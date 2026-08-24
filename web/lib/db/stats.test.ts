import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { migrateTestDb, testDb, truncateAll } from "../../test/db";
import { departments, problems, users, attempts, problemChoices, attemptChoices } from "./schema";
import {
  findProblemStats, countProblemStats, findAllProblemStats, countActiveProblems,
  findProblemStat, countAnalyzedAttempts, findChoiceDistribution, findRecentWrong,
} from "./stats";

const db = testDb();
let deptId = 0, userId = 0;

beforeAll(async () => { await migrateTestDb(); });
beforeEach(async () => {
  await truncateAll();
  [{ id: deptId }] = await db.insert(departments)
    .values({ name: "가팀", code: "A", status: "ACTIVE" }).returning({ id: departments.id });
  // problems.created_by 는 NOT NULL + users FK 다.
  [{ id: userId }] = await db.insert(users).values({
    employeeNo: "admin", name: "관리자", email: "a@b.c", passwordHash: "x",
    departmentId: deptId, role: "SUPER_ADMIN", status: "ACTIVE", mustChangePassword: false,
  }).returning({ id: users.id });
});

/** 문제 하나를 만들고 정답/오답 시도를 원하는 만큼 붙인다. */
async function seedWithAttempts(over: Partial<typeof problems.$inferInsert>, correct: number, wrong: number) {
  const [p] = await db.insert(problems).values({
    type: "OX", content: "본문", departmentId: deptId, status: "ACTIVE", createdBy: userId, ...over,
  }).returning({ id: problems.id });
  const rows = [
    ...Array.from({ length: correct }, () => ({ userId, problemId: p.id, submittedAnswer: "가", isCorrect: true })),
    ...Array.from({ length: wrong }, () => ({ userId, problemId: p.id, submittedAnswer: "나", isCorrect: false })),
  ];
  if (rows.length) await db.insert(attempts).values(rows);
  return p.id;
}

