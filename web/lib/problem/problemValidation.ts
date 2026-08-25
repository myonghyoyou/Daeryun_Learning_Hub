import { BizError } from "../http/errors";
import { ErrorCode } from "../http/errorCode";
import { checkImageUrl, IMAGE_URL_PREFIX } from "./imageUrl";

export type ProblemType = "MCQ_SINGLE" | "MCQ_MULTI" | "OX" | "SHORT_ANSWER" | "FILL_BLANK";

export interface ChoiceInput {
  text: string | null;
  correct: boolean;
}

export interface BlankInput {
  blankKey: string | null;
  answerText: string | null;
}

export interface ProblemCreateInput {
  type: ProblemType;
  content: string | null;
  imageUrl?: string | null;
  referenceText?: string | null;
  explanation?: string | null;
  choices?: ChoiceInput[] | null;
  answers?: (string | null)[] | null;
  blanks?: BlankInput[] | null;
  blankRevealCount?: number | null;
  // 원소가 null 일 수 있다 — 본문 매핑(problemRequestBody.ts)이 Jackson 처럼 List 안의 null 을
  // 그대로 남기고, 아래 normalizeTags 가 건너뛴다.
  tags?: (string | null)[] | null;
  sourceNumber?: number | null;
}

// 본문 안의 {{key}} 빈칸 마커. Spring 출처: ProblemServiceImpl.java:49.
export const BLANK_MARKER_PATTERN = /\{\{([A-Za-z0-9_-]+)\}\}/g;

const MAX_TAGS = 20;
const MAX_TAG_LENGTH = 100;
const MAX_CHOICE_LENGTH = 500;
const MIN_CHOICES = 2;
const MAX_CHOICES = 5;
const MAX_ANSWER_LENGTH = 500;
const MAX_BLANK_KEY_LENGTH = 50;
const MAX_BLANK_ANSWER_LENGTH = 500;

function invalid(message: string): never {
  throw new BizError(ErrorCode.INPUT_VALUE_INVALID, message);
}

function isBlank(value: string | null | undefined): boolean {
  return value == null || value.trim() === "";
}

/** trim 후 빈 문자열이면 null (Java trimToNull 이식). */
function trimToNull(value: string | null | undefined): string | null {
  if (value == null) return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

/**
 * 저장 전 정규화. Java 는 요청 객체를 제자리에서 변형하지만, 이 이식은 새 객체를 반환하고
 * 입력을 건드리지 않는다 — 호출부가 원본을 재사용하다 사고 나는 것을 막기 위한 의도적 이탈
 * (정답지에 미세 이탈로 기록됨).
 *
 * tags 는 여기서 건드리지 않는다. Java `normalize()`(ProblemServiceImpl.java:230-249)는 tags 를
 * 전혀 만지지 않는다 — `normalizeTags`는 저장 시점, `validate()`·`validateSourceNumber()`·부서
 * 해석기 뒤에만 호출된다(:124,:162). 여기서 태그를 정규화하면 태그 위반(21개 등)이 문항 번호
 * 누락 같은 다른 위반보다 먼저 던져져 Java 와 오류 메시지 순서가 뒤바뀐다.
 */
export function normalizeProblemRequest(req: ProblemCreateInput): ProblemCreateInput {
  return {
    ...req,
    content: trimToNull(req.content),
    imageUrl: req.imageUrl !== undefined ? trimToNull(req.imageUrl) : req.imageUrl,
    referenceText: req.referenceText !== undefined ? trimToNull(req.referenceText) : req.referenceText,
    explanation: req.explanation !== undefined ? trimToNull(req.explanation) : req.explanation,
    choices: req.choices ? req.choices.map((c) => ({ ...c, text: trimToNull(c.text) })) : req.choices,
    answers: req.answers ? req.answers.map((a) => trimToNull(a)) : req.answers,
    blanks: req.blanks
      ? req.blanks.map((b) => ({ blankKey: trimToNull(b.blankKey), answerText: trimToNull(b.answerText) }))
      : req.blanks,
  };
}

/**
 * trim → 빈 것 제거 → toLowerCase → 중복 제거. `toLowerCase()`(Locale 독립)만 쓴다 —
 * `toLocaleLowerCase()`는 튀르키예 로케일에서 "I" → "ı" 로 바뀌는 문제를 재도입한다.
 */
export function normalizeTags(input: (string | null)[] | null | undefined): string[] {
  if (!input) return [];
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of input) {
    if (raw == null) continue;
    const trimmed = raw.trim();
    if (trimmed === "") continue;
    const lower = trimmed.toLowerCase();
    if (!seen.has(lower)) {
      seen.add(lower);
      result.push(lower);
    }
  }
  if (result.length > MAX_TAGS || result.some((t) => t.length > MAX_TAG_LENGTH)) {
    invalid("태그는 문제당 20개, 태그명은 100자 이하여야 합니다.");
  }
  return result;
}

