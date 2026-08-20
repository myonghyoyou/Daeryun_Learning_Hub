// vitest 는 .env 를 자동으로 읽지 않는다(Next 런타임만 자동 로드한다) — problemImage.test.ts 와
// 같은 이유로 여기서도 명시해야 한다(scripts/bootstrap.ts 주석 참고).
import "dotenv/config";
import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import { migrateTestDb, testDb, truncateAll } from "../../../../../test/db";
import { auditLogs, departments, users } from "../../../../../lib/db/schema";
import type { AuthUser } from "../../../../../lib/auth/types";

const storageState = vi.hoisted(() => ({ uploads: [] as string[] }));
vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    storage: {
      from: () => ({
        upload: async (path: string) => { storageState.uploads.push(path); return { data: { path }, error: null }; },
        remove: async () => ({ data: null, error: null }),
      }),
    },
  }),
}));

const state = vi.hoisted(() => ({ currentUser: null as unknown }));
vi.mock("../../../../../lib/db/client", async () => {
  const { testDb } = await import("../../../../../test/db");
  const actual = await vi.importActual<object>("../../../../../lib/db/client");
  return { ...actual, getDb: () => testDb() };
});
vi.mock("../../../../../lib/auth/session", () => ({ getAuthUser: async () => state.currentUser }));

const db = testDb();
let deptA = 0;

function post(form: FormData): Request {
  return new Request("http://localhost/api/admin/problems/images", { method: "POST", body: form });
}

function pngFile(name = "photo.png"): File {
  return new File([new Uint8Array([1, 2, 3])], name, { type: "image/png" });
}

async function loginAs(role: AuthUser["role"], departmentId: number, employeeNo: string): Promise<AuthUser> {
  const [u] = await db.insert(users).values({
    employeeNo, name: employeeNo, email: `${employeeNo}@x.local`, passwordHash: "h", departmentId, role,
  }).returning();
  const actor: AuthUser = { userId: u.id, employeeNo, name: employeeNo, role, departmentId, mustChangePassword: false };
  state.currentUser = actor;
  return actor;
}

beforeAll(async () => { await migrateTestDb(); });
beforeEach(async () => {
  await truncateAll(db);
  state.currentUser = null;
  storageState.uploads = [];
  [{ id: deptA }] = await db.insert(departments).values({ name: "가팀", code: "A" }).returning({ id: departments.id });
});

describe("POST /api/admin/problems/images", () => {
  it("총괄 관리자가 올리면 imageUrl 을 돌려준다(R1)", async () => {
    await loginAs("SUPER_ADMIN", deptA, "admin");
    const form = new FormData();
    form.set("file", pngFile());
    const { POST } = await import("./route");
    const res = await POST(post(form));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.resultCode).toBe(200);
    expect(body.data.imageUrl).toMatch(/^\/api\/problem-images\/[0-9a-f-]{36}\.png$/);
  });

  it("부서 관리자도 올릴 수 있다(R1) — ProblemController.uploadImage 는 클래스 레벨 역할을 물려받는다", async () => {
    // 이웃 라우트(계정 엑셀 업로드)를 구조만 베끼고 역할까지 베끼면 SUPER_ADMIN 전용으로 좁아진다.
    // uploadImage 에는 메서드 레벨 @RequireRole 이 없다(ProblemController.java:84-88) — 클래스
    // 레벨 {SUPER_ADMIN, DEPT_ADMIN} 그대로다. 부서 이동(changeDepartment)만 SUPER_ADMIN 전용이다.
    await loginAs("DEPT_ADMIN", deptA, "dept1");
    const form = new FormData();
    form.set("file", pngFile());
    const { POST } = await import("./route");
    const res = await POST(post(form));
    expect(res.status).toBe(200);
    expect((await res.json()).resultCode).toBe(200);
  });

  it("직원 역할은 403/990 이다(R4)", async () => {
    await loginAs("EMPLOYEE", deptA, "emp1");
    const form = new FormData();
    form.set("file", pngFile());
    const { POST } = await import("./route");
    const res = await POST(post(form));
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ resultCode: 990, resultMsg: "접근 권한이 없습니다." });
  });

  it("로그인하지 않으면 401/980 이다", async () => {
    const { POST } = await import("./route");
    const res = await POST(post(new FormData()));
    expect(res.status).toBe(401);
    expect((await res.json()).resultCode).toBe(980);
  });

  it("file 필드가 없으면 HTTP 200 + 1009, 기본 문구다(파싱은 성공했지만 항목이 비었다)", async () => {
    await loginAs("SUPER_ADMIN", deptA, "admin");
    const { POST } = await import("./route");
    const res = await POST(post(new FormData()));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ resultCode: 1009, resultMsg: "필수 파일이 누락되었습니다." });
  });

  it("빈 파일도 1009 다", async () => {
    await loginAs("SUPER_ADMIN", deptA, "admin");
    const form = new FormData();
    form.set("file", new File([], "empty.png", { type: "image/png" }));
    const { POST } = await import("./route");
    expect((await (await POST(post(form))).json())).toEqual({ resultCode: 1009, resultMsg: "필수 파일이 누락되었습니다." });
  });

  it("5MB 를 넘으면 400/1015 다(I4)", async () => {
    await loginAs("SUPER_ADMIN", deptA, "admin");
    const form = new FormData();
    form.set("file", new File([new Uint8Array(5 * 1024 * 1024 + 1)], "big.png", { type: "image/png" }));
    const { POST } = await import("./route");
    const res = await POST(post(form));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ resultCode: 1015, resultMsg: "이미지 크기는 5MB를 초과할 수 없습니다." });
  });

  it("허용되지 않는 형식은 400/1014 다(I5)", async () => {
    await loginAs("SUPER_ADMIN", deptA, "admin");
    const form = new FormData();
    form.set("file", new File([new Uint8Array([1])], "x.svg", { type: "image/svg+xml" }));
    const { POST } = await import("./route");
    const res = await POST(post(form));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      resultCode: 1014,
      resultMsg: "허용되지 않는 파일 형식입니다. png, jpg, jpeg, gif, webp 이미지만 업로드할 수 있습니다.",
    });
  });

  it("성공 시 감사 로그를 남긴다(A7/I9)", async () => {
    const actor = await loginAs("SUPER_ADMIN", deptA, "admin");
    const form = new FormData();
    form.set("file", pngFile());
    const { POST } = await import("./route");
    const res = await POST(post(form));
    const body = await res.json();
    const storedName = (body.data.imageUrl as string).split("/").pop();
    const [log] = await db.select().from(auditLogs);
    expect(log).toMatchObject({
      actorId: actor.userId, action: "PROBLEM_IMAGE_UPLOADED", targetType: "PROBLEM_IMAGE", targetId: null,
      detail: { fileName: storedName },
    });
  });
});
