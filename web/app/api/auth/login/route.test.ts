import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import bcrypt from "bcryptjs";
import { migrateTestDb, testDb, truncateAll } from "../../../../test/db";
import { departments, users } from "../../../../lib/db/schema";

// vi.mock 은 파일 최상단으로 호이스팅된다. 팩토리가 최상위 const/import 를 직접 참조하면
// "Cannot access before initialization" 이 나므로, 스파이는 vi.hoisted 로 만들고
// 실제 모듈이 필요한 팩토리는 async + 동적 import 를 쓴다(vitest 문서의 안전 패턴).
const spies = vi.hoisted(() => ({ setSessionCookie: vi.fn(), clearSessionCookie: vi.fn() }));

// getDb 를 테스트 DB 로 대체
vi.mock("../../../../lib/db/client", async () => {
  const { testDb } = await import("../../../../test/db");
  return { getDb: () => testDb() };
});
// 쿠키 설정은 next/headers 를 쓰므로 스파이로 대체(라우트가 호출하는지만 확인)
vi.mock("../../../../lib/auth/session", () => ({
  setSessionCookie: spies.setSessionCookie,
  clearSessionCookie: spies.clearSessionCookie,
}));

const db = testDb();
async function seedUser() {
  const [dept] = await db.insert(departments).values({ name: "개발팀", code: "D" + Math.random() }).returning();
  await db.insert(users).values({
    employeeNo: "1001", name: "홍길동", email: "u" + Math.random() + "@x.local",
    passwordHash: await bcrypt.hash("password1", 10), departmentId: dept.id, role: "EMPLOYEE",
    mustChangePassword: false,
  });
}

beforeAll(async () => { await migrateTestDb(); process.env.SESSION_JWT_SECRET = "test-secret-at-least-32-bytes-long-000"; });
beforeEach(async () => { await truncateAll(); spies.setSessionCookie.mockClear(); spies.clearSessionCookie.mockClear(); });

function post(body: unknown): Request {
  return new Request("http://localhost/api/auth/login", { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } });
}

describe("POST /api/auth/login", () => {
  it("logs in and sets the session cookie", async () => {
    await seedUser();
    const { POST } = await import("./route");
    const res = await POST(post({ employeeNo: "1001", password: "password1" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ resultCode: 200, resultMsg: "정상 처리되었습니다.", data: { name: "홍길동", role: "EMPLOYEE", mustChangePassword: false } });
    expect(spies.setSessionCookie).toHaveBeenCalledOnce();
  });

  it("rejects a wrong password with 1011 and sets no cookie", async () => {
    await seedUser();
    const { POST } = await import("./route");
    const res = await POST(post({ employeeNo: "1001", password: "wrong" }));
    expect(res.status).toBe(400);
    expect((await res.json()).resultCode).toBe(1011);
    expect(spies.setSessionCookie).not.toHaveBeenCalled();
  });

  it("treats a missing body as blank credentials (1000)", async () => {
    const { POST } = await import("./route");
    const res = await POST(new Request("http://localhost/api/auth/login", { method: "POST" }));
    expect((await res.json()).resultCode).toBe(1000);
  });

  it("coerces a numeric employeeNo like Jackson would (logs in)", async () => {
    await seedUser();
    const { POST } = await import("./route");
    const res = await POST(post({ employeeNo: 1001, password: "password1" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ resultCode: 200, resultMsg: "정상 처리되었습니다.", data: { name: "홍길동", role: "EMPLOYEE", mustChangePassword: false } });
    expect(spies.setSessionCookie).toHaveBeenCalledOnce();
  });
});

describe("POST /api/auth/logout", () => {
  it("clears the session cookie and returns ok() with no data", async () => {
    const { POST } = await import("../logout/route");
    const res = await POST();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ resultCode: 200, resultMsg: "정상 처리되었습니다." });
    expect(spies.clearSessionCookie).toHaveBeenCalledOnce();
  });
});
