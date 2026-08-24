import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { migrateTestDb, testDb, truncateAll } from "../../test/db";
import { departments, problems, users, attempts, problemChoices, attemptChoices } from "../db/schema";
import { ErrorCode } from "../http/errorCode";
import type { AuthUser } from "../auth/types";
import type { ProblemStatRow } from "../db/stats";
import {
  effectiveDepartmentId, toStatItem, listProblemStats, getProblemStatDetail,
} from "./statsService";

const db = testDb();
let deptA = 0, deptB = 0, superAdminId = 0, deptAdminId = 0, deptAdminBId = 0;
let superAdmin: AuthUser;
let deptAdmin: AuthUser;
let deptAdminOfOtherDept: AuthUser;

beforeAll(async () => { await migrateTestDb(); });
beforeEach(async () => {
  await truncateAll();
  [{ id: deptA }] = await db.insert(departments).values({ name: "가팀", code: "A", status: "ACTIVE" }).returning({ id: departments.id });
  [{ id: deptB }] = await db.insert(departments).values({ name: "나팀", code: "B", status: "ACTIVE" }).returning({ id: departments.id });
  [{ id: superAdminId }] = await db.insert(users).values({
    employeeNo: "admin", name: "총괄", email: "a@b.c", passwordHash: "x",
    departmentId: deptA, role: "SUPER_ADMIN", status: "ACTIVE", mustChangePassword: false,
  }).returning({ id: users.id });
  [{ id: deptAdminId }] = await db.insert(users).values({
    employeeNo: "dept-a", name: "부서관리자A", email: "b@b.c", passwordHash: "x",
    departmentId: deptA, role: "DEPT_ADMIN", status: "ACTIVE", mustChangePassword: false,
  }).returning({ id: users.id });
  [{ id: deptAdminBId }] = await db.insert(users).values({
    employeeNo: "dept-b", name: "부서관리자B", email: "c@b.c", passwordHash: "x",
    departmentId: deptB, role: "DEPT_ADMIN", status: "ACTIVE", mustChangePassword: false,
  }).returning({ id: users.id });
  superAdmin = { userId: superAdminId, employeeNo: "admin", name: "총괄", role: "SUPER_ADMIN", departmentId: deptA, mustChangePassword: false };
  deptAdmin = { userId: deptAdminId, employeeNo: "dept-a", name: "부서관리자A", role: "DEPT_ADMIN", departmentId: deptA, mustChangePassword: false };
  deptAdminOfOtherDept = { userId: deptAdminBId, employeeNo: "dept-b", name: "부서관리자B", role: "DEPT_ADMIN", departmentId: deptB, mustChangePassword: false };
});

/** 문제 하나를 만들고 정답/오답 시도를 원하는 만큼 붙인다. lib/db/stats.test.ts 와 같은 헬퍼. */
async function seedWithAttempts(over: Partial<typeof problems.$inferInsert>, correct: number, wrong: number) {
  const [p] = await db.insert(problems).values({
    type: "OX", content: "본문", departmentId: deptA, status: "ACTIVE", createdBy: superAdminId, ...over,
  }).returning({ id: problems.id });
  const rows = [
    ...Array.from({ length: correct }, () => ({ userId: superAdminId, problemId: p.id, submittedAnswer: "가", isCorrect: true })),
    ...Array.from({ length: wrong }, () => ({ userId: superAdminId, problemId: p.id, submittedAnswer: "나", isCorrect: false })),
  ];
  if (rows.length) await db.insert(attempts).values(rows);
  return p.id;
}

const row: ProblemStatRow = {
  problemId: 1, content: "본문", type: "OX", status: "ACTIVE",
  departmentId: 1, departmentName: "가팀",
  totalAttempts: 0, correctAttempts: 0, lastAttemptAt: null,
};

describe("effectiveDepartmentId (R4·R5)", () => {
  it("SUPER_ADMIN 은 요청값을 그대로 쓴다", () =>
    expect(effectiveDepartmentId(superAdmin, 7)).toBe(7));
  it("SUPER_ADMIN 이 생략하면 null — 전 부서다", () =>
    expect(effectiveDepartmentId(superAdmin, null)).toBeNull());
  it("R5: DEPT_ADMIN 은 요청값을 무시하고 자기 부서를 쓴다 — 오류가 아니다", () =>
    expect(effectiveDepartmentId({ ...deptAdmin, departmentId: 3 }, 999)).toBe(3));
});

describe("정답률 (L12·X1·X2)", () => {
  it("X1: 시도 0건이면 null — 0.0 이 아니다", () =>
    expect(toStatItem({ ...row, totalAttempts: 0, correctAttempts: 0 }).accuracyRate).toBeNull());
  it("X2: 전부 오답이면 0.0 — null 이 아니다", () =>
    expect(toStatItem({ ...row, totalAttempts: 3, correctAttempts: 0 }).accuracyRate).toBe(0));
  it("L12: 나눗셈은 소수다", () =>
    expect(toStatItem({ ...row, totalAttempts: 3, correctAttempts: 1 }).accuracyRate)
      .toBeCloseTo(1 / 3, 15));
});

