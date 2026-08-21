import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import { migrateTestDb, testDb, truncateAll } from "../../../../../test/db";
import { departments, problemChoices, problems, users } from "../../../../../lib/db/schema";
import type { AuthUser } from "../../../../../lib/auth/types";

const state = vi.hoisted(() => ({ currentUser: null as unknown }));
vi.mock("../../../../../lib/db/client", async () => {
  const { testDb } = await import("../../../../../test/db");
  const actual = await vi.importActual<object>("../../../../../lib/db/client");
  return { ...actual, getDb: () => testDb() };
});
vi.mock("../../../../../lib/auth/session", () => ({ getAuthUser: async () => state.currentUser }));

const db = testDb();
let deptId = 0;
let userId = 0;

function reqJson(path: string, body: unknown): Request {
  return new Request("http://localhost" + path, {
    method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" },
  });
}

function reqBrokenBody(path: string): Request {
  return new Request("http://localhost" + path, {
    method: "POST", body: "{이건 JSON 이 아니다", headers: { "content-type": "application/json" },
  });
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

async function seedMcqProblem(): Promise<{ problemId: number; choiceId: number }> {
  const [row] = await db.insert(problems).values({
    type: "MCQ_SINGLE", content: "본문", departmentId: deptId, status: "ACTIVE", createdBy: userId,
  }).returning({ id: problems.id });
  const [choice] = await db.insert(problemChoices).values([
    { problemId: row.id, choiceText: "가", isCorrect: true, displayOrder: 1 },
    { problemId: row.id, choiceText: "나", isCorrect: false, displayOrder: 2 },
  ]).returning({ id: problemChoices.id });
  return { problemId: row.id, choiceId: choice.id };
}

beforeAll(async () => { await migrateTestDb(); });
beforeEach(async () => { await truncateAll(); state.currentUser = null; });

describe("POST /api/problems/[id]/attempts", () => {
  it("E1: EMPLOYEE 도 통과한다", async () => {
    await seedEmployee();
    const { problemId, choiceId } = await seedMcqProblem();
    const { POST } = await import("./route");
    const res = await POST(
      reqJson(`/api/problems/${problemId}/attempts`, { selectedChoiceIds: [choiceId] }),
      { params: Promise.resolve({ id: String(problemId) }) },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.correct).toBe(true);
  });

  it("E2: 비로그인은 401/980", async () => {
    const { POST } = await import("./route");
    const res = await POST(
      reqJson("/api/problems/1/attempts", { selectedChoiceIds: [] }),
      { params: Promise.resolve({ id: "1" }) },
    );
    expect(res.status).toBe(401);
    expect((await res.json()).resultCode).toBe(980);
  });

  it("E5: 잘못된 id + 정상 본문 → 400/1000/요청 값의 형식이 올바르지 않습니다: id", async () => {
    await seedEmployee();
    const { POST } = await import("./route");
    const res = await POST(
      reqJson("/api/problems/abc/attempts", { selectedChoiceIds: [] }),
      { params: Promise.resolve({ id: "abc" }) },
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ resultCode: 1000, resultMsg: "요청 값의 형식이 올바르지 않습니다: id" });
  });

  it("E5-1: 잘못된 id + 깨진 본문 → 400/1000/요청 값의 형식이 올바르지 않습니다: id", async () => {
    await seedEmployee();
    const { POST } = await import("./route");
    const res = await POST(reqBrokenBody("/api/problems/abc/attempts"), { params: Promise.resolve({ id: "abc" }) });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ resultCode: 1000, resultMsg: "요청 값의 형식이 올바르지 않습니다: id" });
  });

  it("E5-1: 없는 문제 + 깨진 본문 → 200/1000/잘못된 파라미터를 입력했습니다. (본문이 조회보다 먼저다)", async () => {
    await seedEmployee();
    const { POST } = await import("./route");
    const res = await POST(reqBrokenBody("/api/problems/999999/attempts"), { params: Promise.resolve({ id: "999999" }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ resultCode: 1000, resultMsg: "잘못된 파라미터를 입력했습니다." });
    expect(body.errorList).toBeUndefined(); // E6: MessageNotReadableError 경로는 errorList 가 없다
  });

  it("E5-1: 없는 문제 + 정상 본문 → 400/1000/존재하지 않거나 보관된 문제입니다.", async () => {
    await seedEmployee();
    const { POST } = await import("./route");
    const res = await POST(
      reqJson("/api/problems/999999/attempts", { selectedChoiceIds: [] }),
      { params: Promise.resolve({ id: "999999" }) },
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ resultCode: 1000, resultMsg: "존재하지 않거나 보관된 문제입니다." });
  });

  it("E6: 본문이 JSON 이 아니면 200/1000/errorList 없음", async () => {
    await seedEmployee();
    const { problemId } = await seedMcqProblem();
    const { POST } = await import("./route");
    const res = await POST(reqBrokenBody(`/api/problems/${problemId}/attempts`), { params: Promise.resolve({ id: String(problemId) }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.resultCode).toBe(1000);
    expect(body.errorList).toBeUndefined();
  });
});
