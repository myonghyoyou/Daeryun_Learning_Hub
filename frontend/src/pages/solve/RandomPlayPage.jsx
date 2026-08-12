import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "react-toastify";
import Surface from "@/components/ui/Surface.jsx";
import Button from "@/components/ui/Button.jsx";
import SolveShell from "@/pages/solve/SolveShell.jsx";
import ProblemSolveCard from "@/components/solve/ProblemSolveCard.jsx";
import { getSolveProblem } from "@/api/solve.js";
import { resolveErrorMessage } from "@/api/client.js";
import {
  SESSION_STORAGE_KEY,
  currentProblemId,
  isFinished,
  recordResult,
  parseSession,
  endSessionEarly,
} from "@/utils/solveSession.js";

/**
 * 랜덤 세트 진행 화면. 문제를 한 번에 하나씩 보여주고, 채점 결과를 확인할 시간을 준 뒤
 * 사용자가 "다음 문제"를 눌러야 다음으로 넘어간다. 세트를 다 풀면 결과 요약으로 보낸다.
 *
 * 조기 return이 많은 화면이라 훅 순서가 렌더마다 달라지지 않도록 모든 훅을 컴포넌트
 * 최상단에 두고, 리다이렉트는 렌더 도중이 아니라 useEffect 안에서만 한다.
 */
export default function RandomPlayPage() {
  const navigate = useNavigate();
  const [session, setSession] = useState(() => parseSession(sessionStorage.getItem(SESSION_STORAGE_KEY)));
  const [problem, setProblem] = useState(null);
  const [loadError, setLoadError] = useState(false);
  const [submittedResult, setSubmittedResult] = useState(null);
  const [retryCount, setRetryCount] = useState(0);

  const problemId = session ? currentProblemId(session) : null;

  useEffect(() => {
    if (!session) {
      navigate("/solve/random", { replace: true });
      return;
    }
    if (isFinished(session)) {
      navigate("/solve/random/result", { replace: true });
    }
  }, [session, navigate]);

  useEffect(() => {
    if (problemId === null) return;
    let cancelled = false;
    setProblem(null);
    setLoadError(false);
    setSubmittedResult(null);
    getSolveProblem(problemId)
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
  }, [problemId, retryCount]);

  function handleNext() {
    if (!session || !submittedResult) return;
    const next = recordResult(session, submittedResult.correct);
    sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(next));
    setSession(next);
  }

  function handleRetry() {
    setRetryCount((count) => count + 1);
  }

  /**
   * 문제 로드가 계속 실패할 때(네트워크, 또는 그사이 보관 처리됨)의 탈출구. 이미 제출한
   * 결과는 지키면서 세트를 지금까지 푼 만큼만으로 끝난 것으로 만들고 결과 화면으로 보낸다.
   * recordResult 를 쓰지 않으므로 못 푼 문제가 오답으로 집계되지 않는다.
   */
  function handleViewResults() {
    if (!session) return;
    const ended = endSessionEarly(session);
    sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(ended));
    navigate("/solve/random/result", { replace: true });
  }

  if (!session || isFinished(session)) {
    return (
      <SolveShell>
        <p className="px-1 py-10 text-center text-body text-ink-muted">이동 중...</p>
      </SolveShell>
    );
  }

  if (loadError) {
    return (
      <SolveShell>
        <Surface className="p-0">
          <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
            <p className="text-body font-semibold text-ink-strong">문제를 불러오지 못했습니다.</p>
            <div className="flex flex-col gap-3 sm:flex-row">
              <Button variant="secondary" size="sm" onClick={handleRetry}>
                다시 시도
              </Button>
              <Button variant="secondary" size="sm" onClick={handleViewResults}>
                결과 보기
              </Button>
            </div>
          </div>
        </Surface>
      </SolveShell>
    );
  }

  if (!problem) {
    return (
      <SolveShell>
        <p className="px-1 py-10 text-center text-body text-ink-muted">불러오는 중...</p>
      </SolveShell>
    );
  }

  return (
    <SolveShell>
      <section className="mb-6">
        <p className="text-body-small font-medium text-ink-muted">
          {session.index + 1} / {session.problemIds.length}
        </p>
      </section>

      <ProblemSolveCard problem={problem} onSubmitted={setSubmittedResult} />

      {submittedResult && (
        <div className="mt-4">
          <Button size="lg" onClick={handleNext}>
            다음 문제
          </Button>
        </div>
      )}
    </SolveShell>
  );
}