describe("클램프 (L1·L2)", () => {
  it.each([[0, 20], [-5, 20], [1000, 100], [50, 50]])("size %i → %i", async (given, want) => {
    expect((await listProblemStats(db, superAdmin, { departmentId: null, status: null, page: 1, size: given })).size)
      .toBe(want);
  });
  it.each([[0, 1], [-5, 1], [3, 3]])("page %i → %i", async (given, want) => {
    expect((await listProblemStats(db, superAdmin, { departmentId: null, status: null, page: given, size: 20 })).page)
      .toBe(want);
  });
});

describe("listProblemStats — 스코프 (R5)", () => {
  it("DEPT_ADMIN 은 요청한 departmentId 를 무시하고 자기 부서만 본다", async () => {
    const own = await seedWithAttempts({ content: "내 부서" }, 1, 0);
    await seedWithAttempts({ content: "남의 부서", departmentId: deptB }, 1, 0);
    const result = await listProblemStats(db, deptAdmin, { departmentId: deptB, status: null, page: 1, size: 20 });
    expect(result.items.map((i) => i.problemId)).toEqual([own]);
    expect(result.totalCount).toBe(1);
  });

  it("SUPER_ADMIN 이 departmentId 를 생략하면 전 부서가 나온다", async () => {
    await seedWithAttempts({ content: "가팀" }, 1, 0);
    await seedWithAttempts({ content: "나팀", departmentId: deptB }, 1, 0);
    const result = await listProblemStats(db, superAdmin, { departmentId: null, status: null, page: 1, size: 20 });
    expect(result.totalCount).toBe(2);
  });
});

describe("listProblemStats — 응답 형태", () => {
  it("L13: 응답 키 4개, items[i] 키 10개(problemId 포함)", async () => {
    await seedWithAttempts({ content: "문제" }, 1, 0);
    const result = await listProblemStats(db, superAdmin, { departmentId: null, status: null, page: 1, size: 20 });
    expect(Object.keys(result).sort()).toEqual(["items", "page", "size", "totalCount"]);
    expect(Object.keys(result.items[0]).sort()).toEqual([
      "accuracyRate", "content", "correctAttempts", "departmentId", "departmentName",
      "lastAttemptAt", "problemId", "status", "totalAttempts", "type",
    ]);
  });
});

/** 상세 조립용 문제 픽스처. */
async function seedMcq() {
  const [p] = await db.insert(problems).values({
    type: "MCQ_SINGLE", content: "MCQ 문제", departmentId: deptA, status: "ACTIVE", createdBy: superAdminId,
  }).returning({ id: problems.id });
  const [c1] = await db.insert(problemChoices)
    .values({ problemId: p.id, choiceText: "가", isCorrect: true, displayOrder: 1 }).returning({ id: problemChoices.id });
  const [c2] = await db.insert(problemChoices)
    .values({ problemId: p.id, choiceText: "나", isCorrect: false, displayOrder: 2 }).returning({ id: problemChoices.id });
  const [a1] = await db.insert(attempts)
    .values({ userId: superAdminId, problemId: p.id, submittedAnswer: "가", isCorrect: true }).returning({ id: attempts.id });
  await db.insert(attemptChoices).values([{ attemptId: a1.id, choiceId: c1.id, choiceText: "가" }]);
  return { problemId: p.id, c1Id: c1.id, c2Id: c2.id };
}

async function seedOx() {
  const [p] = await db.insert(problems).values({
    type: "OX", content: "OX 문제", departmentId: deptA, status: "ACTIVE", createdBy: superAdminId,
  }).returning({ id: problems.id });
  const [o] = await db.insert(problemChoices)
    .values({ problemId: p.id, choiceText: "O", isCorrect: true, displayOrder: 1 }).returning({ id: problemChoices.id });
  const [x] = await db.insert(problemChoices)
    .values({ problemId: p.id, choiceText: "X", isCorrect: false, displayOrder: 2 }).returning({ id: problemChoices.id });
  const [a1] = await db.insert(attempts)
    .values({ userId: superAdminId, problemId: p.id, submittedAnswer: "O", isCorrect: true }).returning({ id: attempts.id });
  await db.insert(attemptChoices).values([{ attemptId: a1.id, choiceId: o.id, choiceText: "O" }]);
  return { problemId: p.id, oChoiceId: o.id, xChoiceId: x.id };
}

async function seedShortAnswer() {
  const [p] = await db.insert(problems).values({
    type: "SHORT_ANSWER", content: "주관식", departmentId: deptA, status: "ACTIVE", createdBy: superAdminId,
  }).returning({ id: problems.id });
  return p.id;
}

