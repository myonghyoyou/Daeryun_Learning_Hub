// 디자인 시스템 7.12: 빈 상태에는 "데이터가 없습니다"만 두지 않고 다음 행동을 함께 제공한다.
export default function EmptyState({ title, description, action }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-16 text-center">
      <p className="text-body font-semibold text-ink-strong">{title}</p>
      {description && <p className="text-body-small text-ink-muted">{description}</p>}
      {action}
    </div>
  );
}
