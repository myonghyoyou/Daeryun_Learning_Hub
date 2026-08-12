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
   * 이 화면에서 세트를 "그만두는" 두 상황이 공유하는 하나의 동작이다:
   *   1) 문제 로드가 계속 실패할 때(네트워크, 또는 그사이 보관 처리됨)의 탈출구 — 아래
   *      loadError 화면의 버튼.
   *   2) 정상 진행 중 사용자가 능동적으로 그만두는 경우 — 아래 진행 화면의 "그만하고
   *      결과 보기" 버튼.
   * 두 호출부 모두 반드시 이 함수를 거쳐야 한다 — 어느 쪽이든 세트를 벗어나는 동작은
   * "이미 제출한 결과를 지킨다"는 같은 규칙을 따라야 하기 때문이다. 이미 제출한 결과는
   * 지키면서 세트를 지금까지 푼 만큼만으로 끝난 것으로 만들고 결과 화면으로 보낸다.
   * recordResult 를 쓰지 않으므로 못 푼 문제가 오답으로 집계되지 않는다.
   *
   * 예외 — 함수 이름은 handleViewResults 지만 결과를 보여주지 않는 경우가 하나 있다.
   * 아직 한 문제도 풀지 않았다면(index === 0) endSessionEarly 는 problemIds 를 0개로
   * 잘라 결과 화면이 "0문제 중 0개 정답"을 보여주게 된다 — 깨지지는 않지만 보여줄 결과가
   * 없다. 제출한 기록도 없으므로 지킬 것도 없다. 이때는 두 호출부 모두에서 결과 화면
   * 대신 학습 홈으로 보낸다 — 로드 실패 화면과 진행 화면 어느 쪽에서 눌러도 동일하다.
   * 이 분기를 호출부별로 나누지 않고 여기 하나로 모아 둔 것은 의도다: 두 화면이 이
   * 규칙에서 어긋나지 않도록 하기 위함이며, 버튼 문구도 이 분기에 맞춰 호출부마다
   * 삼항식으로 바뀐다("학습 홈으로" vs "결과 보기"/"그만하고 결과 보기").
   */
  function handleViewResults() {
    if (!session) return;
    if (session.index === 0) {
      navigate("/solve");
      return;
    }
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
              {/* handleViewResults 는 아직 아무것도 제출하지 않았으면(index === 0) 결과
                  화면 대신 학습 홈으로 보낸다 — 진행 화면의 "그만하고 결과 보기" 버튼과
                  같은 규칙이다. 문구도 그에 맞춘다. */}
              <Button variant="secondary" size="sm" onClick={handleViewResults}>
                {session.index === 0 ? "학습 홈으로" : "결과 보기"}
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
      <section className="mb-6 flex items-center justify-between gap-3">
        <p className="text-body-small font-medium text-ink-muted">
          {session.index + 1} / {session.problemIds.length}
        </p>
        {/* 진행 중 이탈은 이미 제출한 기록을 잃는 길이 되면 안 된다. 지금까지 푼 만큼으로
            세트를 끝내고 결과 요약을 보여준다(로드 실패 화면의 "결과 보기"와 같은 장치).
            단, 아직 한 문제도 풀지 않았다면(index === 0) 보여줄 결과가 없으므로
            handleViewResults 가 결과 화면 대신 학습 홈으로 보낸다 — 문구도 그에 맞춘다. */}
        <Button variant="secondary" size="sm" onClick={handleViewResults}>
          {session.index === 0 ? "학습 홈으로" : "그만하고 결과 보기"}
        </Button>
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
