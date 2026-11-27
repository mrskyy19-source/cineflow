import os
import gc
import json
import urllib.request
import subprocess
from pathlib import Path
from datetime import datetime
from fastapi import FastAPI, BackgroundTasks, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from loguru import logger

try:
    from nvidia_enterprise import (
        generate_viral_hooks_nim,
        get_enterprise_runtime_status,
        detect_rhel_runtime,
    )
    ENTERPRISE_MODULE_LOADED = True
except ImportError as err:
    logger.warning(f"nvidia_enterprise fallback: {err}")
    ENTERPRISE_MODULE_LOADED = False

    def detect_rhel_runtime() -> dict:
        return {"os": "Linux", "is_rhel_family": False, "pretty_name": "Standard Linux"}

    def get_enterprise_runtime_status() -> dict:
        return {
            "rhel_runtime": detect_rhel_runtime(),
            "redhat_rhsm": {"configured": False, "active": False, "detail": "Module not loaded"},
            "nvidia_enterprise": {"configured": False, "endpoint": None, "model": None},
        }

    def generate_viral_hooks_nim(transcript: str, target_language: str = "English + Estonian", num_clips: int = 3) -> list[dict]:
        return [{
            "id": 1, "title": "Highlight Short #1", "range": "00:00 - 00:18",
            "hook": "CINEFLOW AI AUTOPILOT", "caption": (transcript or "Opening Hook")[:140],
            "score": 95, "engine": "local-fallback",
        }]


Path(os.getenv("DATA_DIR", "/tmp/cineflow_data")).mkdir(parents=True, exist_ok=True)
MEDIA_BASE = Path(os.getenv("MEDIA_ROOT", "/tmp/cineflow_media"))
MEDIA_BASE.mkdir(parents=True, exist_ok=True)

