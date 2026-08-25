import { SpinnerGap } from "@phosphor-icons/react";
import { buttonClass } from "@/utils/buttonClass.js";

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
      className={buttonClass({ variant, size, className })}
      {...props}
    >
      {loading && <SpinnerGap size={16} className="animate-spin" aria-hidden="true" />}
      {loading ? "처리 중" : children}
    </button>
  );
}
