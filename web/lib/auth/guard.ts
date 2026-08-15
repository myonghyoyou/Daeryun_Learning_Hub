import { BizError } from "../http/errors";
import { ErrorCode } from "../http/errorCode";
import type { AuthUser, UserRole } from "./types";

// 현재 RoleCheckInterceptor 미러: @RequireRole 대응.
export function requireRole(user: AuthUser, ...roles: UserRole[]): void {
  if (!roles.includes(user.role)) {
    throw new BizError(ErrorCode.ACCESS_AUTH_DENIED);
  }
}
