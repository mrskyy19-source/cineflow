import { NextResponse } from "next/server";

function getWorkerBase(): string {
  const raw = (process.env.WORKER_URL || "https://cineflow-worker-8hci.onrender.com").trim().replace(/\/$/, "");
  if (raw.startsWith("http://") || raw.startsWith("https://")) return raw;
  return `http://${raw}`;
}

async function callWorker(path: string, init?: RequestInit): Promise<Response> {
  const base = getWorkerBase();
  try {
    return await fetch(`${base}${path}`, { ...init, cache: "no-store" });
  } catch {
    // Fallback to public worker URL if internal hostport is unreachable
    return await fetch(`https://cineflow-worker-8hci.onrender.com${path}`, { ...init, cache: "no-store" });
  }
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const jobId = searchParams.get("jobId");
    const userId = searchParams.get("userId");
    const target = jobId
      ? `/jobs/${encodeURIComponent(jobId)}`
      : `/jobs${userId ? `?user_id=${encodeURIComponent(userId)}` : ""}`;

    const res = await callWorker(target);
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Worker unreachable" }, { status: 502 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const job_id = body.jobId || body.job_id || `job-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const s3_key = body.s3Key || body.s3_key;
    const user_id = body.userId || body.user_id || "local-user";
    const filename = body.filename || "video.mp4";

    const res = await callWorker("/jobs/process", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ job_id, s3_key, user_id, filename }),
    });
    const data = await res.json();
    return NextResponse.json({ ...data, job_id }, { status: res.status });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Failed to queue job" }, { status: 502 });
  }
}

export async function DELETE(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const jobId = searchParams.get("jobId");
    const status = searchParams.get("status");
    const target = jobId
      ? `/jobs/${encodeURIComponent(jobId)}`
      : `/jobs${status ? `?status=${encodeURIComponent(status)}` : ""}`;

    const res = await callWorker(target, { method: "DELETE" });
    const data = await res.json().catch(() => ({ ok: res.ok }));
    return NextResponse.json(data, { status: res.status });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Delete failed" }, { status: 502 });
  }
}
