const ROLE_LABELS = {
  SUPER_ADMIN: "총괄 관리자",
  DEPT_ADMIN: "부서 관리자",
};

export function roleLabel(role) {
  return ROLE_LABELS[role] ?? "관리자";
}

/**
 * 관리자 Topbar의 부서 범위 표기.
 * 세션에는 departmentId만 있고 부서 이름이 없다(useSessionStatus 참고). 이 Plan의
 * 관리자 화면은 SUPER_ADMIN 전용이므로, 총괄 관리자는 Topbar 라벨을 위해 별도
 * 부서 API를 호출하지 않고 "전체 부서"로 고정 표시한다. 부서 관리자용 부서명
 * 표기는 Plan 3에서 부서 관리자 화면을 만들 때 함께 다룬다.
 */
export function departmentScopeLabel(session) {
  if (session?.role === "SUPER_ADMIN") {
    return "전체 부서";
  }
  return session?.departmentId ? `부서 ${session.departmentId}번` : "-";
}