describe("findProblemStats — 정렬 (이탈 ㉠: SQL 만 정렬한다)", () => {
  it("L6: 정답률 오름차순", async () => {
    const high = await seedWithAttempts({ content: "80%" }, 4, 1);   // 0.8
    const low  = await seedWithAttempts({ content: "20%" }, 1, 4);   // 0.2
    const mid  = await seedWithAttempts({ content: "50%" }, 1, 1);   // 0.5
    const rows = await findProblemStats(db, { limit: 100, offset: 0 });
    expect(rows.map((r) => r.problemId)).toEqual([low, mid, high]);
  });

  it("L7: 미응시(시도 0건)는 맨 뒤 — 0% 가 아니다", async () => {
    const none = await seedWithAttempts({ content: "미응시" }, 0, 0);
    const zero = await seedWithAttempts({ content: "전부오답" }, 0, 3);   // 0.0
    const rows = await findProblemStats(db, { limit: 100, offset: 0 });
    // 0.0 이 맨 앞, null 이 맨 뒤. 이 둘을 못 가르면 "미응시"와 "전부 틀림"이 섞인다.
    expect(rows.map((r) => r.problemId)).toEqual([zero, none]);
    expect(rows[0].totalAttempts).toBe(3);
    expect(rows[1].totalAttempts).toBe(0);
  });

  // 주의(브리핑 원문 그대로 둔 2행 테스트 — 판별력 없음): 이 테스트는 `, p.id` 를 지워도
  // 계속 초록으로 남는다. HashAggregate 가 그룹 수 2건에서는 우연히 삽입 순서를 보존하기
  // 때문이다(id 오름차순 == 항상 삽입 순서이므로 이 정도 크기에서는 결과가 우연히 맞는다).
  // 실제 판별은 바로 아래 6건 테스트가 한다 — 이 테스트를 그 테스트와 같은 무게의 증거로
  // 읽지 말 것.
  it("L8: 동률은 problemId 오름차순 (2건 — 브리핑 원문, 판별력 없음. 실제 판별은 아래 6건 테스트)", async () => {
    const a = await seedWithAttempts({ content: "a" }, 1, 1);
    const b = await seedWithAttempts({ content: "b" }, 2, 2);   // 같은 0.5
    const rows = await findProblemStats(db, { limit: 100, offset: 0 });
    expect(rows.map((r) => r.problemId)).toEqual([a, b].sort((x, y) => x - y));
  });

  // 실측(ad-hoc 스크립트, N=6)으로 확인: `, p.id` 를 지우면 HashAggregate 출력이
  // [4,5,6,3,1,2] 처럼 실제로 뒤섞인다 — 위 2건 테스트로는 못 잡는 것을 여기서 잡는다.
  it("L8: 동률 6건의 순서가 정확히 problemId 오름차순이다 — Set 비교로는 안 잡힌다", async () => {
    const ids: number[] = [];
    for (let i = 0; i < 6; i++) ids.push(await seedWithAttempts({ content: `q${i}` }, 1, 1));
    const rows = await findProblemStats(db, { limit: 100, offset: 0 });
    expect(rows.map((r) => r.problemId)).toEqual([...ids].sort((x, y) => x - y));
  });

  it("L8: 타이브레이커가 페이징 경계에서 중복·누락을 막는다", async () => {
    // 전부 같은 정답률로 만들어 타이브레이커만이 순서를 결정하게 한다.
    const ids: number[] = [];
    for (let i = 0; i < 6; i++) ids.push(await seedWithAttempts({ content: `q${i}` }, 1, 1));
    const p1 = await findProblemStats(db, { limit: 3, offset: 0 });
    const p2 = await findProblemStats(db, { limit: 3, offset: 3 });
    const concatIds = [...p1, ...p2].map((r) => r.problemId);
    expect(new Set(concatIds).size).toBe(6);   // 중복 없음
    // 중복 없음만으로는 부족하다 — 페이지를 이어 붙인 순서가 전체 오름차순과 정확히 같아야
    // "경계에서 잘못 잘리지 않았다"는 것이 증명된다.
    expect(concatIds).toEqual([...ids].sort((x, y) => x - y));
  });
});

describe("findProblemStats / countProblemStats — 필터", () => {
  it("L11: totalCount 는 시도 수에 부풀지 않는다", async () => {
    await seedWithAttempts({ content: "시도 5건" }, 3, 2);
    expect(await countProblemStats(db, {})).toBe(1);   // 5 가 아니다
  });

  it("L5: status 빈 문자열은 필터가 아니다", async () => {
    await seedWithAttempts({ content: "활성" }, 0, 0);
    await seedWithAttempts({ content: "보관", status: "ARCHIVED" }, 0, 0);
    expect((await findProblemStats(db, { status: "", limit: 100, offset: 0 })).length).toBe(2);
    expect((await findProblemStats(db, { status: "ACTIVE", limit: 100, offset: 0 })).length).toBe(1);
  });

  it("L4: status 필터를 안 주면 보관 문제도 나온다", async () => {
    await seedWithAttempts({ content: "보관", status: "ARCHIVED" }, 1, 1);
    expect((await findProblemStats(db, { limit: 100, offset: 0 })).length).toBe(1);
  });

  it("departmentId 필터가 있으면 그 부서만", async () => {
    const [other] = await db.insert(departments)
      .values({ name: "나팀", code: "B", status: "ACTIVE" }).returning({ id: departments.id });
    const a = await seedWithAttempts({ content: "가팀" }, 1, 0);
    await seedWithAttempts({ content: "나팀", departmentId: other.id }, 1, 0);
    expect((await findProblemStats(db, { departmentId: deptId, limit: 100, offset: 0 })).map((r) => r.problemId))
      .toEqual([a]);
    expect(await countProblemStats(db, { departmentId: deptId })).toBe(1);
  });
});

