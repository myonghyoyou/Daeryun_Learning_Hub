import Surface from "@/components/ui/Surface.jsx";

/**
 * 학습 홈의 학습 루틴(디자인 시스템 8.2). 서버 상태·알림 없이 학습 방법을 안내하는
 * 정적 카드다. 수요가 없으면 SolveHomePage 에서 이 블록만 지우면 된다.
 */
const ROUTINES = [
  { title: "짧게 자주", body: "한 번에 몰아 풀기보다 10문제씩 자주 푸는 편이 오래 남습니다." },
  { title: "틀린 문제 다시", body: "결과 요약에서 틀린 문제를 확인하고 같은 유형을 한 번 더 풀어 보세요." },
  { title: "부서 밖 문제도", body: "다른 부서 문제도 그대로 풀 수 있습니다. 시야를 넓히는 데 도움이 됩니다." },
];

export default function RoutineCard() {
  return (
    <Surface className="p-5">
      <p className="text-section-title font-semibold text-ink-strong">학습 루틴</p>
      <ul className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-3">
        {ROUTINES.map((routine) => (
          <li key={routine.title} className="rounded-md bg-surface-subtle p-4">
            <p className="text-card-title font-bold text-ink-strong">{routine.title}</p>
            <p className="mt-1 text-body-small text-ink-muted">{routine.body}</p>
          </li>
        ))}
      </ul>
    </Surface>
  );
}
