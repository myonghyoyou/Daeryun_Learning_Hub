import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import { migrateTestDb, testDb, truncateAll } from "../../../../../test/db";
import { departments, users } from "../../../../../lib/db/schema";
import { insertProblem } from "../../../../../lib/db/problems";
import type { AuthUser } from "../../../../../lib/auth/types";

const state = vi.hoisted(() => ({ currentUser: null as unknown }));
vi.mock("../../../../../lib/db/client", async () => {
  const { testDb } = await import("../../../../../test/db");
  const actual = await vi.importActual<object>("../../../../../lib/db/client");
  return { ...actual, getDb: () => testDb() };
});
vi.mock("../../../../../lib/auth/session", () => ({ getAuthUser: async () => state.currentUser }));

const db = testDb();
let deptA = 0, deptB = 0, actorId = 0;

async function seedAdmin(role: AuthUser["role"] = "SUPER_ADMIN") {
  [{ id: deptA }] = await db.insert(departments).values({ name: "가팀", code: "A" }).returning({ id: departments.id });
  [{ id: deptB }] = await db.insert(departments).values({ name: "나팀", code: "B" }).returning({ id: departments.id });
  const [u] = await db.insert(users).values({
    employeeNo: "admin", name: "관리자", email: "admin@x.local", passwordHash: "h", departmentId: deptA, role,
  }).returning();
  actorId = u.id;
  state.currentUser = {
    userId: u.id, employeeNo: "admin", name: "관리자", role, departmentId: deptA, mustChangePassword: false,
  } satisfies AuthUser;
}

async function seed(departmentId: number, sourceNumber: number) {
  await insertProblem(db, {
    type: "OX", content: "본문", status: "ACTIVE", departmentId, sourceNumber, createdBy: actorId,
  });
}

function request(query = ""): Request {
  return new Request(`http://localhost/api/admin/problems/next-source-number${query}`);
}

beforeAll(async () => { await migrateTestDb(); });
beforeEach(async () => { await truncateAll(); state.currentUser = null; });

describe("GET /api/admin/problems/next-source-number", () => {
  it("returns the bare number, not a wrapper object", async () => {
    // 정답지 C12: 응답 data 는 숫자 그대로다({sourceNumber:n} 이 아니다).
    //
    // 이 단언은 라우트 경로 해석도 함께 잰다. `/api/admin/problems/[id]` 와 세그먼트를
    // 공유하므로, Next 가 next-source-number 를 id 로 파싱했다면 여기 오는 값은 숫자가 아니라
    // "존재하지 않는 문제입니다." 다. (정적 세그먼트가 동적 세그먼트보다 우선한다.)
    await seedAdmin();
    await seed(deptA, 7);
    const { GET } = await import("./route");
    const res = await GET(request(`?departmentId=${deptA}`));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ resultCode: 200, resultMsg: "정상 처리되었습니다.", data: 8 });
  });

  it("returns 1 for an empty department", async () => {
    await seedAdmin();
    const { GET } = await import("./route");
    expect((await (await GET(request(`?departmentId=${deptB}`))).json()).data).toBe(1);
  });

  it("ignores a department admin's requested department", async () => {
    // 정답지 R5·C11: resolveOwningDepartment 가 요청값을 버리고 actor 부서로 강제한다.
    await seedAdmin("DEPT_ADMIN");
    await seed(deptA, 4);
    await seed(deptB, 40);
    const { GET } = await import("./route");
    expect((await (await GET(request(`?departmentId=${deptB}`))).json()).data).toBe(5);
  });

  it("keeps the wider class-level role: a department admin is allowed", async () => {
    // 정답지 R1: 이 엔드포인트는 부서 이동과 달리 메서드 레벨로 좁히지 않는다.
    await seedAdmin("DEPT_ADMIN");
    const { GET } = await import("./route");
    expect((await GET(request())).status).toBe(200);
  });

  it("rejects an employee with 403/990", async () => {
    await seedAdmin("EMPLOYEE");
    const { GET } = await import("./route");
    const res = await GET(request(`?departmentId=${deptA}`));
    expect(res.status).toBe(403);
    expect((await res.json()).resultCode).toBe(990);
  });

  it("rejects a missing session with 401/980", async () => {
    const { GET } = await import("./route");
    const res = await GET(request());
    expect(res.status).toBe(401);
    expect((await res.json()).resultCode).toBe(980);
  });

  it("makes a super admin choose a department", async () => {
    await seedAdmin();
    const { GET } = await import("./route");
    const res = await GET(request());
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ resultCode: 1000, resultMsg: "문제가 귀속될 부서를 선택하세요." });
  });

  it("maps a malformed departmentId param to 1000", async () => {
    await seedAdmin();
    const { GET } = await import("./route");
    const res = await GET(request("?departmentId=abc"));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ resultCode: 1000, resultMsg: "요청 값의 형식이 올바르지 않습니다: departmentId" });
  });
});
