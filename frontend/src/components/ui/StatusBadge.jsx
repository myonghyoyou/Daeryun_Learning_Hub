// 디자인 시스템 7.9 StatusBadge: 색상 점만으로 상태를 전달하지 않고 텍스트를 함께 표시한다.
const STATUS_STYLE = {
  ACTIVE: { dotClassName: "bg-success-text", textClassName: "text-success-text", label: "활성" },
  INACTIVE: { dotClassName: "bg-danger-text", textClassName: "text-danger-text", label: "비활성" },
  // 보관은 "나쁜 상태"가 아니라 "더 이상 출제되지 않는 상태"라 경고색을 쓰지 않는다.
  ARCHIVED: { dotClassName: "bg-ink-subtle", textClassName: "text-ink-muted", label: "보관됨" },
};

export default function StatusBadge({ status, label }) {
  const style = STATUS_STYLE[status] ?? {
    dotClassName: "bg-ink-subtle",
    textClassName: "text-ink-muted",
    label: status,
  };
  return (
    <span className={`inline-flex items-center gap-1.5 text-body-small font-medium ${style.textClassName}`}>
      <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${style.dotClassName}`} />
      {label ?? style.label}
    </span>
  );
}
