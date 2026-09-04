import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import * as XLSX from "xlsx";
import { migrateTestDb, testDb, truncateAll } from "../../../../../test/db";
import { departments, users } from "../../../../../lib/db/schema";
import type { AuthUser } from "../../../../../lib/auth/types";

const state = vi.hoisted(() => ({ currentUser: null as unknown }));
vi.mock("../../../../../lib/db/client", async () => {
  const { testDb } = await import("../../../../../test/db");
  const actual = await vi.importActual<object>("../../../../../lib/db/client");
  return { ...actual, getDb: () => testDb() };
});
vi.mock("../../../../../lib/auth/session", () => ({ getAuthUser: async () => state.currentUser }));

const db = testDb();
async function seedAdmin() {
  const [d] = await db.insert(departments).values({ name: "본사", code: "HQ" }).returning();
  const [u] = await db.insert(users).values({ employeeNo: "admin", name: "총괄", email: "admin@x.local", passwordHash: "h", departmentId: d.id, role: "SUPER_ADMIN" }).returning();
  state.currentUser = { userId: u.id, employeeNo: "admin", name: "총괄", role: "SUPER_ADMIN", departmentId: d.id, mustChangePassword: false, track: "ADMIN" } satisfies AuthUser;
}
function xlsxFile(): File {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["사번", "이름", "이메일", "부서코드", "역할"], ["r1", "가", "r1@x.local", "HQ", "EMPLOYEE"]]));
  const buf = XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
  return new File([buf], "ok.xlsx", { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}
function post(form: FormData): Request {
  return new Request("http://localhost/api/admin/users/excel-upload", { method: "POST", body: form });
}
beforeAll(async () => { await migrateTestDb(); });
beforeEach(async () => { await truncateAll(); state.currentUser = null; });

describe("excel-upload route", () => {
  it("uploads and returns D7 successAccounts", async () => {
    await seedAdmin();
    const form = new FormData();
    form.set("file", xlsxFile());
    const { POST } = await import("./route");
    const body = await (await POST(post(form))).json();
    expect(body.resultCode).toBe(200);
    expect(body.data.successAccounts[0].employeeNo).toBe("r1");
  });
  it("returns HTTP 200 + 1009 when the file field is missing", async () => {
    await seedAdmin();
    const { POST } = await import("./route");
    const res = await POST(post(new FormData()));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ resultCode: 1009, resultMsg: "파일을 업로드할 수 없습니다." });
  });
  it("returns 403/990 for a DEPT_ADMIN with no file (role gate precedes the file-absent branch)", async () => {
    const [d] = await db.insert(departments).values({ name: "본사", code: "HQ" }).returning();
    const [u] = await db.insert(users).values({ employeeNo: "dept1", name: "부서장", email: "dept1@x.local", passwordHash: "h", departmentId: d.id, role: "DEPT_ADMIN" }).returning();
    state.currentUser = { userId: u.id, employeeNo: "dept1", name: "부서장", role: "DEPT_ADMIN", departmentId: d.id, mustChangePassword: false, track: "ADMIN" } satisfies AuthUser;
    const { POST } = await import("./route");
    const res = await POST(post(new FormData()));
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ resultCode: 990, resultMsg: "접근 권한이 없습니다." });
  });
  it("rejects a >4MB file with 400/1015", async () => {
    await seedAdmin();
    const form = new FormData();
    form.set("file", new File([new Uint8Array(4 * 1024 * 1024 + 1)], "big.xlsx"));
    const { POST } = await import("./route");
    const res = await POST(post(form));
    expect(res.status).toBe(400);
    expect((await res.json()).resultCode).toBe(1015);
  });
});
