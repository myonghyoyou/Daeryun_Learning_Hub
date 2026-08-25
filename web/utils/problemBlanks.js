/**
 * FILL_BLANK 빈칸 후보 목록의 순수 로직. Task 2/6에서 합의한 마커 문법은 이중 중괄호
 * `{{blank_1}}`이며, 서버(ProblemServiceImpl.validateBlanks)는 다음을 검사한다:
 *  1) 빈칸이 최소 1개
 *  2) 모든 빈칸의 키·정답이 비어 있지 않음(목록 중간의 빈 항목 포함, 조용히 거르지 않음)
 *  3) 빈칸 키 중복 금지
 *  4) 선언한 각 키가 본문에 `{{key}}` 형태로 실제로 등장
 *  5) 본문의 각 `{{key}}` 마커가 선언된 빈칸 키 중 하나로 존재(정답 없는 고아 마커 금지)
 *  6) blankRevealCount가 1 이상, 빈칸 개수 이하
 * 이 모듈은 그 여섯 규칙을 동일한 순서로 클라이언트에서 미리 검사한다.
 */
export function createBlank() {
  return { blankKey: "", answerText: "" };
}

function isBlankText(value) {
  return !value || !value.trim();
}

export function validateBlanks({ content, blanks, blankRevealCount }) {
  if (!blanks || blanks.length === 0) {
    return "빈칸을 최소 1개 정의하세요.";
  }

  if (blanks.some((blank) => isBlankText(blank.blankKey) || isBlankText(blank.answerText))) {
    return "빈칸 키와 정답을 모두 입력하세요.";
  }

  const keys = blanks.map((blank) => blank.blankKey.trim());
  if (new Set(keys).size !== keys.length) {
    return "빈칸 키가 중복되었습니다.";
  }

  for (const key of keys) {
    if (!content || !content.includes(`{{${key}}}`)) {
      return `본문에 없는 빈칸 마커입니다: ${key}`;
    }
  }

  // 서버 ProblemServiceImpl.validateBlanks 와 같은 순서·같은 문구. 정규식은 blankSegments.js 의
  // MARKER 와 같은 문자 집합이어야 지정 모드가 칩으로 그리는 것과 검증이 보는 것이 일치한다.
  const markerPattern = /\{\{([A-Za-z0-9_-]+)\}\}/g;
  const declared = new Set(keys);
  let m;
  while ((m = markerPattern.exec(content ?? "")) !== null) {
    if (!declared.has(m[1])) {
      return `정답이 등록되지 않은 빈칸 마커가 본문에 있습니다: ${m[1]}`;
    }
  }

  const count = Number(blankRevealCount);
  if (!Number.isInteger(count) || count < 1 || count > blanks.length) {
    return "출제할 빈칸 개수가 유효하지 않습니다.";
  }

  return null;
}
