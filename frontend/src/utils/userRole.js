/**
 * 계정 목록/생성-수정 폼에서 쓰는 역할 표기.
 * adminSession.js의 roleLabel은 Topbar에 로그인한 "관리자 본인"의 역할만
 * 표시하도록 만들어져 EMPLOYEE를 다루지 않는다("관리자"로 뭉뚱그림). 계정 목록에는
 * EMPLOYEE 행이 그대로 나타나므로 이 화면 전용으로 세 역할을 모두 매핑한다.
 */
const ROLE_LABELS = {
  SUPER_ADMIN: "총괄 관리자",
  DEPT_ADMIN: "부서 관리자",
  EMPLOYEE: "직원",
};

export const ROLE_OPTIONS = [
  { value: "SUPER_ADMIN", label: ROLE_LABELS.SUPER_ADMIN },
  { value: "DEPT_ADMIN", label: ROLE_LABELS.DEPT_ADMIN },
  { value: "EMPLOYEE", label: ROLE_LABELS.EMPLOYEE },
];

export function roleLabel(role) {
  return ROLE_LABELS[role] ?? role;
}
