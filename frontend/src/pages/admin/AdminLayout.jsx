import { useState } from "react";
import { Outlet, useNavigate } from "react-router-dom";
import { toast } from "react-toastify";
import { Gauge, Buildings } from "@phosphor-icons/react";
import AppShell from "@/components/layout/AppShell.jsx";
import SidebarNav from "@/components/layout/SidebarNav.jsx";
import Topbar from "@/components/layout/Topbar.jsx";
import { useSessionStatus } from "@/hooks/useSessionStatus.js";
import { logout } from "@/api/auth.js";
import { refetchSession } from "@/store/sessionStore.js";
import { resolveErrorMessage } from "@/api/client.js";
import { roleLabel, departmentScopeLabel } from "@/utils/adminSession.js";

/**
 * 8.6.1 관리자 Shell: 대시보드/문제 관리/통계/부서 관리/계정 관리 순서가 최종 형태지만,
 * 이 Plan에서는 아직 존재하지 않는 라우트(문제 관리, 통계)로 이어지는 메뉴를 만들지 않는다.
 * 부서 관리는 총괄 관리자에게만 렌더링하고, 부서 관리자에게는 비활성화 상태로 보여주는 대신
 * 아예 목록에서 제외한다. 계정 관리(/admin/users)는 Task 6이 이 함수를 함께 수정해 추가한다.
 */
function buildNavGroups(role) {
  const groups = [
    {
      label: "주요 메뉴",
      items: [{ to: "/admin", label: "대시보드", icon: Gauge, end: true }],
    },
  ];
  if (role === "SUPER_ADMIN") {
    groups.push({
      label: "관리 메뉴",
      items: [{ to: "/admin/departments", label: "부서 관리", icon: Buildings }],
    });
  }
  return groups;
}

export default function AdminLayout() {
  const { session } = useSessionStatus();
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
          onLogout={handleLogout}
          loggingOut={loggingOut}
        />
      }
    >
      <Outlet />
    </AppShell>
  );
}
