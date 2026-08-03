// 디자인 시스템 7.5 Input + 10 접근성: label(또는 aria-label)과 오류 인라인 표시를 강제한다.
export default function Input({
  id,
  label,
  error,
  required = false,
  className = "",
  inputClassName = "",
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
      <input
        id={id}
        aria-invalid={Boolean(error)}
        aria-describedby={errorId}
        className={`h-[38px] w-full rounded-sm border bg-surface-default px-3 text-body text-ink-strong placeholder:text-ink-subtle focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-brand-aqua ${
          error ? "border-danger-text" : "border-line-default"
        } ${inputClassName}`}
        {...props}
      />
      {error && (
        <p id={errorId} className="mt-1 text-body-small text-danger-text">
          {error}
        </p>
      )}
    </div>
  );
}
