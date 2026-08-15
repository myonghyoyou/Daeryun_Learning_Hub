import { NextResponse, type NextRequest } from "next/server";
import { verifySession, SESSION_COOKIE } from "./lib/auth/jwt";
import { evaluateGate } from "./lib/auth/gate";

export async function middleware(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE.name)?.value;
  const user = token ? await verifySession(token) : null;
  const decision = evaluateGate(request.nextUrl.pathname, request.method, user);
  if (decision.action === "reject") {
    return NextResponse.json(decision.body, { status: decision.status });
  }
  return NextResponse.next();
}

// /api/** 만 게이트. 정적 자원·페이지는 통과(페이지 인가는 프론트가 담당, 현재와 동일).
export const config = { matcher: ["/api/:path*"] };
