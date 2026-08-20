import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import { migrateTestDb, testDb, truncateAll } from "../../../../../test/db";
import { departments, problems, users } from "../../../../../lib/db/schema";
import type { AuthUser } from "../../../../../lib/auth/types";

const state = vi.hoisted(() => ({ currentUser: null as unknown }));
vi.mock("../../../../../lib/db/client", async () => {
  const { testDb } = await import("../../../../../test/db");
  const actual = await vi.importActual<object>("../../../../../lib/db/client");
  return { ...actual, getDb: () => testDb() };
});
vi.mock("../../../../../lib/auth/session", () => ({ getAuthUser: async () => state.currentUser }));

const db = testDb();
let deptId = 0;

const oxBody = (sourceNumber: number) => ({
  type: "OX", content: "본문", sourceNumber,
  choices: [{ text: "O", correct: true }, { text: "X", correct: false }],
});

async function seedAdmin(role: AuthUser["role"] = "SUPER_ADMIN") {
  const [d] = await db.insert(departments).values({ name: "가팀", code: "A" }).returning();
  deptId = d.id;
  const [u] = await db.insert(users).values({
    employeeNo: "admin", name: "총괄", email: "admin@x.local", passwordHash: "h", departmentId: d.id, role,
  }).returning();
  state.currentUser = { userId: u.id, employeeNo: "admin", name: "총괄", role, departmentId: d.id, mustChangePassword: false } satisfies AuthUser;
}

function postRequest(body: unknown, query = ""): Request {
  return new Request(`http://localhost/api/admin/problems${query}`, {
    method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" },
  });
}

beforeAll(async () => { await migrateTestDb(); });
beforeEach(async () => { await truncateAll(db); state.currentUser = null; });

describe("problem routes", () => {
  it("POST creates a problem and returns bare ok", async () => {
    await seedAdmin();
    const { POST } = await import("../route");
    const res = await POST(postRequest(oxBody(1), `?departmentId=${deptId}`));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ resultCode: 200, resultMsg: "정상 처리되었습니다." });
    const [row] = await db.select().from(problems);
    expect(row.sourceNumber).toBe(1);
    expect(row.departmentId).toBe(deptId);
  });

  it("rejects an employee with 403/990", async () => {
    await seedAdmin("EMPLOYEE");
    const { POST } = await import("../route");
    const res = await POST(postRequest(oxBody(1), `?departmentId=${deptId}`));
    expect(res.status).toBe(403);
    expect((await res.json()).resultCode).toBe(990);
  });

  it("rejects a missing session with 401/980", async () => {
    const { POST } = await import("../route");
    const res = await POST(postRequest(oxBody(1)));
    expect(res.status).toBe(401);
    expect((await res.json()).resultCode).toBe(980);
  });

  it("surfaces a validation failure as 400/1000 with the Korean message", async () => {
    await seedAdmin();
    const { POST } = await import("../route");
    const res = await POST(postRequest({ ...oxBody(1), content: "   " }, `?departmentId=${deptId}`));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ resultCode: 1000, resultMsg: "문제 내용을 입력하세요." });
  });

  it("maps a malformed departmentId param to 1000", async () => {
    await seedAdmin();
    const { POST } = await import("../route");
    const res = await POST(postRequest(oxBody(1), "?departmentId=abc"));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ resultCode: 1000, resultMsg: "요청 값의 형식이 올바르지 않습니다: departmentId" });
  });

  it("GET returns the detail with the correct flag named `correct`", async () => {
    await seedAdmin();
    const { POST } = await import("../route");
    await POST(postRequest(oxBody(1), `?departmentId=${deptId}`));
    const [row] = await db.select().from(problems);
    const { GET } = await import("./route");
    const body = await (await GET(new Request("http://localhost"), { params: Promise.resolve({ id: String(row.id) }) })).json();
    expect(body.resultCode).toBe(200);
    expect(body.data.choices.map((c: { choiceText: string; correct: boolean }) => [c.choiceText, c.correct]))
      .toEqual([["O", true], ["X", false]]);
  });

  it("GET rejects an employee with 403/990", async () => {
    await seedAdmin("EMPLOYEE");
    const { GET } = await import("./route");
    const res = await GET(new Request("http://localhost"), { params: Promise.resolve({ id: "1" }) });
    expect(res.status).toBe(403);
    expect((await res.json()).resultCode).toBe(990);
  });

  it("PUT rejects an employee with 403/990", async () => {
    await seedAdmin("EMPLOYEE");
    const { PUT } = await import("./route");
    const res = await PUT(
      new Request("http://localhost", { method: "PUT", body: JSON.stringify(oxBody(1)), headers: { "content-type": "application/json" } }),
      { params: Promise.resolve({ id: "1" }) },
    );
    expect(res.status).toBe(403);
    expect((await res.json()).resultCode).toBe(990);
  });

  it("DELETE rejects an employee with 403/990", async () => {
    await seedAdmin("EMPLOYEE");
    const { DELETE } = await import("./route");
    const res = await DELETE(new Request("http://localhost", { method: "DELETE" }), { params: Promise.resolve({ id: "1" }) });
    expect(res.status).toBe(403);
    expect((await res.json()).resultCode).toBe(990);
  });

  it("PUT updates and DELETE archives", async () => {
    await seedAdmin();
    const { POST } = await import("../route");
    await POST(postRequest(oxBody(1), `?departmentId=${deptId}`));
    const [row] = await db.select().from(problems);
    const { PUT, DELETE } = await import("./route");
    const putRes = await PUT(
      new Request("http://localhost", { method: "PUT", body: JSON.stringify({ ...oxBody(2), content: "고친 본문" }), headers: { "content-type": "application/json" } }),
      { params: Promise.resolve({ id: String(row.id) }) },
    );
    expect((await putRes.json()).resultCode).toBe(200);
    const delRes = await DELETE(new Request("http://localhost", { method: "DELETE" }), { params: Promise.resolve({ id: String(row.id) }) });
    expect((await delRes.json()).resultCode).toBe(200);
    const [after] = await db.select().from(problems);
    expect([after.content, after.sourceNumber, after.status]).toEqual(["고친 본문", 2, "ARCHIVED"]);
  });
});
