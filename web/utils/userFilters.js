/**
 * 계정 목록 화면의 검색어/상태 필터는 서버가 아니라 클라이언트에서 처리한다.
 * GET /api/admin/users는 departmentId만 쿼리로 받으므로(UserController 참고),
 * 디자인 시스템 8.10이 요구하는 "검색·상태 필터"는 departmentFilters.js와 동일하게
 * 이미 받아온 목록을 이 순수 함수로 걸러내는 방식으로 구현한다.
 */
export function filterUsers(users, { keyword = "", status = "ALL" } = {}) {
  const normalizedKeyword = keyword.trim().toLowerCase();
  return users.filter((user) => {
    if (status !== "ALL" && user.status !== status) {
      return false;
    }
    if (!normalizedKeyword) {
      return true;
    }
    return (
      user.employeeNo?.toLowerCase().includes(normalizedKeyword) ||
      user.name?.toLowerCase().includes(normalizedKeyword) ||
      user.email?.toLowerCase().includes(normalizedKeyword) ||
      user.departmentName?.toLowerCase().includes(normalizedKeyword)
    );
  });
}
