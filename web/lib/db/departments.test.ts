import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { migrateTestDb, testDb, truncateAll } from "../../test/db";
import { problems, users } from "./schema";
import { findAllDepartments, findDepartmentByCode, findDepartmentById, findDepartmentsWithProblems, insertDepartment, updateDepartment } from "./departments";

const db = testDb();
beforeAll(async () => { await migrateTestDb(); });
beforeEach(async () => { await truncateAll(); });

describe("departments dao", () => {
  it("inserts, finds by id/code, lists ordered by name", async () => {
    // 정렬 단언은 ASCII 이름으로 — 한글 정렬은 DB 콜레이션(C vs en_US.utf8)에 따라 달라 플래키하다.
    const b = await insertDepartment(db, { name: "beta", code: "B1" });
    await insertDepartment(db, { name: "alpha", code: "A1" });
    expect((await findDepartmentById(db, b.id))?.code).toBe("B1");
    expect((await findDepartmentByCode(db, "A1"))?.name).toBe("alpha");
    expect((await findAllDepartments(db)).map((d) => d.name)).toEqual(["alpha", "beta"]);
  });
  it("updates only name and status", async () => {
    const d = await insertDepartment(db, { name: "이전", code: "C1" });
    await updateDepartment(db, { id: d.id, name: "이후", status: "INACTIVE" });
    const after = await findDepartmentById(db, d.id);
    expect(after?.name).toBe("이후");
    expect(after?.status).toBe("INACTIVE");
    expect(after?.code).toBe("C1"); // code 는 불변
  });
});

describe("findDepartmentsWithProblems", () => {
  // 부서 이름은 ASCII 로 짓는다 — 위 주석대로 한글 정렬은 DB 콜레이션에 따라 플래키하다.
  async function seedProblem(code: string, over: Record<string, unknown> = {}) {
    const dept = await insertDepartment(db, { name: `dept-${code}`, code });
    const [owner] = await db.insert(users).values({
      employeeNo: `emp-${code}`, name: "관리자", email: `${code}@x.local`,
      passwordHash: "h", departmentId: dept.id, role: "SUPER_ADMIN",
    }).returning();
    await db.insert(problems).values({
      type: "OX", content: "본문", departmentId: dept.id, createdBy: owner.id, ...over,
    });
    return dept;
  }

  it("그 직군의 문제가 있는 부서만 낸다", async () => {
    await seedProblem("A1", { track: "ADMIN" });
    await seedProblem("T1", { track: "TECH" });

    expect((await findDepartmentsWithProblems(db, "ADMIN")).map((d) => d.code)).toEqual(["A1"]);
    expect((await findDepartmentsWithProblems(db, "TECH")).map((d) => d.code)).toEqual(["T1"]);
  });

  it("보관된 문제만 있는 부서는 빠진다", async () => {
    await seedProblem("A2", { track: "ADMIN", status: "ARCHIVED" });
    expect(await findDepartmentsWithProblems(db, "ADMIN")).toEqual([]);
  });

  // selectDistinct 확인 — 문제가 여러 개라고 부서가 여러 번 나오면 안 된다.
  it("한 부서에 문제가 여러 개여도 한 번만 나온다", async () => {
    const dept = await seedProblem("M1", { track: "ADMIN" });
    const [owner] = await db.select().from(users);
    await db.insert(problems).values({
      type: "OX", content: "둘째", departmentId: dept.id, createdBy: owner.id, track: "ADMIN",
    });
    expect((await findDepartmentsWithProblems(db, "ADMIN")).map((d) => d.code)).toEqual(["M1"]);
  });
});
