import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { migrateTestDb, testDb, truncateAll } from "../../test/db";
import { departments, users } from "./schema";
import {
  findActiveRun, findActiveRunsByUser, findFinishedDepartmentIds, findLatestFinishedRun,
  findRunById, insertRun, markRunFinished, updateRunProgress,
} from "./solveRuns";

const db = testDb();
let planId = 0;
let salesId = 0;
let userId = 0;

beforeAll(async () => { await migrateTestDb(); });
beforeEach(async () => {
  await truncateAll();
  [{ id: planId }] = await db.insert(departments)
    .values({ name: "기획팀", code: "PLAN", status: "ACTIVE" }).returning({ id: departments.id });
  [{ id: salesId }] = await db.insert(departments)
    .values({ name: "영업팀", code: "SALES", status: "ACTIVE" }).returning({ id: departments.id });
  [{ id: userId }] = await db.insert(users).values({
    employeeNo: "emp", name: "직원", email: "e@b.c", passwordHash: "x",
    departmentId: planId, role: "EMPLOYEE", status: "ACTIVE", mustChangePassword: false,
  }).returning({ id: users.id });
});

describe("insertRun · findRunById", () => {
  it("만든 바퀴를 다시 읽어 온다", async () => {
    const made = await insertRun(db, { userId, departmentId: planId, mode: "ALL", problemIds: [7, 8] });
    const found = await findRunById(db, made.id);
    expect(found?.problemIds).toEqual([7, 8]);
    expect(found?.mode).toBe("ALL");
    expect(found?.cursor).toBe(0);
    expect(found?.results).toEqual([]);
    expect(found?.status).toBe("IN_PROGRESS");
  });

  it("없는 id 는 null 이다", async () => {
    expect(await findRunById(db, 999999)).toBeNull();
  });
});

describe("findActiveRun", () => {
  it("그 팀의 진행 중인 바퀴를 준다", async () => {
    const made = await insertRun(db, { userId, departmentId: planId, mode: "ALL", problemIds: [1] });
    expect((await findActiveRun(db, userId, planId))?.id).toBe(made.id);
  });

  it("다른 팀의 바퀴는 주지 않는다", async () => {
    await insertRun(db, { userId, departmentId: planId, mode: "ALL", problemIds: [1] });
    expect(await findActiveRun(db, userId, salesId)).toBeNull();
  });

  it("끝난 바퀴는 주지 않는다", async () => {
    const made = await insertRun(db, { userId, departmentId: planId, mode: "ALL", problemIds: [1] });
    await markRunFinished(db, made.id);
    expect(await findActiveRun(db, userId, planId)).toBeNull();
  });
});

describe("findActiveRunsByUser", () => {
  it("진행 중인 바퀴를 부서별로 한 번에 준다", async () => {
    const a = await insertRun(db, { userId, departmentId: planId, mode: "ALL", problemIds: [1] });
    const b = await insertRun(db, { userId, departmentId: salesId, mode: "WRONG", problemIds: [2] });
    const map = await findActiveRunsByUser(db, userId);
    expect(map.get(planId)?.id).toBe(a.id);
    expect(map.get(salesId)?.id).toBe(b.id);
  });

  it("끝난 바퀴는 들어 있지 않다", async () => {
    const a = await insertRun(db, { userId, departmentId: planId, mode: "ALL", problemIds: [1] });
    await markRunFinished(db, a.id);
    expect((await findActiveRunsByUser(db, userId)).size).toBe(0);
  });

  it("남의 바퀴는 들어 있지 않다", async () => {
    const [other] = await db.insert(users).values({
      employeeNo: "emp2", name: "다른직원", email: "e2@b.c", passwordHash: "x",
      departmentId: planId, role: "EMPLOYEE", status: "ACTIVE", mustChangePassword: false,
    }).returning({ id: users.id });
    await insertRun(db, { userId: other.id, departmentId: planId, mode: "ALL", problemIds: [1] });
    expect((await findActiveRunsByUser(db, userId)).size).toBe(0);
  });
});

describe("findLatestFinishedRun", () => {
  it("끝난 바퀴 중 가장 나중 것을 준다", async () => {
    const first = await insertRun(db, { userId, departmentId: planId, mode: "ALL", problemIds: [1] });
    await markRunFinished(db, first.id);
    const second = await insertRun(db, { userId, departmentId: planId, mode: "WRONG", problemIds: [2] });
    await markRunFinished(db, second.id);
    expect((await findLatestFinishedRun(db, userId, planId))?.id).toBe(second.id);
  });

  it("끝난 바퀴가 없으면 null 이다", async () => {
    await insertRun(db, { userId, departmentId: planId, mode: "ALL", problemIds: [1] });
    expect(await findLatestFinishedRun(db, userId, planId)).toBeNull();
  });
});

describe("findFinishedDepartmentIds", () => {
  it("끝난 바퀴가 있는 부서 id 를 모은다", async () => {
    const a = await insertRun(db, { userId, departmentId: planId, mode: "ALL", problemIds: [1] });
    await markRunFinished(db, a.id);
    await insertRun(db, { userId, departmentId: salesId, mode: "ALL", problemIds: [2] });

    const ids = await findFinishedDepartmentIds(db, userId);
    expect(ids.has(planId)).toBe(true);
    expect(ids.has(salesId)).toBe(false);
  });
});

describe("updateRunProgress", () => {
  it("위치와 결과와 상태를 함께 쓴다", async () => {
    const made = await insertRun(db, { userId, departmentId: planId, mode: "ALL", problemIds: [1, 2] });
    await updateRunProgress(db, made.id, {
      cursor: 1, results: [{ problemId: 1, correct: true }], status: "IN_PROGRESS",
    });
    const found = await findRunById(db, made.id);
    expect(found?.cursor).toBe(1);
    expect(found?.results).toEqual([{ problemId: 1, correct: true }]);
    expect(found?.status).toBe("IN_PROGRESS");
  });

  it("건너뛴 결과(null)도 그대로 저장된다", async () => {
    const made = await insertRun(db, { userId, departmentId: planId, mode: "ALL", problemIds: [1] });
    await updateRunProgress(db, made.id, {
      cursor: 1, results: [{ problemId: 1, correct: null }], status: "FINISHED",
    });
    expect((await findRunById(db, made.id))?.results).toEqual([{ problemId: 1, correct: null }]);
  });

  it("끝으로 표시하면 같은 팀에 새 바퀴를 만들 수 있다", async () => {
    const made = await insertRun(db, { userId, departmentId: planId, mode: "ALL", problemIds: [1] });
    await markRunFinished(db, made.id);
    const next = await insertRun(db, { userId, departmentId: planId, mode: "WRONG", problemIds: [2] });
    expect(next.id).not.toBe(made.id);
  });
});
