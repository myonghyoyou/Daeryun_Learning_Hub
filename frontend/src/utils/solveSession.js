/**
 * 랜덤 풀이 세트의 진행 상태를 다루는 순수 함수.
 *
 * 세트는 sessionStorage 에 보관한다(새로고침을 견디되 서버 테이블은 만들지 않는다).
 * 저장소 접근은 화면이 하고 이 파일은 상태 계산만 한다 — 이 프로젝트에는 jsdom 이 없어
 * sessionStorage 를 쓰는 코드는 테스트할 수 없기 때문이다. 여기 있는 함수는 인자를 변형하지
 * 않고 새 객체를 반환한다.
 */
export const SESSION_STORAGE_KEY = "solve-random-session";

export function createSession(problems) {
  const list = problems.map((p) => ({ id: p.id, type: p.type, content: p.content }));
  return {
    problemIds: list.map((p) => p.id),
    problems: list,
    index: 0,
    results: [],
  };
}

export function currentProblemId(session) {
  return session.index < session.problemIds.length ? session.problemIds[session.index] : null;
}

export function problemById(session, id) {
  return session.problems?.find((p) => p.id === id);
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
    problems: session.problems,
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

/**
 * sessionStorage 에 저장된 원본 문자열을 세션으로 파싱한다. 사용자가 개발자 도구로 값을
 * 지우거나 고칠 수 있으므로 없거나·JSON이 깨졌거나·형태가 아니면 null을 돌려준다 —
 * 호출부(화면)가 설정 화면으로 돌려보낸다.
 *
 * sessionStorage 접근은 화면이 하고(alias 없이 이 파일을 node --test 로 돌리기 위해)
 * 이 함수는 문자열을 받아 파싱·검증만 하는 순수 함수다.
 */
export function parseSession(raw) {
  if (!raw) return null;
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  if (!Array.isArray(parsed.problemIds)) return null;
  if (typeof parsed.index !== "number") return null;
  if (!Array.isArray(parsed.results)) return null;
  if (!Array.isArray(parsed.problems)) return null;
  return parsed;
}

/**
 * 세트를 지금까지 푼 만큼만 남기고 끝난 것으로 만든다. 진행 중 문제 로드가 계속 실패할 때
 * (네트워크 문제, 또는 그사이 문제가 보관 처리됨) 이미 제출한 기록은 지키면서 결과 화면으로
 * 빠져나가는 탈출구로 쓴다. problemIds 를 index 까지 잘라 isFinished 가 참이 되게 하고,
 * results 는 손대지 않으므로 summarize().total(푼 개수)은 그대로다.
 */
export function endSessionEarly(session) {
  return {
    problemIds: session.problemIds.slice(0, session.index),
    problems: session.problems,
    index: session.index,
    results: session.results,
  };
}
