import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const ALLOWED_ORIGINS = new Set([
  "https://cineflow.mctouchintelligence.eu",
  "https://mctouchintelligence.eu",
  "https://www.mctouchintelligence.eu",
  "https://cineflow-web-pjh4.onrender.com",
  "https://spin-match-naija.onrender.com",
  "http://localhost:3000",
]);

function applyCorsHeaders(res: NextResponse, origin: string | null) {
  const allowOrigin =
    origin && ALLOWED_ORIGINS.has(origin)
      ? origin
      : "https://cineflow.mctouchintelligence.eu";

  res.headers.set("Access-Control-Allow-Origin", allowOrigin);
  res.headers.set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.headers.set(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization, X-Requested-With, Accept"
  );
  res.headers.set("Access-Control-Max-Age", "86400");
  res.headers.set("Vary", "Origin");
  return res;
}

export function middleware(req: NextRequest) {
  const origin = req.headers.get("origin");

  if (req.nextUrl.pathname.startsWith("/api/")) {
    // Handle browser preflight OPTIONS requests immediately
    if (req.method === "OPTIONS") {
      const preflight = new NextResponse(null, { status: 204 });
      return applyCorsHeaders(preflight, origin);
    }

    const response = NextResponse.next();
    return applyCorsHeaders(response, origin);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/api/:path*", "/dashboard/:path*"],
};
