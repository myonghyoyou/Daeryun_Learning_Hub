// 디자인 시스템 7.10 DataTable. columns는 <th scope="col">를 생성하고,
// 행은 TableRow/TableCell로 구성해 Task 6의 계정 목록 화면도 동일한 규칙으로 재사용한다.
export default function DataTable({ columns, ariaLabel, children }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[560px] text-left" aria-label={ariaLabel}>
        <thead className="bg-surface-subtle">
          <tr>
            {columns.map((column) => (
              <th
                key={column.key}
                scope="col"
                className={`h-11 px-4 text-label font-bold text-ink-muted ${column.className ?? ""}`}
              >
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

export function TableRow({ children, className = "" }) {
  return (
    <tr className={`border-b border-line-default last:border-b-0 hover:bg-[#F1F8FC] ${className}`}>{children}</tr>
  );
}

export function TableCell({ children, className = "", numeric = false, ...props }) {
  return (
    <td
      className={`h-12 px-4 text-body-small text-ink-default ${numeric ? "text-right tabular-nums" : ""} ${className}`}
      {...props}
    >
      {children}
    </td>
  );
}
