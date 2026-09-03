import Link from "next/link";
import LogoutButton from "@/components/ui/LogoutButton.jsx";
import AccountInfo from "@/components/ui/AccountInfo.jsx";
import AdminConsoleLink from "@/components/ui/AdminConsoleLink.jsx";
import { useLogout } from "@/hooks/useLogout.js";
import { useSessionStatus } from "@/hooks/useSessionStatus.js";
import { useDeviceType } from "@/hooks/useDeviceType.js";
import { canAccessAdmin } from "@/utils/routing.js";
import { roleLabel } from "@/utils/userRole.js";

/**
 * 직원 학습 화면 공통 Shell. 학습 홈·문제 목록·상세·이력이 같은 Topbar(제목 + 접속자 정보 +
 * 로그아웃)를 공유한다. 로그아웃 수단은 직원 착지 지점에서 반드시 유지되어야 하므로 Shell에
 * 고정한다(관리자 메뉴는 노출하지 않는다 — 디자인 시스템 9.2 모바일 규칙).
 *
 * 접속자 정보는 md 이상에서만 보인다 — 모바일 헤더(px-5)는 이미 제목+로그아웃으로 폭이
 * 빠듯해 실측 검증(design QA)을 마친 레이아웃이라, 거기 끼워 넣지 않고 넓은 화면에서만 더한다.
 *
 * 관리자에게는 콘솔로 건너가는 링크를 더한다. 위 "관리자 메뉴는 노출하지 않는다"는 디자인
 * 시스템 9.2 의 모바일 상단 내비 규칙(아이콘 4개까지)이라 PC 에는 걸리지 않는다.
 *
 * 노출 판단에 CSS 중단점을 쓰지 않고 canAccessAdmin 을 그대로 쓰는 이유: 관리자 콘솔은
 * 640px 미만이면 역할과 무관하게 /solve 로 되돌려보낸다(app/(protected)/admin/layout.tsx).
 * md(768px)로 숨기면 641~767px 에서 콘솔에는 들어가는데 버튼만 없는 상태가 된다.
 * device 가 null(측정 전)이면 canAccessAdmin 이 false 라 그리지 않는다 — 잘못 그렸다
 * 사라지는 깜빡임을 막는다.
 */
export default function SolveShell({ children }) {
  const { handleLogout, loggingOut } = useLogout();
  const { session } = useSessionStatus();
  const device = useDeviceType();
  const showAdminLink = canAccessAdmin({ device, role: session?.role });

  return (
    <div className="min-h-screen bg-surface-page">
      <header className="flex h-[76px] items-center justify-between border-b border-line-default bg-surface-default px-5 md:px-7">
        <Link
          href="/solve"
          className="rounded-sm focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-brand-aqua"
        >
          <img src="/logo.png" alt="문제 은행 Hub" className="h-12 w-auto" />
        </Link>
        <div className="flex items-center gap-4">
          <AccountInfo name={session?.name} roleLabel={roleLabel(session?.role)} className="hidden text-right md:flex" />
          {showAdminLink && <AdminConsoleLink />}
          <LogoutButton onLogout={handleLogout} loggingOut={loggingOut} />
        </div>
      </header>
      <main className="mx-auto w-full max-w-[1120px] px-5 py-6 md:px-7 md:py-8">{children}</main>
    </div>
  );
}
