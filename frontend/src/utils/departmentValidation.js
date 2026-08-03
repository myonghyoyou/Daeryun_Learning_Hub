/**
 * 부서 생성 폼의 클라이언트 측 필드 검증.
 * 서버(DepartmentServiceImpl)는 코드 중복만 검사하므로, 필수 입력 누락은
 * 요청을 보내기 전에 여기서 걸러 인라인 오류로 보여준다(8.6.3 "필드 검증 오류").
 */
export function validateDepartmentForm({ name, code }) {
  const errors = {};
  if (!name?.trim()) {
    errors.name = "부서명을 입력하세요.";
  }
  if (!code?.trim()) {
    errors.code = "부서 코드를 입력하세요.";
  }
  return errors;
}