describe("findAllProblemStats", () => {
  it("페이징 없이 전부 반환하고, status 필터가 없다(보관도 포함된다)", async () => {
    await seedWithAttempts({ content: "활성" }, 1, 0);
    await seedWithAttempts({ content: "보관", status: "ARCHIVED" }, 1, 0);
    expect((await findAllProblemStats(db)).length).toBe(2);
  });

  it("departmentId 를 주면 그 부서만", async () => {
    const [other] = await db.insert(departments)
      .values({ name: "나팀", code: "B", status: "ACTIVE" }).returning({ id: departments.id });
    const a = await seedWithAttempts({ content: "가팀" }, 1, 0);
    await seedWithAttempts({ content: "나팀", departmentId: other.id }, 1, 0);
    expect((await findAllProblemStats(db, deptId)).map((r) => r.problemId)).toEqual([a]);
  });

  it("findProblemStats 와 같은 정렬 규칙을 쓴다", async () => {
    const low = await seedWithAttempts({ content: "20%" }, 1, 4);
    const high = await seedWithAttempts({ content: "80%" }, 4, 1);
    expect((await findAllProblemStats(db)).map((r) => r.problemId)).toEqual([low, high]);
  });
});

describe("countActiveProblems", () => {
  it("ACTIVE 만 센다", async () => {
    await seedWithAttempts({ content: "활성" }, 0, 0);
    await seedWithAttempts({ content: "보관", status: "ARCHIVED" }, 0, 0);
    expect(await countActiveProblems(db)).toBe(1);
  });

  it("departmentId 필터", async () => {
    const [other] = await db.insert(departments)
      .values({ name: "나팀", code: "B", status: "ACTIVE" }).returning({ id: departments.id });
    await seedWithAttempts({ content: "가팀" }, 0, 0);
    await seedWithAttempts({ content: "나팀", departmentId: other.id }, 0, 0);
    expect(await countActiveProblems(db, deptId)).toBe(1);
  });
});

describe("findProblemStat", () => {
  // 다른 문제를 먼저 심어 서로 다른 시도 수를 준다 — WHERE p.id = ... 가 없어도(예: 부서
  // 조건 등으로 잘못 바뀌어도) GROUP BY p.id 가 여러 행을 만들어 내고, 그중 하나가 우연히
  // rows[0] 이 되어 "그럴듯한 문제"를 돌려주는 실패 모드를 이 두 문제의 시도 수 차이가 잡는다.
  it("요청한 problemId 의 행만 반환한다 — 다른 문제와 섞이지 않는다", async () => {
    const other = await seedWithAttempts({ content: "다른 문제" }, 5, 0);   // 시도 5건
    const pid = await seedWithAttempts({ content: "단일" }, 2, 1);          // 시도 3건
    const row = await findProblemStat(db, pid);
    expect(row?.problemId).toBe(pid);
    expect(row?.problemId).not.toBe(other);
    expect(row?.totalAttempts).toBe(3);
    expect(row?.correctAttempts).toBe(2);
    expect(row?.departmentId).toBe(deptId);
  });

  it("존재하지 않는 문제는 null — 다른 문제가 존재해도", async () => {
    // 문제를 하나도 안 심으면 WHERE 를 지운 변이도 우연히 빈 배열을 돌려줘 통과한다.
    // 존재하는 문제를 하나 심어야 "필터가 실제로 걸렸다"가 증명된다.
    await seedWithAttempts({ content: "있음" }, 1, 0);
    expect(await findProblemStat(db, 999999)).toBeNull();
  });

  // MAX(a.submitted_at) 미러가 실제로 최댓값을 고르는지, parseUtcTimestamp 변환이 맞는지
  // 아무 데서도 확인되지 않고 있었다 — MIN 으로 바꿔도 전체 스위트가 초록이었다.
  it("lastAttemptAt 은 MAX(submitted_at) 이다 — 가장 최근 시도가 나와야 한다", async () => {
    const pid = await seedWithAttempts({ content: "시각" }, 0, 0);
    await db.insert(attempts).values([
      { userId, problemId: pid, submittedAnswer: "가", isCorrect: true, submittedAt: new Date("2026-01-05T00:00:00Z") },
      { userId, problemId: pid, submittedAnswer: "나", isCorrect: false, submittedAt: new Date("2026-01-10T00:00:00Z") },
      { userId, problemId: pid, submittedAnswer: "다", isCorrect: true, submittedAt: new Date("2026-01-03T00:00:00Z") },
    ]);
    const row = await findProblemStat(db, pid);
    expect(row?.lastAttemptAt?.toISOString()).toBe("2026-01-10T00:00:00.000Z");
  });
});