describe("getProblemStatDetail", () => {
  it("D1: 없는 문제 — 서브플랜 5와 다른 문구다", async () => {
    await expect(getProblemStatDetail(db, 999999, superAdmin)).rejects
      .toMatchObject({ message: "존재하지 않는 문제입니다." });
  });

  it("R8: 없는 문제 + 남의 부서면 존재 검사가 먼저다", async () => {
    await expect(getProblemStatDetail(db, 999999, deptAdminOfOtherDept)).rejects
      .toMatchObject({ message: "존재하지 않는 문제입니다." });
  });

  it("D3: 남의 부서면 403/990", async () => {
    const { problemId: foreignProblemId } = await seedMcq(); // deptA 소속
    await expect(getProblemStatDetail(db, foreignProblemId, deptAdminOfOtherDept)).rejects
      .toMatchObject({ errorCode: ErrorCode.ACCESS_AUTH_DENIED });
  });

  it("D8: 아무도 안 고른 보기도 0회로 남는다", async () => {
    const { problemId: oxId, oChoiceId, xChoiceId } = await seedOx();
    const d = await getProblemStatDetail(db, oxId, superAdmin);
    expect(d.choiceDistribution).toEqual([
      { choiceId: oChoiceId, choiceText: "O", selectedCount: 1 },
      { choiceId: xChoiceId, choiceText: "X", selectedCount: 0 },
    ]);
  });

  it("D7/D14: 선택지 없는 유형은 분포 null, excludedAttempts 0", async () => {
    const shortAnswerId = await seedShortAnswer();
    const d = await getProblemStatDetail(db, shortAnswerId, superAdmin);
    expect(d.choiceDistribution).toBeNull();
    expect(d.excludedAttempts).toBe(0);
  });

  it("D11: excludedAttempts = 전체 시도 − 분석된 시도(옛 선택지 기록은 매칭되지 않는다)", async () => {
    const { problemId } = await seedMcq(); // 이미 시도 1건(분석됨) 있음
    // 문제를 수정해 선택지 ID 가 바뀐 것을 흉내낸다 — 다른 문제의 선택지를 가리키는
    // attempt_choices 행을 만든다. countAnalyzedAttempts 의 조인 조건이 이걸 걸러야 한다.
    const { c1Id: otherProblemChoiceId } = await seedMcq();
    const [staleAttempt] = await db.insert(attempts)
      .values({ userId: superAdminId, problemId, submittedAnswer: "나", isCorrect: false }).returning({ id: attempts.id });
    await db.insert(attemptChoices).values([{ attemptId: staleAttempt.id, choiceId: otherProblemChoiceId, choiceText: "나" }]);
    const d = await getProblemStatDetail(db, problemId, superAdmin);
    expect(d.summary.totalAttempts).toBe(2); // 원래 1건 + 방금 심은 1건
    expect(d.excludedAttempts).toBe(1);      // 방금 심은 것만 매칭 안 됨
  });

  it("D15: recentWrongSamples 는 오답만 최대 5건", async () => {
    const problemId = await seedShortAnswer();
    await db.insert(attempts).values(
      Array.from({ length: 6 }, (_, i) => ({
        userId: superAdminId, problemId, submittedAnswer: `오답${i}`, isCorrect: false,
        submittedAt: new Date(2026, 0, i + 1),
      })),
    );
    const d = await getProblemStatDetail(db, problemId, superAdmin);
    expect(d.recentWrongSamples.length).toBe(5);
  });

  it("응답 키 집합", async () => {
    const { problemId: mcqId } = await seedMcq();
    // recentWrongSamples[0] 을 실제로 검증하려면 오답이 최소 1건 있어야 한다 — 없으면
    // 배열이 비어 [0] 이 undefined 가 되어 이 단언이 항상 우연히 통과한다.
    await db.insert(attempts).values({ userId: superAdminId, problemId: mcqId, submittedAnswer: "나", isCorrect: false });
    const d = await getProblemStatDetail(db, mcqId, superAdmin);
    expect(Object.keys(d).sort()).toEqual(["choiceDistribution", "excludedAttempts", "recentWrongSamples", "summary"]);
    expect(Object.keys(d.summary).sort()).toEqual(["accuracyRate", "content", "correctAttempts",
      "departmentId", "departmentName", "lastAttemptAt", "problemId", "status", "totalAttempts", "type"]);
    expect(Object.keys(d.choiceDistribution![0]).sort()).toEqual(["choiceId", "choiceText", "selectedCount"]);
    expect(d.recentWrongSamples.length).toBeGreaterThan(0);
    expect(Object.keys(d.recentWrongSamples[0]).sort()).toEqual(["submittedAnswer", "submittedAt"]);
  });
});
