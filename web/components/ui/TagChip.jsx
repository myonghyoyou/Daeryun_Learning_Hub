"use client";
import { X } from "@phosphor-icons/react";

// 디자인 시스템 7.6 TagChip: 이 화면에서는 태그가 모두 "Selected + 제거 가능" 상태로만
// 쓰이므로(선택된 태그의 목록 자체가 곧 입력값이다) Selected 배경(#EAF7FD → selection-bg
// 토큰)에 X 버튼을 기본으로 갖춘 한 가지 변형만 구현한다. X 버튼에는 접근 가능한 이름을
// 붙인다(7.6 "Removable: X 버튼에 aria-label").
export default function TagChip({ label, onRemove }) {
  return (
    <span className="inline-flex max-w-full items-center gap-1 rounded-full border border-line-strong bg-selection-bg px-2.5 py-1 text-body-small font-medium text-action-secondary-text">
      <span className="truncate">{label}</span>
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          aria-label={`${label} 태그 삭제`}
          className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-action-secondary-text hover:bg-brand-blue/10 focus-visible:outline focus-visible:outline-[2px] focus-visible:outline-offset-1 focus-visible:outline-brand-aqua"
        >
          <X size={10} aria-hidden="true" />
        </button>
      )}
    </span>
  );
}
