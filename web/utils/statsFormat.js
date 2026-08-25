/**
 * 통계 화면이 공유하는 표시·판정 규칙. 화면(React)과 분리해 두는 이유는 이 프로젝트에
 * jsdom 이 없어 컴포넌트를 테스트할 수 없기 때문이다 — 판정만이라도 단위 테스트로 고정한다.
 *
 * accuracyRate 는 nullable 이고 null 은 "미응시"를 뜻한다(0% 가 아니다). 서버
 * ProblemStatItem 이 같은 규칙을 쓴다.
 */

/** DashboardServiceImpl.MIN_ATTEMPTS_FOR_REVIEW 와 같아야 한다. */
export const REVIEW_MIN_ATTEMPTS = 5;

/** DashboardServiceImpl.REVIEW_ACCURACY_THRESHOLD 와 같아야 한다. */
export const REVIEW_ACCURACY_THRESHOLD = 0.5;

export function formatAccuracyRate(rate) {
  if (rate === null || rate === undefined) {
    return "미응시";
  }
  return `${Math.round(rate * 100)}%`;
}

/**
 * "지금 고쳐야 할 문제"인지. 서버 DashboardServiceImpl.needsReview 와 같은 조건이며,
 * 통계 목록 화면이 같은 기준으로 강조 표시를 하기 위해 클라이언트에도 둔다.
 */
export function isReviewNeeded(item) {
  if (!item || item.status !== "ACTIVE") return false;
  if (item.totalAttempts < REVIEW_MIN_ATTEMPTS) return false;
  if (item.accuracyRate === null || item.accuracyRate === undefined) return false;
  return item.accuracyRate < REVIEW_ACCURACY_THRESHOLD;
}