export function validateSourceNumber(n: number | null | undefined): void {
  if (n == null) invalid("문항 번호를 입력하세요.");
  if (n < 1) invalid("문항 번호는 1 이상이어야 합니다.");
}

function validateChoiceCountRange(choices: ChoiceInput[]): void {
  if (choices.length < MIN_CHOICES || choices.length > MAX_CHOICES) {
    invalid("보기는 2개 이상 5개 이하이어야 합니다.");
  }
}

function validateEmptyChoice(choices: ChoiceInput[]): void {
  for (const c of choices) {
    if (isBlank(c.text)) invalid("빈 보기는 입력할 수 없습니다.");
  }
}

function validateChoiceLength(choices: ChoiceInput[]): void {
  for (const c of choices) {
    if ((c.text ?? "").length > MAX_CHOICE_LENGTH) invalid("보기는 500자 이하여야 합니다.");
  }
}

function countCorrect(choices: ChoiceInput[]): number {
  return choices.filter((c) => c.correct).length;
}

function validateAnswerCountExact(choices: ChoiceInput[]): void {
  if (countCorrect(choices) !== 1) invalid("정답 개수가 올바르지 않습니다.");
}

function validateAnswerCountAtLeastOne(choices: ChoiceInput[]): void {
  if (countCorrect(choices) < 1) invalid("정답을 최소 1개 선택하세요.");
}

function validateMultipleChoice(choices: ChoiceInput[]): void {
  validateChoiceCountRange(choices);
  validateEmptyChoice(choices);
  validateChoiceLength(choices);
  validateAnswerCountExact(choices);
}

function validateMultiSelect(choices: ChoiceInput[]): void {
  validateChoiceCountRange(choices);
  validateEmptyChoice(choices);
  validateChoiceLength(choices);
  validateAnswerCountAtLeastOne(choices);
}

function validateOx(choices: ChoiceInput[]): void {
  // 순서 고정: 보기 개수 검사가 먼저, 그 다음 정답 개수 검사(정답지 V12).
  if (choices.length !== 2) invalid("OX 문제는 보기 2개(O/X)가 필요합니다.");
  validateEmptyChoice(choices);
  validateChoiceLength(choices);
  validateAnswerCountExact(choices);
}

function validateShortAnswer(answers: (string | null)[]): void {
  if (answers.length === 0) invalid("정답을 최소 1개 입력하세요.");
  for (const a of answers) {
    if (isBlank(a)) invalid("빈 정답은 입력할 수 없습니다.");
  }
  for (const a of answers) {
    if ((a ?? "").length > MAX_ANSWER_LENGTH) invalid("정답은 500자 이하여야 합니다.");
  }
}

function extractMarkers(content: string | null): string[] {
  const markers: string[] = [];
  const pattern = new RegExp(BLANK_MARKER_PATTERN.source, BLANK_MARKER_PATTERN.flags);
  let m: RegExpExecArray | null;
  while ((m = pattern.exec(content ?? "")) !== null) {
    markers.push(m[1]);
  }
  return markers;
}

