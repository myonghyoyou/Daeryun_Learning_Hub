"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import Loader from "@/components/ui/Loader.jsx";
import AppShell from "@/components/layout/AppShell.jsx";
import SidebarNav from "@/components/layout/SidebarNav.jsx";
import Topbar from "@/components/layout/Topbar.jsx";
import { useSessionStatus } from "@/hooks/useSessionStatus.js";
import { useDeviceType } from "@/hooks/useDeviceType.js";
import { useLogout } from "@/hooks/useLogout.js";
import { canAccessAdmin } from "@/utils/routing.js";
import { roleLabel, departmentScopeLabel } from "@/utils/adminSession.js";
import { buildNavGroups } from "@/utils/adminNav.js";

/**
 * AdminRoute(640px + 역할 게이트) 와 AdminLayout(셸) 을 한 레이아웃으로 합친 것.
 * `<Outlet/>` 이 `{children}` 이 된다.
 *
 * 이 파일이 `(protected)/` 아래에 있는 것은 의도된 중첩이다. 여기서는 역할·창폭만
 * 검사하고 mustChangePassword 는 보지 않는다 — 그 검사는 `(protected)/layout.tsx`
 * 가 먼저 끝낸다(원본 PrivateRoute > AdminRoute 중첩과 같다). 밖으로 빼면 최초
 * 로그인 상태(비밀번호 강제 변경 대상)인 부서관리자가 /admin 에 그대로 도달한다.
 */
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { status, session } = useSessionStatus();
  const device = useDeviceType();          // 첫 렌더에는 null(SSR 안전), 마운트 후 측정
  const { handleLogout, loggingOut } = useLogout();
  const router = useRouter();
  // device === null 은 "아직 모른다"이지 "pc 가 아니다"가 아니다. 그 조건을 빼면
  // canAccessAdmin 이 false 를 돌려줘 첫 렌더마다 /solve 로 튕긴다.
  const blocked = status !== "loading" && device !== null &&
                  !canAccessAdmin({ device, role: session?.role });

  useEffect(() => {
    if (blocked) router.replace("/solve");
  }, [blocked, router]);

  if (status === "loading" || device === null) return <Loader visible message="세션 확인 중..." />;
  if (blocked) return <Loader visible message="세션 확인 중..." />;

  return (
    <AppShell
      sidebar={<SidebarNav groups={buildNavGroups(session?.role)}
                           accountName={session?.name} accountRoleLabel={roleLabel(session?.role)}
                           onLogout={handleLogout} loggingOut={loggingOut} />}
      topbar={<Topbar roleLabel={roleLabel(session?.role)} scopeLabel={departmentScopeLabel(session)}
                      sessionStatus={status} />}
    >
      {children}
    </AppShell>
  );
}
