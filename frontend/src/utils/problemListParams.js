/**
 * 문제 목록 화면의 필터는 부서/계정 관리 화면(filterDepartments/filterUsers)과 달리
 * 클라이언트에서 목록을 걸러내지 않는다 — GET /api/admin/problems가 type/status/keyword/
 * createdFrom/createdTo/tag를 쿼리 파라미터로 직접 받으므로(ProblemController 참고)
 * 서버가 필터링한다. 이 모듈은 화면 상태(필터 폼 값)를 그 쿼리 파라미터 모양으로
 * 변환하는 순수 함수만 담당한다.
 *
 * type/status의 "전체" 선택은 화면에서 ALL이라는 sentinel 값으로 관리하는데, 이 값을
 * 그대로 보내면 서버가 "ALL"이라는 존재하지 않는 enum 값으로 필터링해 결과가 0건이
 * 되어버린다. 여기서 undefined로 정규화해야 problems.js의 listProblems()가
 * (value !== undefined && value !== "") 조건으로 쿼리스트링에서 아예 제외한다.
 */
export const EMPTY_PROBLEM_FILTERS = {
  keyword: "",
  type: "ALL",
  status: "ALL",
  tag: "",
  createdFrom: "",
  createdTo: "",
};

function normalizeSentinel(value) {
  return value && value !== "ALL" ? value : undefined;
}

function normalizeOptional(value) {
  return value ? value : undefined;
}

export function buildProblemListParams(filters) {
  return {
    keyword: normalizeOptional(filters.keyword?.trim()),
    type: normalizeSentinel(filters.type),
    status: normalizeSentinel(filters.status),
    tag: normalizeOptional(filters.tag),
    createdFrom: normalizeOptional(filters.createdFrom),
    createdTo: normalizeOptional(filters.createdTo),
  };
}
