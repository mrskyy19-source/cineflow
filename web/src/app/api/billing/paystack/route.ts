import { NextResponse } from "next/server";

const PACKS: Record<string, { minutes: number; amountKobo: number; label: string }> = {
  starter: { minutes: 60, amountKobo: 500000, label: "Creator 60 Mins (₦5,000)" },
  pro: { minutes: 250, amountKobo: 1500000, label: "Studio 250 Mins (₦15,000)" },
};

export async function POST(req: Request) {
  const secret = process.env.PAYSTACK_SECRET_KEY;
  if (!secret) {
    return NextResponse.json({ error: "PAYSTACK_SECRET_KEY not configured on server" }, { status: 500 });
  }

  const { email, userId, packId = "starter" } = await req.json();
  const pack = PACKS[packId] || PACKS.starter;
  const reference = `cf_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  const res = await fetch("https://api.paystack.co/transaction/initialize", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secret}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      email: email || "creator@cineflow.ai",
      amount: pack.amountKobo,
      reference,
      callback_url: `${process.env.NEXTAUTH_URL || "https://cineflow-web-pjh4.onrender.com"}/dashboard?payment=success&ref=${reference}`,
      metadata: {
        userId: userId || "local-user",
        minutes: pack.minutes,
        packId,
      },
    }),
  });

  const data = await res.json();
  if (!data.status) {
    return NextResponse.json({ error: data.message || "Paystack init failed" }, { status: 400 });
  }
  return NextResponse.json({ authorization_url: data.data.authorization_url, reference });
}
