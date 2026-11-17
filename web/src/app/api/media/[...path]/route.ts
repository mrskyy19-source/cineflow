import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";

const MEDIA_ROOT = path.resolve(process.env.MEDIA_ROOT || "/tmp/cineflow_media");
const PUBLIC_ROOT = path.resolve(process.cwd(), "public");

export async function GET(_req: NextRequest, { params }: { params: { path: string[] } }) {
  const rel = path.join(...params.path);
  const candidates = [
    path.resolve(MEDIA_ROOT, rel),
    path.resolve(PUBLIC_ROOT, rel),
  ];

  const found = candidates.find(
    (p) => (p.startsWith(MEDIA_ROOT) || p.startsWith(PUBLIC_ROOT)) && fs.existsSync(p)
  );

  if (!found) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const buf = fs.readFileSync(found);
  const ext = path.extname(found).toLowerCase();
  const type =
    ext === ".mp4" ? "video/mp4" :
    ext === ".srt" ? "text/plain" :
    "application/octet-stream";

  return new NextResponse(buf, { headers: { "Content-Type": type } });
}

export async function POST(req: NextRequest, { params }: { params: { path: string[] } }) {
  const filePath = path.resolve(MEDIA_ROOT, ...params.path);
  if (!filePath.startsWith(MEDIA_ROOT)) {
    return NextResponse.json({ error: "Invalid path" }, { status: 400 });
  }
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const buf = Buffer.from(await req.arrayBuffer());
  fs.writeFileSync(filePath, buf);
  return NextResponse.json({ ok: true });
}
