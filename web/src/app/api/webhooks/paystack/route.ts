import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";

export async function POST(req: NextRequest) {
  const secret = process.env.PAYSTACK_SECRET_KEY || "";
  const rawBody = await req.text();
  const signature = req.headers.get("x-paystack-signature") || "";

  const hash = crypto.createHmac("sha512", secret).update(rawBody).digest("hex");
  if (hash !== signature) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  const event = JSON.parse(rawBody);
  if (event.event === "charge.success") {
    const { reference, metadata, amount } = event.data;
    console.log("Verified Paystack payment:", { reference, amount, metadata });
  }

  return NextResponse.json({ received: true }, { status: 200 });
}
