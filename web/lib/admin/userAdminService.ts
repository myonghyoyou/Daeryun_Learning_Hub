import { randomInt } from "node:crypto";
import bcrypt from "bcryptjs";
import type { Db } from "../db/client";
import { countActiveSuperAdminsExcluding, existsByEmail, existsByEmployeeNo, findUserById, insertUser, listUsers, updateUserAdminFields } from "../db/users";
import { findDepartmentById } from "../db/departments";
import { recordAudit } from "../audit/auditLog";
import { BizError } from "../http/errors";
import { ErrorCode } from "../http/errorCode";
import type { AuthUser, UserRole } from "../auth/types";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const TEMP_PASSWORD_CHARS = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
const TEMP_PASSWORD_LENGTH = 10;
const ROLES: readonly string[] = ["SUPER_ADMIN", "DEPT_ADMIN", "EMPLOYEE"];

export function generateTempPassword(): string {
  let out = "";
  for (let i = 0; i < TEMP_PASSWORD_LENGTH; i++) out += TEMP_PASSWORD_CHARS[randomInt(TEMP_PASSWORD_CHARS.length)];
  return out;
}

function validateEmployeeNo(v: string | undefined): asserts v is string {
  if (v == null || v.trim() === "") throw new BizError(ErrorCode.INPUT_VALUE_INVALID, "사번을 입력하세요.");
  if (v.length > 50) throw new BizError(ErrorCode.INPUT_VALUE_INVALID, "사번은 50자를 넘을 수 없습니다.");
}
function validateUserName(v: string | undefined): asserts v is string {
  if (v == null || v.trim() === "") throw new BizError(ErrorCode.INPUT_VALUE_INVALID, "이름을 입력하세요.");
  if (v.length > 100) throw new BizError(ErrorCode.INPUT_VALUE_INVALID, "이름은 100자를 넘을 수 없습니다.");
}
function validateEmail(v: string | undefined): asserts v is string {
  if (v == null || v.trim() === "" || !EMAIL_PATTERN.test(v.trim())) throw new BizError(ErrorCode.INPUT_VALUE_INVALID, "유효한 회사 이메일을 입력하세요.");
  if (v.length > 255) throw new BizError(ErrorCode.INPUT_VALUE_INVALID, "회사 이메일은 255자를 넘을 수 없습니다.");
}
function validateRoleValue(v: string | undefined): asserts v is UserRole {
  if (v == null || !ROLES.includes(v)) throw new BizError(ErrorCode.INPUT_VALUE_INVALID, "역할을 선택하세요.");
}

export async function listAccounts(db: Db, departmentId: number | null) {
  return listUsers(db, departmentId);
}

// D6: 메일 대신 임시 비밀번호를 응답으로 반환한다(승인 이탈). 감사·로그에는 절대 남기지 않는다.
export async function createAccount(db: Db, input: { employeeNo?: string; name?: string; email?: string; departmentId?: number; role?: string }, actorId: number) {
  validateEmployeeNo(input.employeeNo);
  validateUserName(input.name);
  validateEmail(input.email);
  validateRoleValue(input.role);
  if (await existsByEmployeeNo(db, input.employeeNo)) throw new BizError(ErrorCode.INPUT_VALUE_INVALID, "이미 존재하는 사번입니다: " + input.employeeNo);
  if (await existsByEmail(db, input.email)) throw new BizError(ErrorCode.INPUT_VALUE_INVALID, "이미 사용 중인 회사 이메일입니다: " + input.email);
  const department = input.departmentId == null ? undefined : await findDepartmentById(db, input.departmentId);
  if (!department) throw new BizError(ErrorCode.INPUT_VALUE_INVALID, "존재하지 않는 부서입니다.");

  const temporaryPassword = generateTempPassword();
  const passwordHash = await bcrypt.hash(temporaryPassword, 10);
  await db.transaction(async (tx) => {
    const user = await insertUser(tx, {
      employeeNo: input.employeeNo!, name: input.name!, email: input.email!,
      passwordHash, departmentId: department.id, role: input.role!, status: "ACTIVE", mustChangePassword: true,
    });
    await recordAudit(tx, { actorId, action: "USER_CREATED", targetType: "USER", targetId: user.id, detail: { employeeNo: user.employeeNo } });
  });
  return { employeeNo: input.employeeNo, name: input.name, email: input.email, temporaryPassword };
}

export async function updateAccount(db: Db, id: number, input: { name?: string; email?: string; departmentId?: number; role?: string; status?: string }, actor: AuthUser): Promise<void> {
  validateUserName(input.name);
  validateEmail(input.email);
  validateRoleValue(input.role);
  if (input.status == null) throw new BizError(ErrorCode.INPUT_VALUE_INVALID, "계정 상태를 선택하세요.");
  const user = await findUserById(db, id);
  if (!user) throw new BizError(ErrorCode.INPUT_VALUE_INVALID, "존재하지 않는 계정입니다.");
  const department = input.departmentId == null ? undefined : await findDepartmentById(db, input.departmentId);
  if (!department) throw new BizError(ErrorCode.INPUT_VALUE_INVALID, "존재하지 않는 부서입니다.");
  if (input.email.toLowerCase() !== user.email.toLowerCase() && await existsByEmail(db, input.email)) {
    throw new BizError(ErrorCode.INPUT_VALUE_INVALID, "이미 사용 중인 회사 이메일입니다: " + input.email);
  }

  // Spring validateAdminAccessIsPreserved 미러
  const losesSuperAdminRole = user.role === "SUPER_ADMIN" && input.role !== "SUPER_ADMIN";
  const isDeactivated = user.status === "ACTIVE" && input.status === "INACTIVE";
  if (actor.userId === user.id) {
    if (losesSuperAdminRole) throw new BizError(ErrorCode.INPUT_VALUE_INVALID, "본인의 총괄 관리자 역할은 스스로 해제할 수 없습니다.");
    if (isDeactivated) throw new BizError(ErrorCode.INPUT_VALUE_INVALID, "본인 계정은 스스로 비활성화할 수 없습니다.");
  }
  if ((losesSuperAdminRole || (isDeactivated && user.role === "SUPER_ADMIN"))
      && await countActiveSuperAdminsExcluding(db, user.id) === 0) {
    throw new BizError(ErrorCode.INPUT_VALUE_INVALID, "마지막 활성 총괄 관리자입니다. 다른 총괄 관리자를 먼저 지정한 뒤 역할 변경 또는 비활성화하세요.");
  }

  await db.transaction(async (tx) => {
    await updateUserAdminFields(tx, { id, name: input.name!, email: input.email!, departmentId: department.id, role: input.role!, status: input.status! });
    await recordAudit(tx, { actorId: actor.userId, action: "USER_UPDATED", targetType: "USER", targetId: id, detail: { employeeNo: user.employeeNo, name: input.name!, email: input.email!, departmentId: department.id, role: input.role!, status: input.status! } });
  });
}
