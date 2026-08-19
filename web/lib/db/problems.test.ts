import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { migrateTestDb, testDb, truncateAll } from "../../test/db";
import { insertProblem, findProblemById, findMaxSourceNumber, updateDepartmentAndSourceNumber } from "./problems";
import { departments, users } from "./schema";

const db = testDb();
let deptA = 0, deptB = 0, userId = 0;

beforeAll(async () => { await migrateTestDb(); });
beforeEach(async () => {
  await truncateAll(db);
  [{ id: deptA }] = await db.insert(departments).values({ name: "가팀", code: "A", status: "ACTIVE" }).returning({ id: departments.id });
  [{ id: deptB }] = await db.insert(departments).values({ name: "나팀", code: "B", status: "ACTIVE" }).returning({ id: departments.id });
  [{ id: userId }] = await db.insert(users).values({
    employeeNo: "admin", name: "관리자", email: "a@b.c", passwordHash: "x",
    departmentId: deptA, role: "SUPER_ADMIN", status: "ACTIVE", mustChangePassword: false,
  }).returning({ id: users.id });
});

describe("problems DAO", () => {
  it("insert 한 값을 그대로 읽어 온다", async () => {
    const id = await insertProblem(db, {
      type: "OX", content: "본문", status: "ACTIVE",
      departmentId: deptA, sourceNumber: 7, createdBy: userId,
    });
    const row = await findProblemById(db, id);
    expect(row?.sourceNumber).toBe(7);
    expect(row?.departmentId).toBe(deptA);
    expect(row?.type).toBe("OX");
  });

  it("findMaxSourceNumber 는 보관된 문제도 센다", async () => {
    // spec D5: 번호는 재사용하지 않는다. 보관된 문제가 번호를 계속 점유한다.
    // 보관본에 더 높은 번호를 주어, 상태 필터가 끼어들면 실패하는 모양으로 고정한다.
    await insertProblem(db, { type: "OX", content: "활성", status: "ACTIVE", departmentId: deptA, sourceNumber: 5, createdBy: userId });
    await insertProblem(db, { type: "OX", content: "보관", status: "ARCHIVED", departmentId: deptA, sourceNumber: 9, createdBy: userId });
    expect(await findMaxSourceNumber(db, deptA)).toBe(9);
  });

  it("findMaxSourceNumber 는 다른 부서를 세지 않는다", async () => {
    await insertProblem(db, { type: "OX", content: "가", status: "ACTIVE", departmentId: deptA, sourceNumber: 100, createdBy: userId });
    expect(await findMaxSourceNumber(db, deptB)).toBeNull();
  });

  it("번호가 없는 행은 같은 부서에 여러 개 공존한다", async () => {
    // PostgreSQL 의 UNIQUE 는 NULL 을 서로 다른 값으로 본다. 기존 데이터가 이 상태다.
    await insertProblem(db, { type: "OX", content: "1", status: "ACTIVE", departmentId: deptA, sourceNumber: null, createdBy: userId });
    await insertProblem(db, { type: "OX", content: "2", status: "ACTIVE", departmentId: deptA, sourceNumber: null, createdBy: userId });
    expect(await findMaxSourceNumber(db, deptA)).toBeNull();
  });

  it("같은 부서에 같은 번호를 넣으면 23505 로 거부된다", async () => {
    await insertProblem(db, { type: "OX", content: "1", status: "ACTIVE", departmentId: deptA, sourceNumber: 3, createdBy: userId });
    await expect(
      insertProblem(db, { type: "OX", content: "2", status: "ACTIVE", departmentId: deptA, sourceNumber: 3, createdBy: userId }),
    ).rejects.toMatchObject({ code: "23505", constraint_name: "uq_problems_department_source_number" });
  });

  it("updateDepartmentAndSourceNumber 는 두 컬럼을 함께 바꾼다", async () => {
    const id = await insertProblem(db, { type: "OX", content: "x", status: "ACTIVE", departmentId: deptA, sourceNumber: 1, createdBy: userId });
    await updateDepartmentAndSourceNumber(db, id, deptB, 41);
    const row = await findProblemById(db, id);
    expect(row?.departmentId).toBe(deptB);
    expect(row?.sourceNumber).toBe(41);
  });
});
