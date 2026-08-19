import { asc, eq } from "drizzle-orm";
import type { DbConn } from "./client";
import { problemAnswers, problemBlanks, problemChoices } from "./schema";

export type NewChoice = Omit<typeof problemChoices.$inferInsert, "id" | "displayOrder">;
export type NewAnswer = Omit<typeof problemAnswers.$inferInsert, "id">;
export type NewBlank = Omit<typeof problemBlanks.$inferInsert, "id" | "displayOrder">;

// displayOrder 는 여기서 배열 순서로 1부터 부여한다 — 호출부가 원하는 표시 순서대로
// 배열을 넘기기만 하면 된다.
export async function insertChoices(db: DbConn, rows: NewChoice[]): Promise<void> {
  if (rows.length === 0) return;
  await db.insert(problemChoices).values(rows.map((r, i) => ({ ...r, displayOrder: i + 1 })));
}

export async function insertAnswers(db: DbConn, rows: NewAnswer[]): Promise<void> {
  if (rows.length === 0) return;
  await db.insert(problemAnswers).values(rows);
}

export async function insertBlanks(db: DbConn, rows: NewBlank[]): Promise<void> {
  if (rows.length === 0) return;
  await db.insert(problemBlanks).values(rows.map((r, i) => ({ ...r, displayOrder: i + 1 })));
}

export async function findChoicesByProblemId(db: DbConn, problemId: number) {
  return db.select().from(problemChoices)
    .where(eq(problemChoices.problemId, problemId))
    .orderBy(asc(problemChoices.displayOrder));
}

export async function findAnswersByProblemId(db: DbConn, problemId: number) {
  // problem_answers 에는 displayOrder 컬럼이 없다 — id(삽입 순) 오름차순으로 대신한다.
  return db.select().from(problemAnswers)
    .where(eq(problemAnswers.problemId, problemId))
    .orderBy(asc(problemAnswers.id));
}

export async function findBlanksByProblemId(db: DbConn, problemId: number) {
  return db.select().from(problemBlanks)
    .where(eq(problemBlanks.problemId, problemId))
    .orderBy(asc(problemBlanks.displayOrder));
}

export async function deleteChoicesByProblemId(db: DbConn, problemId: number): Promise<void> {
  await db.delete(problemChoices).where(eq(problemChoices.problemId, problemId));
}

export async function deleteAnswersByProblemId(db: DbConn, problemId: number): Promise<void> {
  await db.delete(problemAnswers).where(eq(problemAnswers.problemId, problemId));
}

export async function deleteBlanksByProblemId(db: DbConn, problemId: number): Promise<void> {
  await db.delete(problemBlanks).where(eq(problemBlanks.problemId, problemId));
}
