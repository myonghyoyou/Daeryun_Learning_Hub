/**
 * 목록 페이지네이션 계산. 화면(React)과 분리해 두는 이유는 이 프로젝트에 jsdom이 없어
 * 컴포넌트 렌더링을 테스트할 수 없기 때문이다 — 계산만이라도 단위 테스트로 고정한다.
 *
 * 부서·계정 목록은 pageSlice로 클라이언트에서 자르고, 문제 목록은 서버가 이미 잘라 주므로
 * pageCount/pageRange만 쓴다.
 */
export const PAGE_SIZE = 20;

export function pageCount(totalCount, size = PAGE_SIZE) {
  return Math.max(1, Math.ceil((totalCount || 0) / size));
}

/** 범위를 벗어난 페이지 번호를 유효 범위로 당긴다(항목 삭제·필터 변경으로 페이지가 줄어든 경우). */
export function clampPage(page, totalCount, size = PAGE_SIZE) {
  const last = pageCount(totalCount, size);
  if (!Number.isFinite(page) || page < 1) {
    return 1;
  }
  return Math.min(page, last);
}

export function pageSlice(items, page, size = PAGE_SIZE) {
  const start = (clampPage(page, items.length, size) - 1) * size;
  return items.slice(start, start + size);
}

/** "N–M / 전체 T건" 표기에 쓰는 1-기반 범위. 빈 목록은 0–0. */
export function pageRange(page, totalCount, size = PAGE_SIZE) {
  if (!totalCount) {
    return { from: 0, to: 0 };
  }
  const current = clampPage(page, totalCount, size);
  const from = (current - 1) * size + 1;
  return { from, to: Math.min(current * size, totalCount) };
}
