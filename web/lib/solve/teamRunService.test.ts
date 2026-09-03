import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { eq } from "drizzle-orm";
import { migrateTestDb, testDb, truncateAll } from "../../test/db";
import { attempts, departments, problems, users } from "../db/schema";
import type { AuthUser } from "../auth/types";
import {
  advanceRun, finishRun, getLatestRunView, getRunView, listTeams, startRun, NO_PROBLEMS_MESSAGE,
} from "./teamRunService";

const db = testDb();
let planId = 0;
let salesId = 0;
let actor: AuthUser;
let other: AuthUser;

beforeAll(async () => { await migrateTestDb(); });
beforeEach(async () => {
  await truncateAll();
  [{ id: planId }] = await db.insert(departments)
    .values({ name: "기획팀", code: "PLAN", status: "ACTIVE" }).returning({ id: departments.id });
  [{ id: salesId }] = await db.insert(departments)
    .values({ name: "영업팀", code: "SALES", status: "ACTIVE" }).returning({ id: departments.id });
  const [me] = await db.insert(users).values({
    employeeNo: "emp", name: "직원", email: "e@b.c", passwordHash: "x",
    departmentId: planId, role: "EMPLOYEE", status: "ACTIVE", mustChangePassword: false,
  }).returning({ id: users.id });
  const [you] = await db.insert(users).values({
    employeeNo: "emp2", name: "다른직원", email: "e2@b.c", passwordHash: "x",
    departmentId: planId, role: "EMPLOYEE", status: "ACTIVE", mustChangePassword: false,
  }).returning({ id: users.id });
  actor = { userId: me.id, employeeNo: "emp", name: "직원", role: "EMPLOYEE", departmentId: planId, mustChangePassword: false };
  other = { userId: you.id, employeeNo: "emp2", name: "다른직원", role: "EMPLOYEE", departmentId: planId, mustChangePassword: false };
});

async function seedProblem(sourceNumber: number, over: Partial<typeof problems.$inferInsert> = {}) {
  const [row] = await db.insert(problems).values({
    type: "OX", content: `${sourceNumber}번 문제`, departmentId: planId, status: "ACTIVE",
    createdBy: actor.userId, sourceNumber, ...over,
  }).returning({ id: problems.id });
  return row.id;
}

describe("listTeams", () => {
  it("바퀴가 없으면 activeRun 은 null 이고 끝난 바퀴도 없다", async () => {
    await seedProblem(1);
    const teams = await listTeams(db, actor);
    const plan = teams.find((t) => t.departmentId === planId);
    expect(plan?.totalCount).toBe(1);
    expect(plan?.activeRun).toBeNull();
    expect(plan?.hasFinishedRun).toBe(false);
    expect(plan?.wrongCount).toBe(0);
  });

  it("진행 중인 바퀴를 위치와 총 개수로 알려준다", async () => {
    await seedProblem(1);
    await seedProblem(2);
    const run = await startRun(db, actor, planId, "ALL");
    await advanceRun(db, actor, run.runId, 0, true);

    const plan = (await listTeams(db, actor)).find((t) => t.departmentId === planId);
    expect(plan?.activeRun).toEqual({ runId: run.runId, mode: "ALL", cursor: 1, total: 2 });
  });

  it("끝낸 뒤에는 hasFinishedRun 이 참이고 틀린 문제 수가 나온다", async () => {
    const a = await seedProblem(1);
    await seedProblem(2);
    const run = await startRun(db, actor, planId, "ALL");
    await advanceRun(db, actor, run.runId, 0, false);
    await advanceRun(db, actor, run.runId, 1, true);
    await db.insert(attempts)
      .values({ userId: actor.userId, problemId: a, isCorrect: false, submittedAt: new Date() });

    const plan = (await listTeams(db, actor)).find((t) => t.departmentId === planId);
    expect(plan?.activeRun).toBeNull();
    expect(plan?.hasFinishedRun).toBe(true);
    expect(plan?.wrongCount).toBe(1);
  });
});

