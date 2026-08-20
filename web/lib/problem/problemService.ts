import type { DbConn } from "../db/client";
import { findDepartmentById } from "../db/departments";
import {
  findProblemById, insertProblem, updateProblem as updateProblemRow, updateProblemStatus,
} from "../db/problems";
import {
  deleteAnswersByProblemId, deleteBlanksByProblemId, deleteChoicesByProblemId,
  findAnswersByProblemId, findBlanksByProblemId, findChoicesByProblemId,
  insertAnswers, insertBlanks, insertChoices,
} from "../db/problemParts";
import { findOrCreateTagsByNames, findTagNamesByProblemId, replaceProblemTags } from "../db/tags";
import { recordAudit } from "../audit/auditLog";
import { BizError } from "../http/errors";
import { ErrorCode } from "../http/errorCode";
import type { AuthUser } from "../auth/types";
import {
  normalizeProblemRequest, normalizeTags, validateProblem, validateSourceNumber,
  type ProblemCreateInput, type ProblemType,
} from "./problemValidation";
import { resolveOwningDepartment } from "./owningDepartment";

const SOURCE_NUMBER_UNIQUE_CONSTRAINT = "uq_problems_department_source_number";

export interface ProblemDetailChoice {
  id: number;
  problemId: number;
  choiceText: string;
  correct: boolean;
  displayOrder: number;
}

export interface ProblemDetailBlank {
  id: number;
  problemId: number;
  blankKey: string;
  answerText: string;
  displayOrder: number;
}

/** Spring ProblemDetailResponse(:14-37) 와 필드·순서가 같다(정답지 D1). */
export interface ProblemDetailResponse {
  id: number;
  type: string;
  content: string;
  imageUrl: string | null;
  referenceText: string | null;
  explanation: string | null;
  blankRevealCount: number | null;
  status: string;
  departmentId: number;
  sourceNumber: number | null;
  choices: ProblemDetailChoice[];
  answers: string[];
  blanks: ProblemDetailBlank[];
  tags: string[];
}

/**
 * 부서 스코프 체크의 단일 관문(ProblemServiceImpl.java:214-218). 총괄 관리자는 전체 부서에
 * 접근하고, 부서 관리자는 자기 부서 문제만 접근한다. 상세조회·수정·보관이 모두 이걸 쓴다.
 */
export function assertOwnership(problem: { departmentId: number }, actor: AuthUser): void {
  if (actor.role !== "SUPER_ADMIN" && problem.departmentId !== actor.departmentId) {
    throw new BizError(ErrorCode.ACCESS_AUTH_DENIED);
  }
}

/**
 * UNIQUE(department_id, source_number) 위반을 사람이 읽는 문구로 바꾼다(정답지 N4).
 * 그대로 두면 handleRoute 의 마지막 분기에 걸려 -1 "처리 중 오류가 발생하였습니다."로만 나간다.
 *
 * 부서명을 id 가 아니라 **이미 조회된 문자열**로 받는다. PostgreSQL 은 문장 하나가 실패하면
 * 트랜잭션 전체를 abort 하므로(25P02), 실패한 쓰기와 같은 트랜잭션에서 부서를 다시 SELECT 하면
 * 그 SELECT 가 새 예외를 던지고 안내 문구는 만들어지지도 못한다 — 2026-08-14 QA-1 Critical 이
 * 정확히 이 모양이었다. **이 함수는 DB 를 건드리지 않는다. 되돌리지 말 것.**
 *
 * postgres.js 는 제약 이름을 `constraint_name` 으로 준다(`constraint` 는 undefined, 정답지 N7).
 */
export function translateDuplicateSourceNumber(error: unknown, departmentName: string, sourceNumber: number): unknown {
  const e = error as { code?: string; constraint_name?: string };
  if (e?.code !== "23505" || e.constraint_name !== SOURCE_NUMBER_UNIQUE_CONSTRAINT) {
    return error; // 다른 UNIQUE 위반이면 번호 탓으로 돌리지 않는다(정답지 N6)
  }
  return new BizError(ErrorCode.INPUT_VALUE_INVALID, `${departmentName} ${sourceNumber}번은 이미 있습니다. 다른 번호를 입력하세요.`);
}

/**
 * 안내 문구에 쓸 부서명을 **쓰기 전에** 읽어 둔다(정답지 N5). 행이 없거나 id 가 null 이면
 * 리터럴 "해당 부서"로 폴백한다(정답지 N8) — 그래야 중복 번호 안내가 부서명을 못 찾아 통째로
 * 무너지지 않는다. Task 7·9 도 이 번역 경로를 재사용하므로 폴백을 테스트로 고정한다.
 */
