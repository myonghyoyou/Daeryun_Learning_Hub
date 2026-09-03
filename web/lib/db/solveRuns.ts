import { and, desc, eq, sql } from "drizzle-orm";
import type { DbConn } from "./client";
import { solveRuns } from "./schema";
import type { RunResult } from "../solve/teamRun";

export type RunMode = "ALL" | "WRONG";
export type RunStatus = "IN_PROGRESS" | "FINISHED";

export type SolveRunRow = {
  id: number;
  userId: number;
  departmentId: number;
  mode: RunMode;
  problemIds: number[];
  cursor: number;
  results: RunResult[];
  status: RunStatus;
};

// drizzle 의 jsonb 는 $type 으로 모양을 알려도 DB 에서 온 값의 실제 검증은 하지 않는다.
// 이 한 곳에서만 좁혀 두면 나머지 코드는 SolveRunRow 만 보면 된다.
function toRow(r: typeof solveRuns.$inferSelect): SolveRunRow {
  return {
    id: r.id,
    userId: r.userId,
    departmentId: r.departmentId,
    mode: r.mode as RunMode,
    problemIds: r.problemIds,
    cursor: r.cursor,
    results: r.results,
    status: r.status as RunStatus,
  };
}

export async function insertRun(
  db: DbConn,
  input: { userId: number; departmentId: number; mode: RunMode; problemIds: number[] },
): Promise<SolveRunRow> {
  const [row] = await db.insert(solveRuns).values({
    userId: input.userId,
    departmentId: input.departmentId,
    mode: input.mode,
    problemIds: input.problemIds,
  }).returning();
  return toRow(row);
}

export async function findRunById(db: DbConn, runId: number): Promise<SolveRunRow | null> {
  const [row] = await db.select().from(solveRuns).where(eq(solveRuns.id, runId)).limit(1);
  return row ? toRow(row) : null;
}

export async function findActiveRun(
  db: DbConn, userId: number, departmentId: number,
): Promise<SolveRunRow | null> {
  const [row] = await db.select().from(solveRuns)
    .where(and(
      eq(solveRuns.userId, userId),
      eq(solveRuns.departmentId, departmentId),
      eq(solveRuns.status, "IN_PROGRESS"),
    ))
    .limit(1);
  return row ? toRow(row) : null;
}

/**
 * 이 사람의 진행 중인 바퀴를 부서별로 한 번에 읽는다.
 *
 * 팀 목록이 부서마다 findActiveRun 을 부르면 부서 수만큼 왕복이 붙는다(운영 부서 13개).
 * 유니크 인덱스가 팀당 진행 중 바퀴 하나를 보장하므로 Map 으로 접어도 잃는 것이 없다.
 */
export async function findActiveRunsByUser(
  db: DbConn, userId: number,
): Promise<Map<number, SolveRunRow>> {
  const rows = await db.select().from(solveRuns)
    .where(and(eq(solveRuns.userId, userId), eq(solveRuns.status, "IN_PROGRESS")));
  return new Map(rows.map((r) => [r.departmentId, toRow(r)]));
}

export async function findLatestFinishedRun(
  db: DbConn, userId: number, departmentId: number,
): Promise<SolveRunRow | null> {
  const [row] = await db.select().from(solveRuns)
    .where(and(
      eq(solveRuns.userId, userId),
      eq(solveRuns.departmentId, departmentId),
      eq(solveRuns.status, "FINISHED"),
    ))
    .orderBy(desc(solveRuns.id))
    .limit(1);
  return row ? toRow(row) : null;
}

/** 팀 목록이 "아직 안 풂"과 "틀린 문제 N개"를 가르는 데 쓴다. 부서 수만큼 질의하지 않는다. */
export async function findFinishedDepartmentIds(db: DbConn, userId: number): Promise<Set<number>> {
  const rows = await db.selectDistinct({ departmentId: solveRuns.departmentId })
    .from(solveRuns)
    .where(and(eq(solveRuns.userId, userId), eq(solveRuns.status, "FINISHED")));
  return new Set(rows.map((r) => r.departmentId));
}

export async function updateRunProgress(
  db: DbConn,
  runId: number,
  patch: { cursor: number; results: RunResult[]; status: RunStatus },
): Promise<void> {
  await db.update(solveRuns)
    .set({ cursor: patch.cursor, results: patch.results, status: patch.status, updatedAt: sql`now()` })
    .where(eq(solveRuns.id, runId));
}

export async function markRunFinished(db: DbConn, runId: number): Promise<void> {
  await db.update(solveRuns)
    .set({ status: "FINISHED", updatedAt: sql`now()` })
    .where(eq(solveRuns.id, runId));
}
