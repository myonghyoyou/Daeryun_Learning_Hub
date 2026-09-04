import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import { eq } from "drizzle-orm";
import { migrateTestDb, testDb, truncateAll } from "../../../../../../test/db";
import { auditLogs, departments, problems, users } from "../../../../../../lib/db/schema";
import { insertProblem } from "../../../../../../lib/db/problems";
import type { AuthUser } from "../../../../../../lib/auth/types";

const state = vi.hoisted(() => ({ currentUser: null as unknown }));
vi.mock("../../../../../../lib/db/client", async () => {
  const { testDb } = await import("../../../../../../test/db");
  const actual = await vi.importActual<object>("../../../../../../lib/db/client");
  return { ...actual, getDb: () => testDb() };
});
vi.mock("../../../../../../lib/auth/session", () => ({ getAuthUser: async () => state.currentUser }));

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
    userId: u.id, employeeNo: "admin", name: "관리자", role, departmentId: deptA, mustChangePassword: false, track: "ADMIN",
  } satisfies AuthUser;
}

async function seed(departmentId: number, sourceNumber: number) {
  return insertProblem(db, {
    type: "OX", content: "본문", status: "ACTIVE", departmentId, sourceNumber, createdBy: actorId,
  });
}

function putRequest(body: unknown): Request {
  return new Request("http://localhost/api/admin/problems/1/department", {
    method: "PUT", body: JSON.stringify(body), headers: { "content-type": "application/json" },
  });
}
const params = (id: number | string) => ({ params: Promise.resolve({ id: String(id) }) });

beforeAll(async () => { await migrateTestDb(); });
beforeEach(async () => { await truncateAll(); state.currentUser = null; });

describe("PUT /api/admin/problems/[id]/department", () => {
  it("moves the problem and answers with the new source number", async () => {
    // 정답지 C10: 응답은 {sourceNumber: n} 이다(숫자 그대로가 아니다 — C12 와 반대).
    await seedAdmin();
    await seed(deptB, 5);
    const id = await seed(deptA, 5);
    const { PUT } = await import("./route");
    const res = await PUT(putRequest({ departmentId: deptB }), params(id));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ resultCode: 200, resultMsg: "정상 처리되었습니다.", data: { sourceNumber: 6 } });
    const [row] = await db.select().from(problems).where(eq(problems.id, id));
    expect(row.departmentId).toBe(deptB);
    expect(row.sourceNumber).toBe(6);
    expect((await db.select().from(auditLogs))[0].action).toBe("PROBLEM_DEPARTMENT_CHANGED");
  });

  it("rejects a DEPT_ADMIN with 403/990", async () => {
    // **이 테스트가 이 파일의 존재 이유다.** 부서 이동은 소유권 이전이라 부서 관리자에게
    // 열어 주면 자기 부서 문제를 남의 부서로 던져 버릴 수 있다(ProblemController.java:99).
    // 게다가 그물이 여기밖에 없다: evaluateGate(lib/auth/gate.ts)는 역할을 보지 않고,
    // changeDepartment 는 assertOwnership 도 부르지 않는다. EMPLOYEE 만 검사하는 테스트는
    // 이 구멍을 잡지 못한다 — 넓은 역할 집합을 그대로 복사해 붙여도 초록으로 남기 때문이다.
    await seedAdmin("DEPT_ADMIN");
    const id = await seed(deptA, 1);
    const { PUT } = await import("./route");
    const res = await PUT(putRequest({ departmentId: deptB }), params(id));
    expect(res.status).toBe(403);
    expect((await res.json()).resultCode).toBe(990);
    const [row] = await db.select().from(problems).where(eq(problems.id, id));
    expect(row.departmentId).toBe(deptA); // 이동이 실제로 일어나지 않았다
  });

  it("rejects an employee with 403/990", async () => {
    await seedAdmin("EMPLOYEE");
    const id = await seed(deptA, 1);
    const { PUT } = await import("./route");
    expect((await PUT(putRequest({ departmentId: deptB }), params(id))).status).toBe(403);
  });

  it("rejects a missing session with 401/980", async () => {
    const { PUT } = await import("./route");
    const res = await PUT(putRequest({ departmentId: 1 }), params(1));
    expect(res.status).toBe(401);
    expect((await res.json()).resultCode).toBe(980);
  });

  it("surfaces the same-department guard as 400/1000", async () => {
    await seedAdmin();
    const id = await seed(deptA, 3);
    const { PUT } = await import("./route");
    const res = await PUT(putRequest({ departmentId: deptA }), params(id));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ resultCode: 1000, resultMsg: "이미 가팀 소속입니다." });
  });

  it("surfaces a missing departmentId as 400/1000", async () => {
    await seedAdmin();
    const id = await seed(deptA, 3);
    const { PUT } = await import("./route");
    const res = await PUT(putRequest({}), params(id));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ resultCode: 1000, resultMsg: "옮길 부서를 선택하세요." });
  });

  it("surfaces a missing problem as 400/1000", async () => {
    await seedAdmin();
    const { PUT } = await import("./route");
    const res = await PUT(putRequest({ departmentId: deptB }), params(999999));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ resultCode: 1000, resultMsg: "존재하지 않는 문제입니다." });
  });

  it("maps an unreadable departmentId to 1000 rather than -1", async () => {
    // 캐스팅이 아니라 매핑이다 — 등록 라우트와 같은 규칙(정답지 승인된 이탈 ⑤ 주변).
    await seedAdmin();
    const id = await seed(deptA, 3);
    const { PUT } = await import("./route");
    const res = await PUT(putRequest({ departmentId: { a: 1 } }), params(id));
    expect(res.status).toBe(200); // MessageNotReadableError 는 HTTP 200 + 1000 이다
    expect(await res.json()).toEqual({ resultCode: 1000, resultMsg: "잘못된 파라미터를 입력했습니다." });
  });
});
