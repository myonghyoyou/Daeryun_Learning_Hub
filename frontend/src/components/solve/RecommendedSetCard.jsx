import { Link } from "react-router-dom";
import { Sparkle, ArrowRight } from "@phosphor-icons/react";
import Surface from "@/components/ui/Surface.jsx";
import { buttonClass } from "@/utils/buttonClass.js";

/**
 * 학습 홈의 추천 문제 세트(디자인 시스템 8.2). 서버 추천 로직 없이 바로 시작할 수 있는
 * 조합을 제안하는 진입점이다 — 눌러도 기존 랜덤 설정 화면으로 갈 뿐 새 API 를 쓰지 않는다.
 * 수요가 없으면 SolveHomePage 에서 이 블록만 지우면 된다(다른 화면이 이 파일을 쓰지 않는다).
 */
export default function RecommendedSetCard() {
  return (
    <Surface className="p-5">
      <span className="inline-flex h-10 w-10 items-center justify-center rounded-md bg-surface-blue text-brand-blue">
        <Sparkle size={22} aria-hidden="true" />
      </span>
      <p className="mt-3 text-section-title font-semibold text-ink-strong">추천 문제 세트</p>
      <p className="mt-1 text-body-small text-ink-muted">
        문제 수와 부서를 골라 바로 시작할 수 있습니다. 기본은 10문제·전사 공통입니다.
      </p>
      <div className="mt-3 flex flex-wrap gap-1">
        <span className="rounded-xs bg-surface-subtle px-2 py-0.5 text-body-small text-ink-muted">10문제</span>
        <span className="rounded-xs bg-surface-subtle px-2 py-0.5 text-body-small text-ink-muted">전사 공통</span>
      </div>
      <Link to="/solve/random" className={buttonClass({ variant: "primary", size: "md", className: "mt-4" })}>
        세트 시작하기
        <ArrowRight size={16} aria-hidden="true" />
      </Link>
    </Surface>
  );
}
