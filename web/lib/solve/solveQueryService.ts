import { randomInt } from "node:crypto";
import type { DbConn } from "../db/client";
import { findDepartmentById } from "../db/departments";
import { findBlanksByProblemId, findChoicesByProblemId } from "../db/problemParts";
import { findProblemById } from "../db/problems";
import { findActiveSolveProblems, findRandomActiveProblems, type SolveListRow } from "../db/solveProblems";
import { BizError } from "../http/errors";
import { ErrorCode } from "../http/errorCode";

const NOT_FOUND_MESSAGE = "존재하지 않거나 보관된 문제입니다.";

export interface SolveDetail {
  id: number;
  type: string;
  content: string;
  imageUrl: string | null;
  referenceText: string | null;
  choices: { id: number; text: string | null }[] | null;
  blanksToAnswer: string[] | null;
  revealedBlanks: { blankKey: string; answerText: string }[] | null;
  departmentName: string | null;
  sourceNumber: number | null;
}

export async function listSolveProblems(
  db: DbConn,
  f: { keyword?: string | null; tag?: string | null },
): Promise<SolveListRow[]> {
  return findActiveSolveProblems(db, f);
}

export async function randomSolveSet(
  db: DbConn,
  i: { count: number; departmentId?: number | null },
): Promise<SolveListRow[]> {
  const MAX_RANDOM_COUNT = 50;
  // SolveServiceImpl.randomSet(java:50-57) 미러 — count 범위 검증이 여기, 서비스에 있다.
  if (i.count < 1 || i.count > MAX_RANDOM_COUNT) {
    throw new BizError(
      ErrorCode.INPUT_VALUE_INVALID,
      `문제 수는 1 이상 ${MAX_RANDOM_COUNT} 이하여야 합니다.`,
    );
  }
  return findRandomActiveProblems(db, i);
}

/** SolveServiceImpl.selectRandomBlankKeys(java:94-98) 미러 — shuffle 후 앞에서 count 개. */
export function selectRandomBlankKeys(keys: string[], count: number): string[] {
  const shuffled = [...keys];
  for (let i = shuffled.length - 1; i > 0; i -= 1) {
    const j = randomInt(i + 1); // node:crypto — Java 의 SecureRandom 미러. Math.random() 을 쓰지 마라.
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled.slice(0, Math.min(count, shuffled.length));
}

export async function getSolveDetail(db: DbConn, problemId: number): Promise<SolveDetail> {
  const problem = await findProblemById(db, problemId);
  // Q1: 없는 것과 보관된 것이 같은 문구다. 나누지 마라.
  if (!problem || problem.status !== "ACTIVE") {
    throw new BizError(ErrorCode.INPUT_VALUE_INVALID, NOT_FOUND_MESSAGE);
  }

  let choices: SolveDetail["choices"] = null;
  let blanksToAnswer: string[] | null = null;
  let revealedBlanks: SolveDetail["revealedBlanks"] = null;

  if (problem.type === "FILL_BLANK") {
    const blanks = await findBlanksByProblemId(db, problemId);
    // ?? 0 으로 덮지 않는다 — FILL_BLANK 는 생성 검증이 >= 1 을 강제하므로 null 이 될 수
    // 없고, 0 으로 덮으면 "물어볼 빈칸이 없다"는 조용히 틀린 화면이 나온다.
    const selected = selectRandomBlankKeys(blanks.map((b) => b.blankKey), problem.blankRevealCount!);
    blanksToAnswer = selected;
    // Q6: 안 물어보는 칸은 정답째로 내보낸다. 정답 비노출의 승인된 예외다.
    // Q6-1: filter 결과라 항상 배열이다 — 전부 물어보면 [] 이지 null 이 아니다.
    revealedBlanks = blanks
      .filter((b) => !selected.includes(b.blankKey))
      .map((b) => ({ blankKey: b.blankKey, answerText: b.answerText }));
  } else if (problem.type !== "SHORT_ANSWER") {
    // Q4: 단답은 어느 분기에도 들어가지 않아 셋 다 null 로 남는다.
    // Q2/Q3: id 와 text 만. isCorrect 를 절대 실어 보내지 마라.
    choices = (await findChoicesByProblemId(db, problemId)).map((c) => ({ id: c.id, text: c.choiceText }));
  }

  const department = await findDepartmentById(db, problem.departmentId);
  return {
    id: problem.id,
    type: problem.type,
    content: problem.content,
    imageUrl: problem.imageUrl,
    referenceText: problem.referenceText,
    choices,
    blanksToAnswer,
    revealedBlanks,
    departmentName: department?.name ?? null, // Q10: 부서가 없으면 null
    sourceNumber: problem.sourceNumber,
    // Q11: explanation 은 여기 없다. 채점 응답에서만 나온다.
  };
}
