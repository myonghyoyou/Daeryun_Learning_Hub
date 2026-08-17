import type { Db } from "../db/client";
import { findAllDepartments, findDepartmentByCode, findDepartmentById, insertDepartment, updateDepartment } from "../db/departments";
import { recordAudit } from "../audit/auditLog";
import { BizError } from "../http/errors";
import { ErrorCode } from "../http/errorCode";

const NAME_MAX = 100;
const CODE_MAX = 50;

function validateName(name: string | undefined): asserts name is string {
  if (name == null || name.trim() === "") throw new BizError(ErrorCode.INPUT_VALUE_INVALID, "부서명을 입력하세요.");
  if (name.length > NAME_MAX) throw new BizError(ErrorCode.INPUT_VALUE_INVALID, `부서명은 ${NAME_MAX}자를 넘을 수 없습니다.`);
}
function validateCode(code: string | undefined): asserts code is string {
  if (code == null || code.trim() === "") throw new BizError(ErrorCode.INPUT_VALUE_INVALID, "부서 코드를 입력하세요.");
  if (code.length > CODE_MAX) throw new BizError(ErrorCode.INPUT_VALUE_INVALID, `부서 코드는 ${CODE_MAX}자를 넘을 수 없습니다.`);
}

export async function listDepartments(db: Db) {
  return (await findAllDepartments(db)).map((d) => ({ id: d.id, name: d.name, code: d.code, status: d.status }));
}

export async function createDepartment(db: Db, input: { name?: string; code?: string }, actorId: number): Promise<void> {
  validateName(input.name);
  validateCode(input.code);
  if (await findDepartmentByCode(db, input.code)) {
    throw new BizError(ErrorCode.INPUT_VALUE_INVALID, "이미 존재하는 부서 코드입니다: " + input.code);
  }
  // insert + 감사 = 한 트랜잭션(Spring @Transactional 미러): 감사 실패 시 부서 행도 롤백.
  await db.transaction(async (tx) => {
    const row = await insertDepartment(tx, { name: input.name!, code: input.code! });
    await recordAudit(tx, { actorId, action: "DEPARTMENT_CREATED", targetType: "DEPARTMENT", targetId: row.id, detail: { code: row.code } });
  });
}

export async function updateDepartmentInfo(db: Db, id: number, input: { name?: string; status?: string }, actorId: number): Promise<void> {
  validateName(input.name);
  if (input.status == null) throw new BizError(ErrorCode.INPUT_VALUE_INVALID, "부서 상태를 선택하세요.");
  const department = await findDepartmentById(db, id);
  if (!department) throw new BizError(ErrorCode.INPUT_VALUE_INVALID, "존재하지 않는 부서입니다.");
  await db.transaction(async (tx) => {
    await updateDepartment(tx, { id, name: input.name!, status: input.status! });
    await recordAudit(tx, { actorId, action: "DEPARTMENT_UPDATED", targetType: "DEPARTMENT", targetId: id, detail: { code: department.code, name: input.name!, status: input.status! } });
  });
}
