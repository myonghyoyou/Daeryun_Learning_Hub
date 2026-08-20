import { MessageNotReadableError } from "../http/errors";
import type { BlankInput, ChoiceInput, ProblemCreateInput, ProblemType } from "./problemValidation";

/**
 * `ProblemCreateRequest`(dto/problem/ProblemCreateRequest.java) 로의 본문 매핑.
 *
 * `body as unknown as ProblemCreateInput` 캐스팅을 대신한다. 캐스팅은 타입이 아무것도
 * 보장하지 않으므로 `type:"MCQ"` 같은 값이 검증을 통째로 지나(정답지: `validateProblem` 의
 * switch 에는 default 분기가 없었다) DB 의 CHECK 제약에서 터졌고, 사용자에게는 -1
 * "처리 중 오류가 발생하였습니다." 만 나갔다. Spring 은 같은 입력에 Jackson 이 실패하며
 * 1000 을 낸다(GlobalExceptionHandler.java:48-51).
 *
 * **여기 두는 이유**: 이 매핑이 만드는 `ProblemCreateInput` 은 옆 파일
 * `problemValidation.ts` 가 소유한 타입이다. 타입과 그 유일한 와이어 포맷 매퍼를 붙여 두면
 * 필드가 늘 때 한 파일만 보면 된다. 라우트 옆에 두면 Task 7·9(엑셀 업로드)가 라우트
 * 디렉터리를 거꾸로 import 해야 한다. 일반적인 Jackson 강제변환 규칙 중 라우트 공용인 것은
 * `lib/http/body.ts`(asStringField)에 이미 있고, 여기 있는 것들은 이 DTO 모양 전용이다.
 *
 * 규칙은 Jackson 기본 설정을 따른다:
 *  - 모르는 필드는 무시한다(Spring Boot 는 FAIL_ON_UNKNOWN_PROPERTIES 를 끈다)
 *  - 없는 필드는 Java 필드 기본값(참조형 null, primitive boolean false)
 *  - 스칼라 ↔ 문자열/숫자 강제변환은 허용, 객체·배열이 스칼라 자리에 오면 실패
 *  - 배열 자리의 단일 값은 실패(ACCEPT_SINGLE_VALUE_AS_ARRAY 기본 off)
 */

const PROBLEM_TYPES: readonly string[] = ["MCQ_SINGLE", "MCQ_MULTI", "OX", "SHORT_ANSWER", "FILL_BLANK"];

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

// Java 의 필드는 `Integer` 다 — 32비트를 넘는 값은 Jackson 이 InputCoercionException 으로
// 거부한다. JS 의 안전 정수(2^53)로 재면 3000000000 같은 값이 통과해 버리고, 그 뒤로는
// 아무도 막지 않는다: validateSourceNumber 는 `>= 1` 만 보고, 컬럼은 `integer` 라 INSERT 가
// SQLSTATE 22003 으로 터지며, translateDuplicateSourceNumber 는 23505 만 가로채므로
// handleRoute 의 마지막 분기에서 -1 "처리 중 오류가 발생하였습니다." 로 나간다. F1 이 닫으려던
// 바로 그 구멍이므로 두 갈래(숫자·문자열) 모두 여기서 잰다.
const JAVA_INTEGER_MIN = -2147483648;
const JAVA_INTEGER_MAX = 2147483647;

function toJavaInteger(value: number, field: string): number {
  if (!Number.isFinite(value)) return unreadable(field);
  // 절삭이 먼저다: Jackson 의 ACCEPT_FLOAT_AS_INT 도 범위 판정 전에 정수부를 취한다.
  const truncated = Math.trunc(value);
  if (truncated < JAVA_INTEGER_MIN || truncated > JAVA_INTEGER_MAX) return unreadable(field);
  return truncated;
}

// Jackson Integer: 정수 문자열은 변환, 실수는 절삭(ACCEPT_FLOAT_AS_INT 기본 TryConvert),
// 빈 문자열은 null(CoercionAction.AsNull), boolean·객체·배열은 실패.
function readInteger(value: unknown, field: string): number | null {
  if (value == null) return null;
  if (typeof value === "number") return toJavaInteger(value, field);
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed === "") return null;
    if (!/^[+-]?\d+$/.test(trimmed)) return unreadable(field);
    return toJavaInteger(Number(trimmed), field);
  }
  return unreadable(field);
}

