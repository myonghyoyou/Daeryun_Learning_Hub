import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import { migrateTestDb, testDb, truncateAll } from "../../../test/db";
import { departments, problems, users } from "../../../lib/db/schema";
import type { AuthUser } from "../../../lib/auth/types";

const state = vi.hoisted(() => ({ currentUser: null as unknown }));
vi.mock("../../../lib/db/client", async () => {
  const { testDb } = await import("../../../test/db");
  const actual = await vi.importActual<object>("../../../lib/db/client");
  return { ...actual, getDb: () => testDb() };
});
vi.mock("../../../lib/auth/session", () => ({ getAuthUser: async () => state.currentUser }));

const db = testDb();

// 인증은 세션 mock(위)이 담당하고 이 라우트는 users 테이블을 조회하지 않으므로,
// AuthUser 는 실제 DB 행 없이 값 객체로만 둔다.
const employee = {
  userId: 1, employeeNo: "emp", name: "직원", role: "EMPLOYEE",
  departmentId: 1, mustChangePassword: false, track: "ADMIN",
} satisfies AuthUser;

beforeAll(async () => { await migrateTestDb(); });
beforeEach(async () => { await truncateAll(); state.currentUser = employee; });

/**
 * 이 라우트는 이제 **그 직군의 문제가 있는 부서**만 준다(직군 분리, 2026-09). 부서만 심으면
 * 아무것도 안 나오므로 문제와 그 작성자까지 같이 심는다.
 */
async function seedDepartmentWithProblem(
  name: string, code: string,
  over: { status?: "ACTIVE" | "INACTIVE"; track?: "ADMIN" | "TECH" } = {},
) {
  const [dept] = await db.insert(departments)
    .values({ name, code, status: over.status ?? "ACTIVE" }).returning();
  const [owner] = await db.insert(users).values({
    employeeNo: `emp-${code}`, name: "관리자", email: `${code}@x.local`,
    passwordHash: "h", departmentId: dept.id, role: "SUPER_ADMIN",
  }).returning();
  await db.insert(problems).values({
    type: "OX", content: "본문", departmentId: dept.id, createdBy: owner.id,
    track: over.track ?? "ADMIN",
  });
  return dept;
}

describe("departments route", () => {
  it("활성 부서만 이름 오름차순으로 준다", async () => {
    await seedDepartmentWithProblem("나팀", "B");
    await seedDepartmentWithProblem("가팀", "A");
    await seedDepartmentWithProblem("폐지팀", "Z", { status: "INACTIVE" });
    const { GET } = await import("./route");
    const res = await GET();
    const body = await res.json();
    expect(body.data.map((d: { name: string }) => d.name)).toEqual(["가팀", "나팀"]);
  });

  it("고른 직군의 문제가 있는 부서만 준다", async () => {
    await seedDepartmentWithProblem("행정팀", "A", { track: "ADMIN" });
    await seedDepartmentWithProblem("기술팀", "T", { track: "TECH" });
    const { GET } = await import("./route");
    // 세션의 직군이 ADMIN 이므로 기술팀은 안 나온다.
    const body = await (await GET()).json();
    expect(body.data.map((d: { name: string }) => d.name)).toEqual(["행정팀"]);
  });

  it("응답 필드는 정확히 id·name·code 다 — status·createdAt 은 안 나간다", async () => {
    // 관리자용 /api/admin/departments 는 전체 행을 준다. 같은 DAO 를 재사용하면 여기서 걸린다
    // (findAllTags vs findInUseTags 와 같은 함정).
    await seedDepartmentWithProblem("가팀", "A");
    const { GET } = await import("./route");
    const body = await (await GET()).json();
    expect(Object.keys(body.data[0]).sort()).toEqual(["code", "id", "name"]);
  });

  it("EMPLOYEE 도 쓸 수 있다 — 역할 제한이 없다", async () => {
    state.currentUser = { ...employee, role: "EMPLOYEE" };
    const { GET } = await import("./route");
    const res = await GET();
    expect(res.status).toBe(200);
  });

  it("비로그인은 401", async () => {
    state.currentUser = null;
    const { GET } = await import("./route");
    const res = await GET();
    expect(res.status).toBe(401);
  });
});
