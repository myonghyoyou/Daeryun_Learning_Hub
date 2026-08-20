import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import * as XLSX from "xlsx";
import { eq } from "drizzle-orm";
import { migrateTestDb, testDb, truncateAll } from "../../test/db";
import { auditLogs, departments, excelUploadLogs, users } from "../db/schema";
import { BizError } from "../http/errors";
import { uploadAccountsExcel } from "./accountExcel";

const db = testDb();
let actorId: number;
function sheetBuffer(rows: unknown[][]): ArrayBuffer {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["사번", "이름", "이메일", "부서코드", "역할"], ...rows]));
  const out = XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
  return out;
}
beforeAll(async () => { await migrateTestDb(); });
beforeEach(async () => {
  await truncateAll();
  const [hq] = await db.insert(departments).values({ name: "본사", code: "HQ" }).returning();
  const [admin] = await db.insert(users).values({ employeeNo: "admin", name: "총괄", email: "admin@x.local", passwordHash: "h", departmentId: hq.id, role: "SUPER_ADMIN" }).returning();
  actorId = admin.id;
});

describe("uploadAccountsExcel", () => {
  it("isolates rows: good rows commit even when a bad row is between them (D7 successAccounts)", async () => {
    const buffer = sheetBuffer([
      ["e1", "가", "e1@x.local", "HQ", "EMPLOYEE"],
      ["e2", "나", "broken-email", "HQ", "EMPLOYEE"],
      ["e3", "다", "e3@x.local", "HQ", "EMPLOYEE"],
    ]);
    const result = await uploadAccountsExcel(db, { buffer, fileName: "accounts.xlsx" }, actorId);
    expect(result.totalRows).toBe(3);
    expect(result.successRows).toBe(2);
    expect(result.failRows).toBe(1);
    expect(result.errorDetail).toBe("행 3: 유효한 회사 이메일 형식이 아닙니다.");
    expect(result.successAccounts.map((a) => a.employeeNo)).toEqual(["e1", "e3"]);
    expect(result.successAccounts[0].temporaryPassword).toHaveLength(10);
    expect((await db.select().from(users)).map((u) => u.employeeNo)).toEqual(expect.arrayContaining(["e1", "e3"]));
    const log = (await db.select().from(excelUploadLogs))[0];
    expect(log.targetType).toBe("ACCOUNT");
    expect(log.successRows).toBe(2);
    expect((await db.select().from(auditLogs)).filter((a) => a.action === "USER_CREATED")).toHaveLength(2);
    expect((await db.select().from(auditLogs)).filter((a) => a.action === "ACCOUNT_EXCEL_UPLOADED")).toHaveLength(1);
  });

  it("reports the exact per-row failure reasons", async () => {
    const buffer = sheetBuffer([
      ["", "가", "a@x.local", "HQ", "EMPLOYEE"],
      ["admin", "나", "b@x.local", "HQ", "EMPLOYEE"],
      ["e9", "다", "ADMIN@x.local", "HQ", "EMPLOYEE"],
      ["e8", "라", "d@x.local", "NOPE", "EMPLOYEE"],
      ["e7", "마", "e@x.local", "HQ", "WIZARD"],
    ]);
    const result = await uploadAccountsExcel(db, { buffer, fileName: "f.xlsx" }, actorId);
    expect(result.failRows).toBe(5);
    expect(result.errorDetail!.split("\n")).toEqual([
      "행 2: 필수값이 누락되었습니다.",
      "행 3: 이미 존재하는 사번입니다: admin",
      "행 4: 이미 사용 중인 회사 이메일입니다: ADMIN@x.local",
      "행 5: 존재하지 않는 부서코드입니다: NOPE",
      "행 6: 유효하지 않은 역할입니다: WIZARD",
    ]);
  });

  it("rejects over 500 data rows before processing any", async () => {
    const rows = Array.from({ length: 501 }, (_, i) => [`m${i}`, "x", `m${i}@x.local`, "HQ", "EMPLOYEE"]);
    await expect(uploadAccountsExcel(db, { buffer: sheetBuffer(rows), fileName: "big.xlsx" }, actorId)).rejects.toThrow(/최대 500건/);
    expect(await db.select().from(users)).toHaveLength(1); // admin 뿐 — 아무 행도 커밋 안 됨
  });

  it("rejects an unreadable file with 1013", async () => {
    const junk = new TextEncoder().encode("this is not xlsx").buffer as ArrayBuffer;
    const err = await uploadAccountsExcel(db, { buffer: junk, fileName: "junk.xlsx" }, actorId).then(() => null, (e) => e as BizError);
    expect(err).toBeInstanceOf(BizError);
    expect((err as BizError).errorCode.code).toBe(1013);
  });

  it("detects in-file duplicate employeeNo/email", async () => {
    const buffer = sheetBuffer([
      ["d1", "가", "dup@x.local", "HQ", "EMPLOYEE"],
      ["d1", "나", "n2@x.local", "HQ", "EMPLOYEE"],
      ["d3", "다", "DUP@x.local", "HQ", "EMPLOYEE"],
    ]);
    const result = await uploadAccountsExcel(db, { buffer, fileName: "dup.xlsx" }, actorId);
    expect(result.successRows).toBe(1);
    expect(result.errorDetail!.split("\n")).toEqual([
      "행 3: 이미 존재하는 사번입니다: d1",
      "행 4: 이미 사용 중인 회사 이메일입니다: DUP@x.local",
    ]);
  });

  it("reports a row-save failure when the DB insert itself fails (X14)", async () => {
    // employeeNo 는 엑셀 행 검증에 길이 제한이 없어(단건 생성과 달리) 그대로 insertUser 까지
    // 도달하고, users.employee_no varchar(50) 제약 위반으로 DB INSERT 가 실패한다 — catch 경로 실측.
    const overlong = "E".repeat(60);
    const buffer = sheetBuffer([[overlong, "가", "over@x.local", "HQ", "EMPLOYEE"]]);
    const result = await uploadAccountsExcel(db, { buffer, fileName: "toolong.xlsx" }, actorId);
    expect(result.failRows).toBe(1);
    expect(result.errorDetail).toBe("행 2: 계정 저장에 실패했습니다.");
    expect(await db.select().from(users)).toHaveLength(1); // admin 뿐 — 실패 행은 커밋 안 됨
  });

  it("accepts a legacy .xls (OLE2/CFB) file like POI's WorkbookFactory", async () => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["사번", "이름", "이메일", "부서코드", "역할"], ["x1", "가", "x1@x.local", "HQ", "EMPLOYEE"]]));
    const buffer = XLSX.write(wb, { type: "array", bookType: "xls" }) as ArrayBuffer;
    const result = await uploadAccountsExcel(db, { buffer, fileName: "legacy.xls" }, actorId);
    expect(result.successRows).toBe(1);
    expect(result.successAccounts.map((a) => a.employeeNo)).toEqual(["x1"]);
    expect((await db.select().from(users)).map((u) => u.employeeNo)).toEqual(expect.arrayContaining(["x1"]));
  });
});
