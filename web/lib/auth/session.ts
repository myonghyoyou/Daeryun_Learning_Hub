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
export async function setSessionCookie(user: AuthUser): Promise<void> {
  const store = await cookies();
  store.set(SESSION_COOKIE.name, await signSession(user), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.SESSION_COOKIE_SECURE === "true",
    path: "/",
    maxAge: SESSION_COOKIE.maxAge,
  });
}

export async function clearSessionCookie(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE.name);
}
