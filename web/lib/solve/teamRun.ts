/**
 * 한 팀을 훑는 "바퀴"의 진행 계산. DB 도 화면도 모르는 순수 함수만 둔다.
 *
 * 문제 줄 세우기는 여기 없다 — SQL 의 ORDER BY 한 곳에만 둔다(lib/db/solveTeams.ts).
 * 같은 규칙을 두 곳에 두면 한쪽만 고치는 사고가 난다.
 */

/** 바퀴에서 한 문제를 지나간 기록. correct 가 null 이면 건너뛴 문제다. */
export type RunResult = { problemId: number; correct: boolean | null };

export function isRunFinished(cursor: number, total: number): boolean {
  return cursor >= total;
}

export function nextCursor(cursor: number, total: number): number {
  return Math.min(cursor + 1, total);
}

/**
 * 화면이 보낸 위치가 지금 위치와 같을 때만 전진한다.
 *
 * 새로고침 뒤 "다음 문제"를 두 번 누르면 두 칸을 건너뛰어 한 문제가 통째로 사라진다.
 * 클라이언트가 자기가 보던 위치를 함께 보내게 하고 여기서 대조해 그것을 막는다.
 */
export function canAdvance(fromCursor: number, cursor: number): boolean {
  return fromCursor === cursor;
}

export function summarizeResults(results: RunResult[]): {
  answeredCount: number;
  correctCount: number;
  wrongProblemIds: number[];
} {
  const answered = results.filter((r) => r.correct !== null);
  return {
    answeredCount: answered.length,
    correctCount: answered.filter((r) => r.correct === true).length,
    wrongProblemIds: answered.filter((r) => r.correct === false).map((r) => r.problemId),
  };
}
