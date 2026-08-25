/**
 * 관리자 화면 접근을 차단하는 뷰포트 폭 기준(PRD 3.2).
 *
 * 768px이던 것을 640px로 낮췄다(QA D5). 브라우저 확대는 CSS 뷰포트 너비를 줄이므로,
 * 1440px 화면에서 200% 확대하면 720px가 되어 관리자가 /solve로 튕겨나갔다 —
 * WCAG 2.1 SC 1.4.4는 200%까지 사용 가능할 것을 요구한다. 640px면 1280px 이상
 * 화면의 200% 확대가 모두 통과한다.
 *
 * 확대와 좁은 창을 구분하는 방법(pointer 미디어 쿼리 등)을 쓰지 않은 이유: PRD 3.2가
 * "브라우저 창 크기 조절로 경계를 넘나드는 경우에도 차단"을 명시하므로, 판별은
 * 뷰포트 폭이라는 단일 신호로 유지한다.
 */
export const MOBILE_BREAKPOINT = 640;

export function classifyDevice(viewportWidth) {
  return viewportWidth < MOBILE_BREAKPOINT ? "mobile" : "pc";
}