app = FastAPI(title="CineFlow Enterprise Worker", version="2.7.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

DB_PATH = Path(os.getenv("DATA_DIR", "/tmp/cineflow_data")) / "jobs_db.json"
DATABASE_URL = os.getenv("DATABASE_URL", "")
WEB_BASE = os.getenv("WEB_URL", "https://cineflow-web-pjh4.onrender.com").rstrip("/")

R2_ACCOUNT_ID = os.getenv("R2_ACCOUNT_ID", "")
R2_ACCESS_KEY_ID = os.getenv("R2_ACCESS_KEY_ID", "")
R2_SECRET_ACCESS_KEY = os.getenv("R2_SECRET_ACCESS_KEY", "")
R2_BUCKET = os.getenv("R2_BUCKET", "cineflow-media")
R2_PUBLIC_URL = os.getenv("R2_PUBLIC_URL", "").rstrip("/")
_r2_client = None


def get_r2():
    global _r2_client
    if _r2_client is None and R2_ACCOUNT_ID and R2_ACCESS_KEY_ID and R2_SECRET_ACCESS_KEY:
        import boto3
        _r2_client = boto3.client(
            "s3",
            endpoint_url=f"https://{R2_ACCOUNT_ID}.r2.cloudflarestorage.com",
            aws_access_key_id=R2_ACCESS_KEY_ID,
            aws_secret_access_key=R2_SECRET_ACCESS_KEY,
            region_name="auto",
        )
    return _r2_client


def pull_source_media(rel_key: str, local_path: Path):
    if local_path.exists():
        return
    local_path.parent.mkdir(parents=True, exist_ok=True)
    r2 = get_r2()
    if r2:
        try:
            r2.download_file(R2_BUCKET, rel_key, str(local_path))
            return
        except Exception as e:
            logger.warning(f"R2 download fallback: {e}")
    req = urllib.request.Request(f"{WEB_BASE}/api/media/{rel_key}", headers={"User-Agent": "CineFlow-Worker/2.7"})
    with urllib.request.urlopen(req, timeout=90) as resp:
        local_path.write_bytes(resp.read())


def publish_media_file(local_path: Path, rel_key: str) -> str:
    r2 = get_r2()
    if r2:
        try:
            r2.upload_file(str(local_path), R2_BUCKET, rel_key, ExtraArgs={"ContentType": "video/mp4"})
            return f"{R2_PUBLIC_URL}/{rel_key}" if R2_PUBLIC_URL else f"/{rel_key}"
        except Exception as e:
            logger.warning(f"R2 upload fallback: {e}")
    req = urllib.request.Request(
        f"{WEB_BASE}/api/media/{rel_key}",
        data=local_path.read_bytes(),
        headers={"User-Agent": "CineFlow-Worker/2.7", "Content-Type": "application/octet-stream"},
        method="POST",
    )
    urllib.request.urlopen(req, timeout=90)
    return f"/{rel_key}"


def get_pg_conn():
    if not DATABASE_URL:
        return None
    try:
        import psycopg2
        conn = psycopg2.connect(DATABASE_URL, connect_timeout=3)
        with conn.cursor() as cur:
            cur.execute("""
                CREATE TABLE IF NOT EXISTS cineflow_projects (
                    job_id TEXT PRIMARY KEY, user_id TEXT NOT NULL, filename TEXT NOT NULL,
                    s3_key TEXT NOT NULL, status TEXT NOT NULL, progress INT NOT NULL DEFAULT 0,
                    stage TEXT, result JSONB, created_at TIMESTAMPTZ DEFAULT NOW()
                );
            """)
        conn.commit()
        return conn
    except Exception:
        return None


def load_local_jobs() -> dict[str, dict]:
    if DB_PATH.exists():
        try:
            return json.loads(DB_PATH.read_text())
        except Exception:
            return {}
    return {}


def save_job_record(job: dict):
    all_jobs = load_local_jobs()
    all_jobs[job["job_id"]] = job
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    DB_PATH.write_text(json.dumps(all_jobs, indent=2))
    conn = get_pg_conn()
    if conn:
        try:
            with conn.cursor() as cur:
                cur.execute("""
                    INSERT INTO cineflow_projects (job_id, user_id, filename, s3_key, status, progress, stage, result)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s::jsonb)
                    ON CONFLICT (job_id) DO UPDATE SET
                        status = EXCLUDED.status, progress = EXCLUDED.progress,
                        stage = EXCLUDED.stage, result = EXCLUDED.result;
                """, (
                    job["job_id"], job.get("user_id", "local-user"), job.get("filename", "video.mp4"),
                    job.get("s3_key", ""), job["status"], job.get("progress", 0), job.get("stage", ""),
                    json.dumps(job.get("result")) if job.get("result") is not None else None,
                ))
            conn.commit()
        finally:
            conn.close()


def fetch_jobs_for_user(user_id: str | None) -> list[dict]:
    conn = get_pg_conn()
    if conn:
        try:
            with conn.cursor() as cur:
                if user_id:
                    cur.execute(
                        "SELECT job_id, user_id, filename, s3_key, status, progress, stage, result, created_at "
                        "FROM cineflow_projects WHERE user_id = %s ORDER BY created_at DESC LIMIT 50;", (user_id,)
                    )
                else:
                    cur.execute(
                        "SELECT job_id, user_id, filename, s3_key, status, progress, stage, result, created_at "
                        "FROM cineflow_projects ORDER BY created_at DESC LIMIT 50;"
                    )
                rows = cur.fetchall()
                conn.close()
                return [{
                    "job_id": r[0], "user_id": r[1], "filename": r[2], "s3_key": r[3],
                    "status": r[4], "progress": r[5], "stage": r[6], "result": r[7],
                    "created_at": r[8].isoformat() if r[8] else None,
                } for r in rows]
        except Exception:
            conn.close()
    jobs = list(reversed(list(load_local_jobs().values())))
    return [j for j in jobs if j.get("user_id") == user_id] if user_id else jobs


def fetch_single_job(job_id: str) -> dict | None:
    local = load_local_jobs().get(job_id)
    if local:
        return local
    conn = get_pg_conn()
    if conn:
        try:
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT job_id, user_id, filename, s3_key, status, progress, stage, result "
                    "FROM cineflow_projects WHERE job_id = %s;", (job_id,)
                )
                r = cur.fetchone()
                if r:
                    return {
                        "job_id": r[0], "user_id": r[1], "filename": r[2], "s3_key": r[3],
                        "status": r[4], "progress": r[5], "stage": r[6], "result": r[7],
                    }
        finally:
            conn.close()
    return None


class JobPayload(BaseModel):
    job_id: str
    s3_key: str
    user_id: str = "local-user"
    filename: str = "video.mp4"
    target_language: str = "English + Estonian"


@app.on_event("startup")
async def mark_interrupted_jobs():
    all_jobs = load_local_jobs()
    for j in all_jobs.values():
        if j.get("status") in ("queued", "processing"):
            j["status"] = "failed"
            j["stage"] = "Interrupted by server restart"
    DB_PATH.write_text(json.dumps(all_jobs, indent=2))
    conn = get_pg_conn()
    if conn:
        try:
            with conn.cursor() as cur:
                cur.execute(
                    "UPDATE cineflow_projects SET status = %s, stage = %s WHERE status IN (%s, %s);",
                    ("failed", "Interrupted by server restart", "queued", "processing"),
                )
            conn.commit()
        finally:
            conn.close()


