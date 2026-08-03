// 디자인 시스템 7.7 Surface: White + line + subtle shadow의 독립 기능 영역.
export default function Surface({ as: Component = "div", className = "", children, ...props }) {
  return (
    <Component
      className={`rounded-lg border border-line-default bg-surface-default shadow-surface ${className}`}
      {...props}
    >
      {children}
    </Component>
  );
}
