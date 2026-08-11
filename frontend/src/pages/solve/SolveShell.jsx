import { Link } from "react-router-dom";
import LogoutButton from "@/components/ui/LogoutButton.jsx";
import { useLogout } from "@/hooks/useLogout.js";

/**
 * 직원 학습 화면 공통 Shell. 학습 홈·문제 목록·상세·이력이 같은 Topbar(제목 + 로그아웃)를
 * 공유한다. 로그아웃 수단은 직원 착지 지점에서 반드시 유지되어야 하므로 Shell에 고정한다
 * (관리자 메뉴는 노출하지 않는다 — 디자인 시스템 9.2 모바일 규칙).
 */
export default function SolveShell({ children }) {
  const { handleLogout, loggingOut } = useLogout();

  return (
    <div className="min-h-screen bg-surface-page">
      <header className="flex h-[76px] items-center justify-between border-b border-line-default bg-surface-default px-5 md:px-7">
        <Link
          to="/solve"
          className="rounded-sm text-card-title font-bold tracking-title text-ink-strong focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-brand-aqua"
        >
          문제 은행 Hub
        </Link>
        <LogoutButton onLogout={handleLogout} loggingOut={loggingOut} />
      </header>
      <main className="mx-auto w-full max-w-[1040px] px-5 py-6 md:px-7 md:py-8">{children}</main>
    </div>
  );
}
