import { useState } from "react";
import { Outlet, useNavigate } from "react-router-dom";
import { toast } from "react-toastify";
import AppShell from "@/components/layout/AppShell.jsx";
import SidebarNav from "@/components/layout/SidebarNav.jsx";
import Topbar from "@/components/layout/Topbar.jsx";
import { useSessionStatus } from "@/hooks/useSessionStatus.js";
import { logout } from "@/api/auth.js";
import { refetchSession } from "@/store/sessionStore.js";
import { resolveErrorMessage } from "@/api/client.js";
import { roleLabel, departmentScopeLabel } from "@/utils/adminSession.js";
import { buildNavGroups } from "@/utils/adminNav.js";

export default function AdminLayout() {
  const { status, session } = useSessionStatus();
  const navigate = useNavigate();
  const [loggingOut, setLoggingOut] = useState(false);

  async function handleLogout() {
    setLoggingOut(true);
    try {
      await logout();
      // 로그아웃 후에도 세션 스토어를 재조회하지 않으면 캐시된 "authenticated"가 남아
      // PrivateRoute가 반응하지 않는다(sessionStore.js의 refetchSession 문서 참고).
      await refetchSession();
      navigate("/login", { replace: true });
    } catch (error) {
      toast.error(resolveErrorMessage(error, "로그아웃에 실패했습니다."));
    } finally {
      setLoggingOut(false);
    }
  }

  return (
    <AppShell
      sidebar={<SidebarNav groups={buildNavGroups(session?.role)} />}
      topbar={
        <Topbar
          roleLabel={roleLabel(session?.role)}
          scopeLabel={departmentScopeLabel(session)}
          sessionStatus={status}
          onLogout={handleLogout}
          loggingOut={loggingOut}
        />
      }
    >
      <Outlet />
    </AppShell>
  );
}
