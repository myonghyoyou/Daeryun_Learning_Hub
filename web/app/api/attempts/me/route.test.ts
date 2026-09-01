import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import { migrateTestDb, testDb, truncateAll } from "../../../../test/db";
import { departments, problems, users, attempts } from "../../../../lib/db/schema";
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
let meId = 0;
let otherId = 0;
let problemId = 0;

async function seedUser(employeeNo: string, role: AuthUser["role"] = "EMPLOYEE") {
  const [u] = await db.insert(users).values({
    employeeNo, name: employeeNo, email: `${employeeNo}@x.local`, passwordHash: "h",
    departmentId: deptId, role, status: "ACTIVE", mustChangePassword: false,
  }).returning({ id: users.id });
  return u.id;
}

async function seedProblem(over: Partial<typeof problems.$inferInsert> = {}) {
  const [row] = await db.insert(problems).values({
    type: "OX", content: "본문", departmentId: deptId, status: "ACTIVE",
    createdBy: meId, sourceNumber: null, ...over,
  }).returning({ id: problems.id });
  return row.id;
}

function asMe() {
  state.currentUser = {
    userId: meId, employeeNo: "me", name: "나", role: "EMPLOYEE",
    departmentId: deptId, mustChangePassword: false,
  } satisfies AuthUser;
}

beforeAll(async () => { await migrateTestDb(); });
beforeEach(async () => {
  await truncateAll();
  state.currentUser = null;
  // 리뷰(fix wave item C): departments 와 users 는 별도 시퀀스라 부서를 하나만 심으면
  // deptId === meId === problemId === 1 로 우연히 겹친다. 겹치면 findAttemptsByUserId(getDb(),
  // actor.userId) 를 actor.departmentId 로 바꿔치기해도(둘 다 값이 1이라) H1 이 초록으로
  // 남는다 — attemptService.test.ts:164-182 가 이미 겪은 함정과 같다. 던지는 부서 하나를
  // 먼저 심어 실제 deptId 를 meId 와 어긋나게 한다(users 시퀀스는 영향받지 않는다).
  await db.insert(departments).values({ name: "버림", code: "Z" });
  [{ id: deptId }] = await db.insert(departments).values({ name: "가팀", code: "A" }).returning({ id: departments.id });
  meId = await seedUser("me");
  otherId = await seedUser("other");
  problemId = await seedProblem();
});

describe("attempts/me route", () => {
  it("H1: 다른 사람의 이력은 안 나온다", async () => {
    // id 공간이 겹치지 않는다는 전제를 명시적으로 단언한다 — 미래에 beforeEach 가 바뀌어
    // 이 전제가 조용히 재붕괴하면 여기서 먼저 실패해야 한다(전제가 깨지면 아래 본검사가 무의미해진다).
    expect(meId).not.toBe(deptId);
    await db.insert(attempts).values([
      { userId: meId, problemId, submittedAnswer: "내 것", isCorrect: true },
      { userId: otherId, problemId, submittedAnswer: "남의 것", isCorrect: true },
    ]);
    asMe();
    const { GET } = await import("./route");
    const body = await (await GET()).json();
    expect(body.data.map((r: { submittedAnswer: string }) => r.submittedAnswer)).toEqual(["내 것"]);
  });

  it("H4: is_correct 별칭이 살아 있어 true 인 시도가 실제로 true 로 나온다", async () => {
    // 두 값이 실제로 다를 수 있는 픽스처 — false 만 넣으면 alias 누락(H4 함정)이 우연히 통과한다.
    await db.insert(attempts).values([
      { userId: meId, problemId, submittedAnswer: "맞음", isCorrect: true },
      { userId: meId, problemId, submittedAnswer: "틀림", isCorrect: false, submittedAt: new Date("2020-01-01") },
    ]);
    asMe();
    const { GET } = await import("./route");
    const body = await (await GET()).json();
    const byAnswer = Object.fromEntries(
      body.data.map((r: { submittedAnswer: string; correct: boolean }) => [r.submittedAnswer, r.correct]));
    expect(byAnswer["맞음"]).toBe(true);
    expect(byAnswer["틀림"]).toBe(false);
  });

  it("H5: 응답 필드 키 집합이 정확히 8개다 — problemType 추가 이후(Task 5 전)", async () => {
    await db.insert(attempts).values([{ userId: meId, problemId, submittedAnswer: "x", isCorrect: false }]);
    asMe();
    const { GET } = await import("./route");
    const body = await (await GET()).json();
    expect(Object.keys(body.data[0]).sort()).toEqual(
      ["correct", "departmentName", "problemContent", "problemId", "problemType", "sourceNumber", "submittedAnswer", "submittedAt"]);
  });

  it("H7: 보관된 문제의 이력도 나온다 — 목록(S2)과 정반대다", async () => {
    const archived = await seedProblem({ status: "ARCHIVED", sourceNumber: 2 });
    await db.insert(attempts).values([{ userId: meId, problemId: archived, submittedAnswer: "x", isCorrect: false }]);
    asMe();
    const { GET } = await import("./route");
    const body = await (await GET()).json();
    expect(body.data.length).toBe(1);
  });

  it("H8: 이력이 없으면 빈 배열이다", async () => {
    asMe();
    const { GET } = await import("./route");
    const body = await (await GET()).json();
    expect(body.data).toEqual([]);
  });

  it("E1: EMPLOYEE 도 접근할 수 있다(역할 제한 없음)", async () => {
    asMe();
    const { GET } = await import("./route");
    const res = await GET();
    expect(res.status).toBe(200);
  });

  it("세션이 없으면 980 이다", async () => {
    const { GET } = await import("./route");
    const res = await GET();
    expect((await res.json()).resultCode).toBe(980);
  });
});
