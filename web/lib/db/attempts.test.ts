import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { migrateTestDb, testDb, truncateAll } from "../../test/db";
import { departments, problems, users, attempts } from "./schema";
import {
  insertAttempt, insertAttemptChoices, insertAttemptBlankAnswers, findAttemptsByUserId,
} from "./attempts";

const db = testDb();
let deptId = 0;
let userId = 0;
let otherUserId = 0;
let problemId = 0;

beforeAll(async () => { await migrateTestDb(); });
beforeEach(async () => {
  await truncateAll();
  [{ id: deptId }] = await db.insert(departments)
    .values({ name: "가팀", code: "A", status: "ACTIVE" }).returning({ id: departments.id });
  [{ id: userId }] = await db.insert(users).values({
    employeeNo: "admin", name: "관리자", email: "a@b.c", passwordHash: "x",
    departmentId: deptId, role: "SUPER_ADMIN", status: "ACTIVE", mustChangePassword: false,
  }).returning({ id: users.id });
  [{ id: otherUserId }] = await db.insert(users).values({
    employeeNo: "emp1", name: "직원", email: "b@b.c", passwordHash: "x",
    departmentId: deptId, role: "EMPLOYEE", status: "ACTIVE", mustChangePassword: false,
  }).returning({ id: users.id });
  problemId = await seed();
});

async function seed(over: Partial<typeof problems.$inferInsert> = {}) {
  const [row] = await db.insert(problems).values({
    type: "OX", content: "본문", departmentId: deptId, status: "ACTIVE",
    createdBy: userId, sourceNumber: null, ...over,
  }).returning({ id: problems.id });
  return row.id;
}

describe("attempts DAO", () => {
  it("T1/H4: is_correct 를 저장하고 이력에서 correct 로 읽는다", async () => {
    const attemptId = await insertAttempt(db, { userId, problemId, submittedAnswer: "가", isCorrect: true });
    const rows = await findAttemptsByUserId(db, userId);
    // Java 는 `a.is_correct AS correct` 별칭이 없으면 항상 false 가 됐다(정답지 H4).
    // 여기서 true 가 나오는 것이 그 함정을 피했다는 증거다.
    expect(rows[0].correct).toBe(true);
    expect(attemptId).toBeGreaterThan(0);
  });

  it("H1: 남의 시도는 안 나온다", async () => {
    await insertAttempt(db, { userId: otherUserId, problemId, submittedAnswer: null, isCorrect: false });
    expect(await findAttemptsByUserId(db, userId)).toEqual([]);
  });

  it("H2: submitted_at 내림차순", async () => {
    // submittedAt 을 **명시적으로** 넣는다. defaultNow() 에 맡기면 두 insert 가 같은 값을 받을 수
    // 있고, ORDER BY 에 타이브레이커가 없어(H2) 순서가 흔들린다. 서브플랜 4 에서 정렬을 고정하지
    // 않은 단언이 플래키로 두 번의 리뷰를 통과한 전례가 있다.
    await db.insert(attempts).values([
      { userId, problemId, submittedAnswer: "먼저", isCorrect: false, submittedAt: new Date("2026-01-01T00:00:00Z") },
      { userId, problemId, submittedAnswer: "나중", isCorrect: true, submittedAt: new Date("2026-01-02T00:00:00Z") },
    ]);
    expect((await findAttemptsByUserId(db, userId)).map((r) => r.submittedAnswer)).toEqual(["나중", "먼저"]);
  });

  it("H5: 응답 필드가 정확히 7개고, 값도 각 컬럼과 일치한다", async () => {
    // 리뷰(fix wave item B): 모양만 고정하고 값을 안 본 세 컬럼이 있었다 — select 맵에서
    // `attempts.problemId` → `attempts.userId`, `problems.sourceNumber` → `problems.departmentId`,
    // `attempts.submittedAt` → `problems.createdAt` 으로 바꿔치기해도 셋 다 스위트가 초록이었다.
    // sourceNumber 는 문제와 다른 값을 심어야 우연히 겹치지 않는다.
    const numberedId = await seed({ sourceNumber: 42 });
    const explicitSubmittedAt = new Date("2026-03-15T09:30:00Z");
    await db.insert(attempts).values({
      userId, problemId: numberedId, submittedAnswer: "x", isCorrect: false, submittedAt: explicitSubmittedAt,
    });
    const rows = await findAttemptsByUserId(db, userId);
    expect(Object.keys(rows[0]).sort()).toEqual(
      ["correct", "departmentName", "problemContent", "problemId", "sourceNumber", "submittedAnswer", "submittedAt"]);
    expect(rows[0].problemId).toBe(numberedId);
    expect(rows[0].sourceNumber).toBe(42);
    expect(rows[0].submittedAt).toEqual(explicitSubmittedAt);
  });

  it("H7: 보관된 문제의 이력도 나온다 — 목록(S2)과 정반대다", async () => {
    // findAttemptsByUserId 에 p.status 조건을 넣고 싶어지는 자리다. Java 에는 없다.
    const archived = await seed({ status: "ARCHIVED" });
    await insertAttempt(db, { userId, problemId: archived, submittedAnswer: "x", isCorrect: false });
    expect((await findAttemptsByUserId(db, userId)).length).toBe(1);
  });

  it("H6: problems·departments 는 INNER JOIN 이다", async () => {
    // 문제는 보관만 되고 삭제되지 않으므로 실질 무해하지만, LEFT JOIN 으로 바꾸면 Java 와
    // 다른 행이 나올 수 있다. 조인 방식을 문서 대신 테스트로 남긴다.
    await insertAttempt(db, { userId, problemId, submittedAnswer: "x", isCorrect: false });
    const row = (await findAttemptsByUserId(db, userId))[0];
    expect(row.departmentName).toBe("가팀");
    expect(row.problemContent).toBe("본문");
  });

  it("H8: 이력이 없으면 빈 배열이다", async () => {
    expect(await findAttemptsByUserId(db, userId)).toEqual([]);
  });

  it("T5/T7: 빈 배열이면 DB 를 건드리지 않는다(SQL 오류가 나면 안 된다)", async () => {
    await expect(insertAttemptChoices(db, [])).resolves.toBeUndefined();
    await expect(insertAttemptBlankAnswers(db, [])).resolves.toBeUndefined();
  });

  it("T5: attempt_choices 는 넘긴 행을 그대로 저장한다", async () => {
    const attemptId = await insertAttempt(db, { userId, problemId, submittedAnswer: "가", isCorrect: true });
    await insertAttemptChoices(db, [
      { attemptId, choiceId: 1, choiceText: "가" },
      { attemptId, choiceId: 2, choiceText: "나" },
    ]);
    // 저장 자체는 스키마 유니크 제약(T10)이 지키므로, 여기서는 SQL 오류 없이 통과하는 것과
    // 재삽입 시 유니크 위반이 나는 것으로 저장 동작을 확인한다.
    await expect(insertAttemptChoices(db, [{ attemptId, choiceId: 1, choiceText: "가" }])).rejects.toMatchObject({
      code: "23505",
    });
  });

  it("T7: attempt_blank_answers 는 넘긴 행을 그대로 저장한다", async () => {
    const attemptId = await insertAttempt(db, { userId, problemId, submittedAnswer: "x", isCorrect: false });
    await expect(
      insertAttemptBlankAnswers(db, [
        { attemptId, blankKey: "b1", submittedAnswer: "가", isCorrect: true },
      ]),
    ).resolves.toBeUndefined();
  });
});
