/**
 * 문제 본문을 "읽기 전용으로 보여주는" 화면(목록·이력·결과 요약)에서 쓸 표시용 변환.
 *
 * 저장된 본문에는 빈칸 자리가 {{b1}} 같은 마커로 들어 있다. 풀이 화면은 blankContent.js 가
 * 이 마커를 입력칸으로 바꿔 주지만, 본문을 텍스트로만 보여주는 화면에는 그런 장치가 없어
 * 내부 코드가 학습자에게 그대로 노출된다. 이 함수가 그 자리를 빈칸 모양으로 바꾼다.
 *
 * 문자 집합은 서버 ProblemServiceImpl.BLANK_MARKER_PATTERN, 지정 모드 blankSegments.js,
 * 풀이 렌더 blankContent.js 와 같아야 한다 — 다르면 어떤 마커는 치환되고 어떤 마커는 남는다.
 */
const BLANK_MARKER_PATTERN = /\{\{[A-Za-z0-9_-]+\}\}/g;

const BLANK_PLACEHOLDER = "____";

export function previewContent(content) {
  if (!content) return "";
  return content.replace(BLANK_MARKER_PATTERN, BLANK_PLACEHOLDER);
}
