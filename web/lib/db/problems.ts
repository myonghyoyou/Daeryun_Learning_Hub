import { eq, sql } from "drizzle-orm";
import type { DbConn } from "./client";
import { problems } from "./schema";

export type NewProblem = typeof problems.$inferInsert;
export type ProblemRow = typeof problems.$inferSelect;
export type ProblemPatch = Partial<Omit<typeof problems.$inferInsert, "id" | "createdAt">>;

export async function insertProblem(db: DbConn, row: NewProblem): Promise<number> {
  const [inserted] = await db.insert(problems).values(row).returning({ id: problems.id });
  return inserted.id;
}

export async function findProblemById(db: DbConn, id: number): Promise<ProblemRow | null> {
  const rows = await db.select().from(problems).where(eq(problems.id, id)).limit(1);
  return rows[0] ?? null;
}

export async function updateProblem(db: DbConn, id: number, patch: ProblemPatch): Promise<void> {
  await db.update(problems).set(patch).where(eq(problems.id, id));
}

export async function updateProblemStatus(db: DbConn, id: number, status: "ACTIVE" | "ARCHIVED"): Promise<void> {
  await db.update(problems).set({ status }).where(eq(problems.id, id));
}

export async function updateDepartmentAndSourceNumber(
  db: DbConn, id: number, departmentId: number, sourceNumber: number,
): Promise<void> {
  await db.update(problems).set({ departmentId, sourceNumber }).where(eq(problems.id, id));
}

// 상태로 거르지 않는다 — spec D5: 문항 번호는 재사용하지 않는다. 보관(ARCHIVED)된 문제도
// 번호를 계속 점유하므로, 다음 번호를 매길 때는 보관본까지 포함한 최댓값을 봐야 한다.
export async function findMaxSourceNumber(db: DbConn, departmentId: number): Promise<number | null> {
  const [row] = await db
    .select({ max: sql<number | null>`max(${problems.sourceNumber})` })
    .from(problems)
    .where(eq(problems.departmentId, departmentId));
  return row?.max ?? null;
}