describe("startRun", () => {
  it("전체 모드는 팀 문제를 번호 순으로 담는다", async () => {
    const two = await seedProblem(2);
    const one = await seedProblem(1);
    const run = await startRun(db, actor, planId, "ALL");
    expect(run.total).toBe(2);
    expect(run.problemIds).toEqual([one, two]);
    expect(run.problems.map((p) => p.id)).toEqual([one, two]);
    expect(run.cursor).toBe(0);
    expect(run.status).toBe("IN_PROGRESS");
  });

  it("problemIds 는 문제 행이 사라져도 그대로다 — 화면이 위치를 여기서 정한다", async () => {
    const one = await seedProblem(1);
    const two = await seedProblem(2);
    const run = await startRun(db, actor, planId, "ALL");
    await db.delete(problems).where(eq(problems.id, one));

    const view = await getRunView(db, actor, run.runId);
    expect(view.problemIds).toEqual([one, two]);
    expect(view.problems.map((p) => p.id)).toEqual([two]);
    expect(view.total).toBe(2);
  });

  it("틀린 것만 모드는 마지막 답이 오답인 문제만 담는다", async () => {
    const wrong = await seedProblem(1);
    const right = await seedProblem(2);
    await db.insert(attempts).values([
      { userId: actor.userId, problemId: wrong, isCorrect: false, submittedAt: new Date("2026-01-01T00:00:00Z") },
      { userId: actor.userId, problemId: right, isCorrect: true, submittedAt: new Date("2026-01-01T00:00:00Z") },
    ]);
    const run = await startRun(db, actor, planId, "WRONG");
    expect(run.problems.map((p) => p.id)).toEqual([wrong]);
    expect(run.mode).toBe("WRONG");
  });

  it("진행 중인 바퀴가 있으면 새로 만들지 않고 그것을 돌려준다", async () => {
    await seedProblem(1);
    await seedProblem(2);
    const first = await startRun(db, actor, planId, "ALL");
    await advanceRun(db, actor, first.runId, 0, true);

    const again = await startRun(db, actor, planId, "WRONG");
    expect(again.runId).toBe(first.runId);
    expect(again.mode).toBe("ALL");
    expect(again.cursor).toBe(1);
  });

  it("담을 문제가 없으면 거절한다", async () => {
    await expect(startRun(db, actor, planId, "ALL")).rejects.toThrow(NO_PROBLEMS_MESSAGE);
  });

  it("틀린 문제가 없으면 복습 바퀴를 만들지 않는다", async () => {
    await seedProblem(1);
    await expect(startRun(db, actor, planId, "WRONG")).rejects.toThrow(NO_PROBLEMS_MESSAGE);
  });
});

describe("advanceRun", () => {
  it("한 칸 전진하며 결과를 쌓는다", async () => {
    const one = await seedProblem(1);
    await seedProblem(2);
    const run = await startRun(db, actor, planId, "ALL");

    const after = await advanceRun(db, actor, run.runId, 0, true);
    expect(after).toEqual({ cursor: 1, status: "IN_PROGRESS", total: 2 });
    expect((await getRunView(db, actor, run.runId)).results).toEqual([{ problemId: one, correct: true }]);
  });

  it("마지막 문제를 지나면 끝난다", async () => {
    await seedProblem(1);
    const run = await startRun(db, actor, planId, "ALL");
    const after = await advanceRun(db, actor, run.runId, 0, true);
    expect(after.status).toBe("FINISHED");
  });

  it("보낸 위치가 어긋나면 아무것도 하지 않는다 — 두 칸 건너뛰기 방지", async () => {
    await seedProblem(1);
    await seedProblem(2);
    const run = await startRun(db, actor, planId, "ALL");
    await advanceRun(db, actor, run.runId, 0, true);

    const again = await advanceRun(db, actor, run.runId, 0, true);
    expect(again.cursor).toBe(1);
    expect((await getRunView(db, actor, run.runId)).results).toHaveLength(1);
  });

  it("건너뛴 문제는 정답에도 오답에도 세지 않는다", async () => {
    await seedProblem(1);
    await seedProblem(2);
    const run = await startRun(db, actor, planId, "ALL");
    await advanceRun(db, actor, run.runId, 0, null);
    await advanceRun(db, actor, run.runId, 1, true);

    const view = await getRunView(db, actor, run.runId);
    expect(view.answeredCount).toBe(1);
    expect(view.correctCount).toBe(1);
  });

  it("남의 바퀴는 전진시킬 수 없다", async () => {
    await seedProblem(1);
    const run = await startRun(db, actor, planId, "ALL");
    await expect(advanceRun(db, other, run.runId, 0, true)).rejects.toThrow();
  });
});

