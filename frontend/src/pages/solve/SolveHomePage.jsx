import { Link } from "react-router-dom";
import { Shuffle, ListChecks, ClockCounterClockwise, ArrowRight } from "@phosphor-icons/react";
import Surface from "@/components/ui/Surface.jsx";
import SolveShell from "@/pages/solve/SolveShell.jsx";

/**
 * 직원 학습 홈. 랜덤으로 풀거나, 골라서 풀거나, 본인 풀이 이력을 확인하는 착지 지점이다.
 * (Blue Bento Learning 학습 홈의 축약 구조 — 랜덤 풀기·골라서 풀기·내 이력.)
 */
export default function SolveHomePage() {
  return (
    <SolveShell>
      <section className="mb-6">
        <h1 className="text-page-title font-bold tracking-title text-ink-strong">학습 홈</h1>
        <p className="mt-1 text-body text-ink-default">전사 공통 문제를 자유롭게 풀고 즉시 채점 결과를 확인하세요.</p>
      </section>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Surface as={Link} to="/solve/random" className="group block p-5 transition-shadow hover:shadow-raised focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-brand-aqua">
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-md bg-surface-blue text-brand-blue">
            <Shuffle size={22} aria-hidden="true" />
          </span>
          <p className="mt-3 flex items-center gap-1.5 text-section-title font-semibold text-ink-strong">
            랜덤으로 풀기
            <ArrowRight size={16} aria-hidden="true" className="text-brand-blue transition-transform group-hover:translate-x-0.5" />
          </p>
          <p className="mt-1 text-body-small text-ink-muted">문제 수와 부서를 정하면 무작위로 뽑아 드립니다.</p>
        </Surface>

        <Surface as={Link} to="/solve/problems" className="group block p-5 transition-shadow hover:shadow-raised focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-brand-aqua">
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-md bg-surface-blue text-brand-blue">
            <ListChecks size={22} aria-hidden="true" />
          </span>
          <p className="mt-3 flex items-center gap-1.5 text-section-title font-semibold text-ink-strong">
            골라서 풀기
            <ArrowRight size={16} aria-hidden="true" className="text-brand-blue transition-transform group-hover:translate-x-0.5" />
          </p>
          <p className="mt-1 text-body-small text-ink-muted">검색·태그로 원하는 문제를 찾아 풉니다.</p>
        </Surface>

        <Surface as={Link} to="/solve/history" className="group block p-5 transition-shadow hover:shadow-raised focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-brand-aqua">
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-md bg-surface-aqua text-info-text">
            <ClockCounterClockwise size={22} aria-hidden="true" />
          </span>
          <p className="mt-3 flex items-center gap-1.5 text-section-title font-semibold text-ink-strong">
            내 풀이 이력
            <ArrowRight size={16} aria-hidden="true" className="text-brand-blue transition-transform group-hover:translate-x-0.5" />
          </p>
          <p className="mt-1 text-body-small text-ink-muted">지금까지 제출한 문제와 정답 여부를 확인합니다.</p>
        </Surface>
      </div>
    </SolveShell>
  );
}
