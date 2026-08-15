import { SignJWT, jwtVerify } from "jose";
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
    };
  } catch {
    return null;
  }
}
