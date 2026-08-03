import { Navigate, Outlet, useLocation } from "react-router-dom";
import Loader from "@/components/ui/Loader.jsx";
import { useSessionStatus } from "@/hooks/useSessionStatus.js";
import { resolvePrivateRedirect } from "@/utils/routing.js";

/**
 * 모든 보호 라우트가 통과하는 지점이라, 비밀번호 강제 변경 게이트도 여기서 막는다.
 * 판단 로직은 `@/utils/routing.js`의 resolvePrivateRedirect 에 순수 함수로 두고
 * 테스트한다(status === "loading" 중 리다이렉트 금지, /change-password 루프 금지).
 */
export default function PrivateRoute() {
  const { status, session } = useSessionStatus();
  const { pathname } = useLocation();

  if (status === "loading") {
    return <Loader visible message="세션 확인 중..." />;
  }

  const redirectTo = resolvePrivateRedirect({ status, session, pathname });
  if (redirectTo) {
    return <Navigate to={redirectTo} replace />;
  }
  return <Outlet />;
}
