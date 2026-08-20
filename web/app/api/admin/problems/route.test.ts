import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import { eq, sql } from "drizzle-orm";
import { migrateTestDb, testDb, truncateAll } from "../../../../test/db";
import { departments, problems, users } from "../../../../lib/db/schema";
import { insertProblem } from "../../../../lib/db/problems";
import { findOrCreateTagsByNames, replaceProblemTags } from "../../../../lib/db/tags";
import type { AuthUser } from "../../../../lib/auth/types";

const state = vi.hoisted(() => ({ currentUser: null as unknown }));
vi.mock("../../../../lib/db/client", async () => {
  const { testDb } = await import("../../../../test/db");
  const actual = await vi.importActual<object>("../../../../lib/db/client");
  return { ...actual, getDb: () => testDb() };
});
vi.mock("../../../../lib/auth/session", () => ({ getAuthUser: async () => state.currentUser }));

const db = testDb();
let deptA = 0, deptB = 0, actorId = 0;

async function seedAdmin(role: AuthUser["role"] = "SUPER_ADMIN") {
  [{ id: deptA }] = await db.insert(departments).values({ name: "가팀", code: "A" }).returning({ id: departments.id });
  [{ id: deptB }] = await db.insert(departments).values({ name: "나팀", code: "B" }).returning({ id: departments.id });
  const [u] = await db.insert(users).values({
    employeeNo: "admin", name: "관리자", email: "admin@x.local", passwordHash: "h", departmentId: deptA, role,
  }).returning();
  actorId = u.id;
  state.currentUser = {
    userId: u.id, employeeNo: "admin", name: "관리자", role, departmentId: deptA, mustChangePassword: false,
  } satisfies AuthUser;
}

async function seedProblem(values: {
  content: string; departmentId?: number; sourceNumber: number; createdAt?: string; tags?: string[];
}) {
  const id = await insertProblem(db, {
    type: "OX", content: values.content, status: "ACTIVE",
    departmentId: values.departmentId ?? deptA, sourceNumber: values.sourceNumber, createdBy: actorId,
  });
  if (values.createdAt) {
    await db.update(problems).set({ createdAt: sql`${values.createdAt}::timestamp` }).where(eq(problems.id, id));
  }
  if (values.tags?.length) await replaceProblemTags(db, id, await findOrCreateTagsByNames(db, values.tags));
  return id;
}

function listRequest(query = ""): Request {
  return new Request(`http://localhost/api/admin/problems${query}`);
}

beforeAll(async () => { await migrateTestDb(); });
beforeEach(async () => { await truncateAll(db); state.currentUser = null; });

describe("GET /api/admin/problems", () => {
  it("returns items, totalCount, page and size", async () => {
    await seedAdmin();
    await seedProblem({ content: "SWOT 분석", sourceNumber: 1, tags: ["회계"] });
    const { GET } = await import("./route");
    const body = await (await GET(listRequest())).json();
    expect(body.resultCode).toBe(200);
    expect(body.data.totalCount).toBe(1);
    expect(body.data.page).toBe(1);
    expect(body.data.size).toBe(20);
    expect(body.data.items[0].departmentName).toBe("가팀");
    expect(body.data.items[0].tags).toEqual(["회계"]);
  });

  it("applies every filter it is given", async () => {
    await seedAdmin();
    await seedProblem({ content: "SWOT 분석", sourceNumber: 1, tags: ["회계"], createdAt: "2026-08-19 10:00:00" });
    await seedProblem({ content: "손익분기점", sourceNumber: 2, tags: ["기타"], createdAt: "2026-08-19 10:00:00" });
    await seedProblem({ content: "SWOT 나팀", departmentId: deptB, sourceNumber: 1, tags: ["회계"], createdAt: "2026-08-19 10:00:00" });
    const { GET } = await import("./route");
    const query = `?departmentId=${deptA}&type=OX&status=ACTIVE&createdFrom=2026-08-19&createdTo=2026-08-19&tag=회계&keyword=swot&page=1&size=10`;
    const body = await (await GET(listRequest(query))).json();
    expect(body.data.totalCount).toBe(1);
    expect(body.data.items.map((i: { content: string }) => i.content)).toEqual(["SWOT 분석"]);
  });

  it("clamps size above 100 and page below 1", async () => {
    await seedAdmin();
    const { GET } = await import("./route");
    const body = await (await GET(listRequest("?size=100000&page=0"))).json();
    expect([body.data.page, body.data.size]).toEqual([1, 100]);
  });

  it("forces a DEPT_ADMIN onto its own department (L16)", async () => {
    await seedAdmin("DEPT_ADMIN");
    await seedProblem({ content: "가팀 문제", sourceNumber: 1 });
    await seedProblem({ content: "나팀 문제", departmentId: deptB, sourceNumber: 1 });
    const { GET } = await import("./route");
    const body = await (await GET(listRequest(`?departmentId=${deptB}`))).json();
    expect(body.data.totalCount).toBe(1);
    expect(body.data.items.map((i: { content: string }) => i.content)).toEqual(["가팀 문제"]);
  });

  it("lets a SUPER_ADMIN browse every department with no departmentId", async () => {
    await seedAdmin();
    await seedProblem({ content: "가팀 문제", sourceNumber: 1 });
    await seedProblem({ content: "나팀 문제", departmentId: deptB, sourceNumber: 1 });
    const { GET } = await import("./route");
    const body = await (await GET(listRequest())).json();
    expect(body.resultCode).toBe(200);
    expect(body.data.totalCount).toBe(2);
  });

  it.each(["createdFrom=어제", "createdTo=2026-02-30"])("maps the malformed date param %s to 400/1000", async (query) => {
    // 정답지 L15: Spring 은 @DateTimeFormat 이 없으면 목록 조회 전체가 500 으로 죽었다(QA D1).
    await seedAdmin();
    const { GET } = await import("./route");
    const res = await GET(listRequest(`?${query}`));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.resultCode).toBe(1000);
    expect(body.resultMsg).toBe(`요청 값의 형식이 올바르지 않습니다: ${query.split("=")[0]}`);
  });

  it("maps a malformed page param to 400/1000", async () => {
    await seedAdmin();
    const { GET } = await import("./route");
    const res = await GET(listRequest("?page=abc"));
    expect(res.status).toBe(400);
    expect((await res.json()).resultMsg).toBe("요청 값의 형식이 올바르지 않습니다: page");
  });

  it("rejects an employee with 403/990", async () => {
    await seedAdmin("EMPLOYEE");
    const { GET } = await import("./route");
    const res = await GET(listRequest());
    expect(res.status).toBe(403);
    expect((await res.json()).resultCode).toBe(990);
  });

  it("rejects a missing session with 401/980", async () => {
    const { GET } = await import("./route");
    const res = await GET(listRequest());
    expect(res.status).toBe(401);
    expect((await res.json()).resultCode).toBe(980);
  });
});
