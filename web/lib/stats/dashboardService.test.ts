import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { migrateTestDb, testDb, truncateAll } from "../../test/db";
import { departments, problems, users, attempts } from "../db/schema";
import type { AuthUser } from "../auth/types";
import type { ProblemStatItem } from "./statsService";
import { needsReview, getDashboardSummary } from "./dashboardService";

const db = testDb();
let deptA = 0, deptB = 0, superAdminId = 0, deptAdminId = 0;
let superAdmin: AuthUser;
let deptAdmin: AuthUser;

beforeAll(async () => { await migrateTestDb(); });
beforeEach(async () => {
  await truncateAll();
  [{ id: deptA }] = await db.insert(departments).values({ name: "가팀", code: "A", status: "ACTIVE" }).returning({ id: departments.id });
  [{ id: deptB }] = await db.insert(departments).values({ name: "나팀", code: "B", status: "ACTIVE" }).returning({ id: departments.id });
  [{ id: superAdminId }] = await db.insert(users).values({
    employeeNo: "admin", name: "총괄", email: "a@b.c", passwordHash: "x",
    departmentId: deptA, role: "SUPER_ADMIN", status: "ACTIVE", mustChangePassword: false,
  }).returning({ id: users.id });
  [{ id: deptAdminId }] = await db.insert(users).values({
    employeeNo: "dept-a", name: "부서관리자A", email: "b@b.c", passwordHash: "x",
    departmentId: deptA, role: "DEPT_ADMIN", status: "ACTIVE", mustChangePassword: false,
  }).returning({ id: users.id });
  superAdmin = { userId: superAdminId, employeeNo: "admin", name: "총괄", role: "SUPER_ADMIN", departmentId: deptA, mustChangePassword: false, track: "ADMIN" };
  deptAdmin = { userId: deptAdminId, employeeNo: "dept-a", name: "부서관리자A", role: "DEPT_ADMIN", departmentId: deptA, mustChangePassword: false, track: "ADMIN" };
});

/** 문제 하나를 만들고 정답/오답 시도를 원하는 만큼 붙인다. statsService.test.ts 와 같은 헬퍼. */
async function seedWithAttempts(over: Partial<typeof problems.$inferInsert>, correct: number, wrong: number) {
  const [p] = await db.insert(problems).values({
    type: "OX", content: "본문", departmentId: deptA, status: "ACTIVE", createdBy: superAdminId, ...over,
  }).returning({ id: problems.id });
  const rows = [
    ...Array.from({ length: correct }, () => ({ userId: superAdminId, problemId: p.id, submittedAnswer: "가", isCorrect: true })),
    ...Array.from({ length: wrong }, () => ({ userId: superAdminId, problemId: p.id, submittedAnswer: "나", isCorrect: false })),
  ];
  if (rows.length) await db.insert(attempts).values(rows);
  return p.id;
}

describe("needsReview (B7) — 네 조건이 전부 AND 다", () => {
  const base = { status: "ACTIVE", totalAttempts: 10, accuracyRate: 0.3 } as ProblemStatItem;
  it("X5: 보관 문제는 제외", () => expect(needsReview({ ...base, status: "ARCHIVED" })).toBe(false));
  it("X3: 시도 4회는 제외", () => expect(needsReview({ ...base, totalAttempts: 4 })).toBe(false));
  it("X3: 시도 5회는 포함", () => expect(needsReview({ ...base, totalAttempts: 5 })).toBe(true));
  it("X1: 미응시(null)는 제외", () => expect(needsReview({ ...base, accuracyRate: null })).toBe(false));
  it("X4: 정확히 0.5 는 제외", () => expect(needsReview({ ...base, accuracyRate: 0.5 })).toBe(false));
  it("X4: 0.49 는 포함", () => expect(needsReview({ ...base, accuracyRate: 0.49 })).toBe(true));
});

