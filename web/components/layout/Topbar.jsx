import LogoutButton from "@/components/ui/LogoutButton.jsx";
import { sessionStatusMeta } from "@/utils/adminSession.js";

// 디자인 시스템 7.3 Topbar + 8.6.1: 현재 역할·부서·세션 상태를 보여주는 프로필 영역과 로그아웃.
export default function Topbar({ roleLabel, scopeLabel, sessionStatus, onLogout, loggingOut }) {
  const statusMeta = sessionStatusMeta(sessionStatus);
  return (
    // sticky top-0: 문서가 스크롤해도 상단에 남는다. bg-surface-default가 불투명하므로 아래
    // 표 행이 비쳐 보이지 않는다. z-20은 표·카드보다 위, 모달(z-50)보다 아래다.
    <header className="sticky top-0 z-20 flex h-[76px] shrink-0 items-center justify-between border-b border-line-default bg-surface-default px-7">
      <div>
        <p className="text-section-title font-bold text-ink-strong">관리자 콘솔</p>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-body-small text-ink-muted">
          <span>
            {roleLabel} · {scopeLabel}
          </span>
          <span className={`inline-flex items-center gap-1.5 font-medium ${statusMeta.textClassName}`}>
            <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${statusMeta.dotClassName}`} />
            {statusMeta.label}
          </span>
        </div>
      </div>
      <LogoutButton onLogout={onLogout} loggingOut={loggingOut} />
    </header>
  );
}
