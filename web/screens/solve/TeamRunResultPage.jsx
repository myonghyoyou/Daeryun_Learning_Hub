import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { toast } from "react-toastify";
import Surface from "@/components/ui/Surface.jsx";
import Button from "@/components/ui/Button.jsx";
import { getLatestRun, getRun, listTeams, startTeamRun } from "@/apiClient/teamRuns.js";
import { resolveErrorMessage } from "@/apiClient/client.js";
import PreviewText from "@/components/ui/PreviewText.jsx";

/**
 * 바퀴 결과. 전체 바퀴든 복습 바퀴든 같은 화면, 같은 버튼 두 개다.
 *
 * "이전에 틀린 문제"는 방금 낸 답까지 반영해 매번 다시 계산되므로, 복습을 돌수록 대상이
 * 줄어 결국 0개가 되고 그때 복습 버튼이 비활성화된다.
 */
export default function TeamRunResultPage() {
  const params = useParams();
  const departmentId = Number(params.departmentId);
  const searchParams = useSearchParams();
  const runIdParam = searchParams.get("run");
  const router = useRouter();

  const [run, setRun] = useState(null);
  const [team, setTeam] = useState(null);
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const teams = await listTeams();
        if (cancelled) return;
        setTeam(teams.find((t) => t.departmentId === departmentId) ?? null);
        // run 이 주소에 없으면 그 팀의 마지막 바퀴를 보여 준다(북마크·새로고침).
        // activeRun 으로 되찾으면 안 된다 — 다 푼 뒤에는 항상 null 이라 결과를 못 본다.
        const loaded = runIdParam ? await getRun(Number(runIdParam)) : await getLatestRun(departmentId);
        if (cancelled) return;
        if (!loaded) {
          router.replace("/solve/problems");
          return;
        }
        setRun(loaded);
      } catch (error) {
        if (!cancelled) toast.error(resolveErrorMessage(error, "결과를 불러오지 못했습니다."));
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [departmentId, runIdParam, router]);

  async function start(mode) {
    setStarting(true);
    try {
      await startTeamRun(departmentId, mode);
      router.push(`/solve/problems/${departmentId}/play`);
    } catch (error) {
      toast.error(resolveErrorMessage(error, "시작하지 못했습니다."));
    } finally {
      setStarting(false);
    }
  }

  if (!run) {
    return <p className="px-1 py-10 text-center text-body text-ink-muted">불러오는 중...</p>;
  }

  const wrongProblems = run.results
    .filter((r) => r.correct === false)
    .map((r) => run.problems.find((p) => p.id === r.problemId))
    .filter((p) => p !== undefined);

  return (
    <div className="mx-auto w-full max-w-2xl">
      <section className="mb-6">
        <h1 className="text-page-title font-bold tracking-title text-ink-strong">
          {run.departmentName} 결과
        </h1>
        <p className="mt-1 text-body text-ink-default">
          {run.answeredCount}문제 중 {run.correctCount}문제를 맞혔습니다.
        </p>
      </section>

      {wrongProblems.length > 0 && (
        <Surface className="mb-4 p-5">
          <p className="mb-3 text-section-title font-semibold text-ink-strong">틀린 문제</p>
          <ul className="space-y-2">
            {wrongProblems.map((p) => (
              <li key={p.id} className="text-body text-ink-default">
                <span className="mr-2 text-body-small text-ink-muted">
                  {p.sourceNumber === null ? "번호 없음" : `${p.sourceNumber}번`}
                </span>
                <PreviewText text={p.content} />
              </li>
            ))}
          </ul>
        </Surface>
      )}

      <Surface className="p-5">
        <div className="flex flex-col gap-3">
          <Button type="button" size="md" loading={starting} onClick={() => start("ALL")}>
            처음부터 다시 풀기 ({team?.totalCount ?? 0}문제)
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="md"
            loading={starting}
            disabled={!team || team.wrongCount === 0}
            onClick={() => start("WRONG")}
          >
            {team && team.wrongCount > 0
              ? `이전에 틀린 문제 다시 풀어보기 (${team.wrongCount}문제)`
              : "틀린 문제가 없습니다"}
          </Button>
          <Link
            href="/solve/problems"
            className="rounded-sm text-center text-body-small font-semibold text-action-secondary-text hover:underline focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-brand-aqua"
          >
            팀 목록으로
          </Link>
        </div>
      </Surface>
    </div>
  );
}
