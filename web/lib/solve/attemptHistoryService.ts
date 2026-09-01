import { and, eq, inArray } from "drizzle-orm";
import type { DbConn } from "../db/client";
import { findAttemptsByUserId, type AttemptHistoryRow } from "../db/attempts";
import { problemAnswers, problemBlanks, problemChoices } from "../db/schema";

export type AttemptHistoryItem = AttemptHistoryRow & { correctAnswerSummary: string };

const CHOICE_TYPES = new Set(["MCQ_SINGLE", "MCQ_MULTI", "OX"]);

/** problemId 별로 text 를 모아 ", " 로 이어붙인 맵을 만든다. */
function groupJoin(rows: { problemId: number; text: string }[]): Map<number, string> {
  const buckets = new Map<number, string[]>();
  for (const r of rows) {
    if (!buckets.has(r.problemId)) buckets.set(r.problemId, []);
    buckets.get(r.problemId)!.push(r.text);
  }
  return new Map([...buckets.entries()].map(([id, texts]) => [id, texts.join(", ")]));
}

type ProblemText = { problemId: number; text: string };

// 세 헬퍼 모두 problemIds 가 비면 쿼리 없이 빈 배열을 돌려준다 — lib/db/tags.ts 의
// findOrCreateTagsByNames 와 같은 관례다(빈 IN 절도 SQL 상 유효하지만, 굳이 요청을 보내지 않는다).
async function fetchCorrectChoiceTexts(db: DbConn, problemIds: number[]): Promise<ProblemText[]> {
  if (problemIds.length === 0) return [];
  return db.select({ problemId: problemChoices.problemId, text: problemChoices.choiceText })
    .from(problemChoices)
    .where(and(inArray(problemChoices.problemId, problemIds), eq(problemChoices.isCorrect, true)));
}

async function fetchAnswerTexts(db: DbConn, problemIds: number[]): Promise<ProblemText[]> {
  if (problemIds.length === 0) return [];
  // problem_answers 에는 displayOrder 가 없다 — id(삽입 순) 오름차순으로 대신한다
  // (lib/db/problemParts.ts::findAnswersByProblemId 와 같은 관례).
  return db.select({ problemId: problemAnswers.problemId, text: problemAnswers.answerText })
    .from(problemAnswers)
    .where(inArray(problemAnswers.problemId, problemIds))
    .orderBy(problemAnswers.id);
}

async function fetchBlankAnswerTexts(db: DbConn, problemIds: number[]): Promise<ProblemText[]> {
  if (problemIds.length === 0) return [];
  return db.select({ problemId: problemBlanks.problemId, text: problemBlanks.answerText })
    .from(problemBlanks)
    .where(inArray(problemBlanks.problemId, problemIds))
    .orderBy(problemBlanks.displayOrder);
}

/**
 * "내 풀이 이력"에 나오는 문제들의 정답을 배치로 붙인다.
 *
 * 문제당 정답이 여러 개일 수 있어(MCQ_MULTI 의 정답 보기 여러 개, SHORT_ANSWER 의 허용
 * 정답 여러 개, FILL_BLANK 의 빈칸 여러 개) findAttemptsByUserId 의 조인에 그대로
 * 끼워 넣으면 attempts 행이 정답 개수만큼 뻥튀기된다. 대신 이력에 등장한 문제 id 를
 * 유형별로 모아 problem_id IN (...) 로 한 번씩만(최대 3번) 조회해 메모리에서 매핑한다
 * — 이력 행 개수와 무관하게 쿼리 수가 고정된다(N+1 방지).
 *
 * FILL_BLANK 는 실시간 채점(ProblemSolveCard.jsx)의 blank별 정답/오답 매칭과 다르게,
 * 여기서는 해당 문제의 빈칸 정답 전체를 한 줄로 나열한다 — 과거 문제를 복습하는
 * 화면이라 어느 제출값이 어느 빈칸에 대응했는지까지 재현할 필요는 없다는 판단이다.
 */
export async function findAttemptHistoryWithAnswers(db: DbConn, userId: number): Promise<AttemptHistoryItem[]> {
  const rows = await findAttemptsByUserId(db, userId);
  if (rows.length === 0) return [];

  const choiceProblemIds = rows.filter((r) => CHOICE_TYPES.has(r.problemType)).map((r) => r.problemId);
  const answerProblemIds = rows.filter((r) => r.problemType === "SHORT_ANSWER").map((r) => r.problemId);
  const blankProblemIds = rows.filter((r) => r.problemType === "FILL_BLANK").map((r) => r.problemId);

  const [choiceRows, answerRows, blankRows] = await Promise.all([
    fetchCorrectChoiceTexts(db, choiceProblemIds),
    fetchAnswerTexts(db, answerProblemIds),
    fetchBlankAnswerTexts(db, blankProblemIds),
  ]);

  const summaryByProblemId = new Map([
    ...groupJoin(choiceRows),
    ...groupJoin(answerRows),
    ...groupJoin(blankRows),
  ]);

  return rows.map((row) => ({ ...row, correctAnswerSummary: summaryByProblemId.get(row.problemId) ?? "" }));
}
