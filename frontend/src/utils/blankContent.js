// 서버 ProblemServiceImpl.BLANK_MARKER_PATTERN, 지정 모드 blankSegments.js 의 MARKER 와
// 같은 문자 집합([A-Za-z0-9_-])을 써야 세 곳(서버 검증·지정 모드·풀이 렌더)의 판정이 갈라지지 않는다.
const BLANK_MARKER_PATTERN = /\{\{([A-Za-z0-9_-]+)\}\}/g;

/**
 * @param {string} content
 * @param {string[]} blanksToAnswer
 * @param {Record<string, string>} revealedAnswers
 * @returns {Array<{type: "text", value: string} | {type: "input", blankKey: string} | {type: "reveal", blankKey: string, value: string}>}
 */
export function parseBlankContent(content, blanksToAnswer, revealedAnswers) {
  const segments = [];
  let lastIndex = 0;
  let match;

  BLANK_MARKER_PATTERN.lastIndex = 0;
  while ((match = BLANK_MARKER_PATTERN.exec(content)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ type: "text", value: content.slice(lastIndex, match.index) });
    }
    const blankKey = match[1];
    if (blanksToAnswer.includes(blankKey)) {
      segments.push({ type: "input", blankKey });
    } else {
      segments.push({ type: "reveal", blankKey, value: revealedAnswers[blankKey] ?? "" });
    }
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < content.length) {
    segments.push({ type: "text", value: content.slice(lastIndex) });
  }
  return segments;
}
