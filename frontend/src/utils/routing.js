const ADMIN_ROLES = ["SUPER_ADMIN", "DEPT_ADMIN"];

export function canAccessAdmin({ device, role }) {
  return device === "pc" && ADMIN_ROLES.includes(role);
}

export function resolveLandingPath({ device, role }) {
  return canAccessAdmin({ device, role }) ? "/admin" : "/solve";
}

export const CHANGE_PASSWORD_PATH = "/change-password";

/**
 * 보호 라우트(PrivateRoute) 진입 시 리다이렉트할 경로를 결정한다.
 * 리다이렉트가 필요 없으면 null 을 돌려준다.
 *
 * - status === "loading" 이면 절대 리다이렉트하지 않는다(plan 승인된 수정사항).
 *   세션이 확정되기 전에 판단하면 session 이 아직 null 이라 항상 잘못된 곳으로 튕긴다.
 * - mustChangePassword 인 사용자는 /change-password 외의 보호 경로로 들어갈 수 없다.
 *   이전에는 가드가 인증 여부만 보고 mustChangePassword 를 무시해서, 강제 변경
 *   대상 사용자가 "/" 로 이동해 /solve 나 /admin 에 그대로 도달할 수 있었다.
 *   (서버는 SessionCheckFilter 로 데이터를 계속 막지만, 그 화면에서 나가는 모든
 *   호출이 HTTP 200 + resultCode 1012 로 돌아올 뿐 아무도 리다이렉트하지 않는다.)
 * - /change-password 자신은 통과시켜 리다이렉트 루프를 만들지 않는다.
 */
export function resolvePrivateRedirect({ status, session, pathname }) {
  if (status === "loading") {
    return null;
  }
  if (status !== "authenticated") {
    return "/login";
  }
  if (session?.mustChangePassword && pathname !== CHANGE_PASSWORD_PATH) {
    return CHANGE_PASSWORD_PATH;
  }
  return null;
}
