import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import { eq } from "drizzle-orm";
import { migrateTestDb, testDb, truncateAll } from "../../test/db";
import {
  departments, users, problems, problemChoices, problemAnswers, problemBlanks,
  attempts, attemptChoices, attemptBlankAnswers,
} from "../db/schema";
import type { AuthUser } from "../auth/types";
import * as attemptDao from "../db/attempts";
import { submitAttempt } from "./attemptService";

const db = testDb();
let deptId = 0;
let actor: AuthUser;

beforeAll(async () => { await migrateTestDb(); });

beforeEach(async () => {
  await truncateAll();
  const [d] = await db.insert(departments).values({ name: "가팀", code: "A" }).returning();
  deptId = d.id;
  const [u] = await db.insert(users).values({
    employeeNo: "emp01", name: "직원", email: "emp@x.local", passwordHash: "h", departmentId: d.id, role: "EMPLOYEE",
  }).returning();
  actor = { userId: u.id, employeeNo: "emp01", name: "직원", role: "EMPLOYEE", departmentId: d.id, mustChangePassword: false };
});

async function seedProblem(over: Partial<typeof problems.$inferInsert> = {}) {
  const [row] = await db.insert(problems).values({
    type: "MCQ_SINGLE", content: "본문", departmentId: deptId, status: "ACTIVE", createdBy: actor.userId, ...over,
  }).returning({ id: problems.id });
  return row.id;
}

async function seedShortAnswer(answerText = "정답"): Promise<number> {
  const id = await seedProblem({ type: "SHORT_ANSWER" });
  await db.insert(problemAnswers).values({ problemId: id, answerText });
  return id;
}

async function seedMcq(): Promise<{ problemId: number; choiceId: number; wrongChoiceId: number }> {
  const problemId = await seedProblem({ type: "MCQ_SINGLE" });
  const [choice, wrong] = await db.insert(problemChoices).values([
    { problemId, choiceText: "가", isCorrect: true, displayOrder: 1 },
    { problemId, choiceText: "나", isCorrect: false, displayOrder: 2 },
  ]).returning({ id: problemChoices.id });
  return { problemId, choiceId: choice.id, wrongChoiceId: wrong.id };
}

async function seedBlank(blankKey = "a", answerText = "가", revealCount = 1): Promise<number> {
  const problemId = await seedProblem({ type: "FILL_BLANK", blankRevealCount: revealCount });
  await db.insert(problemBlanks).values({ problemId, blankKey, answerText, displayOrder: 1 });
  return problemId;
}

describe("submitAttempt — G1: 문제 조회", () => {
  it("없는 id 는 400/1000/존재하지 않거나 보관된 문제입니다", async () => {
    await expect(submitAttempt(db, 999999, { selectedChoiceIds: [] }, actor)).rejects.toMatchObject({
      message: "존재하지 않거나 보관된 문제입니다.",
    });
  });

  it("ARCHIVED 문제도 같은 문구다", async () => {
    const id = await seedProblem({ status: "ARCHIVED" });
    await expect(submitAttempt(db, id, { selectedChoiceIds: [] }, actor)).rejects.toMatchObject({
      message: "존재하지 않거나 보관된 문제입니다.",
    });
  });
});

describe("submitAttempt — ㉯: 트랜잭션과 자식 자르기", () => {
  it("T2: 요약이 500자를 넘으면 잘라서 저장한다", async () => {
    const shortId = await seedShortAnswer();
    await submitAttempt(db, shortId, { selectedChoiceIds: null, submittedText: "가".repeat(600), blankAnswers: null }, actor);
    const [row] = await db.select().from(attempts);
    expect(row.submittedAnswer!.length).toBe(500);
  });

  it("㉯/T8-1: 빈칸 답이 500자를 넘어도 실패하지 않는다 — 자식도 자른다", async () => {
    // Spring 은 여기서 200/-1 을 내면서 attempts 행만 남겼다(정답지 T8-1, 실측).
    const blankId = await seedBlank();
    const long = "가".repeat(600);
    await submitAttempt(db, blankId, {
      selectedChoiceIds: null, submittedText: null, blankAnswers: [{ blankKey: "a", submittedAnswer: long }],
    }, actor);
    const rows = await db.select().from(attemptBlankAnswers);
    expect(rows).toHaveLength(1);
    expect(rows[0].submittedAnswer!.length).toBe(500);
  });

  it("㉯: 자식 insert 가 실패하면 attempts 도 남지 않는다", async () => {
    // 부모가 커밋된 뒤 자식이 죽는 상황을 만들어야 한다. 존재하지 않는 문제로는 안 된다 —
    // submitAttempt 가 문제를 먼저 조회해 "존재하지 않거나 보관된 문제입니다." 로 끝나므로
    // insert 자체가 일어나지 않아 틀린 이유로 통과한다. 정상 경로로는 유도할 수 없으니
    // (자르기가 컬럼 초과를 막는다) 자식 DAO 를 한 번 던지게 한다.
    const blankId = await seedBlank();
    const validBlankBody = { selectedChoiceIds: null, submittedText: null, blankAnswers: [{ blankKey: "a", submittedAnswer: "가" }] };
    const spy = vi.spyOn(attemptDao, "insertAttemptBlankAnswers").mockRejectedValueOnce(new Error("자식 insert 실패"));
    await expect(submitAttempt(db, blankId, validBlankBody, actor)).rejects.toThrow("자식 insert 실패");
    expect(await db.select().from(attempts)).toHaveLength(0); // 롤백됐다
    spy.mockRestore();
  });
});

