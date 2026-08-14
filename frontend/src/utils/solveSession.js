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
  // 결과 요약 화면이 출처 배지를 그리려면 이 두 값이 세션에 남아야 한다.
  // sessionStorage 에 들어가므로 필요한 것만 골라 담는다.
  const list = problems.map((p) => ({
    id: p.id,
    type: p.type,
    content: p.content,
    departmentName: p.departmentName,
    sourceNumber: p.sourceNumber,
  }));
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
  // 이 필드가 없는 세션은 이 변경 이전에 저장된 옛 세션이다 — 의도적으로 거부한다.
  // 느슨하게 받아 problems 를 빈 배열로 취급하면 세트는 이어지지만 결과 화면이 모든
  // 항목을 "(불러올 수 없는 문제)"로 보여주게 된다. 대신 사용자는 설정 화면으로
  // 돌아가 새 세트를 시작하면 되고, 이미 제출한 답은 서버(attempts 테이블)에 남아 있어
  // 잃는 것은 브라우저 탭 안의 진행 위치뿐이다. 조용히 망가진 결과 화면보다 눈에 보이는
  // 재시작이 낫다는 판단이다.
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
