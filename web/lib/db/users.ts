import { eq, sql } from "drizzle-orm";
import type { getDb } from "./client";
import { users } from "./schema";

export type Db = ReturnType<typeof getDb>;

export async function findByEmployeeNo(db: Db, employeeNo: string) {
  const rows = await db.select().from(users).where(eq(users.employeeNo, employeeNo)).limit(1);
  return rows[0];
}

/**
 * 실패 카운트 증가 + 잠금 판정을 원자적 단일 문장으로. 현재 MyBatis incrementFailedLogin 미러.
 * JS 에서 카운트를 읽어 계산하면 동시 요청이 잠금을 우회한다.
 */
export async function incrementFailedLogin(
  db: Db, userId: number, maxFailedAttempts: number, lockedUntil: Date,
): Promise<Date | null> {
  const rows = await db.execute(sql`
    UPDATE users
    SET failed_login_count = failed_login_count + 1,
        locked_until = CASE
          WHEN failed_login_count + 1 >= ${maxFailedAttempts} THEN ${lockedUntil.toISOString()}
          ELSE locked_until
        END
    WHERE id = ${userId}
    RETURNING locked_until
  `);
  const raw = (rows as unknown as Array<{ locked_until: Date | string | null }>)[0]?.locked_until ?? null;
  return raw === null ? null : raw instanceof Date ? raw : new Date(raw);
}

export async function resetFailedLogin(db: Db, userId: number): Promise<void> {
  await db.update(users).set({ failedLoginCount: 0, lockedUntil: null }).where(eq(users.id, userId));
}

export async function updateLastLoginAt(db: Db, userId: number, at: Date): Promise<void> {
  await db.update(users).set({ lastLoginAt: at }).where(eq(users.id, userId));
}

export async function updatePassword(db: Db, userId: number, passwordHash: string): Promise<void> {
  await db.update(users).set({ passwordHash, mustChangePassword: false }).where(eq(users.id, userId));
}
