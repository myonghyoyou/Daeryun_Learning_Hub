import LogoutButton from "@/components/ui/LogoutButton.jsx";
import { useLogout } from "@/hooks/useLogout.js";

/**
 * 임시 페이지: Plan 4에서 실제 문제 풀이 화면으로 교체된다.
 *
 * 다만 로그아웃은 지금 필요하다. 이 화면이 직원 계정의 착지점인데 로그아웃 수단이 없으면
 * 세션이 만료될 때까지 다른 계정으로 전환할 수 없다. Plan 4가 직원용 Shell을 만들면
 * 이 헤더는 그 Shell의 Topbar로 흡수된다.
 */
export default function SolveHomePage() {
  const { handleLogout, loggingOut } = useLogout();

  return (
    <div className="min-h-screen bg-surface-page">
      <header className="flex h-[76px] items-center justify-between border-b border-line-default bg-surface-default px-5 md:px-7">
        <span className="text-card-title font-bold tracking-title text-ink-strong">문제 은행 Hub</span>
        <LogoutButton onLogout={handleLogout} loggingOut={loggingOut} />
      </header>
      <main className="mx-auto w-full max-w-[1440px] px-5 py-6 md:px-7">
        <p className="text-body text-ink-default">문제 풀이 화면 (추후 Plan에서 채워짐)</p>
      </main>
    </div>
  );
}