@app.get("/health")
async def health():
    return {
        "status": "ok",
        "service": "cineflow-worker",
        "enterprise_module": ENTERPRISE_MODULE_LOADED,
        "nvidia_configured": bool(os.getenv("NVIDIA_API_KEY", "").strip()),
        "rhel_runtime": detect_rhel_runtime(),
    }


@app.get("/enterprise/status")
async def enterprise_status():
    return get_enterprise_runtime_status()


@app.get("/jobs")
async def list_jobs(user_id: str | None = None):
    return fetch_jobs_for_user(user_id)


@app.get("/jobs/{job_id}")
async def get_job(job_id: str):
    job = fetch_single_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return job


@app.delete("/jobs/{job_id}")
async def delete_job(job_id: str):
    all_jobs = load_local_jobs()
    if job_id in all_jobs:
        del all_jobs[job_id]
        DB_PATH.write_text(json.dumps(all_jobs, indent=2))
    conn = get_pg_conn()
    if conn:
        try:
            with conn.cursor() as cur:
                cur.execute("DELETE FROM cineflow_projects WHERE job_id = %s;", (job_id,))
            conn.commit()
        finally:
            conn.close()
    return {"deleted": True, "job_id": job_id}


@app.delete("/jobs")
async def purge_jobs(status: str | None = None):
    all_jobs = load_local_jobs()
    all_jobs = {k: v for k, v in all_jobs.items() if v.get("status") == "completed"} if status == "incomplete" else {}
    DB_PATH.write_text(json.dumps(all_jobs, indent=2))
    conn = get_pg_conn()
    if conn:
        try:
            with conn.cursor() as cur:
                if status == "incomplete":
                    cur.execute("DELETE FROM cineflow_projects WHERE status != %s;", ("completed",))
                else:
                    cur.execute("TRUNCATE TABLE cineflow_projects;")
            conn.commit()
        finally:
            conn.close()
    return {"purged": True}


@app.post("/jobs/process")
async def process_job(payload: JobPayload, background_tasks: BackgroundTasks):
    job = {
        "job_id": payload.job_id, "user_id": payload.user_id, "filename": payload.filename,
        "s3_key": payload.s3_key, "target_language": payload.target_language,
        "created_at": datetime.utcnow().isoformat() + "Z", "status": "queued",
        "progress": 5, "stage": "Queued for processing...", "result": None,
    }
    save_job_record(job)
    background_tasks.add_task(run_pipeline, job)
    return {"status": "accepted", "job_id": payload.job_id}


def fmt_srt_time(seconds: float) -> str:
    ms = int(round((seconds - int(seconds)) * 1000))
    total_s = int(seconds)
    h, rem = divmod(total_s, 3600)
    m, s = divmod(rem, 60)
    return f"{h:02d}:{m:02d}:{s:02d},{ms:03d}"


def transcribe_low_mem(video_path: Path, srt_path: Path, total_secs: float) -> list[dict]:
    segments_out = []
    try:
        from faster_whisper import WhisperModel
        model = WhisperModel("tiny", device="cpu", compute_type="int8", cpu_threads=1)
        segments, _ = model.transcribe(str(video_path), beam_size=1)
        lines = []
        for idx, seg in enumerate(segments, start=1):
            txt = seg.text.strip()
            if not txt:
                continue
            segments_out.append({"start": float(seg.start), "end": float(seg.end), "text": txt})
            lines.append(f"{idx}\n{fmt_srt_time(seg.start)} --> {fmt_srt_time(seg.end)}\n{txt}\n")
        del model
        gc.collect()
        if lines:
            srt_path.write_text("\n".join(lines), encoding="utf-8")
            return segments_out
    except Exception as e:
        logger.warning(f"Whisper fallback: {e}")
        gc.collect()
    end_t = min(max(total_secs, 2.0), 6.0)
    srt_path.write_text(f"1\n00:00:00,500 --> {fmt_srt_time(end_t)}\nCINEFLOW AI AUTOPILOT\n", encoding="utf-8")
    return [{"start": 0.5, "end": end_t, "text": "CINEFLOW AI AUTOPILOT"}]


