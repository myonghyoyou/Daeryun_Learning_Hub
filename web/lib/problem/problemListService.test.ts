import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { migrateTestDb, testDb, truncateAll } from "../../test/db";
import { departments, problems, users } from "../db/schema";
import { insertProblem } from "../db/problems";
import { findOrCreateTagsByNames, replaceProblemTags } from "../db/tags";
import type { AuthUser } from "../auth/types";
import { listProblems, type ProblemListRequest } from "./problemListService";

const db = testDb();
let deptA = 0, deptB = 0, superAdmin: AuthUser, deptAdminOfA: AuthUser;

const none: ProblemListRequest = {
  departmentId: null, type: null, status: null,
  createdFrom: null, createdTo: null, tag: null, keyword: null, page: 1, size: 20,
};

async function seed(values: {
  content: string; type?: string; status?: "ACTIVE" | "ARCHIVED"; departmentId?: number;
  sourceNumber?: number | null; createdAt?: string; tags?: string[];
}) {
  const id = await insertProblem(db, {
    type: values.type ?? "OX", content: values.content, status: values.status ?? "ACTIVE",
    departmentId: values.departmentId ?? deptA, sourceNumber: values.sourceNumber ?? null,
    createdBy: superAdmin.userId,
  });
  if (values.createdAt) {
    await db.update(problems).set({ createdAt: sql`${values.createdAt}::timestamp` }).where(eq(problems.id, id));
  }
  if (values.tags?.length) {
    await replaceProblemTags(db, id, await findOrCreateTagsByNames(db, values.tags));
  }
  return id;
}

beforeAll(async () => { await migrateTestDb(); });
beforeEach(async () => {
  await truncateAll(db);
  [{ id: deptA }] = await db.insert(departments).values({ name: "가팀", code: "A" }).returning({ id: departments.id });
  [{ id: deptB }] = await db.insert(departments).values({ name: "나팀", code: "B" }).returning({ id: departments.id });
  const [su] = await db.insert(users).values({
    employeeNo: "super", name: "총괄", email: "s@x.local", passwordHash: "h", departmentId: deptA, role: "SUPER_ADMIN",
  }).returning();
  const [da] = await db.insert(users).values({
    employeeNo: "dept", name: "부서", email: "d@x.local", passwordHash: "h", departmentId: deptA, role: "DEPT_ADMIN",
  }).returning();
  superAdmin = { userId: su.id, employeeNo: "super", name: "총괄", role: "SUPER_ADMIN", departmentId: deptA, mustChangePassword: false };
  deptAdminOfA = { userId: da.id, employeeNo: "dept", name: "부서", role: "DEPT_ADMIN", departmentId: deptA, mustChangePassword: false };
});

describe("problemListService — 클램프", () => {
  it("size 를 100 으로 클램프한다", async () => {
    // 정답지 L3: size=100000 을 그대로 쓰면 페이징이 없는 것과 같아진다.
    const res = await listProblems(db, superAdmin, { ...none, size: 100000 });
    expect(res.size).toBe(100);
  });

  it("size 가 0 이하면 20 이다", async () => {
    // 정답지 L2
    expect((await listProblems(db, superAdmin, { ...none, size: 0 })).size).toBe(20);
    expect((await listProblems(db, superAdmin, { ...none, size: -5 })).size).toBe(20);
  });

  it("page 가 0 이하면 1 이다", async () => {
    // 정답지 L4
    expect((await listProblems(db, superAdmin, { ...none, page: 0 })).page).toBe(1);
    expect((await listProblems(db, superAdmin, { ...none, page: -3 })).page).toBe(1);
  });

  it("클램프한 size 로 offset 을 계산한다", async () => {
    for (const n of [1, 2, 3, 4, 5]) await seed({ content: `행 ${n}`, sourceNumber: n, createdAt: "2026-08-19 09:00:00" });
    const page2 = await listProblems(db, superAdmin, { ...none, page: 2, size: 2 });
    expect(page2.items.map((i) => i.content)).toEqual(["행 3", "행 2"]);
    expect(page2.totalCount).toBe(5);
    expect([page2.page, page2.size]).toEqual([2, 2]);
  });

  it("범위를 넘은 페이지는 빈 목록이지만 총건수는 그대로다", async () => {
    await seed({ content: "하나", sourceNumber: 1 });
    const res = await listProblems(db, superAdmin, { ...none, page: 9 });
    expect(res.items).toEqual([]);
    expect(res.totalCount).toBe(1);
  });
});

