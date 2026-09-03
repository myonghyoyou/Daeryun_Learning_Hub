import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { eq } from "drizzle-orm";
import { migrateTestDb, testDb, truncateAll } from "../../test/db";
import { attempts, departments, problems, users } from "../db/schema";
import type { AuthUser } from "../auth/types";
import { getHallOfFame } from "./hallOfFameService";

const db = testDb();
let planId = 0;
let problemId = 0;
let actor: AuthUser;

async function seedUser(employeeNo: string, name: string) {
  const [row] = await db.insert(users).values({
    employeeNo, name, email: `${employeeNo}@b.c`, passwordHash: "x",
    departmentId: planId, role: "EMPLOYEE", status: "ACTIVE", mustChangePassword: false,
  }).returning({ id: users.id });
  return row.id;
}

async function seedAttempt(userId: number, isCorrect: boolean, at: string) {
  await db.insert(attempts).values({ userId, problemId, isCorrect, submittedAt: new Date(at) });
}

/** 서울 기준 이번 달 1일 0시를 UTC 로 옮긴 시각. */
function monthBoundaryUtc(): Date {
  const kst = new Date(Date.now() + 9 * 60 * 60 * 1000);
  return new Date(Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth(), 1) - 9 * 60 * 60 * 1000);
}

beforeAll(async () => { await migrateTestDb(); });
beforeEach(async () => {
  await truncateAll();
  [{ id: planId }] = await db.insert(departments)
    .values({ name: "기획팀", code: "PLAN", status: "ACTIVE" }).returning({ id: departments.id });
  const author = await seedUser("author", "출제자");
  [{ id: problemId }] = await db.insert(problems).values({
    type: "OX", content: "문제", departmentId: planId, status: "ACTIVE",
    createdBy: author, sourceNumber: 1,
  }).returning({ id: problems.id });
  const me = await seedUser("emp1", "김하나");
  actor = {
    userId: me, employeeNo: "emp1", name: "김하나", role: "EMPLOYEE",
    departmentId: planId, mustChangePassword: false,
  };
});

describe("getHallOfFame", () => {
  it("아무도 맞히지 않았으면 개인도 팀도 비어 있다", async () => {
    const out = await getHallOfFame(db, actor);
    expect(out.month.people).toEqual({ top: [], me: null });
    expect(out.month.teams).toEqual({ top: [], mine: null });
    expect(out.allTime.people).toEqual({ top: [], me: null });
  });

  it("내 순위가 목록의 순위와 같은 값이다", async () => {
    const rival = await seedUser("emp2", "이둘");
    const now = new Date().toISOString();
    await seedAttempt(rival, true, now);
    await seedAttempt(actor.userId, true, now);

    const out = await getHallOfFame(db, actor);
    // 둘 다 1개라 공동 1위다.
    expect(out.allTime.people.top).toHaveLength(1);
    expect(out.allTime.people.top[0].rank).toBe(1);
    expect(out.allTime.people.me?.rank).toBe(1);
  });

  it("이번 달과 전체 기간이 서로 다른 숫자를 낸다", async () => {
    const boundary = monthBoundaryUtc();
    await seedAttempt(actor.userId, true, new Date(boundary.getTime() - 60_000).toISOString());
    await seedAttempt(actor.userId, true, new Date(boundary.getTime() + 60_000).toISOString());

    const out = await getHallOfFame(db, actor);
    expect(out.month.people.me?.correctCount).toBe(1);
    expect(out.allTime.people.me?.correctCount).toBe(2);
  });

  it("내가 맞힌 것이 없으면 me 는 null 이고 남의 순위는 그대로 나온다", async () => {
    const rival = await seedUser("emp2", "이둘");
    await seedAttempt(rival, true, new Date().toISOString());

    const out = await getHallOfFame(db, actor);
    expect(out.allTime.people.top[0].leader.name).toBe("이둘");
    expect(out.allTime.people.me).toBeNull();
  });

  it("내가 0개여도 같은 팀원이 맞혔으면 우리 팀 점수는 나온다", async () => {
    const teammate = await seedUser("emp2", "이둘");
    await seedAttempt(teammate, true, new Date().toISOString());

    const out = await getHallOfFame(db, actor);
    expect(out.allTime.people.me).toBeNull();
    expect(out.allTime.teams.mine).toEqual({ rank: 1, correctCount: 1 });
  });

  it("우리 팀 순위가 팀 목록의 순위와 같은 값이다", async () => {
    const [sales] = await db.insert(departments)
      .values({ name: "영업팀", code: "SALES", status: "ACTIVE" }).returning({ id: departments.id });
    const rival = await seedUser("emp3", "영업사람");
    await db.update(users).set({ departmentId: sales.id }).where(eq(users.id, rival));
    const now = new Date().toISOString();
    await seedAttempt(actor.userId, true, now);
    await seedAttempt(rival, true, now);

    const out = await getHallOfFame(db, actor);
    // 두 팀 모두 1개라 공동 1위다.
    expect(out.allTime.teams.top).toHaveLength(1);
    expect(out.allTime.teams.top[0].rank).toBe(1);
    expect(out.allTime.teams.mine?.rank).toBe(1);
  });
});
