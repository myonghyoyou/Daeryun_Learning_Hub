import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import type { Db } from "./db/client";
import { departments, users } from "./db/schema";

// 부트스트랩이 만드는 유일한 부서. 예전에는 "본사"(HQ)를 만들었는데, 이 회사 조직에
// 본사라는 부서는 없다 — spec 2026-08-13-source-number-and-random-50 이 정한 12개
// 그룹은 "공통"과 실팀 11개다. 총괄관리자는 특정 팀에 속하지 않으므로 공통에 둔다.
const COMMON_CODE = "COMMON";
const COMMON_NAME = "공통";

export async function bootstrap(db: Db): Promise<void> {
  const existing = await db.select({ id: users.id }).from(users).where(eq(users.role, "SUPER_ADMIN")).limit(1);
  if (existing.length > 0) return;

  let [common] = await db.select().from(departments).where(eq(departments.code, COMMON_CODE));
  if (!common) {
    [common] = await db.insert(departments).values({ name: COMMON_NAME, code: COMMON_CODE, status: "ACTIVE" }).returning();
  }

  const employeeNo = required("BOOTSTRAP_ADMIN_EMPLOYEE_NO");
  const email = required("BOOTSTRAP_ADMIN_EMAIL");
  const password = required("BOOTSTRAP_ADMIN_PASSWORD");

  await db.insert(users).values({
    employeeNo,
    name: "총괄관리자",
    email,
    passwordHash: await bcrypt.hash(password, 10),
    departmentId: common.id,
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
