import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { migrateTestDb, testDb, truncateAll } from "../../test/db";
import { departments, problems, users, problemChoices, problemAnswers, problemBlanks } from "../db/schema";
import { insertAttempt } from "../db/attempts";
import { findAttemptHistoryWithAnswers } from "./attemptHistoryService";

const db = testDb();
let deptId = 0;
let userId = 0;

beforeAll(async () => { await migrateTestDb(); });
beforeEach(async () => {
  await truncateAll();
  [{ id: deptId }] = await db.insert(departments)
    .values({ name: "가팀", code: "A", status: "ACTIVE" }).returning({ id: departments.id });
  [{ id: userId }] = await db.insert(users).values({
    employeeNo: "admin", name: "관리자", email: "a@b.c", passwordHash: "x",
    departmentId: deptId, role: "SUPER_ADMIN", status: "ACTIVE", mustChangePassword: false,
  }).returning({ id: users.id });
});

async function seedProblem(type: string, over: Partial<typeof problems.$inferInsert> = {}) {
  const [row] = await db.insert(problems).values({
    type, content: "본문", departmentId: deptId, status: "ACTIVE",
    createdBy: userId, sourceNumber: null, ...over,
  }).returning({ id: problems.id });
  return row.id;
}

describe("findAttemptHistoryWithAnswers", () => {
  it("MCQ_SINGLE: 정답 보기 텍스트를 배치로 붙인다", async () => {
    const problemId = await seedProblem("MCQ_SINGLE");
    await db.insert(problemChoices).values([
      { problemId, choiceText: "서울", isCorrect: true, displayOrder: 1 },
      { problemId, choiceText: "부산", isCorrect: false, displayOrder: 2 },
    ]);
    await insertAttempt(db, { userId, problemId, submittedAnswer: "부산", isCorrect: false });

    const rows = await findAttemptHistoryWithAnswers(db, userId, "ADMIN");
    expect(rows).toHaveLength(1);
    expect(rows[0].correctAnswerSummary).toBe("서울");
  });

  it("MCQ_MULTI: 정답 보기 여러 개를 displayOrder 순으로 잇는다(삽입 순서가 달라도)", async () => {
    const problemId = await seedProblem("MCQ_MULTI");
    // 삽입 순서를 displayOrder 와 일부러 다르게 한다 — ORDER BY 가 빠지면
    // insertion order(다, 가)로 나와 "다, 가" 가 되어 테스트가 실패해야 한다.
    await db.insert(problemChoices).values([
      { problemId, choiceText: "다", isCorrect: true, displayOrder: 3 },
      { problemId, choiceText: "가", isCorrect: true, displayOrder: 1 },
      { problemId, choiceText: "나", isCorrect: false, displayOrder: 2 },
    ]);
    await insertAttempt(db, { userId, problemId, submittedAnswer: "나", isCorrect: false });

    const rows = await findAttemptHistoryWithAnswers(db, userId, "ADMIN");
    expect(rows[0].correctAnswerSummary).toBe("가, 다");
  });

  it("SHORT_ANSWER: 허용 정답을 모두 나열한다", async () => {
    const problemId = await seedProblem("SHORT_ANSWER");
    await db.insert(problemAnswers).values([
      { problemId, answerText: "서울" },
      { problemId, answerText: "Seoul" },
    ]);
    await insertAttempt(db, { userId, problemId, submittedAnswer: "부산", isCorrect: false });

    const rows = await findAttemptHistoryWithAnswers(db, userId, "ADMIN");
    expect(rows[0].correctAnswerSummary).toBe("서울, Seoul");
  });

  it("FILL_BLANK: 빈칸 정답을 모두 나열한다(빈칸별 매칭이 아니라 전체 목록)", async () => {
    const problemId = await seedProblem("FILL_BLANK", { blankRevealCount: 2 });
    await db.insert(problemBlanks).values([
      { problemId, blankKey: "b1", answerText: "가", displayOrder: 1 },
      { problemId, blankKey: "b2", answerText: "나", displayOrder: 2 },
    ]);
    await insertAttempt(db, { userId, problemId, submittedAnswer: "다, 라", isCorrect: false });

    const rows = await findAttemptHistoryWithAnswers(db, userId, "ADMIN");
    expect(rows[0].correctAnswerSummary).toBe("가, 나");
  });

  it("문제가 여러 개(유형 섞임)여도 각자 맞는 정답이 붙는다 — 배치 매핑이 안 섞인다", async () => {
    const mcqId = await seedProblem("OX");
    await db.insert(problemChoices).values([
      { problemId: mcqId, choiceText: "O", isCorrect: false, displayOrder: 1 },
      { problemId: mcqId, choiceText: "X", isCorrect: true, displayOrder: 2 },
    ]);
    const shortId = await seedProblem("SHORT_ANSWER");
    await db.insert(problemAnswers).values({ problemId: shortId, answerText: "정답" });
    await insertAttempt(db, { userId, problemId: mcqId, submittedAnswer: "O", isCorrect: false });
    await insertAttempt(db, { userId, problemId: shortId, submittedAnswer: "오답", isCorrect: false });

    const rows = await findAttemptHistoryWithAnswers(db, userId, "ADMIN");
    const byProblem = new Map(rows.map((r) => [r.problemId, r.correctAnswerSummary]));
    expect(byProblem.get(mcqId)).toBe("X");
    expect(byProblem.get(shortId)).toBe("정답");
  });

  it("이력이 없으면 빈 배열을 즉시 돌려준다(배치 쿼리를 안 날린다)", async () => {
    expect(await findAttemptHistoryWithAnswers(db, userId, "ADMIN")).toEqual([]);
  });
});
