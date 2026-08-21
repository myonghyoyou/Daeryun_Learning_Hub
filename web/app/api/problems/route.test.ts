import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import { migrateTestDb, testDb, truncateAll } from "../../../test/db";
import { departments, problems, users } from "../../../lib/db/schema";
import type { AuthUser } from "../../../lib/auth/types";

const state = vi.hoisted(() => ({ currentUser: null as unknown }));
vi.mock("../../../lib/db/client", async () => {
  const { testDb } = await import("../../../test/db");
  const actual = await vi.importActual<object>("../../../lib/db/client");
  return { ...actual, getDb: () => testDb() };
});
vi.mock("../../../lib/auth/session", () => ({ getAuthUser: async () => state.currentUser }));

const db = testDb();
let deptId = 0;

function req(path: string): Request {
  return new Request("http://localhost" + path);
}

async function seedEmployee(role: AuthUser["role"] = "EMPLOYEE") {
  const [d] = await db.insert(departments).values({ name: "가팀", code: "A" }).returning();
  deptId = d.id;
  const [u] = await db.insert(users).values({
    employeeNo: "emp01", name: "직원", email: "emp@x.local", passwordHash: "h", departmentId: d.id, role,
  }).returning();
  const employee = {
    userId: u.id, employeeNo: "emp01", name: "직원", role, departmentId: d.id, mustChangePassword: false,
  } satisfies AuthUser;
  state.currentUser = employee;
  return employee;
}

beforeAll(async () => { await migrateTestDb(); });
beforeEach(async () => { await truncateAll(); state.currentUser = null; });

describe("GET /api/problems", () => {
  it("E1: EMPLOYEE 도 통과한다 — 이 엔드포인트에는 역할 제한이 없다", async () => {
    await seedEmployee("EMPLOYEE");
    const { GET } = await import("./route");
    expect((await GET(req("/api/problems"))).status).toBe(200);
  });

  it("E1: DEPT_ADMIN·SUPER_ADMIN 도 같다", async () => {
    const employee = await seedEmployee("EMPLOYEE");
    const { GET } = await import("./route");
    for (const role of ["DEPT_ADMIN", "SUPER_ADMIN"] as const) {
      state.currentUser = { ...employee, role };
      expect((await GET(req("/api/problems"))).status).toBe(200);
    }
  });

  it("비로그인은 401/980", async () => {
    const { GET } = await import("./route");
    const res = await GET(req("/api/problems"));
    expect(res.status).toBe(401);
    expect((await res.json()).resultCode).toBe(980);
  });

  it("응답은 봉투에 담긴 목록이고 정답 관련 필드가 없다", async () => {
    await seedEmployee();
    await db.insert(problems).values({
      type: "OX", content: "본문", departmentId: deptId, status: "ACTIVE",
      createdBy: (await db.select().from(users)).find(() => true)!.id,
    });
    const { GET } = await import("./route");
    const body = await (await GET(req("/api/problems"))).json();
    expect(body.resultCode).toBe(200);
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data.length).toBe(1);
    const json = JSON.stringify(body);
    for (const leak of ["\"correct\"", "\"isCorrect\"", "\"explanation\""]) {
      expect(json).not.toContain(leak);
    }
  });

  it("keyword·tag 쿼리를 그대로 넘긴다", async () => {
    await seedEmployee();
    const userRow = (await db.select().from(users))[0];
    await db.insert(problems).values([
      { type: "OX", content: "SWOT 분석", departmentId: deptId, status: "ACTIVE", createdBy: userRow.id },
      { type: "OX", content: "무관한 내용", departmentId: deptId, status: "ACTIVE", createdBy: userRow.id },
    ]);
    const { GET } = await import("./route");
    const body = await (await GET(req("/api/problems?keyword=swot"))).json();
    expect(body.data.length).toBe(1);
  });
});
