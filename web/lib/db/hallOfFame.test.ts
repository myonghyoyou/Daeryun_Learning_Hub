import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { sql } from "drizzle-orm";
import { migrateTestDb, testDb, truncateAll } from "../../test/db";
import { attempts, departments, problems, users } from "./schema";
import { findCorrectCountsByTeam, findCorrectCountsByUser } from "./hallOfFame";

const db = testDb();
let planId = 0;
let salesId = 0;
let problemId = 0;
let otherProblemId = 0;

async function seedUser(employeeNo: string, name: string, over: Partial<typeof users.$inferInsert> = {}) {
  const [row] = await db.insert(users).values({
    employeeNo, name, email: `${employeeNo}@b.c`, passwordHash: "x",
    departmentId: planId, role: "EMPLOYEE", status: "ACTIVE", mustChangePassword: false, ...over,
  }).returning({ id: users.id });
  return row.id;
}

async function seedAttempt(userId: number, isCorrect: boolean, at: string, pid = problemId) {
  await db.insert(attempts).values({
    userId, problemId: pid, isCorrect, submittedAt: new Date(at),
  });
}

beforeAll(async () => { await migrateTestDb(); });
beforeEach(async () => {
  await truncateAll();
  [{ id: planId }] = await db.insert(departments)
    .values({ name: "기획팀", code: "PLAN", status: "ACTIVE" }).returning({ id: departments.id });
  [{ id: salesId }] = await db.insert(departments)
    .values({ name: "영업팀", code: "SALES", status: "ACTIVE" }).returning({ id: departments.id });
  const author = await seedUser("author", "출제자");
  [{ id: problemId }] = await db.insert(problems).values({
    type: "OX", content: "문제", departmentId: planId, status: "ACTIVE",
    createdBy: author, sourceNumber: 1,
  }).returning({ id: problems.id });
  [{ id: otherProblemId }] = await db.insert(problems).values({
    type: "OX", content: "다른 문제", departmentId: planId, status: "ACTIVE",
    createdBy: author, sourceNumber: 2,
  }).returning({ id: problems.id });
});

describe("findCorrectCountsByUser — ALL", () => {
  it("맞힌 것만 세고 오답은 빼놓는다", async () => {
    const me = await seedUser("emp1", "김하나");
    await seedAttempt(me, true, "2026-09-01T01:00:00Z");
    await seedAttempt(me, false, "2026-09-01T02:00:00Z");

    const rows = await findCorrectCountsByUser(db, "ALL");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ userId: me, name: "김하나", departmentName: "기획팀", correctCount: 1 });
  });

  it("같은 문제를 두 번 맞히면 2로 센다", async () => {
    const me = await seedUser("emp1", "김하나");
    await seedAttempt(me, true, "2026-09-01T01:00:00Z");
    await seedAttempt(me, true, "2026-09-01T02:00:00Z");

    expect((await findCorrectCountsByUser(db, "ALL"))[0].correctCount).toBe(2);
  });

  it("서로 다른 문제를 맞히면 합쳐 센다", async () => {
    const me = await seedUser("emp1", "김하나");
    await seedAttempt(me, true, "2026-09-01T01:00:00Z");
    await seedAttempt(me, true, "2026-09-01T02:00:00Z", otherProblemId);

    expect((await findCorrectCountsByUser(db, "ALL"))[0].correctCount).toBe(2);
  });

  it("비활성 계정은 빼놓는다", async () => {
    const gone = await seedUser("emp1", "퇴사자", { status: "INACTIVE" });
    await seedAttempt(gone, true, "2026-09-01T01:00:00Z");

    expect(await findCorrectCountsByUser(db, "ALL")).toEqual([]);
  });

  it("한 번도 안 맞힌 사람은 아예 나오지 않는다", async () => {
    const me = await seedUser("emp1", "김하나");
    await seedAttempt(me, false, "2026-09-01T01:00:00Z");

    expect(await findCorrectCountsByUser(db, "ALL")).toEqual([]);
  });

  it("맞힌 개수 내림차순, 같으면 마지막 정답이 이른 사람이 앞이다", async () => {
    const many = await seedUser("emp1", "많이");
    const early = await seedUser("emp2", "일찍");
    const late = await seedUser("emp3", "늦게");
    await seedAttempt(many, true, "2026-09-01T01:00:00Z");
    await seedAttempt(many, true, "2026-09-01T02:00:00Z");
    await seedAttempt(early, true, "2026-09-01T03:00:00Z");
    await seedAttempt(late, true, "2026-09-01T04:00:00Z");

    expect((await findCorrectCountsByUser(db, "ALL")).map((r) => r.name)).toEqual(["많이", "일찍", "늦게"]);
  });

  it("개수와 마지막 시각이 모두 같으면 사용자 번호가 작은 쪽이 앞이다", async () => {
    const first = await seedUser("emp1", "먼저");
    const second = await seedUser("emp2", "나중");
    await seedAttempt(first, true, "2026-09-01T01:00:00Z");
    await seedAttempt(second, true, "2026-09-01T01:00:00Z");

    expect((await findCorrectCountsByUser(db, "ALL")).map((r) => r.name)).toEqual(["먼저", "나중"]);
    expect(first).toBeLessThan(second);
  });

  it("다른 부서 사람도 함께 나온다 — 부서로 거르지 않는다", async () => {
    const mine = await seedUser("emp1", "기획");
    const yours = await seedUser("emp2", "영업", { departmentId: salesId });
    await seedAttempt(mine, true, "2026-09-01T01:00:00Z");
    await seedAttempt(yours, true, "2026-09-01T02:00:00Z");

    expect((await findCorrectCountsByUser(db, "ALL")).map((r) => r.departmentName)).toEqual(["기획팀", "영업팀"]);
  });
});

