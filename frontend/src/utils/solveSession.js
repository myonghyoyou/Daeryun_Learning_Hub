/**
 * 랜덤 풀이 세트의 진행 상태를 다루는 순수 함수.
 *
 * 세트는 sessionStorage 에 보관한다(새로고침을 견디되 서버 테이블은 만들지 않는다).
 * 저장소 접근은 화면이 하고 이 파일은 상태 계산만 한다 — 이 프로젝트에는 jsdom 이 없어
 * sessionStorage 를 쓰는 코드는 테스트할 수 없기 때문이다. 여기 있는 함수는 인자를 변형하지
 * 않고 새 객체를 반환한다.
 */
export const SESSION_STORAGE_KEY = "solve-random-session";

export function createSession(problemIds) {
  return { problemIds: [...problemIds], index: 0, results: [] };
}

export function currentProblemId(session) {
  return session.index < session.problemIds.length ? session.problemIds[session.index] : null;
}

export function isFinished(session) {
  return session.index >= session.problemIds.length;
}

export function recordResult(session, correct) {
  const problemId = currentProblemId(session);
  if (problemId === null) {
    return session;
  }
  return {
    problemIds: session.problemIds,
    index: session.index + 1,
    results: [...session.results, { problemId, correct }],
  };
}

export function summarize(session) {
  return {
    total: session.results.length,
    correctCount: session.results.filter((r) => r.correct).length,
  };
}