export async function lookupDepartmentName(conn: DbConn, departmentId: number | null): Promise<string> {
  if (departmentId == null) return "해당 부서";
  const department = await findDepartmentById(conn, departmentId);
  return department?.name ?? "해당 부서";
}

/**
 * 유형에 따라 보기/정답/빈칸을 넣는다(ProblemServiceImpl.java:272-303).
 * displayOrder 는 DAO 가 배열 순서로 1부터 부여한다(정답지 V32) — 여기서 세지 않는다.
 * Task 9(엑셀 업로드)가 그대로 재사용한다.
 */
export async function saveTypeSpecificData(conn: DbConn, problemId: number, req: ProblemCreateInput): Promise<void> {
  switch (req.type) {
    case "MCQ_SINGLE":
    case "MCQ_MULTI":
    case "OX":
      await insertChoices(conn, (req.choices ?? []).map((choice) => ({
        problemId, choiceText: choice.text!, isCorrect: choice.correct,
      })));
      break;
    case "SHORT_ANSWER":
      await insertAnswers(conn, (req.answers ?? []).map((answerText) => ({ problemId, answerText: answerText! })));
      break;
    case "FILL_BLANK":
      await insertBlanks(conn, (req.blanks ?? []).map((blank) => ({
        problemId, blankKey: blank.blankKey!, answerText: blank.answerText!,
      })));
      break;
  }
}

// FILL_BLANK 가 아니면 반드시 null 이다. 유형을 바꿔 저장한 뒤 남은 값이 풀이 화면의 빈칸
// 노출 개수로 잘못 쓰이는 것을 막는다(정답지 V31).
function blankRevealCountToStore(req: ProblemCreateInput): number | null {
  return req.type === "FILL_BLANK" ? req.blankRevealCount ?? null : null;
}

export async function createProblem(
  conn: DbConn, input: ProblemCreateInput, requestedDepartmentId: number | null, actor: AuthUser,
): Promise<void> {
  // 순서 고정(정답지 V1·R12): normalize → validate → validateSourceNumber → 부서 해석.
  const req = normalizeProblemRequest(input);
  validateProblem(req);
  validateSourceNumber(req.sourceNumber);
  const owningDepartmentId = await resolveOwningDepartment(conn, requestedDepartmentId, actor);
  // 부서명은 쓰기 전에 읽어 둔다 — 이유는 translateDuplicateSourceNumber 주석 참고.
  const departmentName = await lookupDepartmentName(conn, owningDepartmentId);

  await conn.transaction(async (tx) => {
    let problemId: number;
    try {
      problemId = await insertProblem(tx, {
        type: req.type,
        content: req.content!,
        imageUrl: req.imageUrl ?? null,
        referenceText: req.referenceText ?? null,
        explanation: req.explanation ?? null,
        blankRevealCount: blankRevealCountToStore(req),
        status: "ACTIVE",
        departmentId: owningDepartmentId,
        sourceNumber: req.sourceNumber ?? null,
        createdBy: actor.userId,
      });
    } catch (error) {
      throw translateDuplicateSourceNumber(error, departmentName, req.sourceNumber!);
    }
    await saveTypeSpecificData(tx, problemId, req);
    // normalizeTags 는 여기서, 쓰기 **뒤에** 부른다. Java 는 이걸 replaceTags 의 인자로 평가하므로
    // (ProblemServiceImpl.java:124 create, :162 update) INSERT/UPDATE 보다 늦다. 위로 끌어올리면
    // 태그 21개 + 이미 쓰인 문항번호일 때 중복 번호 안내 대신 태그 문구가 먼저 나가 순서가 어긋난다.
    await replaceProblemTags(tx, problemId, await findOrCreateTagsByNames(tx, normalizeTags(req.tags)));
    await recordAudit(tx, {
      actorId: actor.userId, action: "PROBLEM_CREATED", targetType: "PROBLEM",
      targetId: problemId, detail: { type: req.type },
    });
  });
}

