import { useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "react-toastify";
import { ArrowLeft } from "@phosphor-icons/react";
import Surface from "@/components/ui/Surface.jsx";
import DataTable, { TableRow, TableCell } from "@/components/ui/DataTable.jsx";
import EmptyState from "@/components/ui/EmptyState.jsx";
import Button from "@/components/ui/Button.jsx";
import Collapsible from "@/components/ui/Collapsible.jsx";
import SourceBadge from "@/components/ui/SourceBadge.jsx";
import { myAttemptHistory } from "@/apiClient/solve.js";
import { resolveErrorMessage } from "@/apiClient/client.js";
import { previewContent } from "@/utils/problemPreview.js";
import { buttonClass } from "@/utils/buttonClass.js";

const COLUMNS = [
  { key: "problem", label: "문제" },
  { key: "submitted", label: "제출 답안" },
  { key: "result", label: "결과" },
  { key: "at", label: "일시" },
];

function formatAt(value) {
  if (!value) return "-";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "-" : date.toLocaleString();
}

function ResultText({ correct }) {
  return (
    <span className={`font-medium ${correct ? "text-success-text" : "text-danger-text"}`}>
      {correct ? "정답" : "오답"}
    </span>
  );
}

export default function AttemptHistoryPage() {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  function load() {
    setLoading(true);
    setError(false);
    myAttemptHistory()
      .then(setHistory)
      .catch((err) => {
        setError(true);
        toast.error(resolveErrorMessage(err, "이력을 불러오지 못했습니다."));
      })
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <>
      <Link href="/solve" className="mb-4 inline-flex items-center gap-1 rounded-sm text-body-small font-medium text-ink-default hover:text-ink-strong focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-brand-aqua">
        <ArrowLeft size={16} aria-hidden="true" />
        학습 홈
      </Link>

      <h1 className="mb-5 text-page-title font-bold tracking-title text-ink-strong">내 풀이 이력</h1>

      {loading ? (
        <p className="px-1 py-10 text-center text-body text-ink-muted">불러오는 중...</p>
      ) : error ? (
        <Surface className="p-0">
          <EmptyState
            title="이력을 불러오지 못했습니다."
            description="잠시 후 다시 시도해 주세요."
            action={<Button variant="secondary" size="sm" onClick={load}>다시 시도</Button>}
          />
        </Surface>
      ) : history.length === 0 ? (
        <Surface className="p-0">
          <EmptyState
            title="아직 푼 문제가 없습니다."
            description="문제를 풀면 여기에서 정답 여부를 확인할 수 있어요."
            action={<Link href="/solve/problems" className={buttonClass({ variant: "primary", size: "sm" })}>문제 풀러 가기</Link>}
          />
        </Surface>
      ) : (
        <>
          {/* PC: 테이블 */}
          <Surface className="hidden p-0 md:block">
            <DataTable columns={COLUMNS} ariaLabel="내 풀이 이력">
              {history.map((item, index) => (
                <TableRow key={index}>
                  <TableCell className="max-w-[320px]">
                    <div className="flex flex-col items-start gap-1">
                      <SourceBadge item={item} />
                      <span className="line-clamp-1 text-ink-strong">{previewContent(item.problemContent)}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Collapsible text={item.submittedAnswer || "-"} collapsedLines={1} />
                  </TableCell>
                  <TableCell><ResultText correct={item.correct} /></TableCell>
                  <TableCell>{formatAt(item.submittedAt)}</TableCell>
                </TableRow>
              ))}
            </DataTable>
          </Surface>

          {/* 모바일: 카드 */}
          <ul className="space-y-2 md:hidden">
            {history.map((item, index) => (
              <li key={index}>
                <Surface className="p-4">
                  <p className="line-clamp-2 text-body text-ink-strong">{previewContent(item.problemContent)}</p>
                  <div className="mt-2 flex items-center gap-2">
                    <SourceBadge item={item} />
                    <ResultText correct={item.correct} />
                  </div>
                  <div className="mt-2">
                    <Collapsible text={`제출: ${item.submittedAnswer || "-"}`} collapsedLines={2} className="text-body-small text-ink-muted" />
                  </div>
                  <p className="mt-1 text-body-small text-ink-subtle">{formatAt(item.submittedAt)}</p>
                </Surface>
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}
