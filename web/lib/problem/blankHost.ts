/**
 * 빈칸 마커(`{{blank_1}}`)가 어느 필드에 있는지 정하는 단 하나의 판단.
 *
 * 2026-09-02 에 질문/지문을 나누면서 마커가 참조지문 쪽으로 옮겨 갔다. 렌더링·서버 검증·
 * 클라이언트 검증·관리자 빈칸 지정 네 곳이 각자 판단하면 서로 어긋나므로 여기로 모은다.
 *
 * **마커는 한 필드에만 있어야 한다.** 양쪽에 걸친 데이터는 validateFillBlank 가 거부한다 —
 * 이 함수는 그 규칙이 지켜졌다고 전제한다.
 */
export function blankHostField(referenceText: string | null | undefined): "content" | "referenceText" {
  return referenceText ? "referenceText" : "content";
}

/** 마커가 든 글. 어느 쪽도 없으면 빈 문자열이다(null 을 아래로 흘려보내지 않는다). */
export function blankHostText(
  content: string | null | undefined,
  referenceText: string | null | undefined,
): string {
  return (referenceText ? referenceText : content) ?? "";
}
