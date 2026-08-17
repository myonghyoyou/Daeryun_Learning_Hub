import { and, asc, eq, ne, sql } from "drizzle-orm";
import type { DbConn } from "./client";
import { executeRows, parseUtcTimestamp } from "./raw";
import { departments, users } from "./schema";

export async function findByEmployeeNo(db: DbConn, employeeNo: string) {
  const rows = await db.select().from(users).where(eq(users.employeeNo, employeeNo)).limit(1);
  return rows[0];
}

/**
 * 실패 카운트 증가 + 잠금 판정을 원자적 단일 문장으로. 현재 MyBatis incrementFailedLogin 미러.
 * JS 에서 카운트를 읽어 계산하면 동시 요청이 잠금을 우회한다.
 */
export async function incrementFailedLogin(
  db: DbConn, userId: number, maxFailedAttempts: number, lockedUntil: Date,
): Promise<Date | null> {
  const rows = await executeRows<{ locked_until: string | null }>(db, sql`
    UPDATE users
    SET failed_login_count = failed_login_count + 1,
        locked_until = CASE
          WHEN failed_login_count + 1 >= ${maxFailedAttempts} THEN ${lockedUntil.toISOString()}
          ELSE locked_until
        END
    WHERE id = ${userId}
    RETURNING locked_until::text
  `);
  const raw = rows[0]?.locked_until ?? null;
  return parseUtcTimestamp(raw);
}

export async function resetFailedLogin(db: DbConn, userId: number): Promise<void> {
  await db.update(users).set({ failedLoginCount: 0, lockedUntil: null }).where(eq(users.id, userId));
}

export async function updateLastLoginAt(db: DbConn, userId: number, at: Date): Promise<void> {
  await db.update(users).set({ lastLoginAt: at }).where(eq(users.id, userId));
}

export async function updatePassword(db: DbConn, userId: number, passwordHash: string): Promise<void> {
  await db.update(users).set({ passwordHash, mustChangePassword: false }).where(eq(users.id, userId));
}

export async function listUsers(db: DbConn, departmentId: number | null) {
  const base = db.select({
    id: users.id, employeeNo: users.employeeNo, name: users.name, email: users.email,
    departmentId: users.departmentId, departmentName: departments.name,
    role: users.role, status: users.status, lastLoginAt: users.lastLoginAt,
  }).from(users).innerJoin(departments, eq(departments.id, users.departmentId));
  const rows = departmentId == null ? await base.orderBy(asc(users.employeeNo))
    : await base.where(eq(users.departmentId, departmentId)).orderBy(asc(users.employeeNo));
  return rows;
}
export async function existsByEmployeeNo(db: DbConn, employeeNo: string): Promise<boolean> {
  return (await db.select({ id: users.id }).from(users).where(eq(users.employeeNo, employeeNo)).limit(1)).length > 0;
}
export async function existsByEmail(db: DbConn, email: string): Promise<boolean> {
  return (await db.select({ id: users.id }).from(users)
    .where(sql`lower(${users.email}) = lower(${email})`).limit(1)).length > 0;
}
export async function countActiveSuperAdminsExcluding(db: DbConn, userId: number): Promise<number> {
  const rows = await db.select({ id: users.id }).from(users)
    .where(and(eq(users.role, "SUPER_ADMIN"), eq(users.status, "ACTIVE"), ne(users.id, userId)));
  return rows.length;
}
export async function findUserById(db: DbConn, id: number) {
  return (await db.select().from(users).where(eq(users.id, id)).limit(1))[0];
}
export async function insertUser(db: DbConn, values: typeof users.$inferInsert) {
  const [row] = await db.insert(users).values(values).returning();
  return row;
}
export async function updateUserAdminFields(db: DbConn, input: { id: number; name: string; email: string; departmentId: number; role: string; status: string }) {
  await db.update(users).set({ name: input.name, email: input.email, departmentId: input.departmentId, role: input.role, status: input.status }).where(eq(users.id, input.id));
}
