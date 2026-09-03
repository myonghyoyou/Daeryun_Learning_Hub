import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { migrateTestDb, testDb, truncateAll } from "../../test/db";
import { attempts, departments, problems, users } from "./schema";
import {
  countWrongByDepartment, findSolveRowsByIds, findTeamCounts,
  findTeamProblemIds, findWrongProblemIds,
} from "./solveTeams";

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

async function seedProblem(over: Partial<typeof problems.$inferInsert> = {}) {
  const [row] = await db.insert(problems).values({
    type: "OX", content: "본문", departmentId: planId, status: "ACTIVE",
    createdBy: userId, sourceNumber: null, ...over,
  }).returning({ id: problems.id });
  return row.id;
}

async function seedAttempt(problemId: number, isCorrect: boolean, submittedAt: Date) {
  await db.insert(attempts).values({ userId, problemId, isCorrect, submittedAt });
}

describe("findTeamCounts", () => {
  it("부서마다 정상 문제 수를 센다 — 보관된 문제는 빼고", async () => {
    await seedProblem({ sourceNumber: 1 });
    await seedProblem({ sourceNumber: 2, status: "ARCHIVED" });
    await seedProblem({ departmentId: salesId, sourceNumber: 1 });

    const rows = await findTeamCounts(db);
    const plan = rows.find((r) => r.departmentId === planId);
    const sales = rows.find((r) => r.departmentId === salesId);
    expect(plan?.totalCount).toBe(1);
    expect(plan?.departmentName).toBe("기획팀");
    expect(sales?.totalCount).toBe(1);
  });

  it("정상 문제가 하나도 없는 부서는 목록에 오지 않는다", async () => {
    // 운영의 "본사"(HQ) 처럼 행만 남은 부서를 거른다.
    await seedProblem({ sourceNumber: 1 });
    const rows = await findTeamCounts(db);
    expect(rows.map((r) => r.departmentId)).toEqual([planId]);
  });

  it("보관된 문제만 있는 부서도 빠진다", async () => {
    await seedProblem({ sourceNumber: 1, status: "ARCHIVED" });
    expect(await findTeamCounts(db)).toEqual([]);
  });
});

describe("findTeamProblemIds", () => {
  it("문제집 번호 오름차순이고, 번호가 없으면 맨 뒤다", async () => {
    const noNumber = await seedProblem({ sourceNumber: null });
    const three = await seedProblem({ sourceNumber: 3 });
    const one = await seedProblem({ sourceNumber: 1 });

    expect(await findTeamProblemIds(db, planId)).toEqual([one, three, noNumber]);
  });

  it("번호가 없는 문제끼리는 id 오름차순으로 가른다", async () => {
    // 같은 부서에 같은 번호를 둘 수는 없다(uq_problems_department_source_number).
    // 그래서 동점이 실제로 생기는 자리는 번호가 NULL 인 문제들뿐이고, 여기서
    // id 타이브레이커가 없으면 순서가 흔들린다.
    const numbered = await seedProblem({ sourceNumber: 5 });
    const a = await seedProblem({ sourceNumber: null });
    const b = await seedProblem({ sourceNumber: null });
    expect(await findTeamProblemIds(db, planId)).toEqual([numbered, a, b]);
  });

  it("보관된 문제와 다른 부서 문제는 빼놓는다", async () => {
    const mine = await seedProblem({ sourceNumber: 1 });
    await seedProblem({ sourceNumber: 2, status: "ARCHIVED" });
    await seedProblem({ sourceNumber: 3, departmentId: salesId });
    expect(await findTeamProblemIds(db, planId)).toEqual([mine]);
  });
});

