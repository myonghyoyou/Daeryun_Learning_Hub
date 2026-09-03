import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { toast } from "react-toastify";
import Surface from "@/components/ui/Surface.jsx";
import Button from "@/components/ui/Button.jsx";
import ProblemSolveCard from "@/components/solve/ProblemSolveCard.jsx";
import ProblemSkeleton from "@/components/solve/ProblemSkeleton.jsx";
import { getSolveProblem } from "@/apiClient/solve.js";
import { advanceRun, finishRun, getLatestRun, getRun } from "@/apiClient/teamRuns.js";
import { resolveErrorMessage } from "@/apiClient/client.js";

/**
 * 팀 바퀴 진행 화면. 랜덤 풀기와 같은 카드를 쓰되 진행 상태는 브라우저가 아니라 서버에 있다.
 *
 * 위치를 서버가 들고 있으므로 새로고침해도 같은 문제가 나온다. "다음 문제"를 누를 때
 * 자기가 보던 위치(fromCursor)를 함께 보내, 두 번 눌러도 두 칸 건너뛰지 않게 한다.
 */
export default function TeamRunPlayPage() {
  const params = useParams();
  const departmentId = Number(params.departmentId);
  const router = useRouter();

  const [run, setRun] = useState(null);
  const [problem, setProblem] = useState(null);
  const [loadError, setLoadError] = useState(false);
  const [submittedResult, setSubmittedResult] = useState(null);
  const [advancing, setAdvancing] = useState(false);
  const [retryCount, setRetryCount] = useState(0);

  // 진행 중인 바퀴를 찾아 온다. 없으면 팀 목록으로 돌려보낸다.
  //
  // 팀 목록 전체(listTeams)를 읽지 않는다 — 이 화면은 문제를 넘길 때마다 다시 진입하는데,
  // 그때마다 부서 수만큼 질의가 붙는다. 필요한 것은 이 팀의 바퀴 하나뿐이다.
  useEffect(() => {
    let cancelled = false;
    getLatestRun(departmentId)
      .then((latest) => {
        if (cancelled) return;
        if (!latest || latest.status === "FINISHED") {
          router.replace("/solve/problems");
          return;
        }
        setRun(latest);
      })
      .catch((error) => {
        if (!cancelled) toast.error(resolveErrorMessage(error, "진행 상태를 불러오지 못했습니다."));
      });
    return () => {
      cancelled = true;
    };
  }, [departmentId, router]);

  // problemIds 로 정한다 — problems 로 정하면 문제 행이 지워졌을 때 위치가 한 칸 밀린다.
  const currentId = run && run.cursor < run.total ? run.problemIds[run.cursor] : null;

  useEffect(() => {
    if (currentId === null) return;
    let cancelled = false;
    setProblem(null);
    setLoadError(false);
    setSubmittedResult(null);
    getSolveProblem(currentId)
      .then((data) => {
        if (!cancelled) setProblem(data);
      })
      .catch((error) => {
        if (!cancelled) {
          setLoadError(true);
          toast.error(resolveErrorMessage(error, "문제를 불러오지 못했습니다."));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [currentId, retryCount]);

  async function goNext(correct) {
    if (!run || advancing) return;
    setAdvancing(true);
    try {
      const after = await advanceRun(run.runId, run.cursor, correct);
      if (after.status === "FINISHED") {
        router.replace(`/solve/problems/${departmentId}/result?run=${run.runId}`);
        return;
      }
      setRun(await getRun(run.runId));
    } catch (error) {
      toast.error(resolveErrorMessage(error, "다음 문제로 넘어가지 못했습니다."));
    } finally {
      setAdvancing(false);
    }
  }

  /**
   * 여기서 그만두고 결과로 나간다.
   *
   * 답을 내고 아직 "다음 문제"를 누르지 않은 상태라면 **그 답을 먼저 기록한 뒤** 끝낸다.
   * 그러지 않으면 마지막 문제를 맞히고 그만뒀을 때 결과가 "0문제 중 0문제"로 나온다 —
   * 채점 이력에는 남아 있는데 이 바퀴의 요약에서만 사라지는 것이라 더 헷갈린다.
   */
  async function quit() {
    if (!run || advancing) return;
    setAdvancing(true);
    try {
      if (submittedResult) {
        await advanceRun(run.runId, run.cursor, submittedResult.correct);
      }
      await finishRun(run.runId);
      router.replace(`/solve/problems/${departmentId}/result?run=${run.runId}`);
    } catch (error) {
      toast.error(resolveErrorMessage(error, "그만두지 못했습니다."));
    } finally {
      setAdvancing(false);
    }
  }

  if (!run) {
    return <ProblemSkeleton />;
  }

  return (
    <>
      <div className="mb-4 flex items-center justify-between gap-3">
        <p className="text-body font-semibold text-ink-strong">
          {run.departmentName} · {run.cursor + 1} / {run.total}
          {run.mode === "WRONG" && <span className="ml-2 text-body-small font-medium text-ink-muted">복습</span>}
        </p>
        {/*
          "그만두고 결과 보기"라고 쓰지 않는다. 마지막 문제에서는 아래 버튼도
          "결과 보기"가 되어 두 버튼 이름이 겹친다 — 사용자도, 자동화 테스트도 헷갈린다.
        */}
        <Button variant="secondary" size="sm" loading={advancing} onClick={quit}>
          그만두기
        </Button>
      </div>

      {loadError ? (
        <Surface className="p-5">
          <p className="text-body text-ink-default">문제를 불러오지 못했습니다.</p>
          <div className="mt-3 flex gap-2">
            <Button variant="secondary" size="sm" onClick={() => setRetryCount((c) => c + 1)}>
              다시 시도
            </Button>
            {/*
              보관 처리된 문제일 수 있다. 건너뛸 때는 correct 를 null 로 보내
              맞은 것으로도 틀린 것으로도 세지 않게 한다.
            */}
            <Button variant="secondary" size="sm" loading={advancing} onClick={() => goNext(null)}>
              이 문제 건너뛰기
            </Button>
          </div>
        </Surface>
      ) : !problem ? (
        <ProblemSkeleton />
      ) : (
        <ProblemSolveCard problem={problem} onSubmitted={setSubmittedResult} />
      )}

      {submittedResult && (
        <div className="mt-4">
          <Button size="lg" loading={advancing} onClick={() => goNext(submittedResult.correct)}>
            {run.cursor + 1 >= run.total ? "결과 보기" : "다음 문제"}
          </Button>
        </div>
      )}
    </>
  );
}
