import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import { migrateTestDb, testDb, truncateAll } from "../../../../test/db";
import { departments, problems, users, tags, problemTags } from "../../../../lib/db/schema";
import type { AuthUser } from "../../../../lib/auth/types";

const state = vi.hoisted(() => ({ currentUser: null as unknown }));
vi.mock("../../../../lib/db/client", async () => {
  const { testDb } = await import("../../../../test/db");
  const actual = await vi.importActual<object>("../../../../lib/db/client");
  return { ...actual, getDb: () => testDb() };
});
vi.mock("../../../../lib/auth/session", () => ({ getAuthUser: async () => state.currentUser }));

const db = testDb();
let deptId = 0;
let userId = 0;

async function seedProblem(over: Partial<typeof problems.$inferInsert> = {}) {
  const [row] = await db.insert(problems).values({
    type: "OX", content: "본문", departmentId: deptId, status: "ACTIVE",
    createdBy: userId, sourceNumber: null, ...over,
  }).returning({ id: problems.id });
  return row.id;
}

function asEmployee() {
  state.currentUser = {
    userId, employeeNo: "emp", name: "직원", role: "EMPLOYEE",
    departmentId: deptId, mustChangePassword: false, track: "ADMIN",
  } satisfies AuthUser;
}

beforeAll(async () => { await migrateTestDb(); });
beforeEach(async () => {
  await truncateAll();
  state.currentUser = null;
  [{ id: deptId }] = await db.insert(departments).values({ name: "가팀", code: "A" }).returning({ id: departments.id });
  [{ id: userId }] = await db.insert(users).values({
    employeeNo: "emp", name: "직원", email: "emp@x.local", passwordHash: "h",
    departmentId: deptId, role: "EMPLOYEE", status: "ACTIVE", mustChangePassword: false,
  }).returning({ id: users.id });
});

describe("tags/in-use route", () => {
  it("U1: 보관된 문제에만 붙은 태그는 빠진다", async () => {
    // lib/db/tags.test.ts:74 와 같은 상황을 HTTP 로 한 번 더 본다 — DAO 는 맞는데 라우트가
    // findAllTags 를 부르는 실수를 잡는 것이 목적이다(U4 와 짝).
    const archived = await seedProblem({ status: "ARCHIVED", sourceNumber: 2 });
    const [t] = await db.insert(tags).values({ name: "죽은태그" }).returning({ id: tags.id });
    await db.insert(problemTags).values({ problemId: archived, tagId: t.id });
    asEmployee();
    const { GET } = await import("./route");
    const body = await (await GET()).json();
    expect(body.data).toEqual([]);
  });

  it("U2: 이름 오름차순이고 중복이 없다", async () => {
    // 한 태그("가")를 활성 문제 두 개에 붙여 DISTINCT 가 실제로 필요한 상황을 만든다.
    const p1 = await seedProblem({ sourceNumber: 1 });
    const p2 = await seedProblem({ sourceNumber: 2 });
    const inserted = await db.insert(tags).values([{ name: "나" }, { name: "가" }])
      .returning({ id: tags.id, name: tags.name });
    const ga = inserted.find((r) => r.name === "가")!.id;
    const na = inserted.find((r) => r.name === "나")!.id;
    await db.insert(problemTags).values([
      { problemId: p1, tagId: ga }, { problemId: p2, tagId: ga }, { problemId: p1, tagId: na },
    ]);
    asEmployee();
    const { GET } = await import("./route");
    const body = await (await GET()).json();
    const names = body.data.map((t: { name: string }) => t.name);
    expect(names).toEqual(["가", "나"]);
    expect(new Set(names).size).toBe(names.length);
  });

  it("U3: 응답 필드는 id·name·createdAt 이다", async () => {
    const p1 = await seedProblem();
    const [t] = await db.insert(tags).values({ name: "태그" }).returning({ id: tags.id });
    await db.insert(problemTags).values({ problemId: p1, tagId: t.id });
    asEmployee();
    const { GET } = await import("./route");
    const body = await (await GET()).json();
    expect(Object.keys(body.data[0]).sort()).toEqual(["createdAt", "id", "name"]);
  });

  it("U4: /api/tags 와 /api/tags/in-use 가 다른 결과를 낸다 — 같은 DAO 재사용 실수를 잡는 판별자", async () => {
    const p1 = await seedProblem();
    const [used] = await db.insert(tags).values({ name: "쓰임" }).returning({ id: tags.id });
    await db.insert(tags).values({ name: "안쓰임" }); // 어떤 문제에도 안 붙는다
    await db.insert(problemTags).values({ problemId: p1, tagId: used.id });
    asEmployee();
    const { GET: allGET } = await import("../route");
    const { GET: inUseGET } = await import("./route");
    const allBody = await (await allGET()).json();
    const inUseBody = await (await inUseGET()).json();
    expect(allBody.data.length).toBe(2);
    expect(inUseBody.data.length).toBe(1);
    expect(allBody.data.length).toBeGreaterThan(inUseBody.data.length);
  });

  it("E1/U5: EMPLOYEE 도 접근할 수 있다(역할 제한 없음)", async () => {
    asEmployee();
    const { GET } = await import("./route");
    const res = await GET();
    expect(res.status).toBe(200);
  });

  it("세션이 없으면 980 이다", async () => {
    const { GET } = await import("./route");
    const res = await GET();
    expect((await res.json()).resultCode).toBe(980);
  });
});
