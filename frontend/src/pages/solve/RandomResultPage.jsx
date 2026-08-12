import { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import Surface from "@/components/ui/Surface.jsx";
import Button from "@/components/ui/Button.jsx";
import SolveShell from "@/pages/solve/SolveShell.jsx";
import { SESSION_STORAGE_KEY, summarize, parseSession, isFinished } from "@/utils/solveSession.js";

/**
 * 랜덤 세트 결과 요약 화면. 세션은 마운트 시 한 번만 읽어 state에 담아 두고(useState lazy
 * init), 화면을 그린 뒤 sessionStorage의 세션은 지운다 — 뒤로 가기로 다 푼 세트에 다시
 * 들어가는 것을 막기 위해서다. state의 session은 지우지 않으므로 같은 컴포넌트 인스턴스가
 * 다시 렌더되어도(예: StrictMode 이중 실행) 리다이렉트 effect가 다시 발동하지 않는다 —
 * effect는 session state 자체가 아니라 sessionStorage를 지우고, session state는 그대로다.
 *
 * 세션이 아직 끝나지 않았으면(예: 진행 중에 이 URL을 직접 입력) 부분 집계를 그리지 않고
 * 진행 화면으로 돌려보낸다 — 이때는 세션을 지우지 않아 세트로 계속 돌아갈 수 있다.
 */
export default function RandomResultPage() {
  const navigate = useNavigate();
  const [session] = useState(() => parseSession(sessionStorage.getItem(SESSION_STORAGE_KEY)));

  useEffect(() => {
    if (!session) {
      navigate("/solve/random", { replace: true });
      return;
    }
    if (!isFinished(session)) {
      navigate("/solve/random/play", { replace: true });
      return;
    }
    sessionStorage.removeItem(SESSION_STORAGE_KEY);
  }, [session, navigate]);

  if (!session || !isFinished(session)) {
    return (
      <SolveShell>
        <p className="px-1 py-10 text-center text-body text-ink-muted">이동 중...</p>
      </SolveShell>
    );
  }

  const { total, correctCount } = summarize(session);

  return (
    <SolveShell>
      <section className="mb-6">
        <h1 className="text-page-title font-bold tracking-title text-ink-strong">결과 요약</h1>
      </section>

      <Surface className="max-w-md p-6 text-center">
        <p className="text-body text-ink-default">
          {total}문제 중 <span className="text-section-title font-bold text-ink-strong">{correctCount}개</span> 정답
        </p>

        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <Link to="/solve/random">
            <Button size="md">다시 랜덤으로 풀기</Button>
          </Link>
          <Link to="/solve">
            <Button variant="secondary" size="md">
              학습 홈으로
            </Button>
          </Link>
        </div>
      </Surface>
    </SolveShell>
  );
}
