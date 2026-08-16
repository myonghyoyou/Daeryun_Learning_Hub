import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { eq } from "drizzle-orm";
import { migrateTestDb, testDb, truncateAll } from "../../test/db";
import { departments, users } from "./schema";
import { findByEmployeeNo, incrementFailedLogin, resetFailedLogin, updateLastLoginAt, updatePassword } from "./users";

const db = testDb();

async function seedUser(overrides: Partial<typeof users.$inferInsert> = {}) {
  const [dept] = await db.insert(departments).values({ name: "부서", code: "D" + Date.now() + Math.random() }).returning();
  const [user] = await db.insert(users).values({
    employeeNo: "E" + Date.now() + Math.random(), name: "홍길동", email: "u" + Date.now() + Math.random() + "@x.local",
    passwordHash: "hash", departmentId: dept.id, role: "EMPLOYEE", ...overrides,
  }).returning();
  return user;
}

beforeAll(async () => { await migrateTestDb(); });
beforeEach(async () => { await truncateAll(db); });

describe("users dao", () => {
  it("finds a user by employee number", async () => {
    const u = await seedUser({ employeeNo: "1001" });
    const found = await findByEmployeeNo(db, "1001");
    expect(found?.id).toBe(u.id);
    expect(await findByEmployeeNo(db, "nope")).toBeUndefined();
  });

  it("increments the failed count without locking below the threshold", async () => {
    const u = await seedUser({ failedLoginCount: 3 });
    const lockedUntil = await incrementFailedLogin(db, u.id, 5, new Date(Date.now() + 15 * 60000));
    expect(lockedUntil).toBeNull(); // 4 < 5
    const [after] = await db.select().from(users).where(eq(users.id, u.id));
    expect(after.failedLoginCount).toBe(4);
    expect(after.lockedUntil).toBeNull();
  });

  it("locks the account on the attempt that reaches the threshold", async () => {
    const u = await seedUser({ failedLoginCount: 4 });
    const until = new Date(Date.now() + 15 * 60000);
    const lockedUntil = await incrementFailedLogin(db, u.id, 5, until);
    expect(lockedUntil).not.toBeNull(); // 5 >= 5
    expect(lockedUntil!.getTime()).toBe(until.getTime());
    expect(lockedUntil!.getTime()).toBeGreaterThan(Date.now());
    const [after] = await db.select().from(users).where(eq(users.id, u.id));
    expect(after.failedLoginCount).toBe(5);
    expect(after.lockedUntil).not.toBeNull();
    expect(after.lockedUntil!.getTime()).toBe(until.getTime());
  });

  it("resets the failed count and clears the lock", async () => {
    const u = await seedUser({ failedLoginCount: 5, lockedUntil: new Date() });
    await resetFailedLogin(db, u.id);
    const [after] = await db.select().from(users).where(eq(users.id, u.id));
    expect(after.failedLoginCount).toBe(0);
    expect(after.lockedUntil).toBeNull();
  });

  it("updates last login and password (clearing mustChangePassword)", async () => {
    const u = await seedUser({ mustChangePassword: true });
    await updateLastLoginAt(db, u.id, new Date());
    await updatePassword(db, u.id, "newhash");
    const [after] = await db.select().from(users).where(eq(users.id, u.id));
    expect(after.lastLoginAt).not.toBeNull();
    expect(after.passwordHash).toBe("newhash");
    expect(after.mustChangePassword).toBe(false);
  });
});