describe("findWrongProblemIds", () => {
  it("문제마다 가장 마지막 답만 본다 — 틀렸다가 맞히면 빠진다", async () => {
    const fixed = await seedProblem({ sourceNumber: 1 });
    const stillWrong = await seedProblem({ sourceNumber: 2 });
    await seedAttempt(fixed, false, new Date("2026-01-01T00:00:00Z"));
    await seedAttempt(fixed, true, new Date("2026-01-02T00:00:00Z"));
    await seedAttempt(stillWrong, true, new Date("2026-01-01T00:00:00Z"));
    await seedAttempt(stillWrong, false, new Date("2026-01-02T00:00:00Z"));

    expect(await findWrongProblemIds(db, userId, planId)).toEqual([stillWrong]);
  });

  it("같은 시각이면 나중에 들어간 답을 마지막으로 본다", async () => {
    const p = await seedProblem({ sourceNumber: 1 });
    const at = new Date("2026-01-01T00:00:00Z");
    await seedAttempt(p, true, at);
    await seedAttempt(p, false, at);
    expect(await findWrongProblemIds(db, userId, planId)).toEqual([p]);
  });

  it("한 번도 안 푼 문제는 틀린 문제가 아니다", async () => {
    await seedProblem({ sourceNumber: 1 });
    expect(await findWrongProblemIds(db, userId, planId)).toEqual([]);
  });

  it("남이 틀린 것은 세지 않는다", async () => {
    const p = await seedProblem({ sourceNumber: 1 });
    const [other] = await db.insert(users).values({
      employeeNo: "emp2", name: "다른직원", email: "e2@b.c", passwordHash: "x",
      departmentId: planId, role: "EMPLOYEE", status: "ACTIVE", mustChangePassword: false,
    }).returning({ id: users.id });
    await db.insert(attempts)
      .values({ userId: other.id, problemId: p, isCorrect: false, submittedAt: new Date() });
    expect(await findWrongProblemIds(db, userId, planId)).toEqual([]);
  });

  it("번호 순으로 줄 세운다", async () => {
    const three = await seedProblem({ sourceNumber: 3 });
    const one = await seedProblem({ sourceNumber: 1 });
    await seedAttempt(three, false, new Date("2026-01-01T00:00:00Z"));
    await seedAttempt(one, false, new Date("2026-01-01T00:00:00Z"));
    expect(await findWrongProblemIds(db, userId, planId)).toEqual([one, three]);
  });
});

describe("countWrongByDepartment", () => {
  it("부서별 틀린 문제 수를 센다", async () => {
    const a = await seedProblem({ sourceNumber: 1 });
    const b = await seedProblem({ sourceNumber: 2 });
    const c = await seedProblem({ sourceNumber: 1, departmentId: salesId });
    await seedAttempt(a, false, new Date("2026-01-01T00:00:00Z"));
    await seedAttempt(b, false, new Date("2026-01-01T00:00:00Z"));
    await seedAttempt(c, false, new Date("2026-01-01T00:00:00Z"));

    const counts = await countWrongByDepartment(db, userId);
    expect(counts.get(planId)).toBe(2);
    expect(counts.get(salesId)).toBe(1);
  });

  it("틀린 것이 없으면 그 부서는 아예 들어 있지 않다", async () => {
    const a = await seedProblem({ sourceNumber: 1 });
    await seedAttempt(a, true, new Date("2026-01-01T00:00:00Z"));
    const counts = await countWrongByDepartment(db, userId);
    expect(counts.get(planId)).toBeUndefined();
  });
});

describe("findSolveRowsByIds", () => {
  it("넘긴 id 순서 그대로 돌려준다", async () => {
    const one = await seedProblem({ sourceNumber: 1, content: "첫째" });
    const two = await seedProblem({ sourceNumber: 2, content: "둘째" });
    const rows = await findSolveRowsByIds(db, [two, one]);
    expect(rows.map((r) => r.content)).toEqual(["둘째", "첫째"]);
    expect(rows[0].departmentName).toBe("기획팀");
  });

  it("빈 목록이면 빈 배열이다 — SQL 을 쏘지 않는다", async () => {
    expect(await findSolveRowsByIds(db, [])).toEqual([]);
  });
});
