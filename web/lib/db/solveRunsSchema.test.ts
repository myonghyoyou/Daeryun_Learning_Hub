import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { migrateTestDb, testDb, truncateAll } from "../../test/db";
import { departments, solveRuns, users } from "./schema";

const db = testDb();
let deptId = 0;
let userId = 0;

beforeAll(async () => { await migrateTestDb(); });
beforeEach(async () => {
  await truncateAll();
  [{ id: deptId }] = await db.insert(departments)
    .values({ name: "기획팀", code: "PLAN", status: "ACTIVE" }).returning({ id: departments.id });
  [{ id: userId }] = await db.insert(users).values({
    employeeNo: "emp", name: "직원", email: "e@b.c", passwordHash: "x",
    departmentId: deptId, role: "EMPLOYEE", status: "ACTIVE", mustChangePassword: false,
  }).returning({ id: users.id });
});

describe("solve_runs", () => {
  it("기본값은 cursor 0 · results 빈 배열 · 진행 중이다", async () => {
    const [row] = await db.insert(solveRuns)
      .values({ userId, departmentId: deptId, mode: "ALL", problemIds: [1, 2, 3] })
      .returning();
    expect(row.cursor).toBe(0);
    expect(row.results).toEqual([]);
    expect(row.status).toBe("IN_PROGRESS");
    expect(row.problemIds).toEqual([1, 2, 3]);
  });

  it("한 사람이 한 팀에 진행 중인 바퀴를 둘 만들 수 없다", async () => {
    await db.insert(solveRuns).values({ userId, departmentId: deptId, mode: "ALL", problemIds: [1] });
    await expect(
      db.insert(solveRuns).values({ userId, departmentId: deptId, mode: "WRONG", problemIds: [2] }),
    ).rejects.toThrow();
  });

  it("끝난 바퀴는 여러 개 있어도 된다 — 부분 인덱스라 진행 중인 것만 막는다", async () => {
    await db.insert(solveRuns)
      .values({ userId, departmentId: deptId, mode: "ALL", problemIds: [1], status: "FINISHED" });
    await db.insert(solveRuns)
      .values({ userId, departmentId: deptId, mode: "WRONG", problemIds: [2], status: "FINISHED" });
    await db.insert(solveRuns).values({ userId, departmentId: deptId, mode: "ALL", problemIds: [3] });
    const rows = await db.select().from(solveRuns);
    expect(rows).toHaveLength(3);
  });

  it("mode 와 status 는 정해진 값만 받는다", async () => {
    await expect(
      db.insert(solveRuns).values({ userId, departmentId: deptId, mode: "SOMETHING", problemIds: [1] }),
    ).rejects.toThrow();
  });
});
