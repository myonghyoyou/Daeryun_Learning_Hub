import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import bcrypt from "bcryptjs";
import { migrateTestDb, testDb, truncateAll } from "../../../../test/db";
import { departments, users } from "../../../../lib/db/schema";
import type { AuthUser } from "../../../../lib/auth/types";

// vi.mock 호이스팅 안전 패턴(Task 4 와 동일): 가변 상태·스파이는 vi.hoisted 로.
const state = vi.hoisted(() => ({
  currentUser: null as unknown, // AuthUser | null — hoisted 블록에선 타입 참조 불가라 unknown 으로 두고 사용처에서 좁힌다
  setSessionCookie: vi.fn(),
}));
vi.mock("../../../../lib/db/client", async () => {
  const { testDb } = await import("../../../../test/db");
  return { getDb: () => testDb() };
});
vi.mock("../../../../lib/auth/session", () => ({
  getAuthUser: async () => state.currentUser,
  setSessionCookie: state.setSessionCookie,
}));

const db = testDb();
async function seedUser(mustChange = false) {
  const [dept] = await db.insert(departments).values({ name: "개발팀", code: "D" + Math.random() }).returning();
  const [u] = await db.insert(users).values({
    employeeNo: "1001", name: "홍길동", email: "u" + Math.random() + "@x.local",
    passwordHash: await bcrypt.hash("password1", 10), departmentId: dept.id, role: "EMPLOYEE", mustChangePassword: mustChange,
  }).returning();
  return { u, dept };
}

beforeAll(async () => { await migrateTestDb(); process.env.SESSION_JWT_SECRET = "test-secret-at-least-32-bytes-long-000"; });
beforeEach(async () => { await truncateAll(); state.currentUser = null; state.setSessionCookie.mockClear(); });

describe("GET /api/auth/session", () => {
  it("returns not-logged-in when there is no session", async () => {
    const { GET } = await import("./route");
    const res = await GET();
    expect(await res.json()).toEqual({ resultCode: 200, resultMsg: "정상 처리되었습니다.", data: {
      isLoggedIn: false, employeeNo: null, name: null, role: null, departmentId: null, departmentName: null, mustChangePassword: false,
    }});
  });
  it("returns the logged-in shape with department name", async () => {
    const { u, dept } = await seedUser();
    state.currentUser = { userId: u.id, employeeNo: "1001", name: "홍길동", role: "EMPLOYEE", departmentId: dept.id, mustChangePassword: false } satisfies AuthUser;
    const { GET } = await import("./route");
    const data = (await (await GET()).json()).data;
    expect(data.isLoggedIn).toBe(true);
    expect(data.departmentName).toBe("개발팀");
  });
});

describe("POST /api/auth/change-password", () => {
  it("changes password and re-issues the cookie", async () => {
    const { u, dept } = await seedUser(true);
    state.currentUser = { userId: u.id, employeeNo: "1001", name: "홍길동", role: "EMPLOYEE", departmentId: dept.id, mustChangePassword: true } satisfies AuthUser;
    const { POST } = await import("../change-password/route");
    const res = await POST(new Request("http://localhost/api/auth/change-password", { method: "POST", body: JSON.stringify({ newPassword: "brandnew123" }), headers: { "content-type": "application/json" } }));
    expect(res.status).toBe(200);
    expect(state.setSessionCookie).toHaveBeenCalledOnce();
    expect((state.setSessionCookie.mock.calls[0][0] as AuthUser).mustChangePassword).toBe(false);
  });
  it("rejects change-password without a session (980)", async () => {
    state.currentUser = null;
    const { POST } = await import("../change-password/route");
    const res = await POST(new Request("http://localhost/api/auth/change-password", { method: "POST", body: JSON.stringify({ newPassword: "brandnew123" }), headers: { "content-type": "application/json" } }));
    expect(res.status).toBe(401);
    expect((await res.json()).resultCode).toBe(980);
  });
});
