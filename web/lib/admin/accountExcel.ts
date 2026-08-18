import * as XLSX from "xlsx";
import bcrypt from "bcryptjs";
import type { Db } from "../db/client";
import { existsByEmail, existsByEmployeeNo, insertUser } from "../db/users";
import { findDepartmentByCode } from "../db/departments";
import { recordAudit } from "../audit/auditLog";
import { generateTempPassword } from "./userAdminService";
import { excelUploadLogs } from "../db/schema";
import { BizError } from "../http/errors";
import { ErrorCode } from "../http/errorCode";

const HEADER_ROW_COUNT = 1;
const MAX_DATA_ROWS = 500;
const UNREADABLE = "엑셀 파일을 읽을 수 없습니다. 손상되었거나 암호가 설정된 파일인지 확인한 뒤 다시 올려 주세요.";
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ROLES: readonly string[] = ["SUPER_ADMIN", "DEPT_ADMIN", "EMPLOYEE"];

interface RowOutcome { rowNumber: number; success: boolean; reason: string | null; account?: { employeeNo: string; name: string; email: string; temporaryPassword: string } }

export async function uploadAccountsExcel(db: Db, file: { buffer: ArrayBuffer; fileName: string }, actorId: number) {
  let rows: string[][];
  try {
    const bytes = new Uint8Array(file.buffer);
    // SheetJS 는 비엑셀 텍스트도 CSV 로 관대하게 파싱해 예외를 던지지 않으므로, 서명으로 먼저
    // 걸러낸다. POI(WorkbookFactory)와의 파리티를 위해 xlsx(zip, "PK") 와 레거시 xls(OLE2/CFB,
    // D0 CF 11 E0 A1 B1 1A E1) 두 서명을 모두 허용한다 — 손상된 파일은 아래 XLSX.read 의 catch 로 떨어진다.
    const isZip = bytes.length >= 2 && bytes[0] === 0x50 && bytes[1] === 0x4b;
    const OLE2_SIGNATURE = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];
    const isOle2 = bytes.length >= 8 && OLE2_SIGNATURE.every((b, i) => bytes[i] === b);
    if (!isZip && !isOle2) {
      throw new BizError(ErrorCode.FILE_UNREADABLE, UNREADABLE);
    }
    const workbook = XLSX.read(bytes, { type: "array" });
    if (workbook.SheetNames.length === 0) {
      throw new BizError(ErrorCode.FILE_UNREADABLE, "엑셀 파일에 시트가 없습니다. 첫 번째 시트에 계정 목록을 담아 다시 올려 주세요.");
    }
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    // raw:false = POI DataFormatter 대응(표시 문자열), blankrows:false = 빈 행 스킵(POI null row 대응)
    rows = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1, raw: false, defval: "", blankrows: false });
  } catch (error) {
    if (error instanceof BizError) throw error;
    throw new BizError(ErrorCode.FILE_UNREADABLE, UNREADABLE);
  }

  const dataRows = rows.slice(HEADER_ROW_COUNT);
  if (dataRows.length > MAX_DATA_ROWS) {
    throw new BizError(ErrorCode.INPUT_VALUE_INVALID, `한 번에 업로드할 수 있는 데이터 행은 최대 ${MAX_DATA_ROWS}건입니다. 파일을 나눠 업로드하세요.`);
  }

  const outcomes: RowOutcome[] = [];
  const seenEmployeeNos = new Set<string>();
  const seenEmails = new Set<string>();

  for (let i = 0; i < dataRows.length; i++) {
    const rowNumber = i + HEADER_ROW_COUNT + 1; // 엑셀 표기 행 번호(헤더=1행)
    outcomes.push(await processRow(db, dataRows[i], rowNumber, seenEmployeeNos, seenEmails, actorId));
  }

  const successes = outcomes.filter((o) => o.success);
  const failures = outcomes.filter((o) => !o.success);
  const errorDetail = failures.length === 0 ? null : failures.map((f) => `행 ${f.rowNumber}: ${f.reason}`).join("\n");

  // 업로드 로그 + 그 감사 = 한 트랜잭션(행별 커밋과 독립 — Spring 경계 미러)
  await db.transaction(async (tx) => {
    const [log] = await tx.insert(excelUploadLogs).values({
      uploadedBy: actorId, departmentId: null, targetType: "ACCOUNT", fileName: file.fileName,
      totalRows: outcomes.length, successRows: successes.length, failRows: failures.length, errorDetail,
    }).returning();
    await recordAudit(tx, { actorId, action: "ACCOUNT_EXCEL_UPLOADED", targetType: "EXCEL_UPLOAD_LOG", targetId: log.id,
      detail: { fileName: file.fileName, totalRows: outcomes.length, successRows: successes.length, failRows: failures.length } });
  });

  return {
    totalRows: outcomes.length, successRows: successes.length, failRows: failures.length, errorDetail,
    successAccounts: successes.map((s) => ({ rowNumber: s.rowNumber, ...s.account! })), // D7
  };
}

async function processRow(db: Db, row: string[], rowNumber: number, seenEmployeeNos: Set<string>, seenEmails: Set<string>, actorId: number): Promise<RowOutcome> {
  const [employeeNo = "", name = "", email = "", departmentCode = "", roleText = ""] = row.map((c) => (c ?? "").trim());
  const fail = (reason: string): RowOutcome => ({ rowNumber, success: false, reason });

  if (!employeeNo || !name || !email || !departmentCode || !roleText) return fail("필수값이 누락되었습니다.");
  if (!EMAIL_PATTERN.test(email)) return fail("유효한 회사 이메일 형식이 아닙니다.");
  if (seenEmployeeNos.has(employeeNo) || await existsByEmployeeNo(db, employeeNo)) return fail("이미 존재하는 사번입니다: " + employeeNo);
  const normalizedEmail = email.toLowerCase();
  if (seenEmails.has(normalizedEmail) || await existsByEmail(db, email)) return fail("이미 사용 중인 회사 이메일입니다: " + email);
  const department = await findDepartmentByCode(db, departmentCode);
  if (!department) return fail("존재하지 않는 부서코드입니다: " + departmentCode);
  if (!ROLES.includes(roleText)) return fail("유효하지 않은 역할입니다: " + roleText);

  const temporaryPassword = generateTempPassword();
  const passwordHash = await bcrypt.hash(temporaryPassword, 10);
  try {
    // 행별 독립 트랜잭션(Spring REQUIRES_NEW 미러): 이 행의 실패는 이 행만 롤백한다.
    await db.transaction(async (tx) => {
      const user = await insertUser(tx, {
        employeeNo, name, email, passwordHash, departmentId: department.id,
        role: roleText, status: "ACTIVE", mustChangePassword: true,
      });
      await recordAudit(tx, { actorId, action: "USER_CREATED", targetType: "USER", targetId: user.id, detail: { employeeNo } });
    });
  } catch {
    // 임시 비밀번호는 절대 로그로 내보내지 않는다. (D6: 메일이 없으므로 문구에서 메일 언급 제거 — 이탈 기록됨)
    return fail("계정 저장에 실패했습니다.");
  }
  seenEmployeeNos.add(employeeNo);
  seenEmails.add(normalizedEmail);
  return { rowNumber, success: true, reason: null, account: { employeeNo, name, email, temporaryPassword } };
}
