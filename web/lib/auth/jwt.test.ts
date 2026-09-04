import { describe, it, expect, beforeAll } from "vitest";
import { signSession, verifySession } from "./jwt";
import type { AuthUser } from "./types";

const user: AuthUser = {
  userId: 1, employeeNo: "1001", name: "홍길동", role: "EMPLOYEE", departmentId: 10, mustChangePassword: false,
  track: "ADMIN",
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

describe("세션의 직군", () => {
  it("서명하고 복원하면 직군이 남아 있다", async () => {
    const restored = await verifySession(await signSession({ ...user, track: "TECH" }));
    expect(restored?.track).toBe("TECH");
  });

  // 배포 전에 발급된 토큰에는 track 이 없다. 강제 로그아웃 없이 넘어가야 한다.
  it("직군이 없는 옛 토큰은 행정직으로 읽는다", async () => {
    const { track: _drop, ...withoutTrack } = { ...user, track: "TECH" as const };
    const restored = await verifySession(await signSession(withoutTrack as never));
    expect(restored?.track).toBe("ADMIN");
  });
});
