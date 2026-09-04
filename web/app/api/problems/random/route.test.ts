import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import { migrateTestDb, testDb, truncateAll } from "../../../../test/db";
import { departments, problems, users } from "../../../../lib/db/schema";
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

function req(path: string): Request {
  return new Request("http://localhost" + path);
}

async function seedEmployee(count = 5) {
  const [d] = await db.insert(departments).values({ name: "가팀", code: "A" }).returning();
  deptId = d.id;
  const [u] = await db.insert(users).values({
    employeeNo: "emp01", name: "직원", email: "emp@x.local", passwordHash: "h", departmentId: d.id, role: "EMPLOYEE",
  }).returning();
  state.currentUser = {
    userId: u.id, employeeNo: "emp01", name: "직원", role: "EMPLOYEE", departmentId: d.id, mustChangePassword: false, track: "ADMIN",
  } satisfies AuthUser;
  for (let i = 0; i < count; i += 1) {
    await db.insert(problems).values({
      type: "OX", content: `문제${i}`, departmentId: d.id, status: "ACTIVE", createdBy: u.id,
    });
  }
}

beforeAll(async () => { await migrateTestDb(); });
beforeEach(async () => { await truncateAll(); state.currentUser = null; });

describe("GET /api/problems/random", () => {
  it("E1: 역할 제한이 없다 — EMPLOYEE 도 통과한다", async () => {
    await seedEmployee();
    const { GET } = await import("./route");
    expect((await GET(req("/api/problems/random?count=1"))).status).toBe(200);
  });

  it("㉮: count 가 없으면 400/1000 이다(승인된 이탈)", async () => {
    await seedEmployee();
    const { GET } = await import("./route");
    const res = await GET(req("/api/problems/random"));
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ resultCode: 1000, resultMsg: "잘못된 파라미터를 입력했습니다." });
  });

  it("P9: count 가 빈 문자열이면 다른 문구다 — 400/1000/파라미터 이름", async () => {
    await seedEmployee();
    const { GET } = await import("./route");
    const res = await GET(req("/api/problems/random?count="));
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ resultCode: 1000, resultMsg: "요청 값의 형식이 올바르지 않습니다: count" });
  });

  it("P2: count=abc 는 400/1000/파라미터 이름", async () => {
    await seedEmployee();
    const { GET } = await import("./route");
    const res = await GET(req("/api/problems/random?count=abc"));
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ resultCode: 1000, resultMsg: "요청 값의 형식이 올바르지 않습니다: count" });
  });

  it("P10: count=1.5 는 400/1000/파라미터 이름", async () => {
    await seedEmployee();
    const { GET } = await import("./route");
    const res = await GET(req("/api/problems/random?count=1.5"));
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ resultCode: 1000, resultMsg: "요청 값의 형식이 올바르지 않습니다: count" });
  });

  it("P3/P4: 범위를 벗어나면 문제 수 문구다", async () => {
    await seedEmployee();
    const { GET } = await import("./route");
    for (const c of [0, -1, 51]) {
      const res = await GET(req(`/api/problems/random?count=${c}`));
      expect(res.status).toBe(400);
      expect(await res.json()).toMatchObject({ resultMsg: "문제 수는 1 이상 50 이하여야 합니다." });
    }
  });

  it("P5: 1 과 50 은 통과한다(경계 포함)", async () => {
    await seedEmployee(60);
    const { GET } = await import("./route");
    for (const c of [1, 50]) {
      expect((await GET(req(`/api/problems/random?count=${c}`))).status).toBe(200);
    }
  });

  it("P6: 조건에 맞는 문제가 count 보다 적어도 오류가 아니다", async () => {
    await seedEmployee(2);
    const { GET } = await import("./route");
    const res = await GET(req("/api/problems/random?count=10"));
    expect(res.status).toBe(200);
    expect((await res.json()).data.length).toBe(2);
  });

  it("P11: departmentId 가 빈 문자열이면 필터 미적용", async () => {
    await seedEmployee(3);
    const { GET } = await import("./route");
    const res = await GET(req("/api/problems/random?count=3&departmentId="));
    expect(res.status).toBe(200);
    expect((await res.json()).data.length).toBe(3);
  });

  it("P11: departmentId 가 없는 부서면 0건이지 오류가 아니다", async () => {
    await seedEmployee(3);
    const { GET } = await import("./route");
    const res = await GET(req("/api/problems/random?count=3&departmentId=99999"));
    expect(res.status).toBe(200);
    expect((await res.json()).data.length).toBe(0);
  });

  it("P11: departmentId=abc 는 400/1000/파라미터 이름", async () => {
    await seedEmployee(3);
    const { GET } = await import("./route");
    const res = await GET(req("/api/problems/random?count=3&departmentId=abc"));
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ resultMsg: "요청 값의 형식이 올바르지 않습니다: departmentId" });
  });

  it("random 이 [id] 로 새지 않는다", async () => {
    // 새면 "존재하지 않거나 보관된 문제입니다." 라는 그럴듯한 오답이 나온다(경로 주의).
    await seedEmployee(1);
    const { GET } = await import("./route");
    const res = await GET(req("/api/problems/random?count=1"));
    expect(await res.json()).not.toMatchObject({ resultMsg: "존재하지 않거나 보관된 문제입니다." });
  });

  it("비로그인은 401/980", async () => {
    const { GET } = await import("./route");
    const res = await GET(req("/api/problems/random?count=1"));
    expect(res.status).toBe(401);
    expect((await res.json()).resultCode).toBe(980);
  });
});
