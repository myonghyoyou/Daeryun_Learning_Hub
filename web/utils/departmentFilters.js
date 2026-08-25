/**
 * 부서 목록 화면의 검색어/상태 필터는 서버가 아니라 클라이언트에서 처리한다.
 * GET /api/admin/departments는 쿼리 파라미터를 받지 않고 전체 목록을 반환하므로
 * (DepartmentController 참고), 디자인 시스템 8.10이 요구하는 "검색·상태 필터"는
 * 이미 받아온 목록을 이 순수 함수로 걸러내는 방식으로 구현한다.
 */
export function filterDepartments(departments, { keyword = "", status = "ALL" } = {}) {
  const normalizedKeyword = keyword.trim().toLowerCase();
  return departments.filter((department) => {
    if (status !== "ALL" && department.status !== status) {
      return false;
    }
    if (!normalizedKeyword) {
      return true;
    }
    return (
      department.name?.toLowerCase().includes(normalizedKeyword) ||
      department.code?.toLowerCase().includes(normalizedKeyword)
    );
  });
}
