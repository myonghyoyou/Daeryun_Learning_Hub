import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "react-toastify";
import { Plus } from "@phosphor-icons/react";
import { getDashboardSummary } from "@/api/dashboard.js";
import { listDepartments } from "@/api/departments.js";
import { resolveErrorMessage } from "@/api/client.js";
import { useSessionStatus } from "@/hooks/useSessionStatus.js";
import { previewContent } from "@/utils/problemPreview.js";
import { formatAccuracyRate, REVIEW_MIN_ATTEMPTS } from "@/utils/statsFormat.js";
import { buttonClass } from "@/utils/buttonClass.js";
import Surface from "@/components/ui/Surface.jsx";
import Select from "@/components/ui/Select.jsx";
import Button from "@/components/ui/Button.jsx";
import EmptyState from "@/components/ui/EmptyState.jsx";

function Metric({ label, value, note }) {
  return (
    <Surface className="p-5">
      <p className="text-label font-bold text-ink-muted">{label}</p>
      <p className="mt-1 text-display font-extrabold tracking-title tabular-nums text-ink-strong">{value}</p>
      <p className="mt-1 text-body-small text-ink-subtle">{note}</p>
    </Surface>
  );
}

export default function DashboardPage() {
  const { session } = useSessionStatus();
  const isSuperAdmin = session?.role === "SUPER_ADMIN";

  const [departments, setDepartments] = useState([]);
  const [departmentId, setDepartmentId] = useState("");
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);

  useEffect(() => {
    // 부서 관리자 세션으로 /api/admin/departments 를 부르면 403 이므로 아예 부르지 않는다.
    if (isSuperAdmin) {
      listDepartments().then(setDepartments).catch(() => setDepartments([]));
    }
  }, [isSuperAdmin]);

  function load(nextDepartmentId = departmentId) {
    setLoading(true);
    setLoadError(null);
    getDashboardSummary(isSuperAdmin ? nextDepartmentId || undefined : undefined)
      .then(setSummary)
      .catch((error) => {
        const message = resolveErrorMessage(error, "대시보드를 불러오지 못했습니다.");
        setLoadError(message);
        toast.error(message);
      })
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load(departmentId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSuperAdmin, departmentId]);

  const scopeLabel = isSuperAdmin ? (departmentId ? "선택한 부서 기준" : "전체 부서 기준") : "소속 부서 기준";

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-page-title font-extrabold tracking-title text-ink-strong">관리자 대시보드</h1>
          <p className="mt-1 text-body-small text-ink-muted">{scopeLabel} · 누적 시도 데이터</p>
        </div>
        <Link to="/admin/problems/new" className={buttonClass({ variant: "primary", size: "md" })}>
          <Plus size={16} aria-hidden="true" />
          문제 등록
        </Link>
      </div>

      {isSuperAdmin && (
        <Surface className="p-5">
          <Select
            id="dashboard-department-filter"
            label="부서"
            value={departmentId}
            onChange={(event) => setDepartmentId(event.target.value)}
            options={[
              { value: "", label: "전체 부서" },
              ...departments.map((department) => ({ value: String(department.id), label: department.name })),
            ]}
            className="w-48"
          />
        </Surface>
      )}

      {loading ? (
        <p className="px-1 py-10 text-center text-body-small text-ink-muted">대시보드를 불러오는 중입니다...</p>
      ) : loadError ? (
        <Surface className="p-0">
          <EmptyState
            title="대시보드를 불러오지 못했습니다."
            description="잠시 후 다시 시도해 주세요."
            action={<Button variant="secondary" size="sm" onClick={() => load()}>다시 시도</Button>}
          />
        </Surface>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
            <Metric label="문제 수" value={summary.totalProblems} note="활성 문제만" />
            <Metric
              label="검토 필요 문제"
              value={summary.reviewNeededCount}
              note={`시도 ${REVIEW_MIN_ATTEMPTS}회 이상 · 정답률 50% 미만`}
            />
            <Metric label="전체 시도 수" value={summary.totalAttempts} note="보관 문제 포함" />
            <Metric
              label="평균 정답률"
              value={formatAccuracyRate(summary.averageAccuracyRate)}
              note="전체 정답 ÷ 전체 시도"
            />
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-12">
            <Surface className="p-5 md:col-span-7">
              <h2 className="text-section-title font-semibold text-ink-strong">지금 손봐야 할 문제</h2>
              <p className="mt-1 text-body-small text-ink-muted">
                시도 {REVIEW_MIN_ATTEMPTS}회 이상 쌓였는데 정답률이 50% 아래인 활성 문제입니다.
              </p>
              {summary.lowAccuracyProblems.length === 0 ? (
                <p className="mt-4 text-body-small text-ink-muted">
                  아직 없습니다. 시도가 {REVIEW_MIN_ATTEMPTS}회 이상 쌓인 문제 중 정답률이 낮은 것이 생기면 여기에 나옵니다.{" "}
                  <Link
                    to="/admin/stats"
                    className="rounded-sm text-action-secondary-text hover:underline focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-brand-aqua"
                  >
                    전체 통계 보기
                  </Link>
                </p>
              ) : (
                <ul className="mt-4 space-y-2">
                  {summary.lowAccuracyProblems.map((item) => (
                    <li
                      key={item.problemId}
                      className="flex items-center justify-between gap-3 border-b border-line-default pb-2 last:border-b-0 last:pb-0"
                    >
                      <Link
                        to={`/admin/stats/${item.problemId}`}
                        className="min-w-0 flex-1 truncate rounded-sm text-body text-action-secondary-text hover:underline focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-brand-aqua"
                        title={previewContent(item.content)}
                      >
                        {previewContent(item.content)}
                      </Link>
                      <span className="shrink-0 text-body-small tabular-nums text-danger-text">
                        {formatAccuracyRate(item.accuracyRate)} · {item.totalAttempts}건
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Surface>

            <Surface className="p-5 md:col-span-5">
              <h2 className="text-section-title font-semibold text-ink-strong">최근 등록한 문제</h2>
              {summary.recentProblems.length === 0 ? (
                <p className="mt-4 text-body-small text-ink-muted">
                  아직 등록된 문제가 없습니다. 위 버튼으로 첫 문제를 등록해 보세요.
                </p>
              ) : (
                <ul className="mt-4 space-y-2">
                  {summary.recentProblems.map((problem) => (
                    <li
                      key={problem.id}
                      className="truncate border-b border-line-default pb-2 text-body-small text-ink-default last:border-b-0 last:pb-0"
                      title={previewContent(problem.content)}
                    >
                      {previewContent(problem.content)}
                    </li>
                  ))}
                </ul>
              )}
            </Surface>
          </div>
        </>
      )}
    </div>
  );
}
