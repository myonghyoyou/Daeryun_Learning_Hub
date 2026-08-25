/**
 * 계정 생성/수정 폼의 부서 Select 옵션 구성.
 *
 * 부서 비활성화는 "더 이상 유효한 배정 대상이 아님"을 뜻해야 하지만, 백엔드는 이를
 * 강제하지 않는다(DepartmentController.list()에 상태 필터가 없고, UserAdminServiceImpl은
 * 부서의 null 여부만 검사할 뿐 status는 보지 않는다). 그래서 클라이언트에서 다음 두 규칙을
 * 지킨다:
 *   - 생성 폼: 비활성 부서를 아예 보이지 않게 해 새 계정이 비활성 부서로 배정되지 않게 한다.
 *   - 수정 폼: 이미 배정된 계정의 현재 부서가 비활성이어도 목록에서 사라지면 안 된다
 *     (사라지면 그 계정을 저장할 때마다 부서가 다른 값으로 바뀌어 버린다). 다만 그 부서가
 *     비활성 상태라는 것은 라벨에 "(비활성)"으로 드러내고, 그 외의 비활성 부서는 여전히
 *     선택지에서 제외한다.
 */
export function buildDepartmentOptions(departments, { currentDepartmentId } = {}) {
  const currentId = currentDepartmentId == null ? null : String(currentDepartmentId);
  const options = [{ value: "", label: "부서 선택" }];
  for (const department of departments) {
    const id = String(department.id);
    const isCurrent = currentId !== null && id === currentId;
    if (department.status !== "ACTIVE" && !isCurrent) {
      continue;
    }
    const label = department.status === "ACTIVE" ? department.name : `${department.name} (비활성)`;
    options.push({ value: id, label });
  }
  return options;
}
