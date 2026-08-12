import { useState } from "react";
import { CaretDown, CaretUp } from "@phosphor-icons/react";

/**
 * Tailwind는 클래스명을 문자열로 조립하면(`line-clamp-${n}`) 빌드 시 그 클래스를
 * 찾지 못해 스타일이 조용히 안 나온다. 그래서 collapsedLines 값별로 완성된 클래스를
 * 미리 매핑해 두고, 목록에 없는 값은 기본값(3)으로 고정한다.
 */
const LINE_CLAMP_CLASSES = {
  1: "line-clamp-1",
  2: "line-clamp-2",
  3: "line-clamp-3",
  4: "line-clamp-4",
  5: "line-clamp-5",
};

/**
 * 긴 텍스트를 접어 두고 필요할 때 펼친다(디자인 시스템 8.4.2 참조 지문, 8.5 풀이 이력 답안).
 * 짧은 텍스트에는 토글을 아예 그리지 않는다 — 접을 것이 없는데 버튼만 있으면 방해가 된다.
 */
export default function Collapsible({ text, collapsedLines = 3, threshold = 120, className = "" }) {
  const [open, setOpen] = useState(false);
  if (!text) return null;

  const needsToggle = text.length > threshold;
  if (!needsToggle) {
    return <p className={`whitespace-pre-wrap ${className}`}>{text}</p>;
  }

  const clampClass = LINE_CLAMP_CLASSES[collapsedLines] ?? LINE_CLAMP_CLASSES[3];

  return (
    <div>
      <p className={`whitespace-pre-wrap ${open ? "" : clampClass} ${className}`}>{text}</p>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="mt-1 inline-flex items-center gap-1 rounded-sm text-body-small font-medium text-action-secondary-text hover:underline focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-brand-aqua"
      >
        {open ? "접기" : "더 보기"}
        {open ? <CaretUp size={12} aria-hidden="true" /> : <CaretDown size={12} aria-hidden="true" />}
      </button>
    </div>
  );
}
