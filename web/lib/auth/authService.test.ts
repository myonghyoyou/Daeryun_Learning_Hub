import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { migrateTestDb, testDb, truncateAll } from "../../test/db";
import { departments, users } from "../db/schema";
import { BizError } from "../http/errors";
import { login, sessionStatus, changePassword } from "./authService";
import type { AuthUser } from "./types";

const db = testDb();

async function seedUser(opts: { password?: string; status?: string; mustChange?: boolean; failed?: number; lockedUntil?: Date | null } = {}) {
  const [dept] = await db.insert(departments).values({ name: "개발팀", code: "D" + Math.random() }).returning();
  const [user] = await db.insert(users).values({
    employeeNo: "1001", name: "홍길동", email: "u" + Math.random() + "@x.local",
    passwordHash: await bcrypt.hash(opts.password ?? "password1", 10),
    departmentId: dept.id, role: "EMPLOYEE", status: opts.status ?? "ACTIVE",
    mustChangePassword: opts.mustChange ?? false, failedLoginCount: opts.failed ?? 0, lockedUntil: opts.lockedUntil ?? null,
  }).returning();
  return { user, dept };
}

function code(fn: () => Promise<unknown>): Promise<number> {
  return fn().then(() => { throw new Error("expected throw"); }, (e) => {
    if (e instanceof BizError) return e.errorCode.code;
    throw e;
  });
}

beforeAll(async () => { await migrateTestDb(); });
beforeEach(async () => { await truncateAll(); });

describe("login", () => {
  it("succeeds and returns name/role/mustChangePassword; resets failures", async () => {
    const { user } = await seedUser({ failed: 3 });
    const { authUser, response } = await login(db, { employeeNo: "1001", password: "password1" });
    expect(response).toEqual({ name: "홍길동", role: "EMPLOYEE", mustChangePassword: false });
    expect(authUser.userId).toBe(user.id);
    const [after] = await db.select().from(users).where(eq(users.id, user.id));
    expect(after.failedLoginCount).toBe(0);
    expect(after.lastLoginAt).not.toBeNull();
  });

  it("rejects blank credentials with 1000", async () => {
    expect(await code(() => login(db, { employeeNo: "", password: "" }))).toBe(1000);
  });
  it("rejects unknown employeeNo with 1011", async () => {
    expect(await code(() => login(db, { employeeNo: "nope", password: "x" }))).toBe(1011);
  });
  it("rejects an inactive account with 1011", async () => {
    await seedUser({ status: "INACTIVE" });
    expect(await code(() => login(db, { employeeNo: "1001", password: "password1" }))).toBe(1011);
  });
  it("wrong password below threshold reports 1011 and increments", async () => {
    const { user } = await seedUser({ failed: 0 });
    expect(await code(() => login(db, { employeeNo: "1001", password: "wrong" }))).toBe(1011);
    const [after] = await db.select().from(users).where(eq(users.id, user.id));
    expect(after.failedLoginCount).toBe(1);
  });
  it("the attempt that reaches 5 reports 1010 (ACCOUNT_LOCKED, not LOGIN_FAILED)", async () => {
    await seedUser({ failed: 4 });
    expect(await code(() => login(db, { employeeNo: "1001", password: "wrong" }))).toBe(1010);
  });
  it("a locked account rejects with 1010 even with the correct password", async () => {
    await seedUser({ lockedUntil: new Date(Date.now() + 15 * 60000) });
    expect(await code(() => login(db, { employeeNo: "1001", password: "password1" }))).toBe(1010);
  });
});

describe("sessionStatus", () => {
  it("returns not-logged-in shape for a null user", async () => {
    expect(await sessionStatus(db, null)).toEqual({
      isLoggedIn: false, employeeNo: null, name: null, role: null,
      departmentId: null, departmentName: null, mustChangePassword: false,
    });
  });
  it("returns the logged-in shape with a fresh department name", async () => {
    const { user, dept } = await seedUser();
    const authUser: AuthUser = { userId: user.id, employeeNo: "1001", name: "홍길동", role: "EMPLOYEE", departmentId: dept.id, mustChangePassword: false, track: "ADMIN" };
    expect(await sessionStatus(db, authUser)).toEqual({
      isLoggedIn: true, employeeNo: "1001", name: "홍길동", role: "EMPLOYEE",
      departmentId: dept.id, departmentName: "개발팀", mustChangePassword: false,
    });
  });
});

describe("changePassword", () => {
  it("rejects a short password with 1000", async () => {
    const { user, dept } = await seedUser();
    const authUser: AuthUser = { userId: user.id, employeeNo: "1001", name: "홍길동", role: "EMPLOYEE", departmentId: dept.id, mustChangePassword: true, track: "ADMIN" };
    expect(await code(() => changePassword(db, authUser, "short7!"))).toBe(1000);
  });
  it("rejects when there is no session user with 980", async () => {
    expect(await code(() => changePassword(db, null, "longenough1"))).toBe(980);
  });
  it("rejects reusing the current password with 1000", async () => {
    const { user, dept } = await seedUser({ password: "password1" });
    const authUser: AuthUser = { userId: user.id, employeeNo: "1001", name: "홍길동", role: "EMPLOYEE", departmentId: dept.id, mustChangePassword: true, track: "ADMIN" };
    expect(await code(() => changePassword(db, authUser, "password1"))).toBe(1000);
  });
  it("changes the password, clears mustChangePassword, returns updated authUser", async () => {
    const { user, dept } = await seedUser({ password: "password1", mustChange: true });
    const authUser: AuthUser = { userId: user.id, employeeNo: "1001", name: "홍길동", role: "EMPLOYEE", departmentId: dept.id, mustChangePassword: true, track: "ADMIN" };
    const updated = await changePassword(db, authUser, "brandnew123");
    expect(updated.mustChangePassword).toBe(false);
    const [after] = await db.select().from(users).where(eq(users.id, user.id));
    expect(after.mustChangePassword).toBe(false);
    expect(await bcrypt.compare("brandnew123", after.passwordHash)).toBe(true);
  });
});
