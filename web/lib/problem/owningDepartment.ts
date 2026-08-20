import type { DbConn } from "../db/client";
import { findDepartmentById } from "../db/departments";
import { BizError } from "../http/errors";
import { ErrorCode } from "../http/errorCode";
import type { AuthUser } from "../auth/types";

/**
 * 문제가 귀속될 부서를 정하는 단일 규칙(OwningDepartmentResolver.java:36-50 이식).
 * 개별 등록·엑셀 업로드·다음 문항번호 조회가 모두 이 함수 하나만 쓴다 — 규칙을 복제하면
 * 한쪽만 고쳐지는 드리프트가 생기는데, 이건 보안 판정이라 대가가 크다.
 *
 * 총괄 관리자만 요청값을 쓰고, 부서 관리자는 요청값을 무시하고 본인 부서로 강제된다.
 * 화면의 disabled 는 실수 방지일 뿐이므로 파라미터 위조는 여기서 막는다(정답지 R5).
 *
 * 비활성 문구는 "비활성 부서에는 문제를 등록할 수 없습니다: <부서명>" 이다 —
 * changeDepartment 의 "비활성 부서로는 옮길 수 없습니다: <부서명>"(정답지 C5)과 다르다.
 */
export async function resolveOwningDepartment(
  conn: DbConn, requested: number | null, actor: AuthUser,
): Promise<number> {
  if (actor.role !== "SUPER_ADMIN") return actor.departmentId;
  if (requested == null) {
    throw new BizError(ErrorCode.INPUT_VALUE_INVALID, "문제가 귀속될 부서를 선택하세요.");
  }
  const department = await findDepartmentById(conn, requested);
  if (!department) {
    throw new BizError(ErrorCode.INPUT_VALUE_INVALID, "존재하지 않는 부서입니다.");
  }
  if (department.status !== "ACTIVE") {
    throw new BizError(ErrorCode.INPUT_VALUE_INVALID, `비활성 부서에는 문제를 등록할 수 없습니다: ${department.name}`);
  }
  return requested;
}
