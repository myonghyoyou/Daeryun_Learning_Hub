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
   * "제출한 결과를 지킨다"는 같은 규칙을 따라야 하기 때문이다. 세트를 지금까지 푼
   * 만큼만으로 끝난 것으로 만들고 결과 화면으로 보낸다.
   *
   * "제출한 결과"에는 **아직 세션에 반영되지 않은, 방금 채점된 답**도 포함된다.
   * handleNext(다음 문제 버튼)를 눌러야 recordResult 가 session 에 실제로 기록되므로,
   * 문제를 풀고 채점 결과를 보고 있는 상태에서(submittedResult 가 있는데 "다음 문제"를
   * 아직 안 누른 상태) 바로 그만두면 session 은 그 제출을 모른다. 이 함수가 먼저
   * submittedResult 를 recordResult 로 반영한 뒤 endSessionEarly 를 호출하는 이유가
   * 그것이다 — 그렇지 않으면 방금 채점된 답이 결과 요약에서 통째로 빠진다.
   * recordResult 를 아예 안 쓰는 게 아니라, 대기 중인 제출이 있을 때만 딱 한 번 쓴다 —
   * 못 푼 문제가 오답으로 집계되는 일은 없다(currentProblemId 가 null 이면
   * recordResult 는 아무것도 하지 않고 session 을 그대로 돌려준다).
   *
   * 예외 — 함수 이름은 handleViewResults 지만 결과를 보여주지 않는 경우가 하나 있다.
   * (대기 중인 제출을 반영한 뒤에도) 푼 문제가 하나도 없다면 endSessionEarly 는
   * problemIds 를 0개로 잘라 결과 화면이 "0문제 중 0개 정답"을 보여주게 된다 — 깨지지는
   * 않지만 보여줄 결과가 없다. 지킬 기록도 없으므로 이때는 결과 화면 대신 학습 홈으로
   * 보낸다. 판정은 반드시 반영 **후**의 index(base.index)로 해야 한다 — 반영 전
   * session.index 로 판정하면, 첫 문제를 막 제출하고 바로 그만두는 경우 그 한 문제가
   * 사라진 채로 "아무것도 안 풀었다"고 취급해 버린다.
   * 이 두 규칙(대기 제출 반영, 반영 후 index 로 판정)은 호출부별로 나누지 않고 여기
   * 하나로 모아 둔 것이 의도다 — 로드 실패 화면과 진행 화면이 이 규칙에서 어긋나지
   * 않도록 하기 위함이며, 버튼 문구도 같은 조건(effective index === 0)에 맞춰 호출부마다
   * 삼항식으로 바뀐다("학습 홈으로" vs "결과 보기"/"그만하고 결과 보기"). 로드 실패
   * 화면에서는 문제를 못 불러온 상태라 submittedResult 가 항상 null 이므로 이 분기의
   * 영향이 사실상 없다(반영 전과 반영 후 index 가 같다) — 그래도 같은 함수를 거치므로
   * 규칙은 동일하게 적용된다.
   */
  function handleViewResults() {
    if (!session) return;
    const base = submittedResult ? recordResult(session, submittedResult.correct) : session;
    if (base.index === 0) {
      navigate("/solve");
      return;
    }
    const ended = endSessionEarly(base);
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

  // handleViewResults 가 실제로 판정하는 것과 같은 조건. session.index 만 보면 "채점
  // 결과를 보고 있지만 아직 다음 문제를 안 누른" 상태(submittedResult 있음)를 "아무것도
  // 안 풀었다"로 잘못 취급한다 — 대기 중인 제출을 반영한 뒤의 index 로 판정해야 한다.
  const noResultsToShow = session.index === 0 && !submittedResult;

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
              {/* handleViewResults 는 (대기 중인 제출을 반영해도) 보여줄 결과가 없으면
                  결과 화면 대신 학습 홈으로 보낸다 — 진행 화면의 "그만하고 결과 보기"
                  버튼과 같은 규칙이다. 문구도 그에 맞춘다. 이 화면은 문제를 못 불러온
                  상태라 submittedResult 가 항상 null 이므로 noResultsToShow 는 사실상
                  session.index === 0 과 같다. */}
              <Button variant="secondary" size="sm" onClick={handleViewResults}>
                {noResultsToShow ? "학습 홈으로" : "결과 보기"}
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
        {/* 진행 중 이탈은 제출한 기록을 잃는 길이 되면 안 된다 — 아직 "다음 문제"를
            누르지 않은, 방금 채점된 답도 포함해서다. 지금까지 푼 만큼으로 세트를 끝내고
            결과 요약을 보여준다(로드 실패 화면의 "결과 보기"와 같은 장치). 단, (대기 중인
            제출을 반영해도) 보여줄 결과가 없으면 handleViewResults 가 결과 화면 대신
            학습 홈으로 보낸다 — 문구도 그에 맞춘다. */}
        <Button variant="secondary" size="sm" onClick={handleViewResults}>
          {noResultsToShow ? "학습 홈으로" : "그만하고 결과 보기"}
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
