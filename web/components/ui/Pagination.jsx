"use client";
import { CaretLeft, CaretRight } from "@phosphor-icons/react";
import { buttonClass } from "@/utils/buttonClass.js";
import { PAGE_SIZE, pageCount, pageRange } from "@/utils/pagination.js";

/**
 * 목록 하단 페이지 이동. 페이지가 1개뿐이면 아무것도 그리지 않는다 — 8행짜리 목록에
 * 의미 없는 컨트롤이 남지 않게 한다.
 *
 * Button 컴포넌트 대신 buttonClass를 쓰는 이유: Button은 loading prop과 disabled를 함께
 * 다루는데 여기서는 disabled만 필요하다. 스타일 문자열을 손으로 복제하면 QA D6처럼 포커스
 * 링을 빠뜨리게 되므로 단일 출처인 buttonClass를 쓴다.
 */
export default function Pagination({ page, totalCount, size = PAGE_SIZE, onChange }) {
  const last = pageCount(totalCount, size);
  if (last <= 1) {
    return null;
  }
  const { from, to } = pageRange(page, totalCount, size);
  return (
    <nav className="mt-4 flex items-center justify-between" aria-label="페이지 이동">
      <p className="text-body-small text-ink-muted">
        {from}–{to} / 전체 {totalCount}건
      </p>
      <div className="flex items-center gap-2">
        <button
          type="button"
          className={buttonClass({ variant: "secondary", size: "sm" })}
          disabled={page <= 1}
          onClick={() => onChange(page - 1)}
        >
          <CaretLeft size={14} aria-hidden="true" />
          이전
        </button>
        <span className="text-body-small text-ink-default" aria-current="page">
          {page} / {last}
        </span>
        <button
          type="button"
          className={buttonClass({ variant: "secondary", size: "sm" })}
          disabled={page >= last}
          onClick={() => onChange(page + 1)}
        >
          다음
          <CaretRight size={14} aria-hidden="true" />
        </button>
      </div>
    </nav>
  );
}
