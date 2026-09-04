import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "react-toastify";
import { ArrowLeft, ArrowRight, SpinnerGap } from "@phosphor-icons/react";
import Surface from "@/components/ui/Surface.jsx";
import Button from "@/components/ui/Button.jsx";
import EmptyState from "@/components/ui/EmptyState.jsx";
import { listTeams, startTeamRun } from "@/apiClient/teamRuns.js";
import { resolveErrorMessage } from "@/apiClient/client.js";
import { teamStateLabel } from "@/utils/teamRunLabel.js";

/**
 * 골라서 풀기의 착지 지점. 팀을 고르면 그 팀 문제를 처음부터 끝까지 푼다.
 *
 * 누를 때 세 갈래로 갈린다. 진행 중인 바퀴가 있으면 그 바퀴로, 끝난 바퀴가 있으면
 * 선택 화면으로, 아무것도 없으면 전체 바퀴를 새로 만들어 바로 진행 화면으로 보낸다.
 */
export default function SolveTeamListPage() {
  const router = useRouter();
  const [teams, setTeams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [startingId, setStartingId] = useState(null);

  async function refresh() {
    setLoading(true);
    setError(false);
    try {
      setTeams(await listTeams());
    } catch (err) {
      setError(true);
      toast.error(resolveErrorMessage(err, "팀 목록을 불러오지 못했습니다."));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleClick(team) {
    if (team.activeRun) {
      router.push(`/solve/problems/${team.departmentId}/play`);
      return;
    }
    if (team.hasFinishedRun) {
      router.push(`/solve/problems/${team.departmentId}`);
      return;
    }
    setStartingId(team.departmentId);
    try {
      await startTeamRun(team.departmentId, "ALL");
      router.push(`/solve/problems/${team.departmentId}/play`);
    } catch (err) {
      toast.error(resolveErrorMessage(err, "시작하지 못했습니다."));
    } finally {
      setStartingId(null);
    }
  }

  return (
    <>
      <Link href="/solve" className="mb-4 inline-flex items-center gap-1 rounded-sm text-body-small font-medium text-ink-default hover:text-ink-strong focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-brand-aqua">
        <ArrowLeft size={16} aria-hidden="true" />
        학습 홈
      </Link>

      <section className="mb-5 flex items-center justify-between gap-3">
        <h1 className="text-page-title font-bold tracking-title text-ink-strong">골라서 풀기</h1>
        <Link href="/solve/history" className="rounded-sm text-body-small font-semibold text-action-secondary-text hover:underline focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-brand-aqua">
          내 풀이 이력
        </Link>
      </section>
      <p className="mb-5 text-body text-ink-default">팀을 고르면 그 팀 문제를 처음부터 끝까지 풉니다.</p>

      {loading ? (
        <p className="px-1 py-10 text-center text-body text-ink-muted">불러오는 중...</p>
      ) : error ? (
        <Surface className="p-0">
          <EmptyState
            title="팀 목록을 불러오지 못했습니다."
            description="잠시 후 다시 시도해 주세요."
            action={<Button variant="secondary" size="sm" onClick={refresh}>다시 시도</Button>}
          />
        </Surface>
      ) : (
        <Surface className="overflow-hidden p-0">
          <ul>
            {/*
              문제가 하나도 없는 부서는 서버가 아예 내려보내지 않는다(findTeamCounts 의 HAVING).
              그래서 여기에 "문제 없음" 분기가 없다 — 그런 줄이 오지 않는다.
            */}
            {teams.map((team) => {
              const label = teamStateLabel(team);
              return (
                <li key={team.departmentId} className="border-b border-line-default last:border-b-0">
                  <button
                    type="button"
                    disabled={startingId === team.departmentId}
                    onClick={() => handleClick(team)}
                    className="group flex w-full items-center gap-3 p-4 text-left transition-colors hover:bg-surface-subtle focus-visible:outline focus-visible:outline-[3px] focus-visible:-outline-offset-[3px] focus-visible:outline-brand-aqua disabled:cursor-default disabled:opacity-60 disabled:hover:bg-transparent"
                  >
                    <span className="flex-1 text-body font-semibold text-ink-strong">{team.departmentName}</span>
                    <span className="shrink-0 text-body-small text-ink-muted">{team.totalCount}문제</span>
                    <span
                      className={`shrink-0 rounded-full px-2.5 py-1 text-body-small font-medium ${
                        label.kind === "progress" ? "bg-surface-blue text-info-text"
                          : label.kind === "wrong" ? "bg-surface-subtle text-ink-default"
                          : "bg-surface-subtle text-ink-muted"
                      }`}
                    >
                      {label.text}
                    </span>
                    {/*
                      새 바퀴를 만드는 동안에는 화살표 자리에 로딩을 둔다. 서버 왕복이 끝나야
                      화면이 넘어가는데, 그때까지 흐려지기만 하면 눌린 것인지 알 수 없다.
                    */}
                    {startingId === team.departmentId ? (
                      <SpinnerGap size={16} aria-hidden="true" className="shrink-0 animate-spin text-brand-blue" />
                    ) : (
                      <ArrowRight size={16} aria-hidden="true" className="shrink-0 text-ink-subtle transition-transform group-hover:translate-x-0.5 group-hover:text-brand-blue" />
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </Surface>
      )}
    </>
  );
}
