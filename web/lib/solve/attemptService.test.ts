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
import { toAttemptSubmitBody } from "./attemptRequestBody";
import { ErrorCode } from "../http/errorCode";

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
  it("T2: 요약이 500자를 넘으면 앞에서부터 500자를 저장한다(Java substring(0,500))", async () => {
    const shortId = await seedShortAnswer();
    // "가".repeat(600) 만 쓰면 어느 500자 구간을 잘라도 결과가 같아 자르는 방향(앞/뒤)을
    // 판별할 수 없다(finding 5) — 구분되는 접두사를 붙여 slice(0, 500) 과 slice(-500) 을 가른다.
    const longText = "머리" + "가".repeat(600);
    await submitAttempt(db, shortId, { selectedChoiceIds: null, submittedText: longText, blankAnswers: null }, actor);
    const [row] = await db.select().from(attempts);
    expect(row.submittedAnswer!.length).toBe(500);
    expect(row.submittedAnswer!.startsWith("머리")).toBe(true);
  });

  it("㉯/T8-1: 빈칸 답이 500자를 넘어도 실패하지 않는다 — 자식도 앞에서부터 자르고, 나머지 열도 정확하다", async () => {
    // Spring 은 여기서 200/-1 을 내면서 attempts 행만 남겼다(정답지 T8-1, 실측).
    const blankId = await seedBlank();
    const long = "머리" + "가".repeat(600); // 잘리는 방향(finding 5)을 가리는 균일 픽스처를 쓰지 않는다.
    await submitAttempt(db, blankId, {
      selectedChoiceIds: null, submittedText: null, blankAnswers: [{ blankKey: "a", submittedAnswer: long }],
    }, actor);
    const rows = await db.select().from(attemptBlankAnswers);
    expect(rows).toHaveLength(1);
    // blankKey·isCorrect 를 포함한 행 전체를 고정한다(finding 3) — `blankKey: r.correctAnswer` 로
    // 바꿔치기해도 length·submittedAnswer 만 보는 단언은 통과했다.
    expect(rows[0].blankKey).toBe("a");
    expect(rows[0].isCorrect).toBe(false); // 600자짜리 오답이라 항상 오답이다
    expect(rows[0].submittedAnswer!.length).toBe(500);
    expect(rows[0].submittedAnswer!.startsWith("머리")).toBe(true);
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

  it("T6: attempt_choices 는 choice_id 를 담고, choice_text 는 저장 시점 스냅샷이다", async () => {
    const { problemId, choiceId } = await seedMcq();
    await submitAttempt(db, problemId, { selectedChoiceIds: [choiceId], submittedText: null, blankAnswers: null }, actor);
    await db.update(problemChoices).set({ choiceText: "바뀐 문구" }).where(eq(problemChoices.id, choiceId));
    const [row] = await db.select().from(attemptChoices);
    expect(row.choiceId).toBe(choiceId); // choiceText 만 보면 오답이 다른 선택지로 저장돼도 안 잡힌다
    expect(row.choiceText).toBe("가");
  });

  it("G5: 다른 문제의 choiceId 를 제출하면 오답이고 attempt_choices 는 비어 있다", async () => {
    // SolveServiceImpl.java:123-125 — 집합 불일치라 오답이고, selectedChoices 필터에도
    // 안 걸려 attempt_choices 에 아무것도 안 들어간다. body.selectedChoiceIds 를 그대로
    // 저장에 흘려보내면(리뷰에서 지적된 mutation) 존재하는 choiceId 라 FK 를 통과해
    // 남의 문제에 붙은 선택지 행이 커밋된다 — 통계의 유일한 소스가 오염된다.
    const { problemId: problemA } = await seedMcq();
    const { choiceId: choiceFromB } = await seedMcq(); // 문제 A 소속이 아닌 choiceId
    const r = await submitAttempt(db, problemA, { selectedChoiceIds: [choiceFromB], submittedText: null, blankAnswers: null }, actor);
    expect(r.correct).toBe(false);
    expect(await db.select().from(attemptChoices)).toHaveLength(0);
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

describe("submitAttempt — attempts 행 전체(정답지 T1, finding 1)", () => {
  it("두 사용자·두 문제로 제출해도 각 attempts 행이 자신의 사용자·문제·정오 여부를 정확히 담는다", async () => {
    // 한 사용자·한 문제짜리 픽스처는 userId/problemId 단언을 동어반복으로 만든다 —
    // Task 1 의 하드코딩된 부서 필터가 바로 그 모양 아래서 숨었다. 여기서는 서로 다른
    // 사용자가 서로 다른 문제에 제출하고, 하나는 정답, 하나는 오답이게 한다 —
    // `isCorrect: !result.correct` 처럼 부호를 뒤집는 mutation 은 둘 중 하나에서 반드시 걸린다.
    const { problemId: problemA, choiceId } = await seedMcq();
    const { problemId: problemB, wrongChoiceId } = await seedMcq();
    // **id 공간이 겹치면 안 된다.** truncateAll 이 RESTART IDENTITY 를 돌리므로 사용자와
    // 문제가 나란히 1, 2 를 받는다. 그러면 userId 와 problemId 값이 같아져 두 필드를
    // 맞바꿔도 컬럼 값이 동일해지고 — 단언이 조용히 동어반복이 된다(재리뷰가 잡은 지점).
    // 사용자를 둘 더 심어 번호를 어긋나게 한다.
    const [userB, userC] = await db.insert(users).values([
      { employeeNo: "emp02", name: "직원B", email: "emp2@x.local", passwordHash: "h", departmentId: deptId, role: "EMPLOYEE" },
      { employeeNo: "emp03", name: "직원C", email: "emp3@x.local", passwordHash: "h", departmentId: deptId, role: "EMPLOYEE" },
    ]).returning();
    const actorB: AuthUser = { ...actor, userId: userB.id, employeeNo: "emp02", name: "직원B" };
    const actorC: AuthUser = { ...actor, userId: userC.id, employeeNo: "emp03", name: "직원C" };

    await submitAttempt(db, problemA, { selectedChoiceIds: [choiceId], submittedText: null, blankAnswers: null }, actorB);
    await submitAttempt(db, problemB, { selectedChoiceIds: [wrongChoiceId], submittedText: null, blankAnswers: null }, actorC);

    const rowA = (await db.select().from(attempts).where(eq(attempts.problemId, problemA)))[0];
    const rowB = (await db.select().from(attempts).where(eq(attempts.problemId, problemB)))[0];
    // 픽스처 전제를 명시적으로 지킨다 — 이게 깨지면 아래 단언들이 무의미해진다.
    expect(rowA.userId).not.toBe(rowA.problemId);
    expect(rowB.userId).not.toBe(rowB.problemId);
    expect(rowA).toMatchObject({ userId: userB.id, problemId: problemA, isCorrect: true });
    expect(rowB).toMatchObject({ userId: userC.id, problemId: problemB, isCorrect: false });
  });
});

describe("submitAttempt — SHORT_ANSWER 채점 (buildGradeInput 이 findAnswersByProblemId 를 부른다)", () => {
  it("허용 정답과 normalize 일치하면 correct: true, 저장은 원문 그대로다(T2-1)", async () => {
    const shortId = await seedShortAnswer("보정계수");
    const r = await submitAttempt(db, shortId, { selectedChoiceIds: null, submittedText: "  보정계수  ", blankAnswers: null }, actor);
    expect(r.correct).toBe(true);
    // normalize 는 채점 비교용일 뿐이다 — truncate(normalizeAnswer(summary)) 처럼 저장 경로에
    // normalize 결과를 흘려보내면 앞뒤 공백이 사라져 이 단언이 잡는다(finding 4). 이력 화면은
    // 이 컬럼을 그대로 렌더한다.
    const [row] = await db.select().from(attempts);
    expect(row.submittedAnswer).toBe("  보정계수  ");
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

describe("submitAttempt — buildGradeInput 의 FILL_BLANK 가드(blankRevealCount)", () => {
  // solveQueryService.ts:81 과 같은 자리지만 리뷰(fix wave item A)가 지적했듯 이 파일은
  // 두 경계 중 하나도 핀에 박지 않았었다 — `< 0` → `< 1` 로 조여도, `== null ||` 절을
  // 통째로 지워도 스위트가 전부 초록이었다. 아래 두 테스트가 그 구멍을 메운다.
  it("blankRevealCount: 0 이면 던지지 않는다 — 가드는 < 0 에서 멈춰야 한다(< 1 로 조이면 여기서 걸린다)", async () => {
    const blankId = await seedBlank("a", "가", 0);
    const r = await submitAttempt(db, blankId, {
      selectedChoiceIds: null, submittedText: null, blankAnswers: [],
    }, actor);
    expect(r.correct).toBe(true);
    // T9: insertAttemptBlankAnswers([]) 가 조기 반환하므로 자식 행은 안 남는다.
    expect(await db.select().from(attemptBlankAnswers)).toHaveLength(0);
    expect(await db.select().from(attempts)).toHaveLength(1);
  });

  it("blankRevealCount: null 이면 던진다 — 에러 코드까지 확인한다(`== null ||` 절이 지워지면 여기서 걸린다)", async () => {
    const blankId = await seedBlank("a", "가", null as unknown as number);
    await expect(
      submitAttempt(db, blankId, { selectedChoiceIds: null, submittedText: null, blankAnswers: [] }, actor),
    ).rejects.toMatchObject({ errorCode: ErrorCode.MSG_PROC_FAIL });
  });
});

describe("submitAttempt — ㉳: blankAnswers 의 null 원소(승인된 이탈, finding 6)", () => {
  const BLANK_COUNT_MESSAGE = "제출한 빈칸 개수가 올바르지 않습니다.";

  it("JSON blankAnswers: [null] 은 Java 의 NPE(200/-1) 대신 검증 실패 문구로 끝난다", async () => {
    // toAttemptSubmitBody 부터 태워야 실제 이탈 경로(readBlankAnswers 의 null 원소 처리)를
    // 겨눈다 — submitAttempt 에 손으로 만든 body 를 바로 넣으면 매핑 단계를 건너뛴다.
    const blankId = await seedBlank();
    const body = toAttemptSubmitBody({ blankAnswers: [null] });
    await expect(submitAttempt(db, blankId, body, actor)).rejects.toMatchObject({ message: BLANK_COUNT_MESSAGE });
  });
});
