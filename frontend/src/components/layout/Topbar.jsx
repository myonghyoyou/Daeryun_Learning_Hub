import { SignOut } from "@phosphor-icons/react";

// 디자인 시스템 7.3 Topbar + 8.6.1: 현재 역할·부서·세션 상태를 보여주는 프로필 영역과 로그아웃.
export default function Topbar({ roleLabel, scopeLabel, onLogout, loggingOut }) {
  return (
    <header className="flex h-[76px] shrink-0 items-center justify-between border-b border-line-default bg-surface-default px-7">
      <div>
        <p className="text-section-title font-bold text-ink-strong">관리자 콘솔</p>
        <p className="text-body-small text-ink-muted">
          {roleLabel} · {scopeLabel}
        </p>
      </div>
      <button
        type="button"
        onClick={onLogout}
        disabled={loggingOut}
        className="flex h-[38px] items-center gap-1.5 rounded-sm border border-line-strong px-3 text-body-small font-medium text-ink-default hover:bg-surface-subtle focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-brand-aqua disabled:cursor-not-allowed disabled:opacity-45"
      >
        <SignOut size={16} aria-hidden="true" />
        {loggingOut ? "로그아웃 중" : "로그아웃"}
      </button>
    </header>
  );
}
