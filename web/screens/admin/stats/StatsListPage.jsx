import { useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "react-toastify";
import { listProblemStats } from "@/apiClient/stats.js";
import { listDepartments } from "@/apiClient/departments.js";
import { resolveErrorMessage } from "@/apiClient/client.js";
import { useSessionStatus } from "@/hooks/useSessionStatus.js";
import { previewContent } from "@/utils/problemPreview.js";
import { problemStatusLabel, problemTypeLabel, PROBLEM_STATUS_OPTIONS } from "@/utils/problemLabels.js";
import { formatAccuracyRate, isReviewNeeded, REVIEW_ACCURACY_THRESHOLD, REVIEW_MIN_ATTEMPTS } from "@/utils/statsFormat.js";
import { PAGE_SIZE } from "@/utils/pagination.js";
import { buttonClass } from "@/utils/buttonClass.js";
import Surface from "@/components/ui/Surface.jsx";
import Select from "@/components/ui/Select.jsx";
import StatusBadge from "@/components/ui/StatusBadge.jsx";
import DataTable, { TableRow, TableCell } from "@/components/ui/DataTable.jsx";
import ListStateSurface from "@/components/admin/ListStateSurface.jsx";
import Pagination from "@/components/ui/Pagination.jsx";

function formatAt(value) {
  if (!value) return "-";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "-" : date.toLocaleDateString();
}

export default function StatsListPage() {
  const { session } = useSessionStatus();
  const isSuperAdmin = session?.role === "SUPER_ADMIN";

  const [items, setItems] = useState([]);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);

  const [departments, setDepartments] = useState([]);
  const [departmentId, setDepartmentId] = useState("");
  const [status, setStatus] = useState("ALL");

  useEffect(() => {
    // 부서 관리자 세션으로 /api/admin/departments 를 부르면 403 이므로 아예 부르지 않는다.
    if (isSuperAdmin) {
      listDepartments().then(setDepartments).catch(() => setDepartments([]));
    }
  }, [isSuperAdmin]);

  async function refresh(nextPage = page, nextDepartmentId = departmentId, nextStatus = status) {
    setLoading(true);
    setLoadError(null);
    try {
      const result = await listProblemStats({
        departmentId: isSuperAdmin ? nextDepartmentId : undefined,
        status: nextStatus === "ALL" ? undefined : nextStatus,
        page: nextPage,
        size: PAGE_SIZE,
      });
      setItems(result.items);
      setTotalCount(result.totalCount);
      setPage(result.page);
    } catch (error) {
      const message = resolveErrorMessage(error, "통계를 불러오지 못했습니다.");
      setLoadError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh(1, departmentId, status);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [departmentId, status, isSuperAdmin]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-page-title font-extrabold tracking-title text-ink-strong">문제별 정답률 통계</h1>
        <p className="mt-1 text-body-small text-ink-muted">
          정답률이 낮은 문제가 위에 옵니다. 보관된 문제의 시도 기록도 함께 집계합니다.
        </p>
      </div>

      <Surface className="p-5">
        <div className="flex flex-wrap items-end gap-3">
          {isSuperAdmin && (
            <Select
              id="stats-department-filter"
              label="부서"
              value={departmentId}
              onChange={(event) => setDepartmentId(event.target.value)}
              options={[
                { value: "", label: "전체 부서" },
                ...departments.map((department) => ({ value: String(department.id), label: department.name })),
              ]}
              className="w-48"
            />
          )}
          <Select
            id="stats-status-filter"
            label="상태"
            value={status}
            onChange={(event) => setStatus(event.target.value)}
            options={PROBLEM_STATUS_OPTIONS}
            className="w-36"
          />
        </div>
      </Surface>

      {!loading && !loadError && (
        <p className="text-body-small text-ink-muted">
          전체 {totalCount}건 · 검토 필요 판정 기준은 시도 {REVIEW_MIN_ATTEMPTS}회 이상 · 정답률 {REVIEW_ACCURACY_THRESHOLD * 100}% 미만입니다.
        </p>
      )}

      <ListStateSurface
        loading={loading}
        loadingMessage="통계를 불러오는 중입니다..."
        error={loadError}
        onRetry={() => refresh()}
        isEmpty={items.length === 0}
        emptyTitle="집계할 문제가 없습니다."
        emptyDescription="조건을 바꾸거나, 문제를 등록한 뒤 직원이 풀면 여기에 정답률이 쌓입니다."
      >
        <DataTable
          ariaLabel="문제별 정답률 통계"
          columns={[
            { key: "type", label: "유형" },
            { key: "content", label: "문제" },
            { key: "department", label: "부서" },
            { key: "status", label: "상태" },
            { key: "attempts", label: "시도" },
            { key: "accuracy", label: "정답률" },
            { key: "lastAttempt", label: "최근 시도" },
          ]}
        >
          {items.map((item) => (
            <TableRow key={item.problemId}>
              <TableCell>{problemTypeLabel(item.type)}</TableCell>
              <TableCell className="max-w-xs truncate" title={previewContent(item.content)}>
                <Link
                  href={`/admin/stats/${item.problemId}`}
                  className="rounded-sm text-action-secondary-text hover:underline focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-brand-aqua"
                >
                  {previewContent(item.content)}
                </Link>
              </TableCell>
              <TableCell>{item.departmentName}</TableCell>
              <TableCell>
                <StatusBadge status={item.status} label={problemStatusLabel(item.status)} />
              </TableCell>
              <TableCell numeric>{item.totalAttempts}</TableCell>
              <TableCell numeric className={isReviewNeeded(item) ? "font-semibold text-danger-text" : ""}>
                {formatAccuracyRate(item.accuracyRate)}
              </TableCell>
              <TableCell>{formatAt(item.lastAttemptAt)}</TableCell>
            </TableRow>
          ))}
        </DataTable>
      </ListStateSurface>

      <Pagination page={page} totalCount={totalCount} onChange={(next) => refresh(next)} />

      <p className="text-body-small text-ink-subtle">
        <Link href="/admin/problems" className={buttonClass({ variant: "secondary", size: "sm" })}>
          문제 관리로 이동
        </Link>
      </p>
    </div>
  );
}
