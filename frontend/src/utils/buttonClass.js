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

export const BUTTON_VARIANTS = Object.keys(VARIANT_CLASS);
export const BUTTON_SIZES = Object.keys(SIZE_CLASS);

const BASE_CLASS =
  "inline-flex shrink-0 items-center justify-center rounded-sm font-semibold transition-colors " +
  "focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-brand-aqua " +
  "disabled:cursor-not-allowed disabled:opacity-45";

/**
 * 버튼 시각 스타일의 단일 출처.
 *
 * Button 컴포넌트는 {@code <button>} 으로 고정돼 있어 라우터의 {@code <Link>} 를 감쌀 수
 * 없다. 그래서 버튼처럼 보이는 링크는 이 함수를 대신 쓴다 — 예전에는 클래스 문자열을
 * 손으로 복제했고, 세 곳 중 두 곳이 focus-visible 유틸리티를 빠뜨렸다(QA D6).
 */
export function buttonClass({ variant = "primary", size = "md", className = "" } = {}) {
  if (!VARIANT_CLASS[variant]) {
    throw new Error(`알 수 없는 버튼 variant 입니다: ${variant}`);
  }
  if (!SIZE_CLASS[size]) {
    throw new Error(`알 수 없는 버튼 size 입니다: ${size}`);
  }
  return `${BASE_CLASS} ${VARIANT_CLASS[variant]} ${SIZE_CLASS[size]}${className ? ` ${className}` : ""}`;
}
