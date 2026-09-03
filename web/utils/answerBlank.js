/**
 * 문제 본문의 빈 괄호를 찾아 글자 조각과 빈칸 조각으로 나눈다.
 *
 * 종이 문제집을 옮겨 온 본문에는 답을 적을 자리가 `( )` 로 들어 있다. 그냥 두면 다른
 * 괄호와 구분되지 않아, 화면에서 빈칸처럼 보이게 하려고 자리만 알려 준다. 그리는 일은
 * 화면이 한다.
 *
 * **내용이 든 괄호는 잡지 않는다.** `(서울시 공급규정)`·`(신용등급)`·`(를)` 처럼 실제
 * 글이 든 괄호가 261개의 빈 괄호와 섞여 있다(2026-09-04 실측). 안이 비었을 때만 빈칸이다.
 *
 * 실측한 261개가 전부 `( )` 한 가지 모양이지만(공백 하나, 전각 괄호 0개, 줄바꿈 낀 것 0개)
 * `\s*` 로 두는 이유는 나중에 `()` 나 `(  )` 가 들어와도 같은 자리로 읽히기 때문이다.
 */
const EMPTY_PAREN = /\(\s*\)/g;

export function splitAnswerBlanks(text) {
  if (!text) return [];
  const segments = [];
  let lastIndex = 0;
  let match;

  EMPTY_PAREN.lastIndex = 0;
  while ((match = EMPTY_PAREN.exec(text)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ type: "text", value: text.slice(lastIndex, match.index) });
    }
    segments.push({ type: "blank" });
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) {
    segments.push({ type: "text", value: text.slice(lastIndex) });
  }
  return segments;
}
