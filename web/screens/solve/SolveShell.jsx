import Link from "next/link";
import LogoutButton from "@/components/ui/LogoutButton.jsx";
import AccountInfo from "@/components/ui/AccountInfo.jsx";
import { useLogout } from "@/hooks/useLogout.js";
import { useSessionStatus } from "@/hooks/useSessionStatus.js";
import { roleLabel } from "@/utils/userRole.js";

/**
 * 직원 학습 화면 공통 Shell. 학습 홈·문제 목록·상세·이력이 같은 Topbar(제목 + 접속자 정보 +
 * 로그아웃)를 공유한다. 로그아웃 수단은 직원 착지 지점에서 반드시 유지되어야 하므로 Shell에
 * 고정한다(관리자 메뉴는 노출하지 않는다 — 디자인 시스템 9.2 모바일 규칙).
 *
 * 접속자 정보는 md 이상에서만 보인다 — 모바일 헤더(px-5)는 이미 제목+로그아웃으로 폭이
 * 빠듯해 실측 검증(design QA)을 마친 레이아웃이라, 거기 끼워 넣지 않고 넓은 화면에서만 더한다.
 */
export default function SolveShell({ children }) {
  const { handleLogout, loggingOut } = useLogout();
  const { session } = useSessionStatus();

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
          <LogoutButton onLogout={handleLogout} loggingOut={loggingOut} />
        </div>
      </header>
      <main className="mx-auto w-full max-w-[1120px] px-5 py-6 md:px-7 md:py-8">{children}</main>
    </div>
  );
}