describe("getDashboardSummary — 지표별 범위 (B2~B6)", () => {
  it("B2 vs B3: totalProblems 는 활성만, totalAttempts 는 보관 포함", async () => {
    await seedWithAttempts({ content: "활성" }, 2, 1);                      // 3건
    await seedWithAttempts({ content: "보관", status: "ARCHIVED" }, 1, 0);  // 1건
    const s = await getDashboardSummary(db, superAdmin, null);
    expect(s.totalProblems).toBe(1);    // 활성 1개
    expect(s.totalAttempts).toBe(4);    // 3 + 1 — 보관 문제의 시도도 센다
    // 한 응답 안에서 두 지표의 범위가 다르다. 이걸 통일하면 화면 문구가 거짓이 된다.
  });

  it("B4: totalCorrectAttempts 도 활성 + 보관이다", async () => {
    await seedWithAttempts({ content: "활성" }, 2, 1);
    await seedWithAttempts({ content: "보관", status: "ARCHIVED" }, 1, 0);
    const s = await getDashboardSummary(db, superAdmin, null);
    expect(s.totalCorrectAttempts).toBe(3); // 2 + 1
  });

  it("B5: 시도가 0건이면 averageAccuracyRate 는 null — 0.0 이 아니다", async () => {
    await seedWithAttempts({ content: "미응시" }, 0, 0);
    expect((await getDashboardSummary(db, superAdmin, null)).averageAccuracyRate).toBeNull();
  });

  it("B6: 전체 정답/전체 시도이지 문제별 정답률의 평균이 아니다", async () => {
    await seedWithAttempts({ content: "1/1" }, 1, 0);    // 100%
    await seedWithAttempts({ content: "1/9" }, 1, 8);    // 11.1%
    const s = await getDashboardSummary(db, superAdmin, null);
    expect(s.averageAccuracyRate).toBeCloseTo(2 / 10, 15);   // 0.2 — (1.0+0.111)/2 = 0.556 이 아니다
  });

  it("B8: reviewNeededCount 와 lowAccuracyProblems 가 같은 집합이다", async () => {
    await seedWithAttempts({ content: "검토대상" }, 2, 8);  // 시도10, 정답률0.2
    await seedWithAttempts({ content: "정상" }, 9, 1);      // 시도10, 정답률0.9
    const s = await getDashboardSummary(db, superAdmin, null);
    expect(s.lowAccuracyProblems.length).toBe(Math.min(s.reviewNeededCount, 5));
    expect(s.lowAccuracyProblems.every(needsReview)).toBe(true);
  });
});

describe("getDashboardSummary — X3·X4·X5 경계를 실제 DB 값으로 재확인 (교훈 2: 손으로 만든 literal 이 아니라)", () => {
  it("시도수 경계·정확히 0.5 경계·보관 제외를 한 응답 안에서 함께 확인한다", async () => {
    const under5 = await seedWithAttempts({ content: "시도4회" }, 1, 3);          // 4회, 0.25 — X3 로 제외
    const at5 = await seedWithAttempts({ content: "시도5회 정답률0.2" }, 1, 4);   // 5회, 0.2 — 포함
    const exactlyHalf = await seedWithAttempts({ content: "정확히0.5" }, 4, 4);   // 8회, 0.5 — X4 로 제외
    const underHalf = await seedWithAttempts({ content: "0.375" }, 3, 5);         // 8회, 0.375 — 포함
    const archivedLow = await seedWithAttempts({ content: "보관·낮음", status: "ARCHIVED" }, 1, 9); // 10회, 0.1, ARCHIVED — X5 로 제외

    const s = await getDashboardSummary(db, superAdmin, null);

    expect(s.reviewNeededCount).toBe(2); // at5, underHalf 만
    // B11: 재정렬하지 않는다 — allStats(정답률 오름차순) 순서 그대로 나와야 한다.
    expect(s.lowAccuracyProblems.map((i) => i.problemId)).toEqual([at5, underHalf]);
    expect(s.lowAccuracyProblems.map((i) => i.problemId)).not.toContain(under5);
    expect(s.lowAccuracyProblems.map((i) => i.problemId)).not.toContain(exactlyHalf);
    expect(s.lowAccuracyProblems.map((i) => i.problemId)).not.toContain(archivedLow);

    // 보관 문제의 시도도 totalAttempts 에는 들어간다(B3) — reviewNeededCount 에서만 빠진다.
    expect(s.totalAttempts).toBe(4 + 5 + 8 + 8 + 10);
    expect(s.totalProblems).toBe(4); // ARCHIVED 하나는 활성 집계에서 빠진다
  });
});

