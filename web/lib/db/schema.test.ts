import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { eq } from "drizzle-orm";
import { migrateTestDb, testDb, truncateAll } from "../../test/db";
import { departments, users, problems } from "./schema";

const db = testDb();

beforeAll(async () => {
  await migrateTestDb();
});
beforeEach(async () => {
  await truncateAll();
});

describe("schema round-trip", () => {
  it("inserts and reads a department", async () => {
    const [row] = await db.insert(departments).values({ name: "본사", code: "HQ" }).returning();
    expect(row.status).toBe("ACTIVE"); // 기본값
    const found = await db.select().from(departments).where(eq(departments.id, row.id));
    expect(found[0].name).toBe("본사");
  });

  it("enforces the unique department code", async () => {
    await db.insert(departments).values({ name: "A", code: "DUP" });
    await expect(db.insert(departments).values({ name: "B", code: "DUP" })).rejects.toMatchObject({ code: "23505" });
  });

  it("enforces unique (department_id, source_number) on problems", async () => {
    const [dept] = await db.insert(departments).values({ name: "부서", code: "D1" }).returning();
    const [admin] = await db.insert(users).values({
      employeeNo: "A1", name: "관리", email: "a1@x.local", passwordHash: "h",
      departmentId: dept.id, role: "SUPER_ADMIN",
    }).returning();
    const base = { type: "SHORT_ANSWER" as const, content: "q", departmentId: dept.id, createdBy: admin.id, sourceNumber: 7 };
    await db.insert(problems).values(base);
    await expect(
      db.insert(problems).values({ ...base, content: "q2" }),
    ).rejects.toMatchObject({ code: "23505" });
  });
});
