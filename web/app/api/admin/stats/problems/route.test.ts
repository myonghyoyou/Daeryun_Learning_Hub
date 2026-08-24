import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import { migrateTestDb, testDb, truncateAll } from "../../../../../test/db";
import { departments, problems, users } from "../../../../../lib/db/schema";
import type { AuthUser } from "../../../../../lib/auth/types";

const state = vi.hoisted(() => ({ currentUser: null as unknown }));
vi.mock("../../../../../lib/db/client", async () => {
  const { testDb } = await import("../../../../../test/db");
  const actual = await vi.importActual<object>("../../../../../lib/db/client");
  return { ...actual, getDb: () => testDb() };
});
vi.mock("../../../../../lib/auth/session", () => ({ getAuthUser: async () => state.currentUser }));

const db = testDb();
let deptA = 0, deptB = 0;

async function seedActor(role: AuthUser["role"], departmentId: number): Promise<AuthUser> {
  const [u] = await db.insert(users).values({
    employeeNo: `u-${role}-${departmentId}`, name: role, email: `${role}@x.local`, passwordHash: "h",
    departmentId, role,
  }).returning();
  return { userId: u.id, employeeNo: u.employeeNo, name: role, role, departmentId, mustChangePassword: false };
}

function getRequest(query = ""): Request {
  return new Request(`http://localhost/api/admin/stats/problems${query}`);
}

beforeAll(async () => { await migrateTestDb(); });
beforeEach(async () => {
  await truncateAll();
  state.currentUser = null;
  [{ id: deptA }] = await db.insert(departments).values({ name: "가팀", code: "A" }).returning({ id: departments.id });
  [{ id: deptB }] = await db.insert(departments).values({ name: "나팀", code: "B" }).returning({ id: departments.id });
});

describe("GET /api/admin/stats/problems", () => {
  it("R1: EMPLOYEE 는 403/990", async () => {
    state.currentUser = await seedActor("EMPLOYEE", deptA);
    const { GET } = await import("./route");
    const res = await GET(getRequest());
    expect(res.status).toBe(403);
    expect((await res.json()).resultCode).toBe(990);
  });

  it("R3: 비로그인은 401/980", async () => {
    const { GET } = await import("./route");
    const res = await GET(getRequest());
    expect(res.status).toBe(401);
    expect((await res.json()).resultCode).toBe(980);
  });

  it("R5: DEPT_ADMIN 이 departmentId 를 위조해도 자기 부서만 나온다", async () => {
    const deptAdmin = await seedActor("DEPT_ADMIN", deptA);
    state.currentUser = deptAdmin;
    const superAdmin = await seedActor("SUPER_ADMIN", deptA);
    const [own] = await db.insert(problems).values({
      type: "OX", content: "내 부서", departmentId: deptA, createdBy: superAdmin.userId,
    }).returning({ id: problems.id });
    await db.insert(problems).values({
      type: "OX", content: "남의 부서", departmentId: deptB, createdBy: superAdmin.userId,
    });
    const { GET } = await import("./route");
    const res = await GET(getRequest(`?departmentId=${deptB}`));
    const body = await res.json();
    expect(body.data.totalCount).toBe(1);
    expect(body.data.items.map((i: { problemId: number }) => i.problemId)).toEqual([own.id]);
  });

  it("L13: 응답 키 4개", async () => {
    const superAdmin = await seedActor("SUPER_ADMIN", deptA);
    state.currentUser = superAdmin;
    const { GET } = await import("./route");
    const res = await GET(getRequest());
    const body = await res.json();
    expect(Object.keys(body.data).sort()).toEqual(["items", "page", "size", "totalCount"]);
  });

  it("정상 목록 조회 — 기본값 page=1 size=20", async () => {
    const superAdmin = await seedActor("SUPER_ADMIN", deptA);
    state.currentUser = superAdmin;
    await db.insert(problems).values({
      type: "OX", content: "문제", departmentId: deptA, createdBy: superAdmin.userId,
    });
    const { GET } = await import("./route");
    const res = await GET(getRequest());
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.data.page).toBe(1);
    expect(body.data.size).toBe(20);
    expect(body.data.totalCount).toBe(1);
  });
});