// primitive boolean: 없거나 null 이면 false 다(FAIL_ON_NULL_FOR_PRIMITIVES 기본 off).
function readBoolean(value: unknown, field: string): boolean {
  if (value == null) return false;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") {
    const text = value.trim().toLowerCase();
    if (text === "" || text === "false") return false;
    if (text === "true") return true;
    return unreadable(field);
  }
  return unreadable(field);
}

function readArray(value: unknown, field: string): unknown[] | null {
  if (value == null) return null;
  if (Array.isArray(value)) return value;
  return unreadable(field);
}

// enum: 알 수 없는 이름은 실패, 빈 문자열은 null. 숫자를 서수(ordinal)로 받는 Jackson 의
// 뒷문은 재현하지 않는다 — 화면은 언제나 이름을 보내고, 서수는 열거 순서가 바뀌면 조용히
// 다른 유형이 되는 종류의 입력이다.
function readType(value: unknown): ProblemType | null {
  if (value == null) return null;
  if (typeof value !== "string") return unreadable("type");
  const name = value.trim();
  if (name === "") return null;
  if (!PROBLEM_TYPES.includes(name)) return unreadable("type");
  return name as ProblemType;
}

// 원소의 null 을 그대로 남긴다(Jackson 도 List<String> 안의 null 을 허용한다). 반환 타입이
// `(string | null)[]` 인 것은 장식이 아니다: `string[]` 로 단언하면 `tags:[null]` 이 타입상
// 존재할 수 없는 값이 되어 하류가 `raw.trim()` 같은 코드를 안심하고 쓰게 된다 — Java 의
// normalizeTags 가 `.map(String::trim)` 으로 정확히 그렇게 하다 NPE(-1)를 낸다. 이식판
// normalizeTags 는 null 을 건너뛰므로 동작은 유지하고 타입만 사실대로 좁혔다(정답지 승인된 이탈).
function readStringList(value: unknown, field: string): (string | null)[] | null {
  const array = readArray(value, field);
  return array?.map((element, index) => readString(element, `${field}[${index}]`)) ?? null;
}

function readChoices(value: unknown): ChoiceInput[] | null {
  const array = readArray(value, "choices");
  if (array == null) return null;
  return array.map((element, index) => {
    const object = readRecord(element, `choices[${index}]`);
    // Java 는 null 원소를 그대로 두어 검증에서 NPE(500)가 났다. 빈 보기로 접어 "빈 보기는
    // 입력할 수 없습니다."(1000)가 나가게 하는 의도적 이탈이다.
    if (object == null) return { text: null, correct: false };
    return {
      text: readString(object.text, `choices[${index}].text`),
      correct: readBoolean(object.correct, `choices[${index}].correct`),
    };
  });
}

function readBlanks(value: unknown): BlankInput[] | null {
  const array = readArray(value, "blanks");
  if (array == null) return null;
  return array.map((element, index) => {
    const object = readRecord(element, `blanks[${index}]`);
    if (object == null) return { blankKey: null, answerText: null };
    return {
      blankKey: readString(object.blankKey, `blanks[${index}].blankKey`),
      answerText: readString(object.answerText, `blanks[${index}].answerText`),
    };
  });
}

function readRecord(value: unknown, field: string): Record<string, unknown> | null {
  if (value == null) return null;
  if (typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  return unreadable(field);
}

export function toProblemCreateInput(body: Record<string, unknown>): ProblemCreateInput {
  return {
    // 유형 누락은 여기서 막지 않는다 — validateProblem 의 "문제 유형을 선택하세요." 가
    // Java 와 같은 문구를 내야 한다. 여기서 걸러야 하는 것은 *알 수 없는* 유형뿐이다.
    type: readType(body.type) as ProblemType,
    content: readString(body.content, "content"),
    imageUrl: readString(body.imageUrl, "imageUrl"),
    referenceText: readString(body.referenceText, "referenceText"),
    explanation: readString(body.explanation, "explanation"),
    choices: readChoices(body.choices),
    answers: readStringList(body.answers, "answers"),
    blanks: readBlanks(body.blanks),
    blankRevealCount: readInteger(body.blankRevealCount, "blankRevealCount"),
    tags: readStringList(body.tags, "tags"),
    sourceNumber: readInteger(body.sourceNumber, "sourceNumber"),
  };
}
