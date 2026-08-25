"use client";
import { SignOut } from "@phosphor-icons/react";

/**
 * 로그아웃 버튼. 관리자 Topbar·학습 화면·비밀번호 변경 화면이 공유한다.
 * 세 곳에 같은 마크업을 복제하지 않기 위해 분리했다.
 */
export default function LogoutButton({ onLogout, loggingOut, label = "로그아웃", className = "" }) {
  return (
    <button
      type="button"
      onClick={onLogout}
      disabled={loggingOut}
      className={`flex h-[38px] items-center gap-1.5 rounded-sm border border-line-strong px-3 text-body-small font-medium text-ink-default hover:bg-surface-subtle focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-brand-aqua disabled:cursor-not-allowed disabled:opacity-45 ${className}`}
    >
      <SignOut size={16} aria-hidden="true" />
      {loggingOut ? "로그아웃 중" : label}
    </button>
  );
}
