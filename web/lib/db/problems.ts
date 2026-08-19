import { eq, sql } from "drizzle-orm";
import type { DbConn } from "./client";
import { problems } from "./schema";

export type NewProblem = typeof problems.$inferInsert;
export type ProblemRow = typeof problems.$inferSelect;
// ProblemMapper.xml `update`(:57-64) 가 건드리는 여섯 컬럼으로 좁힌다. type·status·
// departmentId·createdBy 는 전용 statement(updateStatus / updateDepartmentAndSourceNumber)
// 를 갖고 있고, 일반 수정 경로에서는 절대 바뀌면 안 된다 — 여기 넣으면 컴파일 오류다.
export type ProblemPatch = Partial<
  Pick<NewProblem, "content" | "imageUrl" | "referenceText" | "explanation" | "blankRevealCount" | "sourceNumber">
>;

export async function insertProblem(db: DbConn, row: NewProblem): Promise<number> {
  const [inserted] = await db.insert(problems).values(row).returning({ id: problems.id });
  return inserted.id;
}

export async function findProblemById(db: DbConn, id: number): Promise<ProblemRow | null> {
  const rows = await db.select().from(problems).where(eq(problems.id, id)).limit(1);
  return rows[0] ?? null;
}

// updated_at 은 세 UPDATE 모두에서 여기서 찍는다. ProblemMapper.xml 의 update(:62)·
// updateStatus(:67)·updateDepartmentAndSourceNumber(:72) 가 전부 `updated_at = now()` 로
// 끝나는데, DB 쪽에는 그물이 없다 — 기본값은 INSERT 때만 걸리고 트리거도 $onUpdate 도 없다.
// 호출부에 맡기면 M3·M4 가 각자 잊을 수 있으므로 DAO 안에 가둔다.
export async function updateProblem(db: DbConn, id: number, patch: ProblemPatch): Promise<void> {
  await db.update(problems).set({ ...patch, updatedAt: sql`now()` }).where(eq(problems.id, id));
}

export async function updateProblemStatus(db: DbConn, id: number, status: "ACTIVE" | "ARCHIVED"): Promise<void> {
  await db.update(problems).set({ status, updatedAt: sql`now()` }).where(eq(problems.id, id));
}

export async function updateDepartmentAndSourceNumber(
  db: DbConn, id: number, departmentId: number, sourceNumber: number,
): Promise<void> {
  await db.update(problems).set({ departmentId, sourceNumber, updatedAt: sql`now()` }).where(eq(problems.id, id));
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