describe("findCorrectCountsByTeam", () => {
  it("팀원이 맞힌 것을 모두 더한다", async () => {
    const a = await seedUser("emp1", "가"); const b = await seedUser("emp2", "나");
    await seedAttempt(a, true, "2026-09-01T01:00:00Z");
    await seedAttempt(a, true, "2026-09-01T02:00:00Z");
    await seedAttempt(b, true, "2026-09-01T03:00:00Z");

    const rows = await findCorrectCountsByTeam(db, "ALL");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ departmentId: planId, departmentName: "기획팀", correctCount: 3 });
  });

  it("비활성 계정의 기록은 팀 합계에서도 빠진다", async () => {
    const live = await seedUser("emp1", "재직");
    const gone = await seedUser("emp2", "퇴사", { status: "INACTIVE" });
    await seedAttempt(live, true, "2026-09-01T01:00:00Z");
    await seedAttempt(gone, true, "2026-09-01T02:00:00Z");

    expect((await findCorrectCountsByTeam(db, "ALL"))[0].correctCount).toBe(1);
  });

  it("합계 내림차순, 같으면 마지막 정답이 이른 팀이 앞이다", async () => {
    const plan1 = await seedUser("emp1", "기획");
    const sales1 = await seedUser("emp2", "영업", { departmentId: salesId });
    await seedAttempt(plan1, true, "2026-09-01T03:00:00Z");
    await seedAttempt(sales1, true, "2026-09-01T01:00:00Z");

    expect((await findCorrectCountsByTeam(db, "ALL")).map((r) => r.departmentName))
      .toEqual(["영업팀", "기획팀"]);
  });

  it("맞힌 것이 없는 팀은 아예 나오지 않는다", async () => {
    const me = await seedUser("emp1", "가");
    await seedAttempt(me, false, "2026-09-01T01:00:00Z");
    expect(await findCorrectCountsByTeam(db, "ALL")).toEqual([]);
  });
});

describe("findCorrectCountsByUser — MONTH", () => {
  /**
   * 서울 기준 이번 달 1일 0시 = UTC 로 지난달 말일 15시.
   * 그 직전 1분과 직후 1분을 심어, 경계가 서울 기준인지 UTC 기준인지 갈라낸다.
   * UTC 기준으로 자르면 둘 다 이번 달로 들어와 이 테스트가 깨진다.
   */
  function monthBoundaryUtc(): Date {
    const now = new Date();
    const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
    return new Date(Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth(), 1) - 9 * 60 * 60 * 1000);
  }

  it("서울 기준 이달 1일 0시 이전 기록은 빠진다", async () => {
    const me = await seedUser("emp1", "김하나");
    const boundary = monthBoundaryUtc();
    await seedAttempt(me, true, new Date(boundary.getTime() - 60_000).toISOString());
    await seedAttempt(me, true, new Date(boundary.getTime() + 60_000).toISOString());

    expect((await findCorrectCountsByUser(db, "MONTH"))[0].correctCount).toBe(1);
    expect((await findCorrectCountsByUser(db, "ALL"))[0].correctCount).toBe(2);
  });

  it("이번 달에 맞힌 것이 없으면 빈 목록이다", async () => {
    const me = await seedUser("emp1", "김하나");
    const boundary = monthBoundaryUtc();
    await seedAttempt(me, true, new Date(boundary.getTime() - 60_000).toISOString());

    expect(await findCorrectCountsByUser(db, "MONTH")).toEqual([]);
  });

  /**
   * 경계식 끝의 `AT TIME ZONE 'UTC'` 가 실제로 일하는지 본다.
   *
   * 서버 시간대가 UTC 면 그 변환이 없어도 결과가 같아, 평소에는 있으나 없으나 통과한다.
   * 세션 시간대를 옮겨 두면 갈라진다 — 변환이 없으면 Postgres 가 시간대 없는
   * submitted_at 을 **세션 시간대**로 읽어 경계가 몇 시간씩 밀린다.
   */
  it("서버 시간대가 UTC 가 아니어도 서울 기준으로 자른다", async () => {
    const me = await seedUser("emp1", "김하나");
    const boundary = monthBoundaryUtc();
    await seedAttempt(me, true, new Date(boundary.getTime() - 60_000).toISOString());
    await seedAttempt(me, true, new Date(boundary.getTime() + 60_000).toISOString());

    await db.execute(sql`SET TIME ZONE 'America/New_York'`);
    try {
      expect((await findCorrectCountsByUser(db, "MONTH"))[0].correctCount).toBe(1);
    } finally {
      await db.execute(sql`SET TIME ZONE 'UTC'`);
    }
  });
});
