import { desc, eq } from "drizzle-orm";
import type { DbConn } from "./client";
import { attempts, attemptBlankAnswers, attemptChoices, departments, problems } from "./schema";

export type NewAttempt = { userId: number; problemId: number; submittedAnswer: string | null; isCorrect: boolean };

export async function insertAttempt(db: DbConn, row: NewAttempt): Promise<number> {
  const [inserted] = await db.insert(attempts).values(row).returning({ id: attempts.id });
  return inserted.id;
}

// 빈 배열을 그냥 통과시킨다 — Java 의 <foreach> 는 여기서 SQL 문법 오류가 났다(정답지 T9).
export async function insertAttemptChoices(
  db: DbConn, rows: { attemptId: number; choiceId: number; choiceText: string | null }[]): Promise<void> {
  if (rows.length === 0) return;
  await db.insert(attemptChoices).values(rows);
}

export async function insertAttemptBlankAnswers(
  db: DbConn, rows: { attemptId: number; blankKey: string; submittedAnswer: string | null; isCorrect: boolean }[],
): Promise<void> {
  if (rows.length === 0) return;
  await db.insert(attemptBlankAnswers).values(rows);
}

export type AttemptHistoryRow = {
  problemId: number; problemContent: string; submittedAnswer: string | null;
  correct: boolean; submittedAt: Date; departmentName: string; sourceNumber: number | null;
  problemType: string;
};

// AttemptMapper.xml:10 미러. Java 는 `a.is_correct AS correct` 별칭이 필수였다 —
// 빼면 mapUnderscoreToCamelCase 가 isCorrect 로 만들어 DTO 에 안 붙고 항상 false 가 됐다.
// 여기서는 select 의 키 이름이 곧 별칭이므로 `correct:` 로 적는 것이 그 미러다(정답지 H4).
export async function findAttemptsByUserId(db: DbConn, userId: number): Promise<AttemptHistoryRow[]> {
  return db.select({
    problemId: attempts.problemId, problemContent: problems.content,
    submittedAnswer: attempts.submittedAnswer, correct: attempts.isCorrect,
    submittedAt: attempts.submittedAt, departmentName: departments.name,
    sourceNumber: problems.sourceNumber, problemType: problems.type,
  })
    .from(attempts)
    .innerJoin(problems, eq(problems.id, attempts.problemId))
    .innerJoin(departments, eq(departments.id, problems.departmentId))
    .where(eq(attempts.userId, userId))
    .orderBy(desc(attempts.submittedAt));
}