export async function updateProblem(
  conn: DbConn, id: number, input: ProblemCreateInput, actor: AuthUser,
): Promise<void> {
  // 순서 고정(정답지 V2): 존재 확인 → assertOwnership → 유형 변경 금지 → normalize → validate → 번호.
  const existing = await findProblemById(conn, id);
  if (!existing) throw new BizError(ErrorCode.INPUT_VALUE_INVALID, "존재하지 않는 문제입니다.");
  assertOwnership(existing, actor);
  if (existing.type !== input.type) {
    throw new BizError(ErrorCode.INPUT_VALUE_INVALID, "문제 유형은 수정할 수 없습니다.");
  }
  const req = normalizeProblemRequest(input);
  validateProblem(req);
  validateSourceNumber(req.sourceNumber);
  // 부서명은 쓰기 전에 읽어 둔다 — 이유는 translateDuplicateSourceNumber 주석 참고.
  const departmentName = await lookupDepartmentName(conn, existing.departmentId);

  await conn.transaction(async (tx) => {
    try {
      // type·status·departmentId·createdBy 는 이 경로에서 바뀌지 않는다(ProblemPatch 가 막는다).
      // updated_at 도 DAO 가 찍는다.
      await updateProblemRow(tx, id, {
        content: req.content!,
        imageUrl: req.imageUrl ?? null,
        referenceText: req.referenceText ?? null,
        explanation: req.explanation ?? null,
        blankRevealCount: blankRevealCountToStore(req),
        sourceNumber: req.sourceNumber ?? null,
      });
    } catch (error) {
      throw translateDuplicateSourceNumber(error, departmentName, req.sourceNumber!);
    }
    // 정답지 V30: 기존 보기·정답·빈칸을 전량 삭제한 뒤 재삽입한다.
    await deleteChoicesByProblemId(tx, id);
    await deleteAnswersByProblemId(tx, id);
    await deleteBlanksByProblemId(tx, id);
    await saveTypeSpecificData(tx, id, req);
    // 쓰기 뒤에 정규화한다 — 이유는 createProblem 쪽 같은 줄의 주석 참고.
    await replaceProblemTags(tx, id, await findOrCreateTagsByNames(tx, normalizeTags(req.tags)));
    await recordAudit(tx, {
      actorId: actor.userId, action: "PROBLEM_UPDATED", targetType: "PROBLEM",
      targetId: id, detail: { type: existing.type },
    });
  });
}

export async function archiveProblem(conn: DbConn, id: number, actor: AuthUser): Promise<void> {
  const existing = await findProblemById(conn, id);
  if (!existing) throw new BizError(ErrorCode.INPUT_VALUE_INVALID, "존재하지 않는 문제입니다.");
  assertOwnership(existing, actor);
  await conn.transaction(async (tx) => {
    await updateProblemStatus(tx, id, "ARCHIVED");
    await recordAudit(tx, {
      actorId: actor.userId, action: "PROBLEM_ARCHIVED", targetType: "PROBLEM", targetId: id, detail: {},
    });
  });
}

export async function getProblemDetail(conn: DbConn, id: number, actor: AuthUser): Promise<ProblemDetailResponse> {
  const problem = await findProblemById(conn, id);
  if (!problem) throw new BizError(ErrorCode.INPUT_VALUE_INVALID, "존재하지 않는 문제입니다.");
  assertOwnership(problem, actor);

  const choiceRows = await findChoicesByProblemId(conn, id);
  const answerRows = await findAnswersByProblemId(conn, id);
  const blankRows = await findBlanksByProblemId(conn, id);
  const tags = await findTagNamesByProblemId(conn, id);

  return {
    id: problem.id,
    type: problem.type as ProblemType,
    content: problem.content,
    imageUrl: problem.imageUrl,
    referenceText: problem.referenceText,
    explanation: problem.explanation,
    blankRevealCount: problem.blankRevealCount,
    status: problem.status,
    departmentId: problem.departmentId,
    sourceNumber: problem.sourceNumber,
    // 정답지 D2: 정답 플래그의 이름은 `correct` 다(`isCorrect` 아님). Java 의 ProblemChoice 는
    // `private boolean correct` 라 Jackson 이 `correct` 로 직렬화하고, 프론트도 choice.correct 로
    // 읽는다(ProblemFormPage.jsx:577). Drizzle 행을 그대로 펼치면(...row) 이름이 어긋나는데,
    // 테스트는 초록으로 남고 저장된 MCQ/OX 를 다시 열 때만 정답이 사라진 것처럼 보인다.
    choices: choiceRows.map((row) => ({
      id: row.id, problemId: row.problemId, choiceText: row.choiceText,
      correct: row.isCorrect, displayOrder: row.displayOrder,
    })),
    // 정답지 D4: answers·tags 는 객체가 아니라 문자열 배열이다.
    answers: answerRows.map((row) => row.answerText),
    // 정답지 D3: blanks 는 다섯 필드가 Drizzle 컬럼명과 그대로 일치한다(개명 대상 없음).
    blanks: blankRows.map((row) => ({
      id: row.id, problemId: row.problemId, blankKey: row.blankKey,
      answerText: row.answerText, displayOrder: row.displayOrder,
    })),
    tags,
  };
}
