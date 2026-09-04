import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { toast } from "react-toastify";
import { ArrowLeft } from "@phosphor-icons/react";
import { getProblemStatDetail } from "@/apiClient/stats.js";
import { resolveErrorMessage } from "@/apiClient/client.js";
import PreviewText from "@/components/ui/PreviewText.jsx";
import { problemStatusLabel, problemTypeLabel } from "@/utils/problemLabels.js";
import { formatAccuracyRate } from "@/utils/statsFormat.js";
import Surface from "@/components/ui/Surface.jsx";
import StatusBadge from "@/components/ui/StatusBadge.jsx";
import Button from "@/components/ui/Button.jsx";
import EmptyState from "@/components/ui/EmptyState.jsx";

function formatAt(value) {
  if (!value) return "-";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "-" : date.toLocaleString();
}

function Metric({ label, value, note }) {
  return (
    <Surface className="p-5">
      <p className="text-label font-bold text-ink-muted">{label}</p>
      <p className="mt-1 text-display font-extrabold tracking-title tabular-nums text-ink-strong">{value}</p>
      {note && <p className="mt-1 text-body-small text-ink-subtle">{note}</p>}
    </Surface>
  );
}

export default function StatsDetailPage() {
  const { id } = useParams();
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);

  function load() {
    setLoading(true);
    setLoadError(null);
    getProblemStatDetail(id)
      .then(setDetail)
      .catch((error) => {
        const message = resolveErrorMessage(error, "상세 통계를 불러오지 못했습니다.");
        setLoadError(message);
        toast.error(message);
      })
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // 로딩·오류 상태에서도 통계 목록 back-link 는 사라지면 안 된다(디자인 계약: 로딩 시
  // Header·필터 위치는 유지하고 metric·표·상세 영역만 Skeleton 처리한다) — 그래서 back-link 는
  // 아래 분기 밖에서 항상 렌더링하고, summary 가 필요한 제목·metric·표만 분기 안에 둔다.
  const backLink = (
    <Link
      href="/admin/stats"
      className="inline-flex items-center gap-1 rounded-sm text-body-small font-medium text-ink-default hover:text-ink-strong focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-brand-aqua"
    >
      <ArrowLeft size={16} aria-hidden="true" />
      통계 목록
    </Link>
  );

  if (loading) {
    return (
      <div className="space-y-6">
        {backLink}
        <p className="px-1 py-10 text-center text-body-small text-ink-muted">통계를 불러오는 중입니다...</p>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="space-y-6">
        {backLink}
        <Surface className="p-0">
          <EmptyState
            title="상세 통계를 불러오지 못했습니다."
            description={loadError}
            action={<Button variant="secondary" size="sm" onClick={load}>다시 시도</Button>}
          />
        </Surface>
      </div>
    );
  }

  const { summary, choiceDistribution, excludedAttempts, recentWrongSamples } = detail;
  const maxSelected = choiceDistribution
    ? Math.max(1, ...choiceDistribution.map((choice) => choice.selectedCount))
    : 1;

  return (
    <div className="space-y-6">
      {backLink}

      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-page-title font-extrabold tracking-title text-ink-strong">
            <PreviewText text={summary.content} />
          </h1>
          <p className="mt-1 flex items-center gap-2 text-body-small text-ink-muted">
            {problemTypeLabel(summary.type)}
            <StatusBadge status={summary.status} label={problemStatusLabel(summary.status)} />
            {summary.departmentName}
          </p>
        </div>
        <Link
          href={`/admin/problems/${summary.problemId}/edit`}
          className="shrink-0 rounded-sm text-body-small font-medium text-action-secondary-text hover:underline focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-brand-aqua"
        >
          이 문제 수정하기
        </Link>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <Metric label="총 시도" value={summary.totalAttempts} />
        <Metric label="정답" value={summary.correctAttempts} />
        <Metric label="정답률" value={formatAccuracyRate(summary.accuracyRate)} note="정답 ÷ 총 시도" />
        <Metric label="최근 시도" value={formatAt(summary.lastAttemptAt)} />
      </div>

      {choiceDistribution && (
        <Surface className="p-5">
          <h2 className="text-section-title font-semibold text-ink-strong">보기별 선택 분포</h2>
          <p className="mt-1 text-body-small text-ink-muted">
            어떤 오답에 몰리는지 보면 문제의 어디를 고쳐야 할지 알 수 있습니다.
          </p>
          {excludedAttempts > 0 && (
            <p className="mt-2 rounded-sm bg-warning-bg px-3 py-2 text-body-small text-warning-text">
              시도 {excludedAttempts}건은 이 분포에 반영되지 않았습니다. 아무 보기도 고르지 않았거나,
              문제를 수정하면서 보기 구성이 바뀌어 그 이전 기록을 지금의 보기와 맞출 수 없는 경우입니다.
            </p>
          )}
          <ul className="mt-4 space-y-3">
            {choiceDistribution.map((choice) => (
              <li key={choice.choiceId}>
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-body text-ink-strong">{choice.choiceText}</span>
                  <span className="shrink-0 text-body-small tabular-nums text-ink-muted">{choice.selectedCount}회</span>
                </div>
                <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-surface-subtle">
                  <div
                    className="h-full rounded-full bg-progress-bg"
                    style={{ width: `${Math.round((choice.selectedCount / maxSelected) * 100)}%` }}
                  />
                </div>
              </li>
            ))}
          </ul>
        </Surface>
      )}

      <Surface className="p-5">
        <h2 className="text-section-title font-semibold text-ink-strong">최근 오답 제출</h2>
        {recentWrongSamples.length === 0 ? (
          <p className="mt-2 text-body-small text-ink-muted">오답 기록이 없습니다.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {recentWrongSamples.map((sample, index) => (
              <li key={index} className="flex items-baseline justify-between gap-3 border-b border-line-default pb-2 last:border-b-0 last:pb-0">
                <span className="text-body text-ink-strong">{sample.submittedAnswer || "-"}</span>
                <span className="shrink-0 text-body-small text-ink-subtle">{formatAt(sample.submittedAt)}</span>
              </li>
            ))}
          </ul>
        )}
      </Surface>
    </div>
  );
}
