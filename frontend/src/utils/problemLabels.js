/**
 * 문제 목록/등록·수정 화면이 공유하는 유형·상태 한글 라벨.
 * 백엔드 enum(ProblemType, ProblemStatus)은 영문 상수라 목록 테이블과 필터 Select에
 * 그대로 노출할 수 없다 — userRole.js의 roleLabel 패턴을 그대로 따른다.
 */
const TYPE_LABELS = {
  MCQ_SINGLE: "객관식(단일)",
  MCQ_MULTI: "객관식(다중)",
  OX: "OX",
  SHORT_ANSWER: "주관식",
  FILL_BLANK: "빈칸 채우기",
};

const STATUS_LABELS = {
  ACTIVE: "활성",
  ARCHIVED: "보관됨",
};

export function problemTypeLabel(type) {
  return TYPE_LABELS[type] ?? type;
}

export function problemStatusLabel(status) {
  return STATUS_LABELS[status] ?? status;
}

// 필터 Select의 "전체" 옵션은 서버에 보낼 값이 없다는 뜻이라 ALL 이라는 전용 sentinel을
// 쓴다("ALL"은 실제 파라미터로 전송되지 않는다 — problemListParams.js 참고).
export const PROBLEM_TYPE_OPTIONS = [
  { value: "ALL", label: "전체 유형" },
  ...Object.keys(TYPE_LABELS).map((value) => ({ value, label: problemTypeLabel(value) })),
];

export const PROBLEM_STATUS_OPTIONS = [
  { value: "ALL", label: "전체 상태" },
  ...Object.keys(STATUS_LABELS).map((value) => ({ value, label: problemStatusLabel(value) })),
];
