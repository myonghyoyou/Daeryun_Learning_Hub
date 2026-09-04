import { splitAnswerBlanks } from "./answerBlank.js";

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

/**
 * 같은 본문을 "그릴 수 있는" 조각으로 나눈다. previewContent 가 글자만 돌려주는 데 반해
 * 이쪽은 빈 괄호 `( )` 자리를 따로 표시해, 목록에서도 풀이 화면과 같은 모양으로 그릴 수 있게 한다.
 *
 * previewContent 를 지우지 않는 이유는 title 속성(툴팁)이 글자만 받기 때문이다.
 * 두 함수가 같은 치환 규칙을 쓰도록 여기서 previewContent 를 먼저 부른다.
 *
 * 마커를 먼저 밑줄로 바꾸고 나서 괄호를 나눈다. 실제 데이터에서 마커와 빈 괄호가 한 본문에
 * 함께 나오는 문제는 0건이지만(2026-09-04 실측), 순서를 정해 두면 나중에 섞여도 결과가 흔들리지 않는다.
 */
export function previewSegments(content) {
  return splitAnswerBlanks(previewContent(content));
}
