import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";

const WORKER_URL = (process.env.WORKER_URL?.startsWith("http") ? process.env.WORKER_URL : `http://${process.env.WORKER_URL || "127.0.0.1:8001"}`) || "http://127.0.0.1:8000";

async function resolveUserId(req: NextRequest): Promise<string> {
  try {
    const token = await getToken({
      req,
      secret: process.env.NEXTAUTH_SECRET,
    });
    return (token?.email as string) || (token?.sub as string) || "local-user";
  } catch {
    return "local-user";
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const userId = await resolveUserId(req);
    const res = await fetch(`${WORKER_URL}/jobs/process`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...body, user_id: userId }),
    });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (err: any) {
    return NextResponse.json(
      { error: `Worker unreachable: ${err.message}` },
      { status: 502 }
    );
  }
}

export async function GET(req: NextRequest) {
  const jobId = req.nextUrl.searchParams.get("jobId");
  const userId = await resolveUserId(req);
  const target = jobId
    ? `${WORKER_URL}/jobs/${encodeURIComponent(jobId)}`
    : `${WORKER_URL}/jobs?user_id=${encodeURIComponent(userId)}`;
  try {
    const res = await fetch(target, { cache: "no-store" });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (err: any) {
    return NextResponse.json(
      { error: `Worker unreachable: ${err.message}` },
      { status: 502 }
    );
  }
}
