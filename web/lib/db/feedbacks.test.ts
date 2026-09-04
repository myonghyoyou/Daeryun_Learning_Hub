import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { eq } from "drizzle-orm";
import { migrateTestDb, testDb, truncateAll } from "../../test/db";
import { departments, feedbacks, users } from "./schema";
import { findUnsent, findUnsentSummary, insertFeedback, markFailed, markSent } from "./feedbacks";

const db = testDb();
let userId = 0;

beforeAll(async () => { await migrateTestDb(); });
beforeEach(async () => {
  await truncateAll();
  const [dept] = await db.insert(departments)
    .values({ name: "가팀", code: "A", status: "ACTIVE" }).returning({ id: departments.id });
  const [u] = await db.insert(users).values({
    employeeNo: "u1", name: "직원", email: "u1@x.local", passwordHash: "h",
    departmentId: dept.id, role: "EMPLOYEE",
  }).returning({ id: users.id });
  userId = u.id;
});

describe("insertFeedback / markSent / markFailed", () => {
  it("저장한 뒤 markSent 하면 SENT 와 taskId 가 남고 시도 횟수가 는다", async () => {
    const { id } = await insertFeedback(db, { userId, problemId: null, sourcePath: "/solve", body: "의견" });
    await markSent(db, id, "T-1");
    const [row] = await db.select().from(feedbacks).where(eqId(id));
    expect(row.status).toBe("SENT");
    expect(row.taskId).toBe("T-1");
    expect(row.attemptCount).toBe(1);
  });

  it("markFailed 하면 FAILED 와 failReason 이 남고 시도 횟수가 는다", async () => {
    const { id } = await insertFeedback(db, { userId, problemId: null, sourcePath: null, body: "의견" });
    await markFailed(db, id, "down");
    const [row] = await db.select().from(feedbacks).where(eqId(id));
    expect(row.status).toBe("FAILED");
    expect(row.failReason).toBe("down");
    expect(row.attemptCount).toBe(1);
  });
});

describe("findUnsent", () => {
  it("SENT 가 아닌 것만, 오래된 순으로 limit 만큼 돌려준다", async () => {
    await db.insert(feedbacks).values([
      { userId, body: "실패한 것", status: "FAILED", failReason: "down" },
      { userId, body: "멈춘 것", status: "PENDING" },
      { userId, body: "보낸 것", status: "SENT", taskId: "T" },
    ]);
    const rows = await findUnsent(db, 10);
    expect(rows.map((r) => r.status).sort()).toEqual(["FAILED", "PENDING"]);
  });
});

describe("findUnsentSummary", () => {
  it("body 없이 요약만 돌려준다", async () => {
    await db.insert(feedbacks).values([
      { userId, body: "실패한 것 - 본문", status: "FAILED", failReason: "down" },
      { userId, body: "보낸 것", status: "SENT", taskId: "T" },
    ]);
    const rows = await findUnsentSummary(db, 10);
    expect(rows).toHaveLength(1);
    expect(rows[0]).not.toHaveProperty("body");
  });
});

function eqId(id: number) {
  return eq(feedbacks.id, id);
}
