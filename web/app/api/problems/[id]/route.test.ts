import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import { migrateTestDb, testDb, truncateAll } from "../../../../test/db";
import { departments, problemChoices, problems, users } from "../../../../lib/db/schema";
import type { AuthUser } from "../../../../lib/auth/types";

const state = vi.hoisted(() => ({ currentUser: null as unknown }));
vi.mock("../../../../lib/db/client", async () => {
  const { testDb } = await import("../../../../test/db");
  const actual = await vi.importActual<object>("../../../../lib/db/client");
  return { ...actual, getDb: () => testDb() };
});
vi.mock("../../../../lib/auth/session", () => ({ getAuthUser: async () => state.currentUser }));

const db = testDb();
let deptId = 0;
let userId = 0;

function req(path: string): Request {
  return new Request("http://localhost" + path);
}

async function seedEmployee() {
  const [d] = await db.insert(departments).values({ name: "가팀", code: "A" }).returning();
  deptId = d.id;
  const [u] = await db.insert(users).values({
    employeeNo: "emp01", name: "직원", email: "emp@x.local", passwordHash: "h", departmentId: d.id, role: "EMPLOYEE",
  }).returning();
  userId = u.id;
  state.currentUser = {
    userId: u.id, employeeNo: "emp01", name: "직원", role: "EMPLOYEE", departmentId: d.id, mustChangePassword: false,
  } satisfies AuthUser;
}

async function seedProblem(over: Partial<typeof problems.$inferInsert> = {}) {
  const [row] = await db.insert(problems).values({
    type: "MCQ_SINGLE", content: "본문", departmentId: deptId, status: "ACTIVE", createdBy: userId, ...over,
  }).returning({ id: problems.id });
  return row.id;
}

beforeAll(async () => { await migrateTestDb(); });
beforeEach(async () => { await truncateAll(); state.currentUser = null; });

describe("GET /api/problems/[id]", () => {
  it("E1: EMPLOYEE 도 통과한다", async () => {
    await seedEmployee();
    const id = await seedProblem();
    await db.insert(problemChoices).values([
      { problemId: id, choiceText: "O", isCorrect: true, displayOrder: 1 },
      { problemId: id, choiceText: "X", isCorrect: false, displayOrder: 2 },
    ]);
    const { GET } = await import("./route");
    const res = await GET(req(`/api/problems/${id}`), { params: Promise.resolve({ id: String(id) }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.choices).toEqual([{ id: expect.any(Number), text: "O" }, { id: expect.any(Number), text: "X" }]);
  });

  it("E5: /api/problems/abc 는 400/1000 이고 문구에 파라미터 이름이 붙는다", async () => {
    await seedEmployee();
    const { GET } = await import("./route");
    const res = await GET(req("/api/problems/abc"), { params: Promise.resolve({ id: "abc" }) });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ resultCode: 1000, resultMsg: "요청 값의 형식이 올바르지 않습니다: id" });
  });

  it("Q1: 없는 id 는 400 / 존재하지 않거나 보관된 문제입니다", async () => {
    await seedEmployee();
    const { GET } = await import("./route");
    const res = await GET(req("/api/problems/999999"), { params: Promise.resolve({ id: "999999" }) });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ resultCode: 1000, resultMsg: "존재하지 않거나 보관된 문제입니다." });
  });

  it("Q1: ARCHIVED 문제도 같은 문구다", async () => {
    await seedEmployee();
    const id = await seedProblem({ status: "ARCHIVED" });
    const { GET } = await import("./route");
    const res = await GET(req(`/api/problems/${id}`), { params: Promise.resolve({ id: String(id) }) });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ resultMsg: "존재하지 않거나 보관된 문제입니다." });
  });

  it("E4: 남의 부서 문제도 조회된다 — 부서 스코프가 없다", async () => {
    await seedEmployee();
    const [otherDept] = await db.insert(departments).values({ name: "나팀", code: "B" }).returning();
    const id = await seedProblem({ departmentId: otherDept.id });
    await db.insert(problemChoices).values([{ problemId: id, choiceText: "O", isCorrect: true, displayOrder: 1 }]);
    const { GET } = await import("./route");
    const res = await GET(req(`/api/problems/${id}`), { params: Promise.resolve({ id: String(id) }) });
    expect(res.status).toBe(200);
  });

  it("응답 전체에 정답성 키가 없다", async () => {
    await seedEmployee();
    const id = await seedProblem();
    await db.insert(problemChoices).values([{ problemId: id, choiceText: "O", isCorrect: true, displayOrder: 1 }]);
    const { GET } = await import("./route");
    const body = await (await GET(req(`/api/problems/${id}`), { params: Promise.resolve({ id: String(id) }) })).json();
    const json = JSON.stringify(body);
    for (const leak of ["\"correct\"", "\"isCorrect\"", "\"explanation\""]) {
      expect(json).not.toContain(leak);
    }
  });

  it("비로그인은 401/980", async () => {
    const { GET } = await import("./route");
    const res = await GET(req("/api/problems/1"), { params: Promise.resolve({ id: "1" }) });
    expect(res.status).toBe(401);
    expect((await res.json()).resultCode).toBe(980);
  });
});
