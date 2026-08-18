import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import type { Db } from "./db/client";
import { departments, users } from "./db/schema";

const HQ_CODE = "HQ";
const HQ_NAME = "본사";

export async function bootstrap(db: Db): Promise<void> {
  const existing = await db.select({ id: users.id }).from(users).where(eq(users.role, "SUPER_ADMIN")).limit(1);
  if (existing.length > 0) return;

  let [hq] = await db.select().from(departments).where(eq(departments.code, HQ_CODE));
  if (!hq) {
    [hq] = await db.insert(departments).values({ name: HQ_NAME, code: HQ_CODE, status: "ACTIVE" }).returning();
  }

  const employeeNo = required("BOOTSTRAP_ADMIN_EMPLOYEE_NO");
  const email = required("BOOTSTRAP_ADMIN_EMAIL");
  const password = required("BOOTSTRAP_ADMIN_PASSWORD");

  await db.insert(users).values({
    employeeNo,
    name: "총괄관리자",
    email,
    passwordHash: await bcrypt.hash(password, 10),
    departmentId: hq.id,
    role: "SUPER_ADMIN",
    status: "ACTIVE",
    mustChangePassword: true,
  });
}

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} 이 설정되지 않았습니다.`);
  return value;
}
