/**
 * 보기 목록의 크기 규칙(디자인 시스템 8.4: 최소 높이 56px, 세로 간격 10~12px).
 *
 * ProblemSolveCard 와 ProblemSkeleton 이 이 값을 함께 쓴다 — 두 곳에 따로 적으면 한쪽만
 * 바뀌었을 때 로딩이 끝나는 순간 레이아웃이 튀는데, 그것이 skeleton 이 막으려던 현상이다.
 */
export const CHOICE_LIST_CLASS = "mt-5 space-y-3";
export const CHOICE_ITEM_MIN_HEIGHT = "min-h-[56px]";
