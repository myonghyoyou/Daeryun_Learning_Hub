import { asc, eq, ne, sql } from "drizzle-orm";
import type { DbConn } from "./client";
import { feedbacks } from "./schema";

export type FeedbackRow = typeof feedbacks.$inferSelect;

/** Task 5 가 관리자 화면에 목록으로 뿌린다. 원문(`body`)은 담지 않는다 — 목록 조회에 남의 원문이 실리면 안 된다. */
export type FeedbackSummary = Pick<
  FeedbackRow,
  "id" | "userId" | "problemId" | "sourcePath" | "status" | "failReason" | "taskId" | "attemptCount" | "lastTriedAt" | "createdAt"
>;

export async function insertFeedback(
  db: DbConn,
  row: { userId: number; problemId: number | null; sourcePath: string | null; body: string },
): Promise<{ id: number }> {
  const [created] = await db.insert(feedbacks).values(row).returning({ id: feedbacks.id });
  return created;
}

export async function markSent(db: DbConn, id: number, taskId: string): Promise<void> {
  await db.update(feedbacks)
    .set({
      status: "SENT", taskId, failReason: null, lastTriedAt: new Date(),
      attemptCount: sql`${feedbacks.attemptCount} + 1`,
    })
    .where(eq(feedbacks.id, id));
}

export async function markFailed(
  db: DbConn, id: number, reason: "config" | "invalid" | "busy" | "down",
): Promise<void> {
  await db.update(feedbacks)
    .set({
      status: "FAILED", failReason: reason, lastTriedAt: new Date(),
      attemptCount: sql`${feedbacks.attemptCount} + 1`,
    })
    .where(eq(feedbacks.id, id));
}

/**
 * 아직 못 보낸 것. **`FAILED` 가 아니라 `<> 'SENT'` 로 잡는다** — 저장 뒤 전달 중에 서버가
 * 죽으면 그 행은 `PENDING` 으로 남고, `FAILED` 만 보면 영영 못 찾는다.
 */
export async function findUnsent(db: DbConn, limit: number): Promise<FeedbackRow[]> {
  return db.select().from(feedbacks)
    .where(ne(feedbacks.status, "SENT"))
    .orderBy(asc(feedbacks.createdAt), asc(feedbacks.id))
    .limit(limit);
}

/**
 * 관리자 화면용 목록. `findUnsent` 와 같은 조건이지만 `body` 를 뺀다 — 브라우저로 나가는
 * 응답에 사용자 원문을 실을 이유가 없다.
 */
export async function findUnsentSummary(db: DbConn, limit: number): Promise<FeedbackSummary[]> {
  return db.select({
    id: feedbacks.id,
    userId: feedbacks.userId,
    problemId: feedbacks.problemId,
    sourcePath: feedbacks.sourcePath,
    status: feedbacks.status,
    failReason: feedbacks.failReason,
    taskId: feedbacks.taskId,
    attemptCount: feedbacks.attemptCount,
    lastTriedAt: feedbacks.lastTriedAt,
    createdAt: feedbacks.createdAt,
  }).from(feedbacks)
    .where(ne(feedbacks.status, "SENT"))
    .orderBy(asc(feedbacks.createdAt), asc(feedbacks.id))
    .limit(limit);
}
