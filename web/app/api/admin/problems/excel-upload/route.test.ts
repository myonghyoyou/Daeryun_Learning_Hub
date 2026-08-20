import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import * as XLSX from "xlsx";
import { migrateTestDb, testDb, truncateAll } from "../../../../../test/db";
import { departments, excelUploadLogs, problems, users } from "../../../../../lib/db/schema";
import type { AuthUser } from "../../../../../lib/auth/types";

const state = vi.hoisted(() => ({ currentUser: null as unknown }));
vi.mock("../../../../../lib/db/client", async () => {
  const { testDb } = await import("../../../../../test/db");
  const actual = await vi.importActual<object>("../../../../../lib/db/client");
  return { ...actual, getDb: () => testDb() };
});
vi.mock("../../../../../lib/auth/session", () => ({ getAuthUser: async () => state.currentUser }));

const HEADER = [
  "문제유형", "문제내용", "이미지", "참조지문", "보기1", "보기2", "보기3", "보기4", "보기5",
  "정답", "해설", "태그", "문항번호",
];

const db = testDb();
let deptA = 0, deptB = 0;

function xlsxFile(rows: (string | number | null)[][], name = "problems.xlsx"): File {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([HEADER, ...rows]));
  const buf = XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
  return new File([buf], name, { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}

function post(form: FormData, query = ""): Request {
  return new Request(`http://localhost/api/admin/problems/excel-upload${query}`, { method: "POST", body: form });
}

async function seedDepartments() {
  [{ id: deptA }] = await db.insert(departments).values({ name: "가팀", code: "A" }).returning({ id: departments.id });
  [{ id: deptB }] = await db.insert(departments).values({ name: "나팀", code: "B" }).returning({ id: departments.id });
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
beforeEach(async () => { await truncateAll(); state.currentUser = null; });

describe("POST /api/admin/problems/excel-upload", () => {
  it("총괄 관리자가 올리면 집계를 돌려준다", async () => {
    await seedDepartments();
    await loginAs("SUPER_ADMIN", deptA, "admin");
    const form = new FormData();
    form.set("file", xlsxFile([
      ["OX", "가", "", "", "O", "X", "", "", "", "1", "", "", 1],
      ["OX", "", "", "", "O", "X", "", "", "", "1", "", "", 2],
    ]));
    const { POST } = await import("./route");
    const res = await POST(post(form, `?departmentId=${deptA}`));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.resultCode).toBe(200);
    expect(body.data).toEqual({
      totalRows: 2, successRows: 1, failRows: 1, errorDetail: "행 3: 문제유형과 문제내용은 필수입니다.",
    });
  });

  it("부서 관리자도 일괄 등록할 수 있고, 요청한 부서가 아니라 본인 부서로 들어간다(R1·R5)", async () => {
    // 계정 엑셀 라우트는 SUPER_ADMIN 전용이지만 ProblemController.uploadExcel 은 클래스 레벨
    // {SUPER_ADMIN, DEPT_ADMIN} 를 그대로 물려받는다 — 여기서 좁히면 부서 관리자가 막힌다.
    await seedDepartments();
    const actor = await loginAs("DEPT_ADMIN", deptA, "dept1");
    const form = new FormData();
    form.set("file", xlsxFile([["OX", "가", "", "", "O", "X", "", "", "", "1", "", "", 1]]));
    const { POST } = await import("./route");
    const res = await POST(post(form, `?departmentId=${deptB}`));
    expect(res.status).toBe(200);
    expect((await res.json()).data).toMatchObject({ totalRows: 1, successRows: 1, failRows: 0 });
    const [saved] = await db.select().from(problems);
    expect(saved.departmentId).toBe(deptA);
    expect(saved.createdBy).toBe(actor.userId);
    const [log] = await db.select().from(excelUploadLogs);
    expect(log).toMatchObject({ targetType: "PROBLEM", departmentId: deptA });
  });

  it("직원 역할은 403/990 이다", async () => {
    await seedDepartments();
    await loginAs("EMPLOYEE", deptA, "emp1");
    const form = new FormData();
    form.set("file", xlsxFile([["OX", "가", "", "", "O", "X", "", "", "", "1", "", "", 1]]));
    const { POST } = await import("./route");
    const res = await POST(post(form, `?departmentId=${deptA}`));
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ resultCode: 990, resultMsg: "접근 권한이 없습니다." });
  });

  it("로그인하지 않으면 401/980 이다", async () => {
    const { POST } = await import("./route");
    const res = await POST(post(new FormData()));
    expect(res.status).toBe(401);
    expect((await res.json()).resultCode).toBe(980);
  });

  it("file 파트가 아예 없으면 HTTP 200 + 1009, 이탈 ⑥ 문구다(F1a)", async () => {
    await seedDepartments();
    await loginAs("SUPER_ADMIN", deptA, "admin");
    const { POST } = await import("./route");
    const res = await POST(post(new FormData()));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ resultCode: 1009, resultMsg: "파일을 업로드할 수 없습니다." });
  });

  it("0바이트 파일은 HTTP 400 + 1009, ErrorCode 기본 문구다(F1b, Java file.isEmpty() 실제 경로)", async () => {
    await seedDepartments();
    await loginAs("SUPER_ADMIN", deptA, "admin");
    const form = new FormData();
    form.set("file", new File([], "empty.xlsx"));
    const { POST } = await import("./route");
    const res = await POST(post(form));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ resultCode: 1009, resultMsg: "필수 파일이 누락되었습니다." });
  });

  it("4MB 를 넘으면 400/1015 다(F7·승인된 이탈 ③)", async () => {
    await seedDepartments();
    await loginAs("SUPER_ADMIN", deptA, "admin");
    const form = new FormData();
    form.set("file", new File([new Uint8Array(4 * 1024 * 1024 + 1)], "big.xlsx"));
    const { POST } = await import("./route");
    const res = await POST(post(form));
    expect(res.status).toBe(400);
    expect((await res.json()).resultCode).toBe(1015);
  });

  it("확장자가 아니면 400/1014 다(F2)", async () => {
    await seedDepartments();
    await loginAs("SUPER_ADMIN", deptA, "admin");
    const form = new FormData();
    form.set("file", xlsxFile([["OX", "가", "", "", "O", "X", "", "", "", "1", "", "", 1]], "problems.csv"));
    const { POST } = await import("./route");
    const res = await POST(post(form, `?departmentId=${deptA}`));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      resultCode: 1014, resultMsg: "xlsx 또는 xls 엑셀 파일만 업로드할 수 있습니다.",
    });
  });

  it("총괄 관리자가 부서를 지정하지 않으면 부서 선택 문구가 나온다(R8)", async () => {
    await seedDepartments();
    await loginAs("SUPER_ADMIN", deptA, "admin");
    const form = new FormData();
    form.set("file", xlsxFile([["OX", "가", "", "", "O", "X", "", "", "", "1", "", "", 1]]));
    const { POST } = await import("./route");
    const res = await POST(post(form));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ resultCode: 1000, resultMsg: "문제가 귀속될 부서를 선택하세요." });
  });

  it("departmentId 가 숫자가 아니면 형식 오류다", async () => {
    await seedDepartments();
    await loginAs("SUPER_ADMIN", deptA, "admin");
    const form = new FormData();
    form.set("file", xlsxFile([["OX", "가", "", "", "O", "X", "", "", "", "1", "", "", 1]]));
    const { POST } = await import("./route");
    const res = await POST(post(form, "?departmentId=abc"));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      resultCode: 1000, resultMsg: "요청 값의 형식이 올바르지 않습니다: departmentId",
    });
  });
});
