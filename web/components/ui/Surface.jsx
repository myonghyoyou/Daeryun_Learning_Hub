// 디자인 시스템 7.7 Surface: White + line + subtle shadow의 독립 기능 영역.
//
// 배경색은 className으로 덮을 수 없다. Tailwind는 생성 순서로 승자를 정하는데
// bg-surface-default가 bg-success-bg/bg-danger-bg보다 뒤에 놓여 항상 이긴다
// (클래스 문자열의 순서는 아무 영향이 없다). 톤을 바꿀 때는 background prop을 쓴다.
export default function Surface({
  as: Component = "div",
  background = "bg-surface-default",
  className = "",
  children,
  ...props
}) {
  return (
    <Component
      className={`rounded-lg border border-line-default ${background} shadow-surface ${className}`}
      {...props}
    >
      {children}
    </Component>
  );
}
