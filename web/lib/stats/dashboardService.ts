import type { DbConn } from "../db/client";
import type { AuthUser } from "../auth/types";
import { findAllProblemStats, countActiveProblems } from "../db/stats";
import { findRecent, type ProblemListItem } from "../db/problems";
import { effectiveDepartmentId, toStatItem, type ProblemStatItem } from "./statsService";

const MIN_ATTEMPTS_FOR_REVIEW = 5;
const REVIEW_ACCURACY_THRESHOLD = 0.5;
const LOW_ACCURACY_LIST_SIZE = 5;
const RECENT_PROBLEM_LIST_SIZE = 5;

/**
 * `DashboardSummaryResponse.java` javadoc 미러. **일곱 지표의 범위가 같지 않다** — 화면이 이
 * 차이를 문구로 밝혀야 한다는 원저자 경고를 그대로 옮긴다.
 *   totalProblems       : 활성 문제만 (정답지 B2)
 *   totalAttempts        : 활성 + 보관 (B3)
 *   totalCorrectAttempts : 활성 + 보관 (B4)
 *   averageAccuracyRate  : 활성 + 보관, 시도 0건이면 null (B5)
 *   reviewNeededCount    : 활성 + 시도 5회 이상 + 정답률 50% 미만 (B7)
 *   lowAccuracyProblems  : reviewNeededCount 와 같은 조건, 정답률 오름차순 최대 5건 (B10·B11)
 */
export interface DashboardSummary {
  totalProblems: number;
  reviewNeededCount: number;
  totalAttempts: number;
  totalCorrectAttempts: number;
  averageAccuracyRate: number | null;
  lowAccuracyProblems: ProblemStatItem[];
  recentProblems: ProblemListItem[];
}

/**
 * `DashboardServiceImpl.needsReview(java:35-40)` 미러. 네 조건이 전부 AND 다(정답지 B7).
 * status가 ACTIVE일 때만(보관 제외, X5), totalAttempts >= 5(X3), accuracyRate != null(미응시
 * 제외, X1), accuracyRate < 0.5(정확히 0.5는 제외, X4). 원저자 주석: "검토 필요 건수와
 * 정답률 낮은 목록이 같은 함수를 안 쓰면 '검토 필요 0건'인데 목록은 0%로 가득 찬 화면이
 * 만들어진다"(B8) — `reviewNeededCount`·`lowAccuracyProblems` 둘 다 반드시 이 함수를 거친다.
 *
 * 실물 데이터의 판별자: ACTIVE·시도 8·정답 4인 문제(정확히 accuracyRate 0.5)가 실측에서
 * `reviewNeededCount` 를 4가 아니라 3으로 만들었다 — `< 0.5` 를 `<= 0.5` 로 잘못 쓰면 이
 * 하나가 조용히 늘어난다.
 */
export function needsReview(item: ProblemStatItem): boolean {
  return item.status === "ACTIVE"
    && item.totalAttempts >= MIN_ATTEMPTS_FOR_REVIEW
    && item.accuracyRate != null
    && item.accuracyRate < REVIEW_ACCURACY_THRESHOLD;
}

/**
 * `DashboardServiceImpl.getSummary(java:42-73)` 미러.
 *
 * **부서 스코프를 두 번 계산한다(정답지 R6·B16, 원주석 `:44-46`).** `findAllProblemStats`·
 * `countActiveProblems` 는 여기서 직접 부르므로(StatsService 를 거치지 않는다) `effectiveDepartmentId`
 * 를 이 함수가 스스로 강제해야 한다. `findRecent` 는 원시 DAO 라 스스로 강제하지 않으므로
 * 같은 `scope` 값을 넘긴다 — 두 곳이 어긋나면 최근 문제 목록만 다른 부서를 보여 준다.
 */
export async function getDashboardSummary(
  db: DbConn, actor: AuthUser, departmentId: number | null,
): Promise<DashboardSummary> {
  const scope = effectiveDepartmentId(actor, departmentId);

  const [allStatRows, totalProblems, recentProblems] = await Promise.all([
    findAllProblemStats(db, scope),
    countActiveProblems(db, scope),
    findRecent(db, scope, RECENT_PROBLEM_LIST_SIZE),
  ]);
  const allStats = allStatRows.map(toStatItem);

  const totalAttempts = allStats.reduce((sum, item) => sum + item.totalAttempts, 0);
  const totalCorrectAttempts = allStats.reduce((sum, item) => sum + item.correctAttempts, 0);
  const averageAccuracyRate = totalAttempts === 0 ? null : totalCorrectAttempts / totalAttempts;

  const reviewTargets = allStats.filter(needsReview);
  // B11: `allStats` 는 `findAllProblemStats`(ACCURACY_ORDER) 가 이미 정답률 오름차순으로
  // 반환한다 — 여기서 재정렬하면 승인된 이탈 ㉠ 이 지운 것을 다시 들여오는 셈이다.
  const lowAccuracyProblems = reviewTargets.slice(0, LOW_ACCURACY_LIST_SIZE);

  return {
    totalProblems,
    reviewNeededCount: reviewTargets.length,
    totalAttempts,
    totalCorrectAttempts,
    averageAccuracyRate,
    lowAccuracyProblems,
    recentProblems,
  };
}
