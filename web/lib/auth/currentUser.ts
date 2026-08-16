import { ErrorCode } from "../http/errorCode";
import { BizError } from "../http/errors";
import { getAuthUser } from "./session";
import { requireRole } from "./guard";
import type { AuthUser, UserRole } from "./types";

// 라우트 1줄 관용구: const actor = await requireActor("SUPER_ADMIN");
// 미들웨어가 세션을 보장하지만, 라우트 단독 테스트·방어를 위해 한 번 더 검사한다(Spring 이중 구조 미러).
export async function requireActor(...roles: UserRole[]): Promise<AuthUser> {
  const user = await getAuthUser();
  if (!user) throw new BizError(ErrorCode.EMPTY_SESSION);
  if (roles.length > 0) requireRole(user, ...roles);
  return user;
}
