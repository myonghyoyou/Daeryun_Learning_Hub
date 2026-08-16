import { cookies } from "next/headers";
import { signSession, verifySession, SESSION_COOKIE } from "./jwt";
import type { AuthUser } from "./types";

export { SESSION_COOKIE };

export async function readAuthUser(cookieValue: string | undefined): Promise<AuthUser | null> {
  if (!cookieValue) return null;
  return verifySession(cookieValue);
}

// 라우트(서버 컴포넌트/핸들러)에서 현재 사용자를 얻는다. 현재 @LoginUser 대응.
export async function getAuthUser(): Promise<AuthUser | null> {
  const store = await cookies();
  return readAuthUser(store.get(SESSION_COOKIE.name)?.value);
}

// 로그인 성공 시(서브플랜 2) 호출. secure 는 SESSION_COOKIE_SECURE env 로 전환.
//
// 파리티 주의: 현재 changePassword 는 세션을 rotate 하고 mustChangePassword=false 로 갱신한
// AuthUser 를 다시 넣어 게이트를 푼다(AuthServiceImpl). JWT 는 불변이므로, 서브플랜 2의
// change-password 는 이 함수를 갱신된 AuthUser(mustChangePassword=false)로 다시 호출해
// 새 토큰을 재발급해야 한다 — 그러지 않으면 기존 토큰이 계속 1012 로 막는다. 로그인 시 재발급이
// 곧 세션 rotate(고정 공격 방지)에 대응한다.
//
// JWT exp(90m)이 서버측 타임아웃, 쿠키는 브라우저 세션 쿠키(Spring 미러) — maxAge 를 주지 않아
// 브라우저 종료 시 쿠키가 함께 사라진다. 무활동 슬라이딩은 middleware.ts 가 통과 응답마다
// 쿠키를 재발급해 구현한다.
export async function setSessionCookie(user: AuthUser): Promise<void> {
  const store = await cookies();
  store.set(SESSION_COOKIE.name, await signSession(user), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.SESSION_COOKIE_SECURE === "true",
    path: "/",
  });
}

export async function clearSessionCookie(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE.name);
}
