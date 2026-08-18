import bcrypt from "bcryptjs";
import { ErrorCode } from "../http/errorCode";
import { BizError } from "../http/errors";
import type { Db } from "../db/client";
import { findDepartmentById } from "../db/departments";
import { findByEmployeeNo, incrementFailedLogin, resetFailedLogin, updateLastLoginAt, updatePassword } from "../db/users";
import type { AuthUser, UserRole } from "./types";
import type { LoginInput, LoginResult, SessionStatus } from "./authSchemas";

const MIN_PASSWORD_LENGTH = 8;

// 잘못 설정된 값(빈 문자열/문자 등)이 Number()를 거치면 NaN이 되고, `count >= NaN`은 항상
// false라 잠금이 조용히 비활성화된다. 유효하지 않으면 기본값으로 되돌린다.
function envInt(name: string, fallback: number): number {
  const n = Number(process.env[name] ?? fallback);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

const MAX_FAILED_ATTEMPTS = envInt("AUTH_MAX_FAILED_ATTEMPTS", 5);
const LOCKOUT_MINUTES = envInt("AUTH_LOCKOUT_MINUTES", 15);

function isBlank(value: string | undefined | null): boolean {
  return value == null || value.trim() === "";
}

export async function login(db: Db, input: LoginInput): Promise<{ authUser: AuthUser; response: LoginResult }> {
  if (isBlank(input.employeeNo) || isBlank(input.password)) {
    throw new BizError(ErrorCode.INPUT_VALUE_INVALID, "사번과 비밀번호를 입력하세요.");
  }
  // 파리티: Spring 은 사번을 trim 하지 않고 원본 그대로 조회한다(trim 은 빈 값 검사에만 쓴다).
  // " 1001 " 처럼 공백이 붙으면 조회 실패 → 1011 이 현재 동작이다.
  const user = await findByEmployeeNo(db, input.employeeNo!);
  if (!user || user.status === "INACTIVE") {
    throw new BizError(ErrorCode.LOGIN_FAILED);
  }
  if (user.lockedUntil && user.lockedUntil.getTime() > Date.now()) {
    throw new BizError(ErrorCode.ACCOUNT_LOCKED);
  }
  const matches = await bcrypt.compare(input.password!, user.passwordHash);
  if (!matches) {
    const lockedUntil = await incrementFailedLogin(
      db, user.id, MAX_FAILED_ATTEMPTS, new Date(Date.now() + LOCKOUT_MINUTES * 60000));
    if (lockedUntil && lockedUntil.getTime() > Date.now()) {
      throw new BizError(ErrorCode.ACCOUNT_LOCKED);
    }
    throw new BizError(ErrorCode.LOGIN_FAILED);
  }

  await resetFailedLogin(db, user.id);
  await updateLastLoginAt(db, user.id, new Date());

  const authUser: AuthUser = {
    userId: user.id, employeeNo: user.employeeNo, name: user.name,
    role: user.role as UserRole, departmentId: user.departmentId, mustChangePassword: user.mustChangePassword,
  };
  return { authUser, response: { name: user.name, role: user.role as UserRole, mustChangePassword: user.mustChangePassword } };
}

export async function sessionStatus(db: Db, authUser: AuthUser | null): Promise<SessionStatus> {
  if (!authUser) {
    return { isLoggedIn: false, employeeNo: null, name: null, role: null, departmentId: null, departmentName: null, mustChangePassword: false };
  }
  const dept = authUser.departmentId == null ? undefined
    : await findDepartmentById(db, authUser.departmentId);
  return {
    isLoggedIn: true, employeeNo: authUser.employeeNo, name: authUser.name, role: authUser.role,
    departmentId: authUser.departmentId, departmentName: dept?.name ?? null, mustChangePassword: authUser.mustChangePassword,
  };
}

export async function changePassword(db: Db, authUser: AuthUser | null, newPassword: string): Promise<AuthUser> {
  if (isBlank(newPassword) || newPassword.length < MIN_PASSWORD_LENGTH) {
    throw new BizError(ErrorCode.INPUT_VALUE_INVALID, "비밀번호는 8자 이상이어야 합니다.");
  }
  if (!authUser) {
    throw new BizError(ErrorCode.EMPTY_SESSION);
  }
  const user = await findByEmployeeNo(db, authUser.employeeNo);
  if (user && await bcrypt.compare(newPassword, user.passwordHash)) {
    throw new BizError(ErrorCode.INPUT_VALUE_INVALID, "현재 비밀번호와 다른 비밀번호를 입력하세요.");
  }
  await updatePassword(db, authUser.userId, await bcrypt.hash(newPassword, 10));
  return { ...authUser, mustChangePassword: false };
}
