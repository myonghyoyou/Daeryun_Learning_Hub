import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { migrateTestDb, testDb, truncateAll } from "../test/db";
import { departments, users } from "./db/schema";
import { bootstrap } from "./bootstrap";

const db = testDb();

beforeAll(async () => {
  await migrateTestDb();
  process.env.BOOTSTRAP_ADMIN_EMPLOYEE_NO = "admin";
  process.env.BOOTSTRAP_ADMIN_EMAIL = "admin@company.local";
  process.env.BOOTSTRAP_ADMIN_PASSWORD = "changeme1234";
});
beforeEach(async () => {
  await truncateAll();
});

describe("bootstrap", () => {
  it("creates the HQ department and a super admin when none exists", async () => {
    await bootstrap(db);

    const [hq] = await db.select().from(departments).where(eq(departments.code, "HQ"));
    expect(hq.name).toBe("본사");

    const [admin] = await db.select().from(users).where(eq(users.role, "SUPER_ADMIN"));
    expect(admin.employeeNo).toBe("admin");
    expect(admin.name).toBe("총괄관리자");
    expect(admin.mustChangePassword).toBe(true);
    expect(admin.departmentId).toBe(hq.id);
    expect(await bcrypt.compare("changeme1234", admin.passwordHash)).toBe(true);
  });

  it("is idempotent — a second run creates no second admin", async () => {
    await bootstrap(db);
    await bootstrap(db);
    const admins = await db.select().from(users).where(eq(users.role, "SUPER_ADMIN"));
    expect(admins).toHaveLength(1);
  });
});
