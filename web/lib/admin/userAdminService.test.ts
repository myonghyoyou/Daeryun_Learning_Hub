import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { migrateTestDb, testDb, truncateAll } from "../../test/db";
import { auditLogs, departments, users } from "../db/schema";
import { BizError } from "../http/errors";
import type { AuthUser } from "../auth/types";
import { createAccount, generateTempPassword, listAccounts, updateAccount } from "./userAdminService";

const db = testDb();
let hq: { id: number }; let admin: { id: number }; let actor: AuthUser;
function msg(fn: () => Promise<unknown>): Promise<string> {
  return fn().then(() => { throw new Error("expected throw"); }, (e) => { if (e instanceof BizError) return e.message; throw e; });
}
beforeAll(async () => { await migrateTestDb(); });
beforeEach(async () => {
  await truncateAll();
  [hq] = await db.insert(departments).values({ name: "본사", code: "HQ" }).returning();
  [admin] = await db.insert(users).values({ employeeNo: "admin", name: "총괄", email: "admin@x.local", passwordHash: "h", departmentId: hq.id, role: "SUPER_ADMIN" }).returning();
  actor = { userId: admin.id, employeeNo: "admin", name: "총괄", role: "SUPER_ADMIN", departmentId: hq.id, mustChangePassword: false, track: "ADMIN" };
});

describe("generateTempPassword", () => {
  it("is 10 chars from the confusion-free charset", () => {
    for (let i = 0; i < 20; i++) {
      const p = generateTempPassword();
      expect(p).toHaveLength(10);
      expect(p).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789]{10}$/);
    }
  });
});

describe("createAccount (D6)", () => {
  it("creates an ACTIVE must-change user and returns the temp password; audit has employeeNo only", async () => {
    const res = await createAccount(db, { employeeNo: "1001", name: "홍길동", email: "hong@x.local", departmentId: hq.id, role: "EMPLOYEE" }, actor.userId);
    expect(res.employeeNo).toBe("1001");
    expect(res.temporaryPassword).toHaveLength(10);
    const [u] = await db.select().from(users).where(eq(users.employeeNo, "1001"));
    expect(u.mustChangePassword).toBe(true);
    expect(await bcrypt.compare(res.temporaryPassword, u.passwordHash)).toBe(true);
    const audit = (await db.select().from(auditLogs)).find((a) => a.action === "USER_CREATED")!;
    expect(audit.detail).toEqual({ employeeNo: "1001" }); // 비밀번호 미포함 (D6 성질 유지)
  });
  it("rejects duplicates and unknown department with the exact messages", async () => {
    expect(await msg(() => createAccount(db, { employeeNo: "admin", name: "x", email: "n@x.local", departmentId: hq.id, role: "EMPLOYEE" }, actor.userId))).toBe("이미 존재하는 사번입니다: admin");
    expect(await msg(() => createAccount(db, { employeeNo: "n1", name: "x", email: "ADMIN@x.local", departmentId: hq.id, role: "EMPLOYEE" }, actor.userId))).toBe("이미 사용 중인 회사 이메일입니다: ADMIN@x.local");
    expect(await msg(() => createAccount(db, { employeeNo: "n1", name: "x", email: "n@x.local", departmentId: 999999, role: "EMPLOYEE" }, actor.userId))).toBe("존재하지 않는 부서입니다.");
  });
  it("rejects blank/invalid fields with the exact messages", async () => {
    expect(await msg(() => createAccount(db, { employeeNo: " ", name: "x", email: "n@x.local", departmentId: hq.id, role: "EMPLOYEE" }, actor.userId))).toBe("사번을 입력하세요.");
    expect(await msg(() => createAccount(db, { employeeNo: "n1", name: " ", email: "n@x.local", departmentId: hq.id, role: "EMPLOYEE" }, actor.userId))).toBe("이름을 입력하세요.");
    expect(await msg(() => createAccount(db, { employeeNo: "n1", name: "x", email: "broken", departmentId: hq.id, role: "EMPLOYEE" }, actor.userId))).toBe("유효한 회사 이메일을 입력하세요.");
    expect(await msg(() => createAccount(db, { employeeNo: "n1", name: "x", email: "n@x.local", departmentId: hq.id, role: undefined }, actor.userId))).toBe("역할을 선택하세요.");
  });
});

