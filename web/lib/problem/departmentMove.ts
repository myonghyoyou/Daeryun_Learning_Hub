import type { DbConn } from "../db/client";
import { findDepartmentById } from "../db/departments";
import { findMaxSourceNumber, findProblemById, updateDepartmentAndSourceNumber } from "../db/problems";
import { recordAudit } from "../audit/auditLog";
import { BizError } from "../http/errors";
import { ErrorCode } from "../http/errorCode";
import type { AuthUser } from "../auth/types";
import { translateDuplicateSourceNumber } from "./problemService";
import { resolveOwningDepartment } from "./owningDepartment";

/**
 * 문제의 귀속 부서를 옮긴다(ProblemServiceImpl.changeDepartment:500-551 이식).
 * 엑셀 업로드에서 부서를 잘못 골랐을 때 화면으로 되돌릴 수 있는 유일한 경로다.
 *
 * **역할 제한은 라우트에만 있다.** Java 도 여기서 `assertOwnership` 을 부르지 않고 컨트롤러의
 * 메서드 레벨 `@RequireRole(SUPER_ADMIN)` 에 전부 기댄다(ProblemController.java:99-104).
 * 이 함수는 부서 유효성만 본다 — 호출부가 총괄 관리자 제한을 걸었다고 가정한다.
 *
 * 가드 순서(정답지 C2~C6): 문제 존재 → 부서 지정 → 부서 존재 → 부서 활성 → 같은 부서 거절.
 * 순서를 바꾸면 "없는 문제 + 없는 부서" 같은 요청에서 안내 문구가 뒤바뀐다.
 *
 * 반환값은 새로 배정된 문항번호다(정답지 C10 의 `{sourceNumber: n}` 이 이 값을 싣는다).
 */
export async function changeProblemDepartment(
  conn: DbConn, id: number, departmentId: number | null, actor: AuthUser,
): Promise<number> {
  const existing = await findProblemById(conn, id);
  if (!existing) throw new BizError(ErrorCode.INPUT_VALUE_INVALID, "존재하지 않는 문제입니다.");
  // 정답지 C3: R8 의 "문제가 귀속될 부서를 선택하세요."(등록 경로)와 다른 문구다. 재사용 금지.
  if (departmentId == null) throw new BizError(ErrorCode.INPUT_VALUE_INVALID, "옮길 부서를 선택하세요.");
  const department = await findDepartmentById(conn, departmentId);
  if (!department) throw new BizError(ErrorCode.INPUT_VALUE_INVALID, "존재하지 않는 부서입니다.");
  // 정답지 C5: R10 의 "비활성 부서에는 문제를 등록할 수 없습니다: <부서명>" 과 다른 문구다.
  if (department.status !== "ACTIVE") {
    throw new BizError(ErrorCode.INPUT_VALUE_INVALID, `비활성 부서로는 옮길 수 없습니다: ${department.name}`);
  }
  // 정답지 C6: 이미 그 부서인데 그대로 "이동" 하면 아래 findMaxSourceNumber 가 이 문제 자신의
  // 행까지 세므로 max + 1 이 원래 번호를 덮어쓴다(부서 꼬리에 있던 문제는 정확히 1씩 밀린다).
  // spec D5 에 따라 옛 번호는 영구히 비므로, 조용한 no-op 대신 거절한다 — no-op 로 두면
  // "부서를 옮겼습니다" 라는 거짓 안내가 나간다.
  if (departmentId === existing.departmentId) {
    throw new BizError(ErrorCode.INPUT_VALUE_INVALID, `이미 ${department.name} 소속입니다.`);
  }

  const from = existing.departmentId;
  // 옮겨 간 부서 기준으로 번호를 다시 매긴다(정답지 C7). 원래 번호를 그대로 들고 가면 그 부서에
  // 같은 번호가 있을 때 UNIQUE 제약에 걸린다(spec D6). 보관본도 번호를 점유하므로 상태로
  // 거르지 않는다 — findMaxSourceNumber 안에 그 규칙이 있다.
  const max = await findMaxSourceNumber(conn, departmentId);
  const assigned = max == null ? 1 : max + 1;

  return conn.transaction(async (tx) => {
    try {
      await updateDepartmentAndSourceNumber(tx, id, departmentId, assigned);
    } catch (error) {
      // 정답지 C8: 두 관리자가 같은 부서로 동시에 옮기면 같은 max 를 읽어 같은 번호를 쓴다.
      // 진 쪽에게 등록·수정과 같은 한국어 안내가 나가야 한다. 부서명은 **이미 손에 있는
      // 문자열**을 그대로 넘긴다 — catch 안에서 다시 SELECT 하면 25P02 로 트랜잭션이 abort 되어
      // 안내 문구가 만들어지지도 못한다(2026-08-14 QA-1 Critical).
      throw translateDuplicateSourceNumber(error, department.name, assigned);
    }
    await recordAudit(tx, {
      actorId: actor.userId, action: "PROBLEM_DEPARTMENT_CHANGED", targetType: "PROBLEM", targetId: id,
      // 정답지 A4·C9: 네 키를 그대로 유지한다.
      detail: { from, to: departmentId, sourceNumberFrom: existing.sourceNumber, sourceNumberTo: assigned },
    });
    return assigned;
  });
}

/**
 * 등록 폼이 번호 칸을 미리 채우는 데 쓴다(ProblemServiceImpl.nextSourceNumber:560-565).
 * 서버가 저장 시점에 자동으로 채우지는 않는다 — 관리자가 종이 문서를 보고 다른 번호로
 * 고칠 수 있어야 하기 때문이다. 두 명이 동시에 열면 같은 값을 받고, 나중에 저장한 쪽이
 * UNIQUE 제약에 걸려 "…번은 이미 있습니다" 안내를 받는다.
 *
 * 스코프는 쓰기 경로의 부서 관문 `resolveOwningDepartment` 가 정한다(정답지 C11·R5) —
 * 부서 관리자의 요청 파라미터는 무시되고 본인 부서로 강제된다. 목록 조회의 부서 규칙
 * (`problemListService.effectiveDepartmentId`)과는 다른 규칙이므로 바꿔 쓰지 말 것.
 */
export async function nextSourceNumber(
  conn: DbConn, departmentId: number | null, actor: AuthUser,
): Promise<number> {
  const scope = await resolveOwningDepartment(conn, departmentId, actor);
  const max = await findMaxSourceNumber(conn, scope);
  return max == null ? 1 : max + 1;
}
