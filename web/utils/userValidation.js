// 계정 생성/수정 폼의 클라이언트 측 필드 검증.
// 서버(UserServiceImpl)는 사번/이메일 중복만 검사하므로, 필수 입력 누락과 이메일
// 형식 오류는 요청을 보내기 전에 여기서 걸러 인라인 오류로 보여준다(8.6.3 "필드 검증 오류").
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validateCommonFields({ name, email, departmentId, role }) {
  const errors = {};
  if (!name?.trim()) {
    errors.name = "이름을 입력하세요.";
  }
  if (!email?.trim()) {
    errors.email = "회사 이메일을 입력하세요.";
  } else if (!EMAIL_PATTERN.test(email.trim())) {
    errors.email = "이메일 형식이 올바르지 않습니다.";
  }
  if (!departmentId) {
    errors.departmentId = "부서를 선택하세요.";
  }
  if (!role) {
    errors.role = "역할을 선택하세요.";
  }
  return errors;
}

// 계정 생성: 사번은 생성 시에만 입력받고 이후에는 수정할 수 없다(백엔드 PUT payload에
// employeeNo가 없다).
export function validateUserCreateForm({ employeeNo, name, email, departmentId, role }) {
  const errors = validateCommonFields({ name, email, departmentId, role });
  if (!employeeNo?.trim()) {
    errors.employeeNo = "사번을 입력하세요.";
  }
  return errors;
}

export function validateUserEditForm({ name, email, departmentId, role }) {
  return validateCommonFields({ name, email, departmentId, role });
}
