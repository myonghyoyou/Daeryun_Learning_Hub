import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import { migrateTestDb, testDb, truncateAll } from "../../test/db";
import { departments, feedbacks, problems, users } from "../db/schema";

const relay = vi.hoisted(() => ({ send: vi.fn() }));
vi.mock("./relay", () => ({ sendFeedback: relay.send }));

const { submitFeedback, retryUnsent } = await import("./feedbackService");

const db = testDb();
let actor = { userId: 0, employeeNo: "u1", name: "직원", role: "EMPLOYEE" as const, departmentId: 0, mustChangePassword: false };
let problemId = 0;

beforeAll(async () => { await migrateTestDb(); });
beforeEach(async () => {
  await truncateAll();
  relay.send.mockReset();
  const [d] = await db.insert(departments).values({ name: "자금팀", code: "FIN", status: "ACTIVE" }).returning();
  const [u] = await db.insert(users).values({
    employeeNo: "u1", name: "직원", email: "u1@x.local", passwordHash: "h",
    departmentId: d.id, role: "EMPLOYEE",
  }).returning();
  actor = { ...actor, userId: u.id, departmentId: d.id };
  const [p] = await db.insert(problems).values({
    type: "SHORT_ANSWER", content: "본문", departmentId: d.id, createdBy: u.id, sourceNumber: 26,
  }).returning();
  problemId = p.id;
});

describe("submitFeedback", () => {
  it("성공하면 SENT 와 taskId 를 남긴다", async () => {
    relay.send.mockResolvedValue({ ok: true, taskId: "T-9" });
    const r = await submitFeedback(db, actor, { body: "의견입니다", sourcePath: "/solve" });
    expect(r.ok).toBe(true);
    const [row] = await db.select().from(feedbacks);
    expect(row.status).toBe("SENT");
    expect(row.taskId).toBe("T-9");
    expect(row.attemptCount).toBe(1);
  });

  /** 저장이 먼저다. 전달이 실패해도 말이 남아야 다시 밀 수 있다. */
  it("전달이 실패해도 원문이 남는다", async () => {
    relay.send.mockResolvedValue({ ok: false, reason: "down", detail: "timeout" });
    const r = await submitFeedback(db, actor, { body: "사라지면 안 되는 말", sourcePath: null });
    expect(r.ok).toBe(false);
    const [row] = await db.select().from(feedbacks);
    expect(row.status).toBe("FAILED");
    expect(row.failReason).toBe("down");
    expect(row.body).toBe("사라지면 안 되는 말");
  });

  it("429 는 다른 문구를 낸다", async () => {
    relay.send.mockResolvedValue({ ok: false, reason: "busy", detail: "" });
    const r = await submitFeedback(db, actor, { body: "x", sourcePath: null });
    expect(r.message).toContain("몰려");
  });

  it("받는 쪽 detail 을 사용자 문구에 싣지 않는다", async () => {
    relay.send.mockResolvedValue({ ok: false, reason: "config", detail: "INBOUND_SECRET 없음" });
    const r = await submitFeedback(db, actor, { body: "x", sourcePath: null });
    expect(r.message).not.toContain("INBOUND_SECRET");
  });

  it("문제 정보는 서버가 DB 에서 찾아 붙인다", async () => {
    relay.send.mockResolvedValue({ ok: true, taskId: "T" });
    await submitFeedback(db, actor, { body: "이상합니다", sourcePath: "/solve", problemId });
    const sent = relay.send.mock.calls[0][0] as { body: string; from: string };
    expect(sent.body).toContain("[자금팀 26번]");
    expect(sent.from).toBe("직원(u1)");
  });

  it("없는 problemId 는 일반 의견으로 처리한다 — 말을 버리지 않는다", async () => {
    relay.send.mockResolvedValue({ ok: true, taskId: "T" });
    const r = await submitFeedback(db, actor, { body: "의견", sourcePath: "/solve", problemId: 999999 });
    expect(r.ok).toBe(true);
    const [row] = await db.select().from(feedbacks);
    expect(row.problemId).toBeNull();
  });

  it("빈 글은 저장도 전달도 하지 않는다", async () => {
    await expect(submitFeedback(db, actor, { body: "   ", sourcePath: null })).rejects.toThrow();
    expect(await db.select().from(feedbacks)).toHaveLength(0);
    expect(relay.send).not.toHaveBeenCalled();
  });
});

describe("retryUnsent", () => {
  /** PENDING 으로 남은 것도 잡아야 한다 — FAILED 만 보면 영영 못 찾는다. */
  it("SENT 가 아닌 것을 모두 잡는다", async () => {
    await db.insert(feedbacks).values([
      { userId: actor.userId, body: "실패한 것", status: "FAILED", failReason: "down" },
      { userId: actor.userId, body: "멈춘 것", status: "PENDING" },
      { userId: actor.userId, body: "보낸 것", status: "SENT", taskId: "T" },
    ]);
    relay.send.mockResolvedValue({ ok: true, taskId: "T-new" });
    const r = await retryUnsent(db, 20);
    expect(r.tried).toBe(2);
    expect(r.sent).toBe(2);
  });

  /** 한도는 서비스 전체가 공유한다. 한꺼번에 밀면 그 시간대의 정상 제출이 막힌다. */
  it("429 를 만나면 즉시 멈춘다", async () => {
    await db.insert(feedbacks).values([
      { userId: actor.userId, body: "1", status: "FAILED", failReason: "down" },
      { userId: actor.userId, body: "2", status: "FAILED", failReason: "down" },
      { userId: actor.userId, body: "3", status: "FAILED", failReason: "down" },
    ]);
    relay.send
      .mockResolvedValueOnce({ ok: true, taskId: "T1" })
      .mockResolvedValueOnce({ ok: false, reason: "busy", detail: "" });
    const r = await retryUnsent(db, 20);
    expect(r.tried).toBe(2);
    expect(r.sent).toBe(1);
    expect(r.stoppedByLimit).toBe(true);
    expect(relay.send).toHaveBeenCalledTimes(2);
  });

  /**
   * config(설정 없음)는 한 행이 그렇다면 다음 행도 똑같이 실패한다 — 계속 돌면
   * attempt_count 만 헛되이 올라간다. 429 와 달리 한도 때문에 멈춘 것이 아니므로
   * stoppedByLimit 은 false 여야 한다.
   */
  it("config 를 만나면 즉시 멈추고 stoppedByLimit 은 false 다", async () => {
    await db.insert(feedbacks).values([
      { userId: actor.userId, body: "1", status: "FAILED", failReason: "down" },
      { userId: actor.userId, body: "2", status: "FAILED", failReason: "down" },
      { userId: actor.userId, body: "3", status: "FAILED", failReason: "down" },
    ]);
    relay.send
      .mockResolvedValueOnce({ ok: true, taskId: "T1" })
      .mockResolvedValueOnce({ ok: false, reason: "config", detail: "URL/SECRET 없음" });
    const r = await retryUnsent(db, 20);
    expect(r.tried).toBe(2);
    expect(r.sent).toBe(1);
    expect(r.stoppedByLimit).toBe(false);
    expect(relay.send).toHaveBeenCalledTimes(2);
  });

  it("한 번에 limit 건까지만 시도한다", async () => {
    await db.insert(feedbacks).values(
      Array.from({ length: 5 }, (_, i) => ({ userId: actor.userId, body: `${i}`, status: "FAILED" as const, failReason: "down" as const })),
    );
    relay.send.mockResolvedValue({ ok: true, taskId: "T" });
    const r = await retryUnsent(db, 2);
    expect(r.tried).toBe(2);
  });
});
