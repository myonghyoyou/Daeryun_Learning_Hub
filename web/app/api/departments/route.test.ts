import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import { migrateTestDb, testDb, truncateAll } from "../../../test/db";
import { departments } from "../../../lib/db/schema";
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
  departmentId: 1, mustChangePassword: false,
} satisfies AuthUser;

beforeAll(async () => { await migrateTestDb(); });
beforeEach(async () => { await truncateAll(); state.currentUser = employee; });

describe("departments route", () => {
  it("활성 부서만 이름 오름차순으로 준다", async () => {
    await db.insert(departments).values([
      { name: "나팀", code: "B", status: "ACTIVE" },
      { name: "가팀", code: "A", status: "ACTIVE" },
      { name: "폐지팀", code: "Z", status: "INACTIVE" },
    ]);
    const { GET } = await import("./route");
    const res = await GET();
    const body = await res.json();
    expect(body.data.map((d: { name: string }) => d.name)).toEqual(["가팀", "나팀"]);
  });

  it("응답 필드는 정확히 id·name·code 다 — status·createdAt 은 안 나간다", async () => {
    // 관리자용 /api/admin/departments 는 전체 행을 준다. 같은 DAO 를 재사용하면 여기서 걸린다
    // (findAllTags vs findInUseTags 와 같은 함정).
    await db.insert(departments).values({ name: "가팀", code: "A", status: "ACTIVE" });
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
