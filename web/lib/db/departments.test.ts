import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { migrateTestDb, testDb, truncateAll } from "../../test/db";
import { findAllDepartments, findDepartmentByCode, findDepartmentById, insertDepartment, updateDepartment } from "./departments";

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
