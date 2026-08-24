import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { eq } from "drizzle-orm";
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
  it("L13: 응답 키 4개, items[i] 키 10개(problemId 포함), accuracyRate 는 실제 DB 값이다(X1·X2·L12 를 순수함수가 아니라 실제 경로로)", async () => {
    // toStatItem 단위 테스트는 손으로 만든 row 리터럴만 통과시켰다 — listProblemStats 가
    // 실제로 그 함수를 호출해 결과를 매핑하는지는 아무도 안 봤다. 여기서 세 가지 실제
    // DB 값(1.0 · 0.0 · null)을 한 응답 안에서 확인한다.
    const withAttempt = await seedWithAttempts({ content: "문제" }, 1, 0);   // 1.0
    const allWrong = await seedWithAttempts({ content: "전부오답" }, 0, 2);  // 0.0
    const noAttempts = await seedWithAttempts({ content: "미응시" }, 0, 0);  // null
    const result = await listProblemStats(db, superAdmin, { departmentId: null, status: null, page: 1, size: 20 });
    expect(Object.keys(result).sort()).toEqual(["items", "page", "size", "totalCount"]);
    expect(Object.keys(result.items[0]).sort()).toEqual([
      "accuracyRate", "content", "correctAttempts", "departmentId", "departmentName",
      "lastAttemptAt", "problemId", "status", "totalAttempts", "type",
    ]);
    const byId = new Map(result.items.map((i) => [i.problemId, i]));
    expect(byId.get(withAttempt)?.accuracyRate).toBe(1);
    expect(byId.get(allWrong)?.accuracyRate).toBe(0);
    expect(byId.get(noAttempts)?.accuracyRate).toBeNull();
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

// MCQ_MULTI 는 한 시도가 attempt_choices 를 여러 행 남기는 유형이다 — countAnalyzedAttempts 의
// DISTINCT(N1 D13)가 존재하는 바로 그 이유. 그런데 CHOICE_TYPES 에서 이 유형만 빠져도
// D7·D8·D11 전부 초록으로 남는다(전부 MCQ_SINGLE·OX 픽스처를 쓴다) — 직접 찍어야 한다.
async function seedMcqMulti() {
  const [p] = await db.insert(problems).values({
    type: "MCQ_MULTI", content: "복수선택", departmentId: deptA, status: "ACTIVE", createdBy: superAdminId,
  }).returning({ id: problems.id });
  const [c1] = await db.insert(problemChoices)
    .values({ problemId: p.id, choiceText: "가", isCorrect: true, displayOrder: 1 }).returning({ id: problemChoices.id });
  const [c2] = await db.insert(problemChoices)
    .values({ problemId: p.id, choiceText: "나", isCorrect: true, displayOrder: 2 }).returning({ id: problemChoices.id });
  const [a1] = await db.insert(attempts)
    .values({ userId: superAdminId, problemId: p.id, submittedAnswer: "가,나", isCorrect: true }).returning({ id: attempts.id });
  await db.insert(attemptChoices).values([
    { attemptId: a1.id, choiceId: c1.id, choiceText: "가" },
    { attemptId: a1.id, choiceId: c2.id, choiceText: "나" },
  ]);
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

  it("D7: MCQ_MULTI 도 CHOICE_TYPES 대상이다 — 분포가 null 이 아니다", async () => {
    const problemId = await seedMcqMulti();
    const d = await getProblemStatDetail(db, problemId, superAdmin);
    expect(d.choiceDistribution).not.toBeNull();
    expect(d.choiceDistribution!.length).toBe(2);
    // 한 시도가 두 보기를 골랐으니 분석된 시도는 1건 — excludedAttempts 는 0.
    expect(d.excludedAttempts).toBe(0);
  });

  it("D2: 보관된 문제도 상세 조회가 된다 — 상태 필터가 없다", async () => {
    const { problemId } = await seedMcq();
    await db.update(problems).set({ status: "ARCHIVED" }).where(eq(problems.id, problemId));
    const d = await getProblemStatDetail(db, problemId, superAdmin);
    expect(d.summary.status).toBe("ARCHIVED");
  });

  it("DEPT_ADMIN 이 자기 부서 문제를 조회하면 통과한다(assertOwnership 재사용의 양성 경로)", async () => {
    const { problemId } = await seedMcq(); // deptA 소속
    const d = await getProblemStatDetail(db, problemId, deptAdmin); // deptAdmin 도 deptA
    expect(d.summary.problemId).toBe(problemId);
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

  // "오답만" 절반은 이 테스트로는 판별력이 없다(오답만 심었다) — 그 절반은
  // lib/db/stats.test.ts 의 findRecentWrong DAO 테스트가 고정한다. 여기서 실제로 확인하는
  // 것은 "최대 5건" 뿐이다.
  it("D15: recentWrongSamples 는 최대 5건으로 잘린다(오답만 필터링은 DAO 테스트가 고정)", async () => {
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

describe("listProblemStats — 페이징이 SQL 정렬 위에서 잘린다 (승인된 이탈 ㉠ 의 안전망)", () => {
  it("페이지를 이어 붙인 순서가 전체 정렬과 정확히 같다", async () => {
    // 이탈 ㉠ 으로 Java 의 서비스 재정렬(no-op)을 뺐다. 그래서 "페이지 안에서만 맞고 전체로는
    // 틀린" 상태를 잡을 것이 여기밖에 없다 — 원저자 주석이 경고한 바로 그 상태다.
    //
    // 정답률을 전부 다르게 만들어 정렬이 실제로 일을 하게 한다. 동률이면 타이브레이커만
    // 시험하게 되고, 그건 이미 DAO 테스트가 본다(N1).
    for (const [correct, wrong] of [[0, 7], [1, 6], [2, 5], [3, 4], [4, 3], [5, 2], [6, 1]]) {
      await seedWithAttempts({ content: `${correct}/7` }, correct, wrong);
    }
    const q = { departmentId: null, status: null };
    const pages = [];
    for (const page of [1, 2, 3]) {
      pages.push(await listProblemStats(db, superAdmin, { ...q, page, size: 3 }));
    }
    const concatenated = pages.flatMap((p) => p.items.map((i) => i.problemId));
    const whole = await listProblemStats(db, superAdmin, { ...q, page: 1, size: 100 });

    expect(concatenated).toHaveLength(7);
    expect(new Set(concatenated).size).toBe(7);          // 중복·누락 없음
    expect(concatenated).toEqual(whole.items.map((i) => i.problemId));   // **순서까지 같다**
    // 정렬이 실제로 오름차순인지도 여기서 함께 본다 — 순서 단언만으로는 두 목록이 나란히
    // 틀려도 통과한다.
    const rates = whole.items.map((i) => i.accuracyRate!);
    expect(rates).toEqual([...rates].sort((a, b) => a - b));
    expect(rates[0]).toBe(0);
  });

  it("totalCount 는 페이지 크기와 무관하게 전체 건수다", async () => {
    for (let i = 0; i < 7; i++) await seedWithAttempts({ content: `q${i}` }, 1, 1);
    for (const size of [3, 100]) {
      expect((await listProblemStats(db, superAdmin, { departmentId: null, status: null, page: 1, size })).totalCount)
        .toBe(7);
    }
  });
});
