import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Surface from "@/components/ui/Surface.jsx";
import SourceBadge from "@/components/ui/SourceBadge.jsx";
import {
  SESSION_STORAGE_KEY,
  summarize,
  parseSession,
  isFinished,
  problemById,
} from "@/utils/solveSession.js";
import PreviewText from "@/components/ui/PreviewText.jsx";
import { buttonClass } from "@/utils/buttonClass.js";

/**
 * 랜덤 세트 결과 요약 화면. 세션은 sessionStorage에서 useEffect 안에서 한 번만 읽어(서버
 * 렌더에는 sessionStorage가 없다) state에 담아 두고, 화면을 그린 뒤 sessionStorage의
 * 세션은 지운다 — 뒤로 가기로 다 푼 세트에 다시 들어가는 것을 막기 위해서다. state의
 * session은 지우지 않으므로 같은 컴포넌트 인스턴스가 다시 렌더되어도(예: StrictMode
 * 이중 실행) 리다이렉트 effect가 다시 발동하지 않는다 — effect는 session state 자체가
 * 아니라 sessionStorage를 지우고, session state는 그대로다.
 *
 * sessionChecked는 "아직 sessionStorage를 안 읽음"과 "읽었는데 세션이 없음"을
 * session 값만으로는 구분할 수 없어서 둔 상태다(parseSession(null) === null). 읽기
 * effect가 session을 세팅하는 것과 같은 effect 안에서 sessionChecked를 true로 세우고,
 * 아래 리다이렉트 effect는 sessionChecked가 true가 되기 전에는 아무 판정도 하지 않는다
 * — 그렇지 않으면 아직 안 읽은 첫 렌더의 session === null을 "세션 없음"으로 오판해
 * 실제로는 유효한 세션을 가진 사용자를 설정 화면으로 잘못 돌려보낼 수 있다.
 *
 * 세션이 아직 끝나지 않았으면(예: 진행 중에 이 URL을 직접 입력) 부분 집계를 그리지 않고
 * 진행 화면으로 돌려보낸다 — 이때는 세션을 지우지 않아 세트로 계속 돌아갈 수 있다.
 *
 * 아래 "이동 중..." 렌더 분기는 session이 null인 두 경우(아직 안 읽음 / 읽었는데 없음)와
 * 세션이 아직 안 끝난 경우를 모두 자연스럽게 덮는다 — session은 읽기 effect가 실행되기
 * 전까지 null로 유지되므로 별도 분기 없이 sessionChecked 이전 상태도 이 화면이 보여준다.
 */
export default function RandomResultPage() {
  const router = useRouter();
  const [sessionChecked, setSessionChecked] = useState(false);
  const [session, setSession] = useState(null);

  useEffect(() => {
    setSession(parseSession(sessionStorage.getItem(SESSION_STORAGE_KEY)));
    setSessionChecked(true);
  }, []);

  useEffect(() => {
    if (!sessionChecked) return;
    if (!session) {
      router.replace("/solve/random");
      return;
    }
    if (!isFinished(session)) {
      router.replace("/solve/random/play");
      return;
    }
    sessionStorage.removeItem(SESSION_STORAGE_KEY);
  }, [sessionChecked, session, router]);

  if (!session || !isFinished(session)) {
    return (
      <p className="px-1 py-10 text-center text-body text-ink-muted">이동 중...</p>
    );
  }

  const { total, correctCount } = summarize(session);

  return (
    // 랜덤 설정 화면과 같은 이유로 제목과 카드를 한 컬럼으로 묶어 중앙에 둔다
    // (RandomSetupPage 주석 참고).
    <div className="mx-auto w-full max-w-2xl">
      <section className="mb-6">
        <h1 className="text-page-title font-bold tracking-title text-ink-strong">결과 요약</h1>
      </section>

      <Surface className="p-6">
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
                {/*
                  줄 높이를 본문(22px)에 맞춘다. 번호와 결과는 12px/18px 이라 그대로 두면
                  위쪽 정렬에서 첫 줄 밑선이 본문보다 3px 남짓 올라간다.
                */}
                <span className="shrink-0 text-body-small font-medium leading-[22px] text-ink-muted">{index + 1}</span>
                <span className="line-clamp-2 flex-1 text-body text-ink-strong">
                  {problem?.content ? <PreviewText text={problem.content} /> : "(불러올 수 없는 문제)"}
                </span>
                <SourceBadge item={problem} />
                <span
                  className={`shrink-0 text-body-small font-semibold leading-[22px] ${
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
          <Link href="/solve/random" className={buttonClass({ variant: "primary", size: "md" })}>
            다시 랜덤으로 풀기
          </Link>
          <Link href="/solve" className={buttonClass({ variant: "secondary", size: "md" })}>
            학습 홈으로
          </Link>
        </div>
      </Surface>
    </div>
  );
}