describe("updateAccount admin-access protection", () => {
  it("blocks self role-drop and self-deactivation", async () => {
    expect(await msg(() => updateAccount(db, admin.id, { name: "총괄", email: "admin@x.local", departmentId: hq.id, role: "EMPLOYEE", status: "ACTIVE" }, actor))).toBe("본인의 총괄 관리자 역할은 스스로 해제할 수 없습니다.");
    expect(await msg(() => updateAccount(db, admin.id, { name: "총괄", email: "admin@x.local", departmentId: hq.id, role: "SUPER_ADMIN", status: "INACTIVE" }, actor))).toBe("본인 계정은 스스로 비활성화할 수 없습니다.");
  });
  it("blocks demoting the last active super admin (by another actor)", async () => {
    const [other] = await db.insert(users).values({ employeeNo: "sa2", name: "부관리", email: "sa2@x.local", passwordHash: "h", departmentId: hq.id, role: "SUPER_ADMIN" }).returning();
    const otherActor: AuthUser = { ...actor, userId: other.id, employeeNo: "sa2" };
    // other 가 admin 을 강등하려면 admin 외 활성 SUPER_ADMIN 이 있어야 한다(여기선 other 가 있어 성공해야 함)
    await updateAccount(db, admin.id, { name: "총괄", email: "admin@x.local", departmentId: hq.id, role: "EMPLOYEE", status: "ACTIVE" }, otherActor);
    // 이제 other 가 마지막 활성 SUPER_ADMIN — admin(이제 EMPLOYEE) 이 other 를 강등 시도하면 보호에 걸린다
    const adminActor: AuthUser = { ...actor, role: "EMPLOYEE" };
    expect(await msg(() => updateAccount(db, other.id, { name: "부관리", email: "sa2@x.local", departmentId: hq.id, role: "EMPLOYEE", status: "ACTIVE" }, adminActor)))
      .toBe("마지막 활성 총괄 관리자입니다. 다른 총괄 관리자를 먼저 지정한 뒤 역할 변경 또는 비활성화하세요.");
  });
  it("skips the email duplicate check when the email is unchanged (case-insensitive)", async () => {
    await updateAccount(db, admin.id, { name: "총괄", email: "ADMIN@x.local", departmentId: hq.id, role: "SUPER_ADMIN", status: "ACTIVE" }, actor);
    const [u] = await db.select().from(users).where(eq(users.id, admin.id));
    expect(u.email).toBe("ADMIN@x.local");
  });
  it("rejects updating a nonexistent account (U15)", async () => {
    expect(await msg(() => updateAccount(db, 999999, { name: "x", email: "n@x.local", departmentId: hq.id, role: "EMPLOYEE", status: "ACTIVE" }, actor)))
      .toBe("존재하지 않는 계정입니다.");
  });
});

describe("listAccounts", () => {
  it("joins department name, filters by department, orders by employee_no", async () => {
    const [dev] = await db.insert(departments).values({ name: "개발팀", code: "DEV" }).returning();
    await db.insert(users).values({ employeeNo: "e2", name: "b", email: "b@x.local", passwordHash: "h", departmentId: dev.id, role: "EMPLOYEE" });
    await db.insert(users).values({ employeeNo: "e1", name: "a", email: "a@x.local", passwordHash: "h", departmentId: dev.id, role: "EMPLOYEE" });
    const all = await listAccounts(db, null);
    expect(all.map((u) => u.employeeNo)).toEqual(["admin", "e1", "e2"]);
    const filtered = await listAccounts(db, dev.id);
    expect(filtered).toHaveLength(2);
    expect(filtered[0].departmentName).toBe("개발팀");
  });
});
