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

const SESSION_STATUS_META = {
  authenticated: { label: "세션 연결됨", dotClassName: "bg-success-text", textClassName: "text-success-text" },
  loading: { label: "세션 확인 중", dotClassName: "bg-warning-text", textClassName: "text-warning-text" },
  unauthenticated: { label: "세션 종료됨", dotClassName: "bg-danger-text", textClassName: "text-danger-text" },
};

/**
 * Topbar의 세션 상태 표시(8.6.1 "현재 역할·부서·세션 상태"). 폴링이나 별도 API 호출
 * 없이, useSessionStatus가 이미 들고 있는 전역 세션 스토어의 status만 그대로
 * 보여준다. 색상 점만으로 상태를 전달하지 않도록 텍스트를 항상 함께 반환한다(§7.9).
 */
export function sessionStatusMeta(status) {
  return (
    SESSION_STATUS_META[status] ?? {
      label: "세션 상태 확인 불가",
      dotClassName: "bg-ink-subtle",
      textClassName: "text-ink-muted",
    }
  );
}
