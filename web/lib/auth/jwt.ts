import { SignJWT, jwtVerify } from "jose";
import { parseTrack } from "../problem/track";
import type { AuthUser } from "./types";

// 쿠키 이름·수명은 여기(Edge-safe, jose 만 의존)에 둔다. middleware 가 next/headers 를 끌어오지
// 않고 이 상수를 쓸 수 있어야 하기 때문이다(next/headers 는 Edge 미들웨어에서 사용 불가).
export const SESSION_COOKIE = { name: "session", maxAge: 90 * 60 } as const;

const DEFAULT_TTL_SECONDS = 90 * 60; // 현재 세션 타임아웃 90분

function secret(): Uint8Array {
  const value = process.env.SESSION_JWT_SECRET;
  if (!value) throw new Error("SESSION_JWT_SECRET 이 설정되지 않았습니다.");
  return new TextEncoder().encode(value);
}

export async function signSession(user: AuthUser, ttlSeconds = DEFAULT_TTL_SECONDS): Promise<string> {
  return new SignJWT({ ...user })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(Math.floor(Date.now() / 1000) + ttlSeconds)
    .sign(secret());
}

export async function verifySession(token: string): Promise<AuthUser | null> {
  try {
    const { payload } = await jwtVerify(token, secret());
    return {
      userId: payload.userId as number,
      employeeNo: payload.employeeNo as string,
      name: payload.name as string,
      role: payload.role as AuthUser["role"],
      departmentId: payload.departmentId as number,
      mustChangePassword: payload.mustChangePassword as boolean,
      // signSession 은 스프레드지만 여기는 열거식이다. 이 줄을 빠뜨리면 track 이 조용히
      // 사라지고, middleware.ts 가 매 요청 재서명하므로 다음 요청에 ADMIN 으로 굳는다.
      track: parseTrack(payload.track),
    };
  } catch {
    return null;
  }
}
