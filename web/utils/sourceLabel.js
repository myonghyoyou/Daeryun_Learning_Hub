/**
 * 출처 배지 문구를 만든다. "정보시스템팀 3번".
 *
 * 영역은 별도 개념이 아니라 문제가 귀속된 부서다(spec D1). 화면(React)과 분리해
 * 두는 이유는 이 프로젝트에 jsdom 이 없어 컴포넌트를 테스트할 수 없기 때문이다.
 *
 * 번호가 없으면 null 을 돌려준다 — 호출부는 이걸 "배지를 그리지 않는다"로 읽는다.
 * 번호 없는 기존 문제가 남아 있는 동안 필요하다.
 */
export function sourceLabel(item) {
  if (!item) return null;
  const number = item.sourceNumber;
  if (number === null || number === undefined || number < 1) return null;
  const name = item.departmentName;
  return name ? `${name} ${number}번` : `${number}번`;
}
