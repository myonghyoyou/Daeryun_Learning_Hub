import { SpinnerGap } from "@phosphor-icons/react";

// 디자인 시스템 7.4 Button: 종류(배경/텍스트)와 사이즈(높이/좌우 패딩/글자 크기).
const VARIANT_CLASS = {
  primary: "bg-action-primary-bg text-white hover:bg-action-primary-hover disabled:hover:bg-action-primary-bg",
  secondary:
    "border border-line-strong bg-surface-default text-action-secondary-text hover:bg-surface-subtle disabled:hover:bg-surface-default",
  tertiary: "bg-transparent text-brand-blue hover:bg-surface-blue disabled:hover:bg-transparent",
  destructive: "bg-danger-text text-white hover:bg-[#B23347] disabled:hover:bg-danger-text",
};

const SIZE_CLASS = {
  sm: "h-8 gap-1.5 px-3 text-[11px]",
  md: "h-[38px] gap-2 px-4 text-body-small",
  lg: "h-11 gap-2 px-[18px] text-[13px]",
};

export default function Button({
  variant = "primary",
  size = "md",
  loading = false,
  disabled = false,
  type = "button",
  className = "",
  children,
  ...props
}) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      className={`inline-flex shrink-0 items-center justify-center rounded-sm font-semibold transition-colors focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-brand-aqua disabled:cursor-not-allowed disabled:opacity-45 ${VARIANT_CLASS[variant]} ${SIZE_CLASS[size]} ${className}`}
      {...props}
    >
      {loading && <SpinnerGap size={16} className="animate-spin" aria-hidden="true" />}
      {loading ? "처리 중" : children}
    </button>
  );
}