describe("findChoiceDistribution / countAnalyzedAttempts", () => {
  it("choiceId 별 선택 횟수를 센다", async () => {
    const pid = await seedWithAttempts({ content: "MCQ", type: "MCQ_SINGLE" }, 0, 0);
    const [c1] = await db.insert(problemChoices)
      .values({ problemId: pid, choiceText: "A", isCorrect: true, displayOrder: 1 }).returning({ id: problemChoices.id });
    const [c2] = await db.insert(problemChoices)
      .values({ problemId: pid, choiceText: "B", isCorrect: false, displayOrder: 2 }).returning({ id: problemChoices.id });
    const [a1] = await db.insert(attempts)
      .values({ userId, problemId: pid, submittedAnswer: "A", isCorrect: true }).returning({ id: attempts.id });
    const [a2] = await db.insert(attempts)
      .values({ userId, problemId: pid, submittedAnswer: "A", isCorrect: true }).returning({ id: attempts.id });
    const [a3] = await db.insert(attempts)
      .values({ userId, problemId: pid, submittedAnswer: "B", isCorrect: false }).returning({ id: attempts.id });
    await db.insert(attemptChoices).values([
      { attemptId: a1.id, choiceId: c1.id, choiceText: "A" },
      { attemptId: a2.id, choiceId: c1.id, choiceText: "A" },
      { attemptId: a3.id, choiceId: c2.id, choiceText: "B" },
    ]);
    const dist = await findChoiceDistribution(db, pid);
    expect(dist.slice().sort((x, y) => x.choiceId - y.choiceId)).toEqual([
      { choiceId: c1.id, selectedCount: 2 },
      { choiceId: c2.id, selectedCount: 1 },
    ]);
  });

  it("D13: excludedAttempts 의 근거 — 다른 문제의 choiceId 는 안 센다", async () => {
    // 문제 A 의 시도가 문제 B 의 choiceId 를 갖고 있으면 분석 대상이 아니다.
    // 조인 조건 `c.problem_id = a.problem_id` 를 빼면 이 테스트가 빨개진다.
    const pidA = await seedWithAttempts({ content: "문제 A", type: "MCQ_SINGLE" }, 0, 0);
    const pidB = await seedWithAttempts({ content: "문제 B", type: "MCQ_SINGLE" }, 0, 0);
    const [choiceA] = await db.insert(problemChoices)
      .values({ problemId: pidA, choiceText: "A", isCorrect: true, displayOrder: 1 }).returning({ id: problemChoices.id });
    const [choiceB] = await db.insert(problemChoices)
      .values({ problemId: pidB, choiceText: "B", isCorrect: true, displayOrder: 1 }).returning({ id: problemChoices.id });
    const [a1] = await db.insert(attempts)
      .values({ userId, problemId: pidA, submittedAnswer: "A", isCorrect: true }).returning({ id: attempts.id });
    const [a2] = await db.insert(attempts)
      .values({ userId, problemId: pidA, submittedAnswer: "B", isCorrect: false }).returning({ id: attempts.id });
    await db.insert(attemptChoices).values([
      { attemptId: a1.id, choiceId: choiceA.id, choiceText: "A" },
      { attemptId: a2.id, choiceId: choiceB.id, choiceText: "B" }, // 다른 문제의 choiceId
    ]);
    // 총 시도는 2건이지만, 문제 A 의 현재 보기와 맞는 것은 a1 뿐이다.
    expect(await countAnalyzedAttempts(db, pidA)).toBe(1);
  });

  // D13 의 근거는 두 절이다 — 조인 조건(위 테스트)과 DISTINCT(이 테스트). 앞서 붙인 조인
  // 조건 테스트는 시도마다 attempt_choices 가 정확히 1행이라 DISTINCT 가 no-op 이었다.
  // MCQ_MULTI 는 시도 하나가 보기를 여러 개 고르면 attempt_choices 가 여러 행이 되므로
  // DISTINCT 가 없으면 시도 수가 부풀어 excludedAttempts 가 0으로 눌린다(D12 가 막으려는
  // 바로 그 상태).
  it("D13: countAnalyzedAttempts 는 DISTINCT 다 — 한 시도가 보기 여러 개를 고른다(MCQ_MULTI)", async () => {
    const pid = await seedWithAttempts({ content: "복수선택", type: "MCQ_MULTI" }, 0, 0);
    const [c1] = await db.insert(problemChoices)
      .values({ problemId: pid, choiceText: "A", isCorrect: true, displayOrder: 1 }).returning({ id: problemChoices.id });
    const [c2] = await db.insert(problemChoices)
      .values({ problemId: pid, choiceText: "B", isCorrect: true, displayOrder: 2 }).returning({ id: problemChoices.id });
    const [a1] = await db.insert(attempts)
      .values({ userId, problemId: pid, submittedAnswer: "A,B", isCorrect: true }).returning({ id: attempts.id });
    // 시도 하나(a1)가 attempt_choices 두 행을 남긴다.
    await db.insert(attemptChoices).values([
      { attemptId: a1.id, choiceId: c1.id, choiceText: "A" },
      { attemptId: a1.id, choiceId: c2.id, choiceText: "B" },
    ]);
    expect(await countAnalyzedAttempts(db, pid)).toBe(1);   // 2 가 아니다
  });
});

