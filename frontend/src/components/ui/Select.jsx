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
      <select
        id={id}
        aria-invalid={Boolean(error)}
        aria-describedby={errorId}
        className={`h-[38px] w-full rounded-sm border bg-surface-default px-3 text-body text-ink-strong focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-brand-aqua ${
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
      {error && (
        <p id={errorId} className="mt-1 text-body-small text-danger-text">
          {error}
        </p>
      )}
    </div>
  );
}
