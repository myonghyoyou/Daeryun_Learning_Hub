import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { migrateTestDb, testDb, truncateAll } from "../../test/db";
import { auditLogs, departments, users } from "../db/schema";
import { BizError } from "../http/errors";
import { createDepartment, listDepartments, updateDepartmentInfo } from "./departmentService";

const db = testDb();
let actorId: number;
async function seedActor() {
  const [d] = await db.insert(departments).values({ name: "본사", code: "HQ" }).returning();
  const [u] = await db.insert(users).values({
    employeeNo: "admin", name: "총괄", email: "admin@x.local", passwordHash: "h",
    departmentId: d.id, role: "SUPER_ADMIN",
  }).returning();
  return u.id;
}
function msg(fn: () => Promise<unknown>): Promise<string> {
  return fn().then(() => { throw new Error("expected throw"); }, (e) => {
    if (e instanceof BizError) return e.message; throw e;
  });
}
beforeAll(async () => { await migrateTestDb(); });
beforeEach(async () => { await truncateAll(db); actorId = await seedActor(); });

describe("createDepartment", () => {
  it("creates ACTIVE and records audit {code}", async () => {
    await createDepartment(db, { name: "개발팀", code: "DEV" }, actorId);
    const rows = await listDepartments(db);
    expect(rows.map((r) => r.code)).toContain("DEV");
    const [audit] = (await db.select().from(auditLogs)).filter((a) => a.action === "DEPARTMENT_CREATED");
    expect(audit.detail).toEqual({ code: "DEV" });
  });
  it("rejects blank/overlong name and code with the exact messages", async () => {
    expect(await msg(() => createDepartment(db, { name: " ", code: "X" }, actorId))).toBe("부서명을 입력하세요.");
    expect(await msg(() => createDepartment(db, { name: "a".repeat(101), code: "X" }, actorId))).toBe("부서명은 100자를 넘을 수 없습니다.");
    expect(await msg(() => createDepartment(db, { name: "팀", code: " " }, actorId))).toBe("부서 코드를 입력하세요.");
    expect(await msg(() => createDepartment(db, { name: "팀", code: "c".repeat(51) }, actorId))).toBe("부서 코드는 50자를 넘을 수 없습니다.");
  });
  it("rejects a duplicate code with the exact message", async () => {
    expect(await msg(() => createDepartment(db, { name: "중복", code: "HQ" }, actorId))).toBe("이미 존재하는 부서 코드입니다: HQ");
  });
});

describe("updateDepartmentInfo", () => {
  it("updates name/status only and records audit", async () => {
    const [dept] = (await listDepartments(db)).filter((d) => d.code === "HQ");
    await updateDepartmentInfo(db, dept.id, { name: "본사(개칭)", status: "INACTIVE" }, actorId);
    const after = (await listDepartments(db)).find((d) => d.id === dept.id)!;
    expect(after.name).toBe("본사(개칭)");
    expect(after.status).toBe("INACTIVE");
  });
  it("rejects missing status and unknown id with the exact messages", async () => {
    const [dept] = await listDepartments(db);
    expect(await msg(() => updateDepartmentInfo(db, dept.id, { name: "x", status: undefined }, actorId))).toBe("부서 상태를 선택하세요.");
    expect(await msg(() => updateDepartmentInfo(db, 999999, { name: "x", status: "ACTIVE" }, actorId))).toBe("존재하지 않는 부서입니다.");
  });
});
