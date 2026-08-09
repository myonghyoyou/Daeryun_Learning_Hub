const ROLE_LABELS = {
  SUPER_ADMIN: "총괄 관리자",
  DEPT_ADMIN: "부서 관리자",
};

export function roleLabel(role) {
  return ROLE_LABELS[role] ?? "관리자";
}

/**
 * 관리자 Topbar의 부서 범위 표기.
 * 총괄 관리자는 특정 부서에 매이지 않으므로 "전체 부서"로 고정한다.
 *
 * 그 외 역할은 세션 응답의 departmentName을 쓴다. 부서 목록 API는 SUPER_ADMIN
 * 전용이라 프런트엔드가 id → 이름 변환을 할 수 없어, 백엔드가 세션 응답에 이름을
 * 실어 보낸다(AuthServiceImpl.getSessionStatus 참고).
 *
 * 이름이 없을 때 id로 돌아가지 않는 것이 의도다. `부서 862번` 같은 내부 식별자를
 * 보여 주는 것은 사용자에게 아무 의미가 없고, 그것이 QA D2로 보고된 결함이었다.
 */
export function departmentScopeLabel(session) {
  if (session?.role === "SUPER_ADMIN") {
    return "전체 부서";
  }
  return session?.departmentName ?? "-";
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
