import { sourceLabel } from "@/utils/sourceLabel.js";

/**
 * 출처(부서 + 문항 번호) 배지. 유형 배지 옆에 회색으로 붙어, 무엇이 문제의 성격이고
 * 무엇이 위치 정보인지 구분되게 한다(spec D8).
 * 번호가 없는 문제에는 아무것도 그리지 않는다.
 */
export default function SourceBadge({ item, className = "" }) {
  const label = sourceLabel(item);
  if (!label) return null;
  return (
    <span
      className={`shrink-0 rounded-full bg-surface-subtle px-2.5 py-1 text-body-small font-medium text-ink-muted ${className}`}
    >
      {label}
    </span>
  );
}