describe("submitAttempt — MCQ 채점·저장", () => {
  it("T5: 선택지가 없으면 attempt_choices 를 만들지 않는다", async () => {
    const { problemId } = await seedMcq();
    await submitAttempt(db, problemId, { selectedChoiceIds: [], submittedText: null, blankAnswers: null }, actor);
    expect(await db.select().from(attemptChoices)).toHaveLength(0);
  });

  it("T6: choice_text 는 저장 시점 스냅샷이다", async () => {
    const { problemId, choiceId } = await seedMcq();
    await submitAttempt(db, problemId, { selectedChoiceIds: [choiceId], submittedText: null, blankAnswers: null }, actor);
    await db.update(problemChoices).set({ choiceText: "바뀐 문구" }).where(eq(problemChoices.id, choiceId));
    expect((await db.select().from(attemptChoices))[0].choiceText).toBe("가");
  });

  it("정답 집합과 일치하면 correct: true", async () => {
    const { problemId, choiceId } = await seedMcq();
    const r = await submitAttempt(db, problemId, { selectedChoiceIds: [choiceId], submittedText: null, blankAnswers: null }, actor);
    expect(r.correct).toBe(true);
  });

  it("오답 선택지면 correct: false", async () => {
    const { problemId, wrongChoiceId } = await seedMcq();
    const r = await submitAttempt(db, problemId, { selectedChoiceIds: [wrongChoiceId], submittedText: null, blankAnswers: null }, actor);
    expect(r.correct).toBe(false);
  });
});

describe("submitAttempt — SHORT_ANSWER 채점 (buildGradeInput 이 findAnswersByProblemId 를 부른다)", () => {
  it("허용 정답과 normalize 일치하면 correct: true", async () => {
    const shortId = await seedShortAnswer("보정계수");
    const r = await submitAttempt(db, shortId, { selectedChoiceIds: null, submittedText: "  보정계수  ", blankAnswers: null }, actor);
    expect(r.correct).toBe(true);
  });

  it("일치하지 않으면 correct: false", async () => {
    const shortId = await seedShortAnswer("보정계수");
    const r = await submitAttempt(db, shortId, { selectedChoiceIds: null, submittedText: "전혀 다른 답", blankAnswers: null }, actor);
    expect(r.correct).toBe(false);
  });
});

describe("submitAttempt — 응답", () => {
  it("G14: 채점 응답에 explanation 이 나온다 — 상세에는 없던 값이다", async () => {
    const { problemId } = await seedMcq();
    await db.update(problems).set({ explanation: "해설 본문" }).where(eq(problems.id, problemId));
    const r = await submitAttempt(db, problemId, { selectedChoiceIds: [], submittedText: null, blankAnswers: null }, actor);
    expect(r.explanation).toBe("해설 본문");
  });

  it("Step 2-1: AttemptResult 의 키 집합이 정확히 세 개다", async () => {
    const { problemId } = await seedMcq();
    const r = await submitAttempt(db, problemId, { selectedChoiceIds: [], submittedText: null, blankAnswers: null }, actor);
    expect(Object.keys(r).sort()).toEqual(["blankResults", "correct", "explanation"]);
  });

  it("Step 2-1: blankResults 항목의 키 집합이 BlankAnswerResult.java 의 4필드와 정확히 같다", async () => {
    // blankResults 를 DB 행에서 spread 하면 problem_blanks.id·displayOrder 가 함께 나간다 —
    // M2 의 revealedBlanks 에서 실제로 살아남은 변이가 그것이다.
    const blankId = await seedBlank();
    const r = await submitAttempt(db, blankId, {
      selectedChoiceIds: null, submittedText: null, blankAnswers: [{ blankKey: "a", submittedAnswer: "가" }],
    }, actor);
    expect(Object.keys(r.blankResults![0]).sort()).toEqual(["blankKey", "correct", "correctAnswer", "submittedAnswer"]);
  });

  it("FILL_BLANK 가 아니면 blankResults 는 null", async () => {
    const { problemId } = await seedMcq();
    const r = await submitAttempt(db, problemId, { selectedChoiceIds: [], submittedText: null, blankAnswers: null }, actor);
    expect(r.blankResults).toBeNull();
  });
});