describe("getDashboardSummary — lowAccuracyProblems 상한 (B10)", () => {
  it("검토 대상이 5개를 넘으면 정답률이 가장 낮은 5건만 나온다 — reviewNeededCount 는 전체를 센다", async () => {
    // B10 이 유일하게 안 덮여 있던 행이다. 검토 대상을 5개 이하로만 심으면 `slice(0, 5)` 를
    // 통째로 지워도 통과한다 — 두 구현이 같은 출력을 낸다.
    //
    // 정답률을 서로 다르게 만들어 **어느 5건인지**까지 단언한다. 전부 동률로 만들면
    // "5건이다"만 보게 되고, 오름차순 목록의 앞에서 자르는지 뒤에서 자르는지 구분이 안 된다.
    const ids = [];
    // 분모를 20으로 통일해 정답률이 삽입 순서와 **같은 방향으로** 오르게 한다.
    // (분모가 섞이면 4/15 < 3/10 처럼 순서가 뒤집혀 단언이 픽스처 산수에 걸린다 — 실제로 한 번 걸렸다.)
    for (const [correct, wrong] of [[0, 20], [1, 19], [2, 18], [3, 17], [4, 16], [5, 15], [6, 14]]) {
      ids.push(await seedWithAttempts({ content: `${correct}/20` }, correct, wrong));
    }
    const s = await getDashboardSummary(db, superAdmin, null);

    expect(s.reviewNeededCount).toBe(7);              // 건수는 잘리지 않는다
    expect(s.lowAccuracyProblems).toHaveLength(5);    // 목록만 잘린다
    // 정답률 오름차순의 **앞** 5건이어야 한다.
    expect(s.lowAccuracyProblems.map((i) => i.problemId)).toEqual(ids.slice(0, 5));
    const rates = s.lowAccuracyProblems.map((i) => i.accuracyRate!);
    expect(rates).toEqual([...rates].sort((a, b) => a - b));
    expect(rates[0]).toBe(0);                          // 0.0 이 맨 앞 — null(미응시)과 다르다
  });
});

describe("getDashboardSummary — 스코프 (R6·B16)", () => {
  it("DEPT_ADMIN 이 departmentId 를 위조해도 recentProblems 는 자기 부서만 보인다", async () => {
    const ownRecent = await seedWithAttempts({ content: "내 부서 최근문제" }, 0, 0);
    await seedWithAttempts({ content: "남의 부서 최근문제", departmentId: deptB }, 0, 0);
    const s = await getDashboardSummary(db, deptAdmin, deptB); // deptAdmin 은 deptA 소속인데 deptB 를 요청
    expect(s.recentProblems.map((i) => i.id)).toEqual([ownRecent]);
    expect(s.totalProblems).toBe(1); // 통계 쪽도 같은 scope 로 강제된다
  });

  it("SUPER_ADMIN 이 departmentId 를 지정하면 그 부서만 나온다", async () => {
    const own = await seedWithAttempts({ content: "가팀" }, 0, 0);
    await seedWithAttempts({ content: "나팀", departmentId: deptB }, 0, 0);
    const s = await getDashboardSummary(db, superAdmin, deptA);
    expect(s.recentProblems.map((i) => i.id)).toEqual([own]);
  });
});

describe("getDashboardSummary — 응답 형태 (B1·B15)", () => {
  it("응답 키 7개, recentProblems[i] 는 ProblemStatItem 이 아니라 ProblemListItem 이라 id 를 쓴다", async () => {
    await seedWithAttempts({ content: "문제" }, 1, 0);
    const s = await getDashboardSummary(db, superAdmin, null);
    expect(Object.keys(s).sort()).toEqual(["averageAccuracyRate", "lowAccuracyProblems", "recentProblems",
      "reviewNeededCount", "totalAttempts", "totalCorrectAttempts", "totalProblems"]);
    // B15: recentProblems 는 ProblemListItem 이라 `id` 를 쓴다 — 통계 항목의 `problemId` 와 다르다.
    expect(Object.keys(s.recentProblems[0]).sort()).toEqual(["content", "createdAt", "departmentId",
      "departmentName", "id", "status", "tags", "track", "type"]);
  });

  it("B12: lowAccuracyProblems[i] 는 ProblemStatItem 10필드, problemId 를 쓴다", async () => {
    await seedWithAttempts({ content: "검토대상" }, 1, 9); // 10회, 0.1
    const s = await getDashboardSummary(db, superAdmin, null);
    expect(Object.keys(s.lowAccuracyProblems[0]).sort()).toEqual(["accuracyRate", "content", "correctAttempts",
      "departmentId", "departmentName", "lastAttemptAt", "problemId", "status", "totalAttempts", "type"]);
  });
});