describe("problemListService — 부서 스코프(정답지 L16·R7)", () => {
  it("부서 관리자는 요청한 departmentId 가 무시된다", async () => {
    await seed({ content: "가팀 문제", sourceNumber: 1 });
    await seed({ content: "나팀 문제", departmentId: deptB, sourceNumber: 1 });
    const res = await listProblems(db, deptAdminOfA, { ...none, departmentId: deptB });
    expect(res.items.every((i) => i.departmentId === deptA)).toBe(true);
    expect(res.totalCount).toBe(1);
  });

  it("총괄 관리자는 departmentId 가 null 이면 전 부서를 본다", async () => {
    // resolveOwningDepartment 를 재사용하면 여기서 "문제가 귀속될 부서를 선택하세요." 가 터져
    // 전체 조회 자체가 불가능해진다 — 목록의 부서 규칙은 별개다(ProblemServiceImpl.java:185).
    await seed({ content: "가팀 문제", sourceNumber: 1 });
    await seed({ content: "나팀 문제", departmentId: deptB, sourceNumber: 1 });
    const res = await listProblems(db, superAdmin, none);
    expect(res.totalCount).toBe(2);
    expect(new Set(res.items.map((i) => i.departmentId))).toEqual(new Set([deptA, deptB]));
  });

  it("총괄 관리자는 요청한 departmentId 로 좁힐 수 있다", async () => {
    await seed({ content: "가팀 문제", sourceNumber: 1 });
    await seed({ content: "나팀 문제", departmentId: deptB, sourceNumber: 1 });
    const res = await listProblems(db, superAdmin, { ...none, departmentId: deptB });
    expect(res.items.map((i) => i.content)).toEqual(["나팀 문제"]);
  });
});

describe("problemListService — 필터·응답", () => {
  it("createdTo 는 그 날 전체를 포함한다", async () => {
    // 정답지 L9: `< (createdTo + 1 day)` 가 아니면 그날 등록분이 통째로 빠진다.
    await seed({ content: "그날 늦게", sourceNumber: 1, createdAt: "2026-08-19 23:30:00" });
    const res = await listProblems(db, superAdmin, { ...none, createdTo: new Date(Date.UTC(2026, 7, 19)) });
    expect(res.totalCount).toBe(1);
  });

  it("totalCount 가 태그 수만큼 부풀지 않는다", async () => {
    // 정답지 L13: countAll 에 태그 조인을 두면 태그 3개짜리 문제 1건이 3건으로 세어진다.
    await seed({ content: "태그 셋", sourceNumber: 1, tags: ["가", "나", "다"] });
    const res = await listProblems(db, superAdmin, none);
    expect(res.totalCount).toBe(1);
    expect(res.items).toHaveLength(1);
  });

  it("keyword 는 본문 부분일치이고 대소문자를 가리지 않는다", async () => {
    await seed({ content: "SWOT 분석이란", sourceNumber: 1 });
    await seed({ content: "손익분기점", sourceNumber: 2 });
    expect((await listProblems(db, superAdmin, { ...none, keyword: "swot" })).items).toHaveLength(1);
  });

  it("tag 필터는 대소문자를 가리지 않는다", async () => {
    await seed({ content: "회계 문제", sourceNumber: 1, tags: ["회계"] });
    await seed({ content: "무관", sourceNumber: 2, tags: ["기타"] });
    expect((await listProblems(db, superAdmin, { ...none, tag: "회계" })).items).toHaveLength(1);
  });

  it("응답은 items·totalCount·page·size 네 필드다", async () => {
    // 정답지 L14
    await seed({ content: "본문", sourceNumber: 1, tags: ["회계"] });
    const res = await listProblems(db, superAdmin, none);
    expect(Object.keys(res)).toEqual(["items", "totalCount", "page", "size"]);
    expect(Object.keys(res.items[0])).toEqual([
      "id", "type", "content", "status", "departmentId", "departmentName", "createdAt", "tags",
    ]);
    expect(res.items[0].departmentName).toBe("가팀");
    expect(res.items[0].tags).toEqual(["회계"]);
  });

  it("created_at 이 같아도 페이지 사이에서 중복·누락이 없다", async () => {
    // 정답지 L12: 엑셀 업로드는 created_at 이 같은 행을 무더기로 만든다.
    for (const n of [1, 2, 3, 4]) await seed({ content: `행 ${n}`, sourceNumber: n, createdAt: "2026-08-19 09:00:00" });
    const first = await listProblems(db, superAdmin, { ...none, size: 2, page: 1 });
    const second = await listProblems(db, superAdmin, { ...none, size: 2, page: 2 });
    const ids = [...first.items, ...second.items].map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toEqual([...ids].sort((a, b) => b - a));
  });
});
