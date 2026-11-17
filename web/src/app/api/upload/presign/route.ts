import { NextResponse } from "next/server";
import { isR2Configured, createPresignedUpload } from "@/lib/r2";

export async function POST(req: Request) {
  try {
    const { filename, contentType } = await req.json();
    if (!filename) {
      return NextResponse.json({ error: "filename required" }, { status: 400 });
    }
    const safeName = `${Date.now()}-${String(filename).replace(/[^a-zA-Z0-9._-]/g, "_")}`;
    const key = `uploads/${safeName}`;

    if (!isR2Configured) {
      return NextResponse.json({ mode: "local", key });
    }

    const uploadUrl = await createPresignedUpload(key, contentType || "video/mp4");
    return NextResponse.json({ mode: "r2", key, uploadUrl });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Presign failed" }, { status: 500 });
  }
}
