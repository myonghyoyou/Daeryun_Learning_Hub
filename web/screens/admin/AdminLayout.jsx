import { Outlet } from "react-router-dom";
import AppShell from "@/components/layout/AppShell.jsx";
import SidebarNav from "@/components/layout/SidebarNav.jsx";
import Topbar from "@/components/layout/Topbar.jsx";
import { useSessionStatus } from "@/hooks/useSessionStatus.js";
import { useLogout } from "@/hooks/useLogout.js";
import { roleLabel, departmentScopeLabel } from "@/utils/adminSession.js";
import { buildNavGroups } from "@/utils/adminNav.js";

export default function AdminLayout() {
  const { status, session } = useSessionStatus();
  const { handleLogout, loggingOut } = useLogout();

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
