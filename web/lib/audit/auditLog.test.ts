import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { migrateTestDb, testDb, truncateAll } from "../../test/db";
import { auditLogs, departments, users } from "../db/schema";
import { recordAudit } from "./auditLog";

const db = testDb();
async function seedActor() {
  const [d] = await db.insert(departments).values({ name: "부서", code: "D" + Math.random() }).returning();
  const [u] = await db.insert(users).values({
    employeeNo: "A" + Math.random(), name: "관리", email: "a" + Math.random() + "@x.local",
    passwordHash: "h", departmentId: d.id, role: "SUPER_ADMIN",
  }).returning();
  return u.id;
}
beforeAll(async () => { await migrateTestDb(); });
beforeEach(async () => { await truncateAll(); });

describe("recordAudit (fail-closed)", () => {
  it("writes an audit row with jsonb detail", async () => {
    const actorId = await seedActor();
    await recordAudit(db, { actorId, action: "DEPARTMENT_CREATED", targetType: "DEPARTMENT", targetId: 7, detail: { code: "HQ" } });
    const rows = await db.select().from(auditLogs);
    expect(rows).toHaveLength(1);
    expect(rows[0].action).toBe("DEPARTMENT_CREATED");
    expect(rows[0].detail).toEqual({ code: "HQ" });
  });
  it("allows a null detail", async () => {
    const actorId = await seedActor();
    await recordAudit(db, { actorId, action: "X", targetType: "Y", targetId: null, detail: null });
    expect(await db.select().from(auditLogs)).toHaveLength(1);
  });
  it("rejects any key containing 'password' — recursively", async () => {
    const actorId = await seedActor();
    await expect(recordAudit(db, { actorId, action: "X", targetType: "Y", targetId: 1, detail: { temporaryPassword: "p" } }))
      .rejects.toThrow(/password/);
    await expect(recordAudit(db, { actorId, action: "X", targetType: "Y", targetId: 1, detail: { nested: { PassWordHash: "h" } } }))
      .rejects.toThrow(/password/);
    expect(await db.select().from(auditLogs)).toHaveLength(0); // fail-closed: 한 행도 안 남는다
  });
});
