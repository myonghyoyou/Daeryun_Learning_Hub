import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import { migrateTestDb, testDb, truncateAll } from "../../../../../../test/db";
import { departments, problems, users } from "../../../../../../lib/db/schema";
import type { AuthUser } from "../../../../../../lib/auth/types";

const state = vi.hoisted(() => ({ currentUser: null as unknown }));
vi.mock("../../../../../../lib/db/client", async () => {
  const { testDb } = await import("../../../../../../test/db");
  const actual = await vi.importActual<object>("../../../../../../lib/db/client");
  return { ...actual, getDb: () => testDb() };
});
vi.mock("../../../../../../lib/auth/session", () => ({ getAuthUser: async () => state.currentUser }));

const db = testDb();
let deptA = 0, deptB = 0;

async function seedActor(role: AuthUser["role"], departmentId: number): Promise<AuthUser> {
  const [u] = await db.insert(users).values({
    employeeNo: `u-${role}-${departmentId}`, name: role, email: `${role}@x.local`, passwordHash: "h",
    departmentId, role,
  }).returning();
  return { userId: u.id, employeeNo: u.employeeNo, name: role, role, departmentId, mustChangePassword: false };
}

function detailRequest(id: string) {
  return { params: Promise.resolve({ id }) };
}

beforeAll(async () => { await migrateTestDb(); });
beforeEach(async () => {
  await truncateAll();
  state.currentUser = null;
  [{ id: deptA }] = await db.insert(departments).values({ name: "가팀", code: "A" }).returning({ id: departments.id });
  [{ id: deptB }] = await db.insert(departments).values({ name: "나팀", code: "B" }).returning({ id: departments.id });
});

describe("GET /api/admin/stats/problems/[id]", () => {
  it("R1: EMPLOYEE 는 403/990", async () => {
    state.currentUser = await seedActor("EMPLOYEE", deptA);
    const { GET } = await import("./route");
    const res = await GET(new Request("http://localhost"), detailRequest("1"));
    expect(res.status).toBe(403);
    expect((await res.json()).resultCode).toBe(990);
  });

  it("R3: 비로그인은 401/980", async () => {
    const { GET } = await import("./route");
    const res = await GET(new Request("http://localhost"), detailRequest("1"));
    expect(res.status).toBe(401);
    expect((await res.json()).resultCode).toBe(980);
  });

  it("E5: /abc 는 요청 값의 형식이 올바르지 않습니다: id", async () => {
    state.currentUser = await seedActor("SUPER_ADMIN", deptA);
    const { GET } = await import("./route");
    const res = await GET(new Request("http://localhost"), detailRequest("abc"));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ resultCode: 1000, resultMsg: "요청 값의 형식이 올바르지 않습니다: id" });
  });

  it("D1: 없는 문제 — 존재하지 않는 문제입니다.", async () => {
    state.currentUser = await seedActor("SUPER_ADMIN", deptA);
    const { GET } = await import("./route");
    const res = await GET(new Request("http://localhost"), detailRequest("999999"));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ resultCode: 1000, resultMsg: "존재하지 않는 문제입니다." });
  });

  it("D3: 남의 부서 DEPT_ADMIN 은 403/990", async () => {
    const superAdmin = await seedActor("SUPER_ADMIN", deptA);
    const [p] = await db.insert(problems).values({
      type: "OX", content: "가팀 문제", departmentId: deptA, createdBy: superAdmin.userId,
    }).returning({ id: problems.id });
    state.currentUser = await seedActor("DEPT_ADMIN", deptB);
    const { GET } = await import("./route");
    const res = await GET(new Request("http://localhost"), detailRequest(String(p.id)));
    expect(res.status).toBe(403);
    expect((await res.json()).resultCode).toBe(990);
  });

  it("정상 조회 — 응답 키 4개", async () => {
    const superAdmin = await seedActor("SUPER_ADMIN", deptA);
    state.currentUser = superAdmin;
    const [p] = await db.insert(problems).values({
      type: "OX", content: "문제", departmentId: deptA, createdBy: superAdmin.userId,
    }).returning({ id: problems.id });
    const { GET } = await import("./route");
    const res = await GET(new Request("http://localhost"), detailRequest(String(p.id)));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(Object.keys(body.data).sort()).toEqual(["choiceDistribution", "excludedAttempts", "recentWrongSamples", "summary"]);
  });
});
