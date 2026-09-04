import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { migrateTestDb, testDb, truncateAll } from "../../test/db";
import { departments, feedbacks, problems, users } from "./schema";

const db = testDb();
let userId = 0;
let problemId = 0;

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
  const [p] = await db.insert(problems).values({
    type: "SHORT_ANSWER", content: "본문", departmentId: dept.id, createdBy: userId,
  }).returning({ id: problems.id });
  problemId = p.id;
});

describe("feedbacks 테이블", () => {
  it("기본값은 PENDING 이고 시도 횟수는 0 이다", async () => {
    const [row] = await db.insert(feedbacks)
      .values({ userId, body: "의견입니다" }).returning();
    expect(row.status).toBe("PENDING");
    expect(row.attemptCount).toBe(0);
    expect(row.problemId).toBeNull();
    expect(row.taskId).toBeNull();
  });

  it("문제를 지우면 피드백은 남고 problem_id 만 비워진다", async () => {
    await db.insert(feedbacks).values({ userId, problemId, body: "이 문제가 이상합니다" });
    await db.delete(problems);
    const rows = await db.select().from(feedbacks);
    expect(rows).toHaveLength(1);
    expect(rows[0].problemId).toBeNull();
  });

  it("정해진 status 만 들어간다", async () => {
    await expect(
      db.insert(feedbacks).values({ userId, body: "x", status: "DONE" }),
    ).rejects.toThrow();
  });

  it("정해진 fail_reason 만 들어간다", async () => {
    await expect(
      db.insert(feedbacks).values({ userId, body: "x", status: "FAILED", failReason: "oops" }),
    ).rejects.toThrow();
  });
});
