import { Navigate, Outlet } from "react-router-dom";
import Loader from "@/components/ui/Loader.jsx";
import { useSessionStatus } from "@/hooks/useSessionStatus.js";

export default function PrivateRoute() {
  const { status } = useSessionStatus();

  if (status === "loading") {
    return <Loader visible message="세션 확인 중..." />;
  }
  if (status === "unauthenticated") {
    return <Navigate to="/login" replace />;
  }
  return <Outlet />;
}
