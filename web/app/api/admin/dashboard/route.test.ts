import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import { migrateTestDb, testDb, truncateAll } from "../../../../test/db";
import { departments, problems, users } from "../../../../lib/db/schema";
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
  return { userId: u.id, employeeNo: u.employeeNo, name: role, role, departmentId, mustChangePassword: false, track: "ADMIN" };
}

function getRequest(query = ""): Request {
  return new Request(`http://localhost/api/admin/dashboard${query}`);
}

beforeAll(async () => { await migrateTestDb(); });
beforeEach(async () => {
  await truncateAll();
  state.currentUser = null;
  [{ id: deptA }] = await db.insert(departments).values({ name: "가팀", code: "A" }).returning({ id: departments.id });
  [{ id: deptB }] = await db.insert(departments).values({ name: "나팀", code: "B" }).returning({ id: departments.id });
});

describe("GET /api/admin/dashboard", () => {
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

  // 교훈 1(N2 리뷰): 서비스 단위 테스트는 각 조각이 옳다는 것만 증명하고, 라우트가 그 값을
  // 서비스에 실제로 넘기는지는 아무도 안 본다. departmentId 가 대시보드의 유일한 쿼리 파라미터라
  // 표면이 작고 그만큼 빠뜨리기 쉽다 — 양방향(전달돼야 하는 경우/무시돼야 하는 경우)을 각각 잡는다.
  it("SUPER_ADMIN 이 지정한 departmentId 가 라우트에서 서비스로 그대로 전달된다", async () => {
    const superAdmin = await seedActor("SUPER_ADMIN", deptA);
    state.currentUser = superAdmin;
    const [own] = await db.insert(problems).values({
      type: "OX", content: "가팀", departmentId: deptA, createdBy: superAdmin.userId,
    }).returning({ id: problems.id });
    await db.insert(problems).values({
      type: "OX", content: "나팀", departmentId: deptB, createdBy: superAdmin.userId,
    });
    const { GET } = await import("./route");
    const res = await GET(getRequest(`?departmentId=${deptA}`));
    const body = await res.json();
    expect(body.data.totalProblems).toBe(1);
    expect(body.data.recentProblems.map((i: { id: number }) => i.id)).toEqual([own.id]);
  });

  it("R5/R6: DEPT_ADMIN 이 departmentId 를 위조해도 자기 부서만 나온다(통계·최근문제 둘 다)", async () => {
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
    expect(body.data.totalProblems).toBe(1);
    expect(body.data.recentProblems.map((i: { id: number }) => i.id)).toEqual([own.id]);
  });

  it("B1: 응답 키 7개", async () => {
    const superAdmin = await seedActor("SUPER_ADMIN", deptA);
    state.currentUser = superAdmin;
    await db.insert(problems).values({
      type: "OX", content: "문제", departmentId: deptA, createdBy: superAdmin.userId,
    });
    const { GET } = await import("./route");
    const res = await GET(getRequest());
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(Object.keys(body.data).sort()).toEqual(["averageAccuracyRate", "lowAccuracyProblems", "recentProblems",
      "reviewNeededCount", "totalAttempts", "totalCorrectAttempts", "totalProblems"]);
  });

  it("L16: ?departmentId=abc 는 요청 값의 형식이 올바르지 않습니다: departmentId", async () => {
    const superAdmin = await seedActor("SUPER_ADMIN", deptA);
    state.currentUser = superAdmin;
    const { GET } = await import("./route");
    const res = await GET(getRequest("?departmentId=abc"));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ resultCode: 1000, resultMsg: "요청 값의 형식이 올바르지 않습니다: departmentId" });
  });

  it("departmentId 생략이면 SUPER_ADMIN 은 전 부서를 본다", async () => {
    const superAdmin = await seedActor("SUPER_ADMIN", deptA);
    state.currentUser = superAdmin;
    await db.insert(problems).values({
      type: "OX", content: "가팀", departmentId: deptA, createdBy: superAdmin.userId,
    });
    await db.insert(problems).values({
      type: "OX", content: "나팀", departmentId: deptB, createdBy: superAdmin.userId,
    });
    const { GET } = await import("./route");
    const res = await GET(getRequest());
    const body = await res.json();
    expect(body.data.totalProblems).toBe(2);
  });
});
