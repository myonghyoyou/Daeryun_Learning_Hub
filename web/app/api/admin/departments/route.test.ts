import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import { migrateTestDb, testDb, truncateAll } from "../../../../test/db";
import { departments, users } from "../../../../lib/db/schema";
import type { AuthUser } from "../../../../lib/auth/types";

const state = vi.hoisted(() => ({ currentUser: null as unknown }));
vi.mock("../../../../lib/db/client", async () => {
  const { testDb } = await import("../../../../test/db");
  const actual = await vi.importActual<object>("../../../../lib/db/client");
  return { ...actual, getDb: () => testDb() };
});
vi.mock("../../../../lib/auth/session", () => ({ getAuthUser: async () => state.currentUser }));

const db = testDb();
async function seedAdmin(role: AuthUser["role"] = "SUPER_ADMIN") {
  const [d] = await db.insert(departments).values({ name: "본사", code: "HQ" }).returning();
  const [u] = await db.insert(users).values({
    employeeNo: "admin", name: "총괄", email: "admin@x.local", passwordHash: "h", departmentId: d.id, role,
  }).returning();
  state.currentUser = { userId: u.id, employeeNo: "admin", name: "총괄", role, departmentId: d.id, mustChangePassword: false, track: "ADMIN" } satisfies AuthUser;
}
beforeAll(async () => { await migrateTestDb(); });
beforeEach(async () => { await truncateAll(); state.currentUser = null; });

describe("departments routes", () => {
  it("GET lists departments for a super admin", async () => {
    await seedAdmin();
    const { GET } = await import("./route");
    const body = await (await GET()).json();
    expect(body.resultCode).toBe(200);
    expect(body.data.map((d: { code: string }) => d.code)).toContain("HQ");
  });
  it("POST creates and returns bare ok", async () => {
    await seedAdmin();
    const { POST } = await import("./route");
    const res = await POST(new Request("http://localhost/api/admin/departments", { method: "POST", body: JSON.stringify({ name: "개발팀", code: "DEV" }), headers: { "content-type": "application/json" } }));
    expect(await res.json()).toEqual({ resultCode: 200, resultMsg: "정상 처리되었습니다." });
  });
  it("rejects a DEPT_ADMIN with 403/990", async () => {
    await seedAdmin("DEPT_ADMIN");
    const { GET } = await import("./route");
    const res = await GET();
    expect(res.status).toBe(403);
    expect((await res.json()).resultCode).toBe(990);
  });
  it("PUT updates via the [id] route", async () => {
    await seedAdmin();
    const [dept] = await db.select().from(departments);
    const { PUT } = await import("./[id]/route");
    const res = await PUT(new Request("http://localhost", { method: "PUT", body: JSON.stringify({ name: "개칭", status: "ACTIVE" }), headers: { "content-type": "application/json" } }), { params: Promise.resolve({ id: String(dept.id) }) });
    expect((await res.json()).resultCode).toBe(200);
  });
});
