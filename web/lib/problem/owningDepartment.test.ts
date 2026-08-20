import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { migrateTestDb, testDb, truncateAll } from "../../test/db";
import { departments } from "../db/schema";
import type { AuthUser } from "../auth/types";
import { resolveOwningDepartment } from "./owningDepartment";

const db = testDb();
let deptA = 0, deptB = 0, inactiveDeptId = 0;
let superAdmin: AuthUser;

beforeAll(async () => { await migrateTestDb(); });
beforeEach(async () => {
  await truncateAll(db);
  [{ id: deptA }] = await db.insert(departments).values({ name: "가팀", code: "A", status: "ACTIVE" }).returning({ id: departments.id });
  [{ id: deptB }] = await db.insert(departments).values({ name: "나팀", code: "B", status: "ACTIVE" }).returning({ id: departments.id });
  [{ id: inactiveDeptId }] = await db.insert(departments).values({ name: "폐지팀", code: "Z", status: "INACTIVE" }).returning({ id: departments.id });
  superAdmin = { userId: 1, role: "SUPER_ADMIN", departmentId: deptA } as AuthUser;
});

describe("resolveOwningDepartment", () => {
  it("총괄 관리자가 지정한 부서를 그대로 쓴다", async () => {
    expect(await resolveOwningDepartment(db, deptB, superAdmin)).toBe(deptB);
  });

  it("부서 관리자는 요청한 부서를 무시하고 자기 부서로 강제된다", async () => {
    // 화면의 disabled 는 실수 방지일 뿐이다. 파라미터 위조는 여기서 막는다.
    const actor = { userId: 1, role: "DEPT_ADMIN", departmentId: deptA } as AuthUser;
    expect(await resolveOwningDepartment(db, deptB, actor)).toBe(deptA);
  });

  it("부서 관리자는 부서를 안 줘도 자기 부서로 해석된다", async () => {
    const actor = { userId: 1, role: "DEPT_ADMIN", departmentId: deptA } as AuthUser;
    expect(await resolveOwningDepartment(db, null, actor)).toBe(deptA);
  });

  it("총괄 관리자가 부서를 안 주면 막는다", async () => {
    await expect(resolveOwningDepartment(db, null, superAdmin)).rejects.toThrow("문제가 귀속될 부서를 선택하세요.");
  });

  it("없는 부서를 막는다", async () => {
    await expect(resolveOwningDepartment(db, 999999, superAdmin)).rejects.toThrow("존재하지 않는 부서입니다.");
  });

  it("비활성 부서를 막고 부서명을 문구에 넣는다", async () => {
    await expect(resolveOwningDepartment(db, inactiveDeptId, superAdmin)).rejects.toThrow("비활성 부서에는 문제를 등록할 수 없습니다: 폐지팀");
  });
});
