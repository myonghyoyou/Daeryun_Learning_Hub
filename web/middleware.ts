import { NextResponse, type NextRequest } from "next/server";
import { verifySession, signSession, SESSION_COOKIE } from "./lib/auth/jwt";
import { evaluateGate } from "./lib/auth/gate";

// 재발급을 건너뛰는 경로: 이 라우트들은 스스로 Set-Cookie 를 관리하므로(로그아웃=삭제,
// 비번변경=rotate) 미들웨어가 여기서 다시 쓰면 충돌한다.
const SELF_MANAGED_COOKIE_PATHS = new Set(["/api/auth/logout", "/api/auth/change-password"]);

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const token = request.cookies.get(SESSION_COOKIE.name)?.value;
  const user = token ? await verifySession(token) : null;
  const decision = evaluateGate(pathname, request.method, user);
  if (decision.action === "reject") {
    return NextResponse.json(decision.body, { status: decision.status });
  }
  const res = NextResponse.next();
  // 무활동 90분 슬라이딩(Spring HttpSession 미러): 통과할 때마다 세션 쿠키를 재발급해
  // 만료 시각을 밀어낸다.
  if (user && !SELF_MANAGED_COOKIE_PATHS.has(pathname)) {
    res.cookies.set(SESSION_COOKIE.name, await signSession(user), {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.SESSION_COOKIE_SECURE === "true",
      path: "/",
    });
  }
  return res;
}

// /api/** 만 게이트. 정적 자원·페이지는 통과(페이지 인가는 프론트가 담당, 현재와 동일).
export const config = { matcher: ["/api/:path*"] };
