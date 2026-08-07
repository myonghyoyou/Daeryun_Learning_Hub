/**
 * FILL_BLANK 빈칸 후보 목록의 순수 로직. Task 2/6에서 합의한 마커 문법은 이중 중괄호
 * `{{blank_1}}`이며, 서버(ProblemServiceImpl.validateBlanks)는 다음을 검사한다:
 *  1) 빈칸이 최소 1개
 *  2) 모든 빈칸의 키·정답이 비어 있지 않음(목록 중간의 빈 항목 포함, 조용히 거르지 않음)
 *  3) 빈칸 키 중복 금지
 *  4) 선언한 각 키가 본문에 `{{key}}` 형태로 실제로 등장
 *  5) blankRevealCount가 1 이상, 빈칸 개수 이하
 * 이 모듈은 그 다섯 규칙을 동일한 순서로 클라이언트에서 미리 검사한다.
 */
const BLANK_MARKER_PATTERN = /\{\{([^{}]+)\}\}/g;

export function createBlank() {
  return { blankKey: "", answerText: "" };
}

// 본문에 실제로 등장하는 {{key}} 마커를 등장 순서대로, 중복 없이 추출한다.
// 단일 중괄호(`{blank_1}`)는 합의된 문법이 아니므로 매칭하지 않는다.
export function extractBlankMarkers(content) {
  if (!content) return [];
  const keys = [];
  const seen = new Set();
  for (const match of content.matchAll(BLANK_MARKER_PATTERN)) {
    const key = match[1];
    if (!seen.has(key)) {
      seen.add(key);
      keys.push(key);
    }
  }
  return keys;
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

  const count = Number(blankRevealCount);
  if (!Number.isInteger(count) || count < 1 || count > blanks.length) {
    return "출제할 빈칸 개수가 유효하지 않습니다.";
  }

  return null;
}
