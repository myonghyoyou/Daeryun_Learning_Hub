import { CaretDown } from "@phosphor-icons/react";

// 디자인 시스템 7.5 Select: Input과 동일한 컨트롤 높이·라벨 규칙을 공유한다.
export default function Select({
  id,
  label,
  error,
  required = false,
  options,
  className = "",
  selectClassName = "",
  ...props
}) {
  const errorId = error ? `${id}-error` : undefined;
  return (
    <div className={className}>
      {label && (
        <label htmlFor={id} className="mb-1 block text-label font-bold text-ink-default">
          {label}
          {required && <span className="ml-1 font-bold text-danger-text">필수</span>}
        </label>
      )}
      <div className="relative">
        <select
          id={id}
          aria-invalid={Boolean(error)}
          aria-describedby={errorId}
          className={`h-[38px] w-full appearance-none rounded-sm border bg-surface-default pl-3 pr-9 text-body text-ink-strong focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-brand-aqua disabled:cursor-not-allowed disabled:opacity-60 ${
            error ? "border-danger-text" : "border-line-default"
          } ${selectClassName}`}
          {...props}
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        {/* 기본 화살표를 끄고 직접 그린다: 브라우저마다 위치·모양이 달랐고 테두리에 딱 붙었다.
            pointer-events-none 이라야 아이콘을 눌러도 select 가 열린다. */}
        <CaretDown
          size={14}
          aria-hidden="true"
          className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-ink-muted"
        />
      </div>
      {error && (
        <p id={errorId} className="mt-1 text-body-small text-danger-text">
          {error}
        </p>
      )}
    </div>
  );
}