function validateFillBlank(content: string | null, blanks: BlankInput[], blankRevealCount: number | null | undefined): void {
  if (blanks.length === 0) invalid("빈칸을 최소 1개 정의하세요.");

  // Java 는 blanks 를 한 번만 순회하며 각 빈칸에 세 검사를 모두 적용한 뒤 다음 빈칸으로
  // 넘어간다(ProblemServiceImpl.java:407-420) — 규칙별 전체 스캔이 아니다. 두 개의 다른 빈칸이
  // 서로 다른 규칙을 위반할 때 어느 문구가 먼저 뜨는지가 이 순서에 달려 있다.
  for (const b of blanks) {
    if (isBlank(b.blankKey) || isBlank(b.answerText)) invalid("빈칸 키와 정답을 모두 입력하세요.");
    if ((b.blankKey ?? "").length > MAX_BLANK_KEY_LENGTH) invalid("빈칸 키는 50자 이하여야 합니다.");
    if ((b.answerText ?? "").length > MAX_BLANK_ANSWER_LENGTH) invalid("빈칸 정답은 500자 이하여야 합니다.");
  }

  // Java 는 trim 하지 않은 원본 키를 그대로 쓴다(keys.add(blank.getBlankKey())) — 중복 검사와
  // 마커 매칭 모두 이 값을 기준으로 한다. normalizeProblemRequest 가 먼저 실행된다는 관례에
  // 기대지 않고, validateProblem 단독 호출에서도 Java 와 같은 결과가 나오도록 원본값을 쓴다.
  const keys = blanks.map((b) => b.blankKey ?? "");
  if (new Set(keys).size !== keys.length) invalid("빈칸 키가 중복되었습니다.");

  // Java 는 이 방향(선언된 키가 본문에 있는가)을 리터럴 부분 문자열로 검사한다
  // (`content.contains("{{" + key + "}}")`, ProblemServiceImpl.java:425-429) — 정규식이 아니다.
  // 정규식(BLANK_MARKER_PATTERN)은 반대 방향(본문의 마커가 선언돼 있는가, :433-440)에만 쓰인다.
  // 두 방향에 같은 정규식 charset([A-Za-z0-9_-]+)을 쓰면, 그 charset 밖의 키(한글, "b.1" 처럼
  // "."을 포함하는 키 등)가 본문에 실제로 있어도 이 방향에서 false 로 거부된다 —
  // web/utils/blankSegments.js 가 명시하듯 "서버는 키 형식을 강제하지 않는다".
  const contentValue = content ?? "";
  for (const key of keys) {
    if (!contentValue.includes(`{{${key}}}`)) invalid(`본문에 없는 빈칸 마커입니다: ${key}`);
  }

  const markers = extractMarkers(content);
  const keySet = new Set(keys);
  for (const marker of markers) {
    if (!keySet.has(marker)) invalid(`정답이 등록되지 않은 빈칸 마커가 본문에 있습니다: ${marker}`);
  }

  if (blankRevealCount == null || blankRevealCount < 1 || blankRevealCount > blanks.length) {
    invalid("출제할 빈칸 개수가 유효하지 않습니다.");
  }
}

/**
 * 5유형 검증. 위반 시 BizError(INPUT_VALUE_INVALID, 문구)를 던진다.
 * 순서: 유형 누락(가장 먼저, switch 무분기 통과 방지) → 내용 공백 → imageUrl → 유형별 검사.
 */
export function validateProblem(req: ProblemCreateInput): void {
  if (req.type == null) invalid("문제 유형을 선택하세요.");
  if (isBlank(req.content)) invalid("문제 내용을 입력하세요.");

  const imageResult = checkImageUrl(req.imageUrl);
  if (imageResult === "BAD_PREFIX") {
    invalid(`이미지는 이미지 업로드 API로 등록한 경로(${IMAGE_URL_PREFIX}...)만 사용할 수 있습니다.`);
  }
  if (imageResult === "TOO_LONG") {
    invalid("이미지 경로는 500자 이하여야 합니다.");
  }

  switch (req.type) {
    case "MCQ_SINGLE":
      validateMultipleChoice(req.choices ?? []);
      break;
    case "MCQ_MULTI":
      validateMultiSelect(req.choices ?? []);
      break;
    case "OX":
      validateOx(req.choices ?? []);
      break;
    case "SHORT_ANSWER":
      validateShortAnswer(req.answers ?? []);
      break;
    case "FILL_BLANK":
      validateFillBlank(req.content, req.blanks ?? [], req.blankRevealCount);
      break;
    default:
      // Java 에서는 닿을 수 없다(type 이 enum 이라 Jackson 이 먼저 거른다). TS 에서는 캐스팅
      // 한 번이면 닿고, 분기가 없으면 유형별 검사를 통째로 건너뛴 채 DB 까지 가서 CHECK 제약이
      // -1 "처리 중 오류가 발생하였습니다." 로 터진다. 본문 매핑(problemRequestBody.ts)이
      // 1차 관문이고 이건 2차 그물이다.
      invalid("문제 유형을 선택하세요.");
  }
}
