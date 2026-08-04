/**
 * 부서 생성/수정 폼의 클라이언트 측 필드 검증.
 * 필수 입력 누락은 요청을 보내기 전에 여기서 걸러 인라인 오류로 보여준다
 * (8.6.3 "필드 검증 오류"). 서버(DepartmentServiceImpl)도 같은 필수값을 검증하며
 * 그쪽이 최종 권한이다 — 여기 검증은 응답을 기다리지 않고 즉시 알려주기 위한 것이다.
 */
function validateName({ name }) {
  const errors = {};
  if (!name?.trim()) {
    errors.name = "부서명을 입력하세요.";
  }
  return errors;
}

export function validateDepartmentForm({ name, code }) {
  const errors = validateName({ name });
  if (!code?.trim()) {
    errors.code = "부서 코드를 입력하세요.";
  }
  return errors;
}

// 부서 수정: 코드는 생성 시에만 입력받고 이후에는 수정할 수 없다(백엔드 PUT payload에
// code가 없다 — DepartmentUpdateRequest는 name/status만 받는다).
export function validateDepartmentEditForm({ name }) {
  return validateName({ name });
}
