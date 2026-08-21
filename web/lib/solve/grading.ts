import { BizError } from "../http/errors";
import { ErrorCode } from "../http/errorCode";

/**
 * SolveServiceImpl.normalize(java:209-211) 미러 — 채점 **비교용**이다. 저장에는 쓰지 않는다
 * (정답지 T2-1: 저장은 제출 원문 그대로다).
 *
 * Java 와 JS 의 공백 정의가 다르므로 그대로 옮기면 안 된다:
 *  - Java `String.trim()` 은 코드포인트 U+0020 **이하**만 깎는다. JS `trim()` 은 U+00A0 같은
 *    유니코드 공백까지 깎는다.
 *  - Java 정규식 `\s` 는 `[ \t\n\x0B\f\r]`(ASCII). JS `\s` 는 U+00A0·U+3000 등을 포함한다.
 * 한글 문서를 붙여넣으면 U+00A0 가 섞이는 일이 흔해 실제로 갈린다.
 */
const JAVA_WHITESPACE = /[ \t\n\f\r]+/g;

function javaTrim(value: string): string {
  let start = 0;
  let end = value.length;
  while (start < end && value.charCodeAt(start) <= 0x20) start += 1;
  while (end > start && value.charCodeAt(end - 1) <= 0x20) end -= 1;
  return value.slice(start, end);
}

export function normalizeAnswer(value: string | null | undefined): string {
  if (value == null) return "";
  return javaTrim(value).toLowerCase().replace(JAVA_WHITESPACE, " ");
}

export interface BlankResult {
  blankKey: string;
  submittedAnswer: string | null;
  correct: boolean;
  correctAnswer: string;
}

export interface GradeResult {
  correct: boolean;
  submittedAnswerSummary: string | null;
  selectedChoices: { id: number; choiceText: string }[]; // 문제 정의 순서
  blankResults: BlankResult[] | null;
}

export type GradeInput =
  | {
      type: "MCQ_SINGLE" | "MCQ_MULTI" | "OX";
      // problem_choices.choice_text 는 NOT NULL 이다(schema.ts) — null 을 받을 필요가 없다.
      // 반면 attempt_choices.choice_text 는 nullable 이므로 저장 쪽 타입과 다르다.
      choices: { id: number; choiceText: string; isCorrect: boolean }[];
      selectedChoiceIds: number[] | null;
    }
  | { type: "SHORT_ANSWER"; answers: string[]; submittedText: string | null }
  | {
      type: "FILL_BLANK";
      blanks: { blankKey: string; answerText: string }[];
      blankRevealCount: number;
      blankAnswers: { blankKey: string; submittedAnswer: string | null }[] | null;
    };

const BLANK_COUNT_MESSAGE = "제출한 빈칸 개수가 올바르지 않습니다.";

export function grade(input: GradeInput): GradeResult {
  switch (input.type) {
    case "MCQ_SINGLE":
    case "MCQ_MULTI":
    case "OX": {
      const correctIds = new Set(input.choices.filter((c) => c.isCorrect).map((c) => c.id));
      const submittedIds = new Set(input.selectedChoiceIds ?? []); // G3: null → 빈 집합
      const correct =
        correctIds.size === submittedIds.size && [...correctIds].every((id) => submittedIds.has(id));
      // G5·T3: 문제에 정의된 순서로 고정한다. 제출 배열은 순서가 의미 없고 남의 id 가 섞일 수 있다.
      const selectedChoices = input.choices
        .filter((c) => submittedIds.has(c.id))
        .map((c) => ({ id: c.id, choiceText: c.choiceText }));
      return {
        correct,
        selectedChoices,
        blankResults: null,
        submittedAnswerSummary: selectedChoices.map((c) => c.choiceText ?? "").join(", "),
      };
    }
    case "SHORT_ANSWER": {
      const submitted = normalizeAnswer(input.submittedText);
      return {
        correct: input.answers.some((a) => normalizeAnswer(a) === submitted),
        selectedChoices: [],
        blankResults: null,
        submittedAnswerSummary: input.submittedText, // T2-1: 원문 그대로
      };
    }
    case "FILL_BLANK": {
      const submitted = input.blankAnswers ?? [];
      const submittedKeys = new Set(submitted.map((b) => b.blankKey));
      const definedKeys = new Set(input.blanks.map((b) => b.blankKey));
      // G9·G10·G11 이 한 조건으로 묶여 문구가 하나다 — 나누지 마라.
      if (
        submittedKeys.size !== submitted.length ||
        ![...submittedKeys].every((k) => definedKeys.has(k)) ||
        submittedKeys.size !== input.blankRevealCount
      ) {
        throw new BizError(ErrorCode.INPUT_VALUE_INVALID, BLANK_COUNT_MESSAGE);
      }
      // Java 는 Collectors.toMap 을 쓴다 — 정의된 blankKey 가 중복되면 터진다.
      // JS Map 은 동일 키를 조용히 덮어쓴다(마지막 값 유지). 도달 불가능 —
      // problem_blanks 에 (problem_id, blank_key) 유일성 제약이 없어 DB 가 막지 않으므로,
      // 이 가드는 애플리케이션 계층만의 안전망이다(문제 생성 검증이 중복 키를 거부한다).
      const answerByKey = new Map(input.blanks.map((b) => [b.blankKey, b.answerText]));
      const blankResults = submitted.map((s) => {
        const correctAnswer = answerByKey.get(s.blankKey)!;
        return {
          blankKey: s.blankKey,
          submittedAnswer: s.submittedAnswer,
          correct: normalizeAnswer(correctAnswer) === normalizeAnswer(s.submittedAnswer),
          correctAnswer,
        };
      });
      return {
        correct: blankResults.every((r) => r.correct),
        selectedChoices: [],
        blankResults,
        // T4: 답만 잇는다. 키는 화면에 안 나오는 내부 식별자다.
        // Java describeBlanks(:236) 은 String.trim() 을 쓴다 — JS trim() 을 쓰면 U+00A0 같은
        // 유니코드 공백만 입력한 제출이 "(미입력)" 으로 잘못 갈린다(T4).
        submittedAnswerSummary: submitted
          .map((b) => (b.submittedAnswer == null || javaTrim(b.submittedAnswer) === "" ? "(미입력)" : b.submittedAnswer))
          .join(", "),
      };
    }
    // Java 는 default 분기에서 MSG_PROC_FAIL 를 던진다. 여기서는 GradeInput 이 판별 조합 타입이라
    // switch 가 정적으로 완전해져(exhaustive) default 가 도달 불가능하다 —
    // 잘못된 type 값을 실제로 막는 것은 zod 가 아니라 buildGradeInput(Task 4)의 default 분기다.
// `type` 은 요청 필드가 아니라 problems.type(varchar) 에서 온다 — 라우트 검증을 거치지 않는다.
// 여기까지 흘러오면 grade 가 undefined 를 돌려주고 호출부가 TypeError 로 죽는데, handleRoute 가
// 그것을 -1 / "처리 중 오류가 발생하였습니다." 로 바꾸므로 Java 의 MSG_PROC_FAIL 과 결과는 같다.
// 다만 **우연히 같은 것이지 설계된 것이 아니다.** buildGradeInput 의 default 를 지우지 마라.
  }
}
