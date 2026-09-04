import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import { migrateTestDb, testDb, truncateAll } from "../../../../../test/db";
import { departments, users } from "../../../../../lib/db/schema";
import type { AuthUser } from "../../../../../lib/auth/types";

const state = vi.hoisted(() => ({ currentUser: null as unknown }));
vi.mock("../../../../../lib/db/client", async () => {
  const { testDb } = await import("../../../../../test/db");
  const actual = await vi.importActual<object>("../../../../../lib/db/client");
  return { ...actual, getDb: () => testDb() };
});
vi.mock("../../../../../lib/auth/session", () => ({ getAuthUser: async () => state.currentUser }));

const db = testDb();
let deptA = 0;

async function seedActor(role: AuthUser["role"], departmentId: number): Promise<AuthUser> {
  const [u] = await db.insert(users).values({
    employeeNo: `u-${role}-${departmentId}`, name: role, email: `${role}@x.local`, passwordHash: "h",
    departmentId, role,
  }).returning();
  return { userId: u.id, employeeNo: u.employeeNo, name: role, role, departmentId, mustChangePassword: false, track: "ADMIN" };
}

beforeAll(async () => { await migrateTestDb(); });
beforeEach(async () => {
  await truncateAll();
  state.currentUser = null;
  [{ id: deptA }] = await db.insert(departments).values({ name: "가팀", code: "A" }).returning({ id: departments.id });
});

describe("POST /api/admin/feedbacks/retry", () => {
  it("부서 관리자는 다시 보내기를 할 수 없다", async () => {
    state.currentUser = await seedActor("DEPT_ADMIN", deptA);
    const { POST } = await import("./route");
    const res = await POST();
    expect(res.status).toBe(403);
    expect((await res.json()).resultCode).toBe(990);
  });

  it("비로그인은 401/980", async () => {
    state.currentUser = null;
    const { POST } = await import("./route");
    const res = await POST();
    expect(res.status).toBe(401);
    expect((await res.json()).resultCode).toBe(980);
  });

  it("총괄 관리자는 보낼 게 없어도 200 이다", async () => {
    state.currentUser = await seedActor("SUPER_ADMIN", deptA);
    const { POST } = await import("./route");
    const res = await POST();
    const payload = await res.json();
    expect(res.status).toBe(200);
    expect(payload.data).toEqual({ tried: 0, sent: 0, stoppedByLimit: false });
  });
});
