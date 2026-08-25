import { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import Surface from "@/components/ui/Surface.jsx";
import SourceBadge from "@/components/ui/SourceBadge.jsx";
import SolveShell from "@/screens/solve/SolveShell.jsx";
import {
  SESSION_STORAGE_KEY,
  summarize,
  parseSession,
  isFinished,
  problemById,
} from "@/utils/solveSession.js";
import { previewContent } from "@/utils/problemPreview.js";
import { buttonClass } from "@/utils/buttonClass.js";

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

      <Surface className="max-w-2xl p-6">
        <p className="text-center text-body text-ink-default">
          {total}문제 중 <span className="text-section-title font-bold text-ink-strong">{correctCount}개</span> 정답
        </p>

        <ul className="mt-6 space-y-2 text-left">
          {session.results.map((r, index) => {
            const problem = problemById(session, r.problemId);
            return (
              <li
                key={index}
                className="flex items-start gap-3 rounded-md border border-line-default p-3"
              >
                <span className="shrink-0 text-body-small font-medium text-ink-muted">{index + 1}</span>
                <span className="line-clamp-2 flex-1 text-body-small text-ink-strong">
                  {previewContent(problem?.content) || "(불러올 수 없는 문제)"}
                </span>
                <SourceBadge item={problem} />
                <span
                  className={`shrink-0 text-body-small font-semibold ${
                    r.correct ? "text-success-text" : "text-danger-text"
                  }`}
                >
                  {r.correct ? "정답" : "오답"}
                </span>
              </li>
            );
          })}
        </ul>

        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <Link to="/solve/random" className={buttonClass({ variant: "primary", size: "md" })}>
            다시 랜덤으로 풀기
          </Link>
          <Link to="/solve" className={buttonClass({ variant: "secondary", size: "md" })}>
            학습 홈으로
          </Link>
        </div>
      </Surface>
    </SolveShell>
  );
}
