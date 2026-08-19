import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import { migrateTestDb, testDb, truncateAll } from "../../../test/db";
import { departments, users } from "../../../lib/db/schema";
import type { AuthUser } from "../../../lib/auth/types";

const state = vi.hoisted(() => ({ currentUser: null as unknown }));
vi.mock("../../../lib/db/client", async () => {
  const { testDb } = await import("../../../test/db");
  const actual = await vi.importActual<object>("../../../lib/db/client");
  return { ...actual, getDb: () => testDb() };
});
vi.mock("../../../lib/auth/session", () => ({ getAuthUser: async () => state.currentUser }));

const db = testDb();
async function seedUser(role: AuthUser["role"] = "EMPLOYEE") {
  const [d] = await db.insert(departments).values({ name: "본사", code: "HQ" }).returning();
  const [u] = await db.insert(users).values({
    employeeNo: "emp", name: "직원", email: "emp@x.local", passwordHash: "h", departmentId: d.id, role,
  }).returning();
  state.currentUser = { userId: u.id, employeeNo: "emp", name: "직원", role, departmentId: d.id, mustChangePassword: false } satisfies AuthUser;
}
beforeAll(async () => { await migrateTestDb(); });
beforeEach(async () => { await truncateAll(db); state.currentUser = null; });

describe("tags route", () => {
  it("인증된 사용자면 역할과 무관하게 태그 목록을 돌려준다", async () => {
    // TagController 에는 @RequireRole 이 없다 — EMPLOYEE 도 접근 가능해야 한다.
    await seedUser("EMPLOYEE");
    const { GET } = await import("./route");
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.resultCode).toBe(200);
    expect(Array.isArray(body.data)).toBe(true);
  });

  it("세션이 없으면 980 이다", async () => {
    // state.currentUser 는 beforeEach 에서 null 로 초기화되어 있다 — 세션 없음 상태.
    const { GET } = await import("./route");
    const res = await GET();
    expect((await res.json()).resultCode).toBe(980);
  });
});
