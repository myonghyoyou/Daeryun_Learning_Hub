import { Navigate, Outlet } from "react-router-dom";
import Loader from "@/components/ui/Loader.jsx";
import { useSessionStatus } from "@/hooks/useSessionStatus.js";
import { useDeviceType } from "@/hooks/useDeviceType.js";
import { canAccessAdmin } from "@/utils/routing.js";

/**
 * plan 승인된 수정사항: "Landing/AdminRoute는 세션 확인 중 리다이렉트하지 않는다."
 * status === "loading"일 때 session은 아직 null이므로, 이 가드를 로딩 체크 없이
 * canAccessAdmin({..., role: session?.role})만으로 판단하면 role이 undefined로
 * 평가되어 새로고침마다 실제 접근 가능 여부와 무관하게 /solve로 튕겨나간다.
 * PrivateRoute/PublicRoute(Task 13)와 동일하게 로딩 중에는 Loader만 보여준다.
 */
export default function AdminRoute() {
  const { status, session } = useSessionStatus();
  const device = useDeviceType();

  if (status === "loading") {
    return <Loader visible message="세션 확인 중..." />;
  }
  if (!canAccessAdmin({ device, role: session?.role })) {
    return <Navigate to="/solve" replace />;
  }
  return <Outlet />;
}
