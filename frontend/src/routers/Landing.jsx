import { Navigate } from "react-router-dom";
import Loader from "@/components/ui/Loader.jsx";
import { useSessionStatus } from "@/hooks/useSessionStatus.js";
import { useDeviceType } from "@/hooks/useDeviceType.js";
import { resolveLandingPath } from "@/utils/routing.js";

/**
 * plan 승인된 수정사항: "Landing/AdminRoute는 세션 확인 중 리다이렉트하지 않는다."
 * status === "loading"일 때 session이 아직 null이므로, 로딩 체크 없이 바로
 * resolveLandingPath({..., role: session?.role})를 호출하면 role이 undefined로
 * 평가되어 실제 역할과 무관하게 항상 "/solve"로 리다이렉트해버린다. 이는 관리자가
 * 새로고침할 때마다 잘못된 화면으로 튕겨나가는 결과를 낳으므로, PrivateRoute와
 * 동일하게 로딩 중에는 Loader만 보여주고 세션이 확정된 뒤에만 리다이렉트한다.
 */
export default function Landing() {
  const { status, session } = useSessionStatus();
  const device = useDeviceType();

  if (status === "loading") {
    return <Loader visible message="세션 확인 중..." />;
  }
  return <Navigate to={resolveLandingPath({ device, role: session?.role })} replace />;
}
