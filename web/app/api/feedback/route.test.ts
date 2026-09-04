import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import { migrateTestDb, testDb, truncateAll } from "../../../test/db";
import { departments, users } from "../../../lib/db/schema";
import type { AuthUser } from "../../../lib/auth/types";
import { BizError } from "../../../lib/http/errors";
import { ErrorCode } from "../../../lib/http/errorCode";

const state = vi.hoisted(() => ({ currentUser: null as unknown }));
vi.mock("../../../lib/db/client", async () => {
  const { testDb } = await import("../../../test/db");
  const actual = await vi.importActual<object>("../../../lib/db/client");
  return { ...actual, getDb: () => testDb() };
});
vi.mock("../../../lib/auth/session", () => ({ getAuthUser: async () => state.currentUser }));

const service = vi.hoisted(() => ({ submit: vi.fn() }));
vi.mock("../../../lib/feedback/feedbackService", () => ({ submitFeedback: service.submit }));

const db = testDb();
let deptA = 0;

async function seedActor(role: AuthUser["role"], departmentId: number): Promise<AuthUser> {
  const [u] = await db.insert(users).values({
    employeeNo: `u-${role}-${departmentId}`, name: role, email: `${role}@x.local`, passwordHash: "h",
    departmentId, role,
  }).returning();
  return { userId: u.id, employeeNo: u.employeeNo, name: role, role, departmentId, mustChangePassword: false };
}

function postRequest(body: unknown): Request {
  return new Request("http://localhost/api/feedback", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
  });
}

beforeAll(async () => { await migrateTestDb(); });
beforeEach(async () => {
  await truncateAll();
  state.currentUser = null;
  service.submit.mockReset();
  [{ id: deptA }] = await db.insert(departments).values({ name: "가팀", code: "A" }).returning({ id: departments.id });
});

describe("POST /api/feedback", () => {
  it("로그인만 요구하고 역할은 보지 않는다", async () => {
    state.currentUser = await seedActor("EMPLOYEE", deptA);
    service.submit.mockResolvedValue({ ok: true, message: "보냈습니다. 고맙습니다." });
    const { POST } = await import("./route");
    const res = await POST(postRequest({ body: "의견" }));
    expect(res.status).toBe(200);
    expect((await res.json()).data.ok).toBe(true);
  });

  it("로그인하지 않으면 401/980 이다", async () => {
    state.currentUser = null;
    const { POST } = await import("./route");
    const res = await POST(postRequest({ body: "의견" }));
    expect(res.status).toBe(401);
    expect((await res.json()).resultCode).toBe(980);
  });

  it("빈 글은 400/1000 이고 문구가 그대로 나간다", async () => {
    state.currentUser = await seedActor("EMPLOYEE", deptA);
    service.submit.mockRejectedValue(
      new BizError(ErrorCode.INPUT_VALUE_INVALID, "내용을 적어주세요."),
    );
    const { POST } = await import("./route");
    const res = await POST(postRequest({ body: "   " }));
    expect(res.status).toBe(400);
    const payload = await res.json();
    expect(payload.resultCode).toBe(1000);
    expect(payload.resultMsg).toBe("내용을 적어주세요.");
  });

  it("problemId 와 sourcePath 를 서비스로 넘긴다", async () => {
    state.currentUser = await seedActor("EMPLOYEE", deptA);
    service.submit.mockResolvedValue({ ok: true, message: "" });
    const { POST } = await import("./route");
    await POST(postRequest({ body: "의견", problemId: 12, sourcePath: "/solve/random/play" }));
    expect(service.submit.mock.calls[0][2]).toMatchObject({
      body: "의견", problemId: 12, sourcePath: "/solve/random/play",
    });
  });

  /** 숫자가 아닌 problemId 가 그대로 흘러가면 DB 조회에서 터진다. */
  it("problemId 가 숫자가 아니면 넘기지 않는다", async () => {
    state.currentUser = await seedActor("EMPLOYEE", deptA);
    service.submit.mockResolvedValue({ ok: true, message: "" });
    const { POST } = await import("./route");
    await POST(postRequest({ body: "의견", problemId: "12" }));
    expect(service.submit.mock.calls[0][2].problemId).toBeUndefined();
  });

  it("본문이 JSON 이 아니어도 서비스까지 도달한다 — 빈 객체로 읽는다", async () => {
    state.currentUser = await seedActor("EMPLOYEE", deptA);
    service.submit.mockResolvedValue({ ok: false, message: "x" });
    const { POST } = await import("./route");
    const bad = new Request("http://localhost/api/feedback", { method: "POST", body: "not-json" });
    const res = await POST(bad);
    expect(res.status).toBe(200);
    expect(service.submit.mock.calls[0][2].body).toBeUndefined();
  });
});
