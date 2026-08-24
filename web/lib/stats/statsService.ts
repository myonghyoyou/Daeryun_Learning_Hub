import type { DbConn } from "../db/client";
import {
  type ProblemStatRow, findProblemStats, countProblemStats, findProblemStat,
  findChoiceDistribution, countAnalyzedAttempts, findRecentWrong,
} from "../db/stats";
import { findProblemById } from "../db/problems";
import { findChoicesByProblemId } from "../db/problemParts";
import { assertOwnership } from "../problem/problemService";
import { BizError } from "../http/errors";
import { ErrorCode } from "../http/errorCode";
import type { AuthUser } from "../auth/types";

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;
const RECENT_WRONG_LIMIT = 5;
const CHOICE_TYPES = new Set(["MCQ_SINGLE", "MCQ_MULTI", "OX"]);

export interface ProblemStatItem {
  problemId: number; content: string; type: string; status: string;
  departmentId: number; departmentName: string | null;
  totalAttempts: number; correctAttempts: number;
  accuracyRate: number | null; lastAttemptAt: Date | null;
}

export interface ProblemStatDetail {
  summary: ProblemStatItem;
  choiceDistribution: { choiceId: number; choiceText: string; selectedCount: number }[] | null;
  excludedAttempts: number;
  recentWrongSamples: { submittedAnswer: string | null; submittedAt: Date }[];
}

/**
 * StatsServiceImpl.effectiveDepartmentId(java:69-71) 미러.
 * 총괄은 요청한 부서를, 부서 관리자는 **요청값을 무시하고** 자기 부서를 쓴다.
 * 원주석: "이 스코프는 UI 가 아니라 여기서 강제된다."
 */
export function effectiveDepartmentId(actor: AuthUser, requested: number | null): number | null {
  return actor.role === "SUPER_ADMIN" ? requested : actor.departmentId;
}

/**
 * ProblemStatItem.from(java) 미러. **`totalAttempts === 0` 이면 `null` 이고 이건 "미응시"다
 * — `0` 이 아니다.** 정렬(NULLS LAST)·검토필요 판정(`accuracyRate != null`)·화면 표기가
 * 전부 이 규칙 위에 있다(정답지 X1·X2).
 */
export function toStatItem(row: ProblemStatRow): ProblemStatItem {
  return { ...row, accuracyRate: row.totalAttempts === 0 ? null : row.correctAttempts / row.totalAttempts };
}

function clampPage(page: number): number {
  return page <= 0 ? 1 : page;
}

function clampSize(size: number): number {
  if (size <= 0) return DEFAULT_PAGE_SIZE;
  return Math.min(size, MAX_PAGE_SIZE);
}

/**
 * StatsServiceImpl.listProblemStats(java) 미러. **정렬은 SQL 에만 있다 — 승인된 이탈 ㉠.**
 * Java 는 `LOWEST_ACCURACY_FIRST` 로 서비스에서 한 번 더 정렬하지만 이미 SQL 이 정렬한
 * 페이지에 재적용되는 no-op 이다(정답지 L9·L10). 포트는 여기서 다시 정렬하지 않는다 —
 * 정렬 규칙은 `lib/db/stats.ts` 의 DAO 테스트가 고정한다.
 */
export async function listProblemStats(
  db: DbConn, actor: AuthUser, q: { departmentId: number | null; status: string | null; page: number; size: number },
): Promise<{ items: ProblemStatItem[]; totalCount: number; page: number; size: number }> {
  const page = clampPage(q.page);
  const size = clampSize(q.size);
  const departmentId = effectiveDepartmentId(actor, q.departmentId);
  const filter = { departmentId, status: q.status };
  const [rows, totalCount] = await Promise.all([
    findProblemStats(db, { ...filter, limit: size, offset: (page - 1) * size }),
    countProblemStats(db, filter),
  ]);
  return { items: rows.map(toStatItem), totalCount, page, size };
}

/**
 * StatsServiceImpl.getProblemStatDetail(java:100-128) 미러.
 * **순서가 계약이다(정답지 R8)**: 존재 확인 → `assertOwnership`. 뒤집으면 남의 부서 문제의
 * 존재 여부가 새어 나간다. 문구는 `problemService.getProblemDetail` 과 같은 자리에서 같은
 * 방식으로 던지지만, 여기는 보관 문제도 조회 대상이라 서브플랜 5의 "존재하지 않거나
 * 보관된 문제입니다." 와 다른 문구를 쓴다(정답지 D1).
 */
export async function getProblemStatDetail(db: DbConn, problemId: number, actor: AuthUser): Promise<ProblemStatDetail> {
  const problem = await findProblemById(db, problemId);
  if (!problem) throw new BizError(ErrorCode.INPUT_VALUE_INVALID, "존재하지 않는 문제입니다.");
  assertOwnership(problem, actor);

  const statRow = await findProblemStat(db, problemId);
  // 집계 행이 없을 때(정답지 D6) — LEFT JOIN 이라 항상 한 행이 나오므로 사실상 도달하기
  // 어렵지만, `problem` 에서 합성한다. accuracyRate 는 시도가 없으므로 null 이다(X1 과 같은 규칙).
  const summary: ProblemStatItem = statRow
    ? toStatItem(statRow)
    : {
        problemId: problem.id, content: problem.content, type: problem.type, status: problem.status,
        departmentId: problem.departmentId, departmentName: null,
        totalAttempts: 0, correctAttempts: 0, accuracyRate: null, lastAttemptAt: null,
      };

  let choiceDistribution: { choiceId: number; choiceText: string; selectedCount: number }[] | null = null;
  let excludedAttempts = 0;
  // CHOICE_TYPES 대상 유형만 분포를 조립한다(정답지 D7). SHORT_ANSWER·FILL_BLANK 는 null·0 그대로 둔다(D14).
  if (CHOICE_TYPES.has(problem.type)) {
    const choices = await findChoicesByProblemId(db, problemId);
    const distribution = await findChoiceDistribution(db, problemId);
    const selectedCountByChoiceId = new Map(distribution.map((d) => [d.choiceId, d.selectedCount]));
    // 전체 보기를 돌면서 분포에 없으면 0으로 채운다 — 아무도 안 고른 보기도 남아야 한다(정답지 D8).
    choiceDistribution = choices.map((c) => ({
      choiceId: c.id, choiceText: c.choiceText, selectedCount: selectedCountByChoiceId.get(c.id) ?? 0,
    }));
    const analyzedAttempts = await countAnalyzedAttempts(db, problemId);
    excludedAttempts = Math.max(0, summary.totalAttempts - analyzedAttempts);
  }

  const recentWrongSamples = await findRecentWrong(db, problemId, RECENT_WRONG_LIMIT);

  return { summary, choiceDistribution, excludedAttempts, recentWrongSamples };
}
