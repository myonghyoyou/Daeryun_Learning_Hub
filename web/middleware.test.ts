import { describe, it, expect, beforeAll } from "vitest";
import { NextRequest } from "next/server";
import { middleware } from "./middleware";
import { signSession, verifySession, SESSION_COOKIE } from "./lib/auth/jwt";
import type { AuthUser } from "./lib/auth/types";

// 통합 테스트: evaluateGate 순수 로직이 아니라 middleware.ts 배선(쿠키 읽기·verifySession·
// NextResponse)을 실제 NextRequest 로 태워 검증한다. gate.test.ts 는 로직을, 이 파일은 배선을 덮는다.

const employee: AuthUser = {
  userId: 1, employeeNo: "1001", name: "홍길동", role: "EMPLOYEE", departmentId: 10, mustChangePassword: false,
};

beforeAll(() => {
  process.env.SESSION_JWT_SECRET = "test-secret-at-least-32-bytes-long-000";
});

function request(path: string, opts: { method?: string; token?: string } = {}): NextRequest {
  const req = new NextRequest(new URL("http://localhost" + path), { method: opts.method ?? "GET" });
  if (opts.token) req.cookies.set(SESSION_COOKIE.name, opts.token);
  return req;
}

// NextResponse.next() 는 x-middleware-next: 1 헤더를 단다. 이것으로 "통과"를 판정한다.
function isPassThrough(res: Response): boolean {
  return res.headers.get("x-middleware-next") === "1";
}

describe("middleware wiring", () => {
  it("rejects a protected path with no cookie as 401 EMPTY_SESSION", async () => {
    const res = await middleware(request("/api/problems"));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ resultCode: 980, resultMsg: "세션 정보가 없습니다." });
  });

  it("passes a public auth path through without a session", async () => {
    const res = await middleware(request("/api/auth/login", { method: "POST" }));
    expect(isPassThrough(res)).toBe(true);
  });

  it("passes a logged-in user through on a protected path (real token round-trip)", async () => {
    const token = await signSession(employee);
    const res = await middleware(request("/api/problems", { token }));
    expect(isPassThrough(res)).toBe(true);
  });

  it("blocks a mustChangePassword user on a non-auth path with 200 + 1012", async () => {
    const token = await signSession({ ...employee, mustChangePassword: true });
    const res = await middleware(request("/api/problems", { token }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ resultCode: 1012, resultMsg: "비밀번호 변경이 필요합니다." });
  });

  it("treats a tampered cookie as no session (401)", async () => {
    const token = await signSession(employee);
    const res = await middleware(request("/api/problems", { token: token + "x" }));
    expect(res.status).toBe(401);
  });

  it("re-issues a fresh session cookie on an authenticated pass-through (sliding expiry)", async () => {
    const token = await signSession(employee);
    const res = await middleware(request("/api/problems", { token }));
    expect(isPassThrough(res)).toBe(true);
    const fresh = res.cookies.get(SESSION_COOKIE.name)?.value;
    expect(fresh).toBeTruthy();
    expect(await verifySession(fresh!)).toEqual(employee);
  });

  it("does not re-issue a session cookie on a logout pass-through (route manages its own Set-Cookie)", async () => {
    const token = await signSession(employee);
    const res = await middleware(request("/api/auth/logout", { method: "POST", token }));
    expect(isPassThrough(res)).toBe(true);
    expect(res.cookies.get(SESSION_COOKIE.name)).toBeUndefined();
  });

  it("does not re-issue a session cookie on a change-password pass-through (route manages its own Set-Cookie)", async () => {
    const token = await signSession(employee);
    const res = await middleware(request("/api/auth/change-password", { method: "POST", token }));
    expect(isPassThrough(res)).toBe(true);
    expect(res.cookies.get(SESSION_COOKIE.name)).toBeUndefined();
  });

  it("sets no cookie on the 401 EMPTY_SESSION reject path", async () => {
    const res = await middleware(request("/api/problems"));
    expect(res.status).toBe(401);
    expect(res.cookies.get(SESSION_COOKIE.name)).toBeUndefined();
  });

  it("sets no cookie on the 200/1012 mustChangePassword reject path", async () => {
    const token = await signSession({ ...employee, mustChangePassword: true });
    const res = await middleware(request("/api/problems", { token }));
    expect(res.status).toBe(200);
    expect(res.cookies.get(SESSION_COOKIE.name)).toBeUndefined();
  });
});
