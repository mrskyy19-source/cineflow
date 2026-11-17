import { NextResponse } from "next/server";

const WORKER_BASE = (process.env.WORKER_URL || "https://cineflow-worker-8hci.onrender.com").replace(/\/$/, "");

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const jobId = searchParams.get("jobId");
    const userId = searchParams.get("userId");
    const target = jobId
      ? `${WORKER_BASE}/jobs/${encodeURIComponent(jobId)}`
      : `${WORKER_BASE}/jobs${userId ? `?user_id=${encodeURIComponent(userId)}` : ""}`;

    const res = await fetch(target, { cache: "no-store" });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Failed to fetch jobs" }, { status: 502 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const job_id = body.jobId || body.job_id || `job-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const s3_key = body.s3Key || body.s3_key;
    const user_id = body.userId || body.user_id || "local-user";
    const filename = body.filename || "video.mp4";

    const res = await fetch(`${WORKER_BASE}/jobs/process`, {
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
      ? `${WORKER_BASE}/jobs/${encodeURIComponent(jobId)}`
      : `${WORKER_BASE}/jobs${status ? `?status=${encodeURIComponent(status)}` : ""}`;

    const res = await fetch(target, { method: "DELETE" });
    const data = await res.json().catch(() => ({ ok: res.ok }));
    return NextResponse.json(data, { status: res.status });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Delete failed" }, { status: 502 });
  }
}
