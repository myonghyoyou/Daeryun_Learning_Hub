import { describe, it, expect, beforeAll } from "vitest";
import { signSession, verifySession } from "./jwt";
import type { AuthUser } from "./types";

const user: AuthUser = {
  userId: 1, employeeNo: "1001", name: "홍길동", role: "EMPLOYEE", departmentId: 10, mustChangePassword: false,
};

beforeAll(() => {
  process.env.SESSION_JWT_SECRET = "test-secret-at-least-32-bytes-long-000";
});

describe("jwt session", () => {
  it("round-trips the auth user", async () => {
    const token = await signSession(user);
    expect(await verifySession(token)).toEqual(user);
  });

  it("returns null for a tampered token", async () => {
    const token = await signSession(user);
    expect(await verifySession(token + "x")).toBeNull();
  });

  it("returns null for an expired token", async () => {
    const token = await signSession(user, 0); // 즉시 만료
    await new Promise((r) => setTimeout(r, 1100));
    expect(await verifySession(token)).toBeNull();
  });
});
