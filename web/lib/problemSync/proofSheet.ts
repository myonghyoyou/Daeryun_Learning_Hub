// 교정용 엑셀(내보내기/되돌리기)이 공유하는 형식 정의.
//
// 목적은 왕복이다 — 각 팀이 엑셀에서 맞춤법·띄어쓰기를 고치면 그 파일을 그대로 읽어
// DB 에 되돌린다. 그래서 컬럼 이름을 DB 표 컬럼과 똑같이 둔다(content, choice_text_1 …).
// 사람이 읽기 좋은 라벨을 쓰면 되돌릴 때 어느 컬럼이 어느 필드였는지 다시 추측해야 한다.
//
// 한 행이 문제 하나다. 자식 표(보기·정답·빈칸)는 칸을 번호로 나눠 폈다 — 실제 데이터의
// 최대치가 보기 5·정답 2·빈칸 5 라 한 행에 들어간다(2026-09-02 확인).

export const MAX_CHOICES = 5;
export const MAX_ANSWERS = 2;
export const MAX_BLANKS = 5;

/** 되돌릴 때 글자를 고쳐 반영하는 칸. 이 목록에 없는 칸은 참고용이라 무시한다. */
export const EDITABLE_COLUMNS = [
  "content",
  "reference_text",
  "explanation",
  ...Array.from({ length: MAX_CHOICES }, (_, i) => `choice_text_${i + 1}`),
  ...Array.from({ length: MAX_ANSWERS }, (_, i) => `answer_text_${i + 1}`),
  ...Array.from({ length: MAX_BLANKS }, (_, i) => `blank_answer_text_${i + 1}`),
] as const;

/**
 * 시트의 컬럼 순서.
 *
 * 앞쪽은 어느 문제인지 알아보는 칸(고치면 안 된다), 뒤쪽이 고칠 칸이다.
 * `id` 로 되돌릴 행을 찾으므로 id 컬럼은 절대 지우거나 바꾸면 안 된다.
 */
export const SHEET_COLUMNS: string[] = [
  "id",
  "department_code",
  "source_number",
  "type",
  "status",
  "content",
  "reference_text",
  "explanation",
  "blank_reveal_count",
  ...Array.from({ length: MAX_CHOICES }, (_, i) => [`choice_text_${i + 1}`, `is_correct_${i + 1}`]).flat(),
  ...Array.from({ length: MAX_ANSWERS }, (_, i) => `answer_text_${i + 1}`),
  ...Array.from({ length: MAX_BLANKS }, (_, i) => [`blank_key_${i + 1}`, `blank_answer_text_${i + 1}`]).flat(),
];

export type ProofRow = Record<string, string | number | null>;

export type ProblemForSheet = {
  id: number;
  departmentCode: string;
  sourceNumber: number | null;
  type: string;
  status: string;
  content: string;
  referenceText: string | null;
  explanation: string | null;
  blankRevealCount: number | null;
  choices: { choiceText: string; isCorrect: boolean }[];
  answers: { answerText: string }[];
  blanks: { blankKey: string; answerText: string }[];
};

/**
 * 문제 하나를 시트 한 행으로 편다.
 *
 * 빈 칸은 빈 문자열로 둔다(null 이 아니라). 엑셀에서 빈 셀과 구분되지 않는 편이,
 * 되돌릴 때 "손대지 않은 칸"으로 일관되게 다루기 쉽다.
 */
export function toSheetRow(problem: ProblemForSheet): ProofRow {
  const row: ProofRow = {
    id: problem.id,
    department_code: problem.departmentCode,
    source_number: problem.sourceNumber ?? "",
    type: problem.type,
    status: problem.status,
    content: problem.content,
    reference_text: problem.referenceText ?? "",
    explanation: problem.explanation ?? "",
    blank_reveal_count: problem.blankRevealCount ?? "",
  };
  for (let i = 0; i < MAX_CHOICES; i += 1) {
    const c = problem.choices[i];
    row[`choice_text_${i + 1}`] = c ? c.choiceText : "";
    row[`is_correct_${i + 1}`] = c ? (c.isCorrect ? "Y" : "") : "";
  }
  for (let i = 0; i < MAX_ANSWERS; i += 1) {
    row[`answer_text_${i + 1}`] = problem.answers[i]?.answerText ?? "";
  }
  for (let i = 0; i < MAX_BLANKS; i += 1) {
    const b = problem.blanks[i];
    row[`blank_key_${i + 1}`] = b ? b.blankKey : "";
    row[`blank_answer_text_${i + 1}`] = b ? b.answerText : "";
  }
  return row;
}
