import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import { migrateTestDb, testDb, truncateAll } from "../../../../test/db";
import { departments, feedbacks, users } from "../../../../lib/db/schema";
import type { AuthUser } from "../../../../lib/auth/types";

const state = vi.hoisted(() => ({ currentUser: null as unknown }));
vi.mock("../../../../lib/db/client", async () => {
  const { testDb } = await import("../../../../test/db");
  const actual = await vi.importActual<object>("../../../../lib/db/client");
  return { ...actual, getDb: () => testDb() };
});
vi.mock("../../../../lib/auth/session", () => ({ getAuthUser: async () => state.currentUser }));

const db = testDb();
let deptA = 0, deptB = 0;

async function seedActor(role: AuthUser["role"], departmentId: number): Promise<AuthUser> {
  const [u] = await db.insert(users).values({
    employeeNo: `u-${role}-${departmentId}`, name: role, email: `${role}@x.local`, passwordHash: "h",
    departmentId, role,
  }).returning();
  return { userId: u.id, employeeNo: u.employeeNo, name: role, role, departmentId, mustChangePassword: false };
}

beforeAll(async () => { await migrateTestDb(); });
beforeEach(async () => {
  await truncateAll();
  state.currentUser = null;
  [{ id: deptA }] = await db.insert(departments).values({ name: "가팀", code: "A" }).returning({ id: departments.id });
  [{ id: deptB }] = await db.insert(departments).values({ name: "나팀", code: "B" }).returning({ id: departments.id });
});

describe("GET /api/admin/feedbacks", () => {
  it("부서 관리자는 볼 수 없다 — 피드백은 부서를 가로지르는 데이터다", async () => {
    state.currentUser = await seedActor("DEPT_ADMIN", deptA);
    const { GET } = await import("./route");
    const res = await GET();
    expect(res.status).toBe(403);
    expect((await res.json()).resultCode).toBe(990);
  });

  it("비로그인은 401/980", async () => {
    state.currentUser = null;
    const { GET } = await import("./route");
    const res = await GET();
    expect(res.status).toBe(401);
    expect((await res.json()).resultCode).toBe(980);
  });

  it("총괄 관리자는 SENT 가 아닌 것만 받는다", async () => {
    state.currentUser = await seedActor("SUPER_ADMIN", deptA);
    const userId = (state.currentUser as AuthUser).userId;
    await db.insert(feedbacks).values([
      { userId, body: "실패", status: "FAILED", failReason: "down" },
      { userId, body: "멈춤", status: "PENDING" },
      { userId, body: "보냄", status: "SENT", taskId: "T" },
    ]);
    const { GET } = await import("./route");
    const res = await GET();
    const payload = await res.json();
    expect(res.status).toBe(200);
    expect(payload.data.map((r: { status: string }) => r.status).sort()).toEqual(["FAILED", "PENDING"]);
  });

  it("본문은 응답에 실리지 않는다", async () => {
    state.currentUser = await seedActor("SUPER_ADMIN", deptA);
    await db.insert(feedbacks).values({
      userId: (state.currentUser as AuthUser).userId, body: "비밀스러운 의견", status: "FAILED", failReason: "down",
    });
    const { GET } = await import("./route");
    const payload = await (await GET()).json();
    expect(payload.data[0]).not.toHaveProperty("body");
    expect(JSON.stringify(payload)).not.toContain("비밀스러운 의견");
  });
});
