/**
 * 문제 엑셀 업로드 화면의 "귀속 부서" Select 구성.
 *
 * 총괄 관리자만 부서를 고를 수 있다. 부서 관리자는 자기 부서 하나만 보이고 disabled 다 —
 * 다만 이는 실수 방지용이고, 권한 판정은 서버(ExcelProblemUploadServiceImpl.resolveDepartmentId)가
 * 한다. 파라미터를 위조해도 서버가 본인 부서로 강제한다.
 *
 * 부서 관리자에게 departments 가 빈 배열인 이유: DepartmentController 가 SUPER_ADMIN 전용이라
 * 목록 API 를 호출할 수 없다(호출하면 403 이 콘솔에 찍힌다). 대신 세션 응답의 departmentName 을 쓴다.
 *
 * 총괄 관리자의 초기값이 빈 문자열인 것은 의도다. 본인 부서를 자동 선택하면 선택을 잊었을 때
 * 조용히 그 부서로 등록된다 — 653문항을 팀별로 넣는 상황에서 가장 위험한 실수다.
 */
export function buildUploadDepartmentField({ session, departments = [] }) {
  if (session?.role === "SUPER_ADMIN") {
    return {
      disabled: false,
      value: "",
      options: [
        { value: "", label: "부서 선택" },
        ...departments
          .filter((department) => department.status === "ACTIVE")
          .map((department) => ({ value: String(department.id), label: department.name })),
      ],
      helpText: "선택한 부서 명의로 등록됩니다.",
    };
  }

  const value = session?.departmentId == null ? "" : String(session.departmentId);
  return {
    disabled: true,
    value,
    options: [{ value, label: session?.departmentName ?? "-" }],
    helpText: "소속 부서로만 등록할 수 있습니다.",
  };
}