describe("findRecentWrong", () => {
  it("D15: 오답만, submitted_at DESC, id DESC, limit", async () => {
    // submittedAt 을 명시적으로 넣는다 — defaultNow() 에 맡기면 같은 값을 받아
    // 타이브레이커 없이 순서가 흔들린다(서브플랜 5에서 같은 함정이 있었다).
    const pid = await seedWithAttempts({ content: "오답모음" }, 0, 0);
    await db.insert(attempts).values([
      { userId, problemId: pid, submittedAnswer: "정답", isCorrect: true, submittedAt: new Date("2026-01-05T00:00:00Z") },
      { userId, problemId: pid, submittedAnswer: "오래된오답", isCorrect: false, submittedAt: new Date("2026-01-01T00:00:00Z") },
      { userId, problemId: pid, submittedAnswer: "최신오답1", isCorrect: false, submittedAt: new Date("2026-01-03T00:00:00Z") },
      { userId, problemId: pid, submittedAnswer: "최신오답2", isCorrect: false, submittedAt: new Date("2026-01-03T00:00:00Z") },
    ]);
    const rows = await findRecentWrong(db, pid, 2);
    expect(rows.map((r) => r.submittedAnswer)).toEqual(["최신오답2", "최신오답1"]);
  });

  it("limit 을 넘는 오답은 잘린다", async () => {
    const pid = await seedWithAttempts({ content: "오답많음" }, 0, 0);
    await db.insert(attempts).values(
      Array.from({ length: 4 }, (_, i) => ({
        userId, problemId: pid, submittedAnswer: `오답${i}`, isCorrect: false,
        submittedAt: new Date(2026, 0, i + 1),
      })),
    );
    expect((await findRecentWrong(db, pid, 5)).length).toBe(4);
    expect((await findRecentWrong(db, pid, 2)).length).toBe(2);
  });
});