describe("finishRun", () => {
  it("중간에 그만두면 끝난 바퀴가 되고 같은 팀을 다시 시작할 수 있다", async () => {
    await seedProblem(1);
    await seedProblem(2);
    const run = await startRun(db, actor, planId, "ALL");
    await finishRun(db, actor, run.runId);

    const next = await startRun(db, actor, planId, "ALL");
    expect(next.runId).not.toBe(run.runId);
    expect(next.cursor).toBe(0);
  });

  it("남의 바퀴는 끝낼 수 없다", async () => {
    await seedProblem(1);
    const run = await startRun(db, actor, planId, "ALL");
    await expect(finishRun(db, other, run.runId)).rejects.toThrow();
  });
});

describe("복습 고리", () => {
  it("복습에서 맞힌 문제는 다음 복습 대상에서 빠진다", async () => {
    const a = await seedProblem(1);
    const b = await seedProblem(2);
    await db.insert(attempts).values([
      { userId: actor.userId, problemId: a, isCorrect: false, submittedAt: new Date("2026-01-01T00:00:00Z") },
      { userId: actor.userId, problemId: b, isCorrect: false, submittedAt: new Date("2026-01-01T00:00:00Z") },
    ]);

    const first = await startRun(db, actor, planId, "WRONG");
    expect(first.problems.map((p) => p.id)).toEqual([a, b]);
    await finishRun(db, actor, first.runId);

    // a 를 맞혔다고 기록한다(실제로는 제출 창구가 남긴다).
    await db.insert(attempts)
      .values({ userId: actor.userId, problemId: a, isCorrect: true, submittedAt: new Date("2026-01-02T00:00:00Z") });

    const second = await startRun(db, actor, planId, "WRONG");
    expect(second.problems.map((p) => p.id)).toEqual([b]);
  });
});

describe("getLatestRunView", () => {
  it("진행 중인 바퀴가 있으면 그것을 준다", async () => {
    await seedProblem(1);
    const run = await startRun(db, actor, planId, "ALL");
    expect((await getLatestRunView(db, actor, planId))?.runId).toBe(run.runId);
  });

  it("끝난 바퀴만 있으면 그중 가장 나중 것을 준다", async () => {
    await seedProblem(1);
    const first = await startRun(db, actor, planId, "ALL");
    await finishRun(db, actor, first.runId);
    expect((await getLatestRunView(db, actor, planId))?.runId).toBe(first.runId);
  });

  it("바퀴가 하나도 없으면 null 이다", async () => {
    await seedProblem(1);
    expect(await getLatestRunView(db, actor, planId)).toBeNull();
  });
});

describe("getRunView", () => {
  it("남의 바퀴는 볼 수 없다", async () => {
    await seedProblem(1);
    const run = await startRun(db, actor, planId, "ALL");
    await expect(getRunView(db, other, run.runId)).rejects.toThrow();
  });

  it("없는 바퀴는 거절한다", async () => {
    await expect(getRunView(db, actor, 999999)).rejects.toThrow();
  });
});
