import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";

const MEDIA_ROOT = process.env.MEDIA_ROOT || "/tmp/cineflow_media";

export async function GET(_req: NextRequest, { params }: { params: { path: string[] } }) {
  const filePath = path.join(MEDIA_ROOT, ...params.path);
  if (!filePath.startsWith(MEDIA_ROOT) || !fs.existsSync(filePath)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const buf = fs.readFileSync(filePath);
  const ext = path.extname(filePath).toLowerCase();
  const type = ext === ".mp4" ? "video/mp4" : ext === ".srt" ? "text/plain" : "application/octet-stream";
  return new NextResponse(buf, { headers: { "Content-Type": type } });
}

export async function POST(req: NextRequest, { params }: { params: { path: string[] } }) {
  const filePath = path.join(MEDIA_ROOT, ...params.path);
  if (!filePath.startsWith(MEDIA_ROOT)) {
    return NextResponse.json({ error: "Invalid path" }, { status: 400 });
  }
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const buf = Buffer.from(await req.arrayBuffer());
  fs.writeFileSync(filePath, buf);
  return NextResponse.json({ ok: true });
}
