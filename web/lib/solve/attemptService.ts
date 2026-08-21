import type { AuthUser } from "../auth/types";
import type { Db, DbConn } from "../db/client";
import { findChoicesByProblemId, findAnswersByProblemId, findBlanksByProblemId } from "../db/problemParts";
import { findProblemById, type ProblemRow } from "../db/problems";
import * as attemptDao from "../db/attempts";
import { BizError } from "../http/errors";
import { ErrorCode } from "../http/errorCode";
import { grade, type BlankResult, type GradeInput } from "./grading";
import type { AttemptSubmitBody } from "./attemptRequestBody";
import { PROBLEM_NOT_FOUND_MESSAGE } from "./solveQueryService";

/** `AttemptResult.java` 미러. 응답 키는 정확히 이 세 개다(정답지 G14) — 스프레드로 더 실으면 안 된다. */
export interface AttemptResult {
  correct: boolean;
  explanation: string | null;
  blankResults: BlankResult[] | null;
}

/**
 * DB 행 + 요청 본문 → grade() 의 순수 입력. **유형별로 어떤 DAO 를 부를지가 여기서 갈린다.**
 * 잘못 불러도 예외가 아니라 오답 판정으로 끝난다(빈 배열 → 정답 집합이 비어 있음 → 전부 오답)
 * 는 점이 이 함수의 조용한 위험 지점이다 — 브랜치를 바꿀 때는 반드시 buildGradeInput 을 겨눈
 * 테스트로 확인한다.
 */
async function buildGradeInput(
  db: DbConn, problem: ProblemRow, body: AttemptSubmitBody,
): Promise<GradeInput> {
  switch (problem.type) {
    case "MCQ_SINGLE":
    case "MCQ_MULTI":
    case "OX":
      return {
        type: problem.type,
        choices: await findChoicesByProblemId(db, problem.id),
        selectedChoiceIds: body.selectedChoiceIds,
      };
    case "SHORT_ANSWER":
      return {
        type: "SHORT_ANSWER",
        answers: (await findAnswersByProblemId(db, problem.id)).map((a) => a.answerText),
        submittedText: body.submittedText,
      };
    case "FILL_BLANK":
      // `!` 로 넘기지 마라 — Task 3 에서 같은 자리가 실제 결함이 됐다. `!` 는 타입만 잠재울 뿐
      // 런타임에서 NULL 을 막지 않는다. 생성 검증이 >= 1 을 강제하므로(ProblemServiceImpl.java:441)
      // 도달 불가지만, 도달하면 Java 는 언박싱 NPE 로 죽는다(200/-1). 그 결과를 명시적으로 맞춘다.
      if (problem.blankRevealCount == null || problem.blankRevealCount < 0) {
        throw new BizError(ErrorCode.MSG_PROC_FAIL);
      }
      return {
        type: "FILL_BLANK",
        blanks: await findBlanksByProblemId(db, problem.id),
        blankRevealCount: problem.blankRevealCount,
        blankAnswers: body.blankAnswers,
      };
    default:
      // 열거형상 도달 불가. Java 도 여기서 MSG_PROC_FAIL 을 던진다(SolveServiceImpl.java:163-164).
      // 대응하는 G행은 없다 — `problems.type` 은 varchar 라 TS 가 이 분기를 지워 주지 않으므로
      // **반드시 남겨라.**
      throw new BizError(ErrorCode.MSG_PROC_FAIL);
  }
}

/** attempts·attempt_blank_answers 의 submitted_answer 는 둘 다 varchar(500) 이다. */
const MAX_SUBMITTED_ANSWER_LENGTH = 500;

function truncate(value: string | null): string | null {
  if (value == null) return null;
  return value.length > MAX_SUBMITTED_ANSWER_LENGTH ? value.slice(0, MAX_SUBMITTED_ANSWER_LENGTH) : value;
}

/**
 * `SolveServiceImpl.submit`(java:100-201) 미러.
 *
 * **첫 인자가 `Db` 다 — `DbConn` 이 아니다.** 이 함수가 트랜잭션을 **연다.** 이미 열린 핸들을
 * 받으면 Drizzle 이 SAVEPOINT 로 중첩시켜 트랜잭션 경계 의도가 깨지므로 타입으로 막는다.
 *
 * **승인된 이탈 ㉯.** Spring 은 `@Transactional` 이 없어 `attempts` insert 가 먼저 커밋되고
 * 자식(선택지·빈칸) insert 가 뒤따랐다 — 자식이 실패하면 부모만 남아 사용자는 `-1` 을 보고
 * 재제출했고, 통계는 고아 시도까지 셌다(정답지 T8·T8-1, 실측). 포트는 ① 한 트랜잭션으로
 * 묶고 ② 자식도 부모와 같은 500자 규칙으로 자른다 — 부모의 자르기 주석이 "insert 실패를
 * 막는다"고 이미 밝히고 있으므로, 자식을 자르는 것은 원저자 의도의 완성이다.
 */
export async function submitAttempt(
  db: Db, problemId: number, body: AttemptSubmitBody, actor: AuthUser,
): Promise<AttemptResult> {
  const problem = await findProblemById(db, problemId);
  // G1: 없는 것과 보관된 것이 같은 문구다. Q1 과 자리 두 곳이 같은 상수를 쓴다 —
  // 재타이핑하면 마침표 하나로 두 엔드포인트가 갈라진다.
  if (!problem || problem.status !== "ACTIVE") {
    throw new BizError(ErrorCode.INPUT_VALUE_INVALID, PROBLEM_NOT_FOUND_MESSAGE);
  }

  const result = grade(await buildGradeInput(db, problem, body)); // 검증 실패는 여기서 던진다(G9-G11)

  await db.transaction(async (tx) => {
    const attemptId = await attemptDao.insertAttempt(tx, {
      userId: actor.userId, problemId,
      submittedAnswer: truncate(result.submittedAnswerSummary),
      isCorrect: result.correct,
    });
    // T5: selectedChoices 가 비어 있으면 DAO 가 알아서 아무것도 넣지 않는다.
    await attemptDao.insertAttemptChoices(tx, result.selectedChoices.map((c) => ({
      attemptId, choiceId: c.id, choiceText: c.choiceText,
    })));
    // ㉯ ②: 자식도 부모와 같은 규칙으로 자른다 — Java 는 여기서만 자르지 않아 컬럼 초과로 죽었다.
    await attemptDao.insertAttemptBlankAnswers(tx, (result.blankResults ?? []).map((r) => ({
      attemptId, blankKey: r.blankKey,
      submittedAnswer: truncate(r.submittedAnswer),
      isCorrect: r.correct,
    })));
  });

  return { correct: result.correct, explanation: problem.explanation, blankResults: result.blankResults };
}
