import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { toast } from "react-toastify";
import { ArrowLeft } from "@phosphor-icons/react";
import Surface from "@/components/ui/Surface.jsx";
import Button from "@/components/ui/Button.jsx";
import { listTeams, startTeamRun } from "@/apiClient/teamRuns.js";
import { resolveErrorMessage } from "@/apiClient/client.js";

/**
 * 한 번 끝낸 팀을 다시 누를 때 나오는 화면. 처음부터 다시 풀지, 틀린 문제만 다시 풀지 고른다.
 *
 * 진행 중인 바퀴가 있는데 이 주소로 직접 들어오면 진행 화면으로 돌려보낸다 — 두 바퀴가
 * 동시에 열리지 않게 한다.
 */
export default function TeamRunChoicePage() {
  const params = useParams();
  const departmentId = Number(params.departmentId);
  const router = useRouter();
  const [team, setTeam] = useState(null);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    listTeams()
      .then((teams) => {
        if (cancelled) return;
        const found = teams.find((t) => t.departmentId === departmentId) ?? null;
        if (found?.activeRun) {
          router.replace(`/solve/problems/${departmentId}/play`);
          return;
        }
        setTeam(found);
        setLoading(false);
      })
      .catch((error) => {
        if (cancelled) return;
        toast.error(resolveErrorMessage(error, "팀 정보를 불러오지 못했습니다."));
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [departmentId, router]);

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

  if (loading) {
    return <p className="px-1 py-10 text-center text-body text-ink-muted">불러오는 중...</p>;
  }

  return (
    <div className="mx-auto w-full max-w-md">
      <Link href="/solve/problems" className="mb-4 inline-flex items-center gap-1 rounded-sm text-body-small font-medium text-ink-default hover:text-ink-strong focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-brand-aqua">
        <ArrowLeft size={16} aria-hidden="true" />
        팀 목록
      </Link>

      <section className="mb-6">
        <h1 className="text-page-title font-bold tracking-title text-ink-strong">{team?.departmentName ?? ""}</h1>
        <p className="mt-1 text-body text-ink-default">
          이미 한 번 푼 팀입니다. 어떻게 풀지 골라 주세요.
        </p>
      </section>

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
        </div>
      </Surface>
    </div>
  );
}
