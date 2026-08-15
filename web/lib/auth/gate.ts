import { ErrorCode } from "../http/errorCode";
import type { AuthUser } from "./types";

const PUBLIC_PATHS = new Set(["/api/auth/login", "/api/auth/session"]);

export type GateDecision =
  | { action: "allow" }
  | { action: "reject"; status: number; body: { resultCode: number; resultMsg: string } };

// 현재 SessionCheckFilter.shouldNotFilter + doFilterInternal 미러.
export function evaluateGate(pathname: string, method: string, user: AuthUser | null): GateDecision {
  if (method === "OPTIONS") return { action: "allow" };
  if (!pathname.startsWith("/api/")) return { action: "allow" };
  if (PUBLIC_PATHS.has(pathname)) return { action: "allow" };

  if (!user) {
    return { action: "reject", status: 401, body: { resultCode: ErrorCode.EMPTY_SESSION.code, resultMsg: ErrorCode.EMPTY_SESSION.message } };
  }
  if (user.mustChangePassword && !pathname.startsWith("/api/auth/")) {
    // 현재도 PASSWORD_CHANGE_REQUIRED 는 HTTP 200 으로 나간다(프론트가 resultCode 로 분기).
    return { action: "reject", status: 200, body: { resultCode: ErrorCode.PASSWORD_CHANGE_REQUIRED.code, resultMsg: ErrorCode.PASSWORD_CHANGE_REQUIRED.message } };
  }
  return { action: "allow" };
}

export { requireRole } from "./guard";
