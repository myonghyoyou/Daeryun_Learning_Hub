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
let hqId: number;
async function seedAdmin(role: AuthUser["role"] = "SUPER_ADMIN") {
  const [d] = await db.insert(departments).values({ name: "본사", code: "HQ" }).returning();
  hqId = d.id;
  const [u] = await db.insert(users).values({
    employeeNo: "admin", name: "총괄", email: "admin@x.local", passwordHash: "h", departmentId: d.id, role,
  }).returning();
  state.currentUser = { userId: u.id, employeeNo: "admin", name: "총괄", role, departmentId: d.id, mustChangePassword: false, track: "ADMIN" } satisfies AuthUser;
  return u.id;
}
beforeAll(async () => { await migrateTestDb(); });
beforeEach(async () => { await truncateAll(); state.currentUser = null; });

describe("users routes", () => {
  it("GET lists accounts", async () => {
    await seedAdmin();
    const { GET } = await import("./route");
    const body = await (await GET(new Request("http://localhost/api/admin/users"))).json();
    expect(body.resultCode).toBe(200);
    expect(body.data[0].employeeNo).toBe("admin");
  });
  it("GET rejects a malformed departmentId with 400/1000 (Spring type-mismatch parity)", async () => {
    await seedAdmin();
    const { GET } = await import("./route");
    const res = await GET(new Request("http://localhost/api/admin/users?departmentId=abc"));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.resultCode).toBe(1000);
    expect(body.resultMsg).toBe("요청 값의 형식이 올바르지 않습니다: departmentId");
  });
  it("POST creates and returns the temporary password (D6)", async () => {
    await seedAdmin();
    const { POST } = await import("./route");
    const res = await POST(new Request("http://localhost/api/admin/users", { method: "POST", body: JSON.stringify({ employeeNo: "1001", name: "홍길동", email: "hong@x.local", departmentId: hqId, role: "EMPLOYEE" }), headers: { "content-type": "application/json" } }));
    const body = await res.json();
    expect(body.resultCode).toBe(200);
    expect(body.data.temporaryPassword).toHaveLength(10);
  });
  it("rejects a DEPT_ADMIN with 403/990", async () => {
    await seedAdmin("DEPT_ADMIN");
    const { GET } = await import("./route");
    const res = await GET(new Request("http://localhost/api/admin/users"));
    expect(res.status).toBe(403);
    expect((await res.json()).resultCode).toBe(990);
  });
});