def run_pipeline(job: dict):
    job_id = job["job_id"]
    try:
        job.update({"status": "processing", "progress": 15, "stage": "Downloading & probing video..."})
        save_job_record(job)
        rel_key = job["s3_key"].lstrip("/")
        if not rel_key.startswith("uploads/"):
            rel_key = f"uploads/{Path(rel_key).name}"
        local_path = MEDIA_BASE / rel_key
        pull_source_media(rel_key, local_path)

        probe_cmd = ["ffprobe", "-v", "quiet", "-print_format", "json", "-show_format", "-show_streams", str(local_path)]
        meta = json.loads(subprocess.check_output(probe_cmd, timeout=20).decode())
        secs = float(meta.get("format", {}).get("duration", 10))
        mins, rem = divmod(int(secs), 60)
        duration_str = f"{mins:02d}:{rem:02d}"
        has_audio = any(s.get("codec_type") == "audio" for s in meta.get("streams", []))

        job.update({"progress": 32, "stage": "Transcribing audio..."})
        save_job_record(job)
        out_dir = MEDIA_BASE / "processed"
        out_dir.mkdir(parents=True, exist_ok=True)
        srt_path = out_dir / f"{local_path.stem}.srt"
        segments = transcribe_low_mem(local_path, srt_path, secs)

        job.update({"progress": 48, "stage": "Generating viral hooks via NVIDIA NIM..."})
        save_job_record(job)
        full_transcript = " ".join(s["text"] for s in segments).strip()
        nim_hooks = generate_viral_hooks_nim(full_transcript, job.get("target_language", "English + Estonian"), 3)

        job.update({"progress": 65, "stage": "Rendering 9:16 vertical video..."})
        save_job_record(job)
        out_name = f"{local_path.stem}_cineflow.mp4"
        out_path = out_dir / out_name
        escaped_srt = str(srt_path).replace("\\", "/").replace(":", "\\:")
        sub_style = "FontName=Arial,FontSize=15,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,BorderStyle=3,Outline=2,Alignment=2,MarginV=40"
        vf = f"crop=ih*9/16:ih,scale=480:854,subtitles='{escaped_srt}':force_style='{sub_style}'"
        cmd = ["ffmpeg", "-y", "-threads", "1", "-i", str(local_path), "-vf", vf]
        cmd += ["-c:a", "aac", "-b:a", "96k"] if has_audio else ["-an"]
        cmd += ["-c:v", "libx264", "-preset", "ultrafast", "-crf", "26", "-movflags", "+faststart", str(out_path)]
        subprocess.run(cmd, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE, timeout=300)
        master_url = publish_media_file(out_path, f"processed/{out_name}")

        job.update({"progress": 85, "stage": "Slicing highlight clip..."})
        save_job_record(job)
        clip_end = round(min(secs, max(4.0, secs / 2.0)), 2)
        clip_name = f"{local_path.stem}_short_1.mp4"
        clip_path = out_dir / clip_name
        subprocess.run(
            ["ffmpeg", "-y", "-ss", "0", "-i", str(out_path), "-t", str(clip_end), "-c", "copy", "-movflags", "+faststart", str(clip_path)],
            check=True, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE, timeout=60
        )
        clip_url = publish_media_file(clip_path, f"processed/{clip_name}")

        for f in (local_path, out_path, clip_path, srt_path):
            try:
                f.unlink(missing_ok=True)
            except Exception:
                pass
        gc.collect()

        enriched = [{
            "id": h.get("id", i), "title": h.get("title", f"Highlight Short #{i}"),
            "range": h.get("range", f"00:00 - {fmt_srt_time(clip_end)[:8]}"), "start": 0, "end": clip_end,
            "hook": h.get("hook", "CINEFLOW AI AUTOPILOT"),
            "caption": h.get("caption", segments[0]["text"] if segments else "Opening Hook"),
            "score": h.get("score", 95), "engine": h.get("engine", "nvidia-nim"),
            "url": clip_url if i == 1 else master_url,
        } for i, h in enumerate(nim_hooks, start=1)]

        job.update({
            "status": "completed", "progress": 100, "stage": "Completed ✓",
            "output_url": master_url, "clips": enriched,
            "result": {
                "original_url": f"{R2_PUBLIC_URL}/{rel_key}" if R2_PUBLIC_URL else f"/{rel_key}",
                "output_url": master_url, "duration": duration_str, "resolution": "480x854 (9:16 + Captions)",
                "viral_score": f"{enriched[0]['score']}/100", "ai_engine": enriched[0]["engine"],
                "highlights": [c["hook"] for c in enriched[:3]], "clips": enriched,
            },
        })
        save_job_record(job)
    except Exception as e:
        logger.error(f"[{job_id}] Failed: {e}")
        job.update({"status": "failed", "stage": f"Error: {str(e)}"})
        save_job_record(job)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
