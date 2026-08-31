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
  it("creates the 공통 department and a super admin when none exists", async () => {
    await bootstrap(db);

    // 부트스트랩이 만드는 부서는 "공통"(COMMON) 하나다. "본사"는 이 회사 조직에 없는
    // 부트스트랩 산물이었다 — spec 2026-08-13 이 정한 12개 그룹은 공통과 실팀 11개다.
    const [common] = await db.select().from(departments).where(eq(departments.code, "COMMON"));
    expect(common.name).toBe("공통");

    const [hq] = await db.select().from(departments).where(eq(departments.code, "HQ"));
    expect(hq).toBeUndefined();

    const [admin] = await db.select().from(users).where(eq(users.role, "SUPER_ADMIN"));
    expect(admin.employeeNo).toBe("admin");
    expect(admin.name).toBe("총괄관리자");
    expect(admin.mustChangePassword).toBe(true);
    expect(admin.departmentId).toBe(common.id);
    expect(await bcrypt.compare("changeme1234", admin.passwordHash)).toBe(true);
  });

  it("is idempotent — a second run creates no second admin", async () => {
    await bootstrap(db);
    await bootstrap(db);
    const admins = await db.select().from(users).where(eq(users.role, "SUPER_ADMIN"));
    expect(admins).toHaveLength(1);
  });
});
