import Link from "next/link";
import { ArrowSquareOut } from "@phosphor-icons/react";

/**
 * 학습 화면 헤더에서 관리자 콘솔로 건너가는 링크. 관리자 사이드바 하단의
 * "학습 화면으로 이동"(components/layout/SidebarNav.jsx)과 짝을 이루는 거울상이라
 * 문구 형식과 아이콘을 맞춘다.
 *
 * **노출 여부는 이 컴포넌트가 정하지 않는다.** 호출부가 canAccessAdmin(utils/routing.js)
 * 으로 판단해 넘긴다 — 그래야 "버튼이 보이는 조건"과 "실제로 들어가지는 조건"이 한
 * 함수에서 나온다. CSS 중단점(md=768px)으로 숨기면 641~767px 구간에서 콘솔에는
 * 들어가지는데 버튼만 사라지는 어긋남이 생긴다(관리자 경계는 640px — utils/device.js).
 */
export default function AdminConsoleLink({ className = "" }) {
  return (
    <Link
      href="/admin"
      className={`inline-flex items-center gap-1.5 rounded-md border border-line-default px-3 py-2 text-body-small font-medium text-ink-default transition-colors hover:bg-surface-subtle hover:text-ink-strong focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-brand-aqua ${className}`}
    >
      <ArrowSquareOut size={18} aria-hidden="true" />
      관리자 화면으로 이동
    </Link>
  );
}
