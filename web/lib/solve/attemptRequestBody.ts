import { MessageNotReadableError } from "../http/errors";

/**
 * `AttemptSubmitRequest.java`(dto/solve) 미러. 세 필드 모두 선택적이다 — 문제 유형에 따라
 * `buildGradeInput`(attemptService.ts)이 그중 하나만 읽는다.
 *
 * **`toAttemptSubmitBody` 는 셀(엑셀)에 쓰지 마라.** 서브플랜 4 의 `problemRequestBody.ts` 와
 * 같은 경계다 — 이건 JSON 본문 전용이다. 규칙은 그 파일과 같은 Jackson 기본값을 따른다:
 *  - 모르는 필드는 무시한다
 *  - 없는 필드는 Java 필드 기본값(참조형 null)
 *  - 스칼라 ↔ 문자열/숫자 강제변환은 허용, 객체·배열이 스칼라 자리에 오면 실패
 *  - 배열 자리의 단일 값은 실패(ACCEPT_SINGLE_VALUE_AS_ARRAY 기본 off)
 * 실패는 전부 `MessageNotReadableError` 를 던진다 — 메시지에 필드 경로(`blankAnswers[2].blankKey`)를
 * 남기지만 로그용이며 사용자에게는 나가지 않는다(E6).
 */
export interface AttemptSubmitBody {
  selectedChoiceIds: number[] | null;
  submittedText: string | null;
  blankAnswers: { blankKey: string; submittedAnswer: string | null }[] | null;
}

function unreadable(field: string): never {
  throw new MessageNotReadableError(field);
}

// Jackson StringDeserializer: number·boolean 은 문자열로 강제변환, 객체·배열은 실패.
function readString(value: unknown, field: string): string | null {
  if (value == null) return null;
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return unreadable(field);
}

function readArray(value: unknown, field: string): unknown[] | null {
  if (value == null) return null;
  if (Array.isArray(value)) return value;
  return unreadable(field);
}

function readRecord(value: unknown, field: string): Record<string, unknown> | null {
  if (value == null) return null;
  if (typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  return unreadable(field);
}

// Jackson Long: 정수 문자열은 변환, 실수는 절삭(ACCEPT_FLOAT_AS_INT), 빈 문자열은 null,
// boolean·객체·배열은 실패. `selectedChoiceIds` 원소는 boxed Long 이라 JSON `null` 원소를
// 허용한다(HashSet 이 null 을 받아 그냥 어느 정답 id 와도 안 맞을 뿐이다) — 그래서 null 은
// unreadable 이 아니라 null 그대로 남긴다(problemRequestBody.ts 의 readLong 과 같은 규칙).
function readLongElement(value: unknown, field: string): number | null {
  if (value == null) return null;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return unreadable(field);
    const truncated = Math.trunc(value);
    if (!Number.isSafeInteger(truncated)) return unreadable(field);
    return truncated;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed === "") return null;
    if (!/^[+-]?\d+$/.test(trimmed)) return unreadable(field);
    const n = Number(trimmed);
    if (!Number.isSafeInteger(n)) return unreadable(field);
    return n;
  }
  return unreadable(field);
}

function readSelectedChoiceIds(value: unknown): number[] | null {
  const array = readArray(value, "selectedChoiceIds");
  if (array == null) return null;
  return array.map((element, index) => readLongElement(element, `selectedChoiceIds[${index}]`)) as number[];
}

// BlankAnswerInput.java 미러. 원소가 null 이면 problemRequestBody.ts 의 readChoices/readBlanks
// 와 같은 관용구를 따른다 — Java 는 null 원소에서 NPE(500)로 죽지만, 그 실패를 그대로 옮기는 것은
// 이 필드의 목적(빈칸 채점)에 아무 값도 더하지 않는다. blankKey 가 null 이면 뒤의 grade() 가
// "정의된 키가 아니다" 로 자연스럽게 실패시킨다(G10) — 여기서 따로 막지 않는다.
function readBlankAnswers(value: unknown): AttemptSubmitBody["blankAnswers"] {
  const array = readArray(value, "blankAnswers");
  if (array == null) return null;
  return array.map((element, index) => {
    const object = readRecord(element, `blankAnswers[${index}]`);
    if (object == null) return { blankKey: null, submittedAnswer: null } as unknown as { blankKey: string; submittedAnswer: string | null };
    return {
      blankKey: readString(object.blankKey, `blankAnswers[${index}].blankKey`) as string,
      submittedAnswer: readString(object.submittedAnswer, `blankAnswers[${index}].submittedAnswer`),
    };
  });
}

export function toAttemptSubmitBody(body: Record<string, unknown>): AttemptSubmitBody {
  return {
    selectedChoiceIds: readSelectedChoiceIds(body.selectedChoiceIds),
    submittedText: readString(body.submittedText, "submittedText"),
    blankAnswers: readBlankAnswers(body.blankAnswers),
  };
}
