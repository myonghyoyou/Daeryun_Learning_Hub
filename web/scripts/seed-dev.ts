// tsx 는 .env 를 로드하지 않는다(drizzle-kit 은 한다). 이 import 가 없으면 .env 가
// 채워져 있어도 getDb() 가 "DATABASE_URL 이 설정되지 않았습니다." 로 죽는다.
// 부수효과 import 라 다른 import 보다 먼저 와야 한다. (scripts/bootstrap.ts 와 같은 이유)
import "dotenv/config";

import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { getDb } from "../lib/db/client";
import { departments, users } from "../lib/db/schema";
import { assertSeedableEnvironment, buildSeedUsers, HQ, SEED_PASSWORD, SEED_TEAMS } from "../lib/devSeed";

async function main() {
  // 로컬 DB 가 아니면 여기서 멈춘다. 운영에 테스트 계정이 섞이면 배포 결정 D8 이 무너진다.
  assertSeedableEnvironment(process.env);

  const db = getDb();

  // 부서: 코드 기준으로 없을 때만 만든다. 이미 있는 부서의 이름·상태는 건드리지 않는다
  // (로컬에는 INACTIVE 로 바꿔 둔 QA 부서가 있고, 그 상태가 검증 대상이다).
  const departmentIdByCode = new Map<string, number>();
  let createdDepartments = 0;
  let renamedDepartments = 0;
  for (const dept of [HQ, ...SEED_TEAMS]) {
    const [found] = await db.select().from(departments).where(eq(departments.code, dept.code));
    if (found) {
      departmentIdByCode.set(dept.code, found.id);
      // 위 규칙의 유일한 예외: 부트스트랩이 HQ 를 "본사"로 만들어 두면 공통문제가 "본사"
      // 소속으로 보인다(lib/devSeed.ts HQ 주석 참고). 로컬에서만 이름을 맞춘다.
      if (dept.code === HQ.code && found.name !== HQ.name) {
        await db.update(departments).set({ name: HQ.name }).where(eq(departments.id, found.id));
        renamedDepartments++;
      }
      continue;
    }
    const [created] = await db.insert(departments).values({ name: dept.name, code: dept.code, status: "ACTIVE" }).returning();
    departmentIdByCode.set(dept.code, created.id);
    createdDepartments++;
  }

  // 계정: 사번이 이미 있으면 건너뛴다. 기존 QA 계정의 비밀번호·역할을 덮어쓰지 않는다.
  // 해시는 계정마다 다시 만들지 않고 한 번만 만든다 — bcrypt cost 10 을 29번 도는 건 낭비다.
  const passwordHash = await bcrypt.hash(SEED_PASSWORD, 10);
  let createdUsers = 0;
  let skippedUsers = 0;
  for (const user of buildSeedUsers()) {
    const [found] = await db.select({ id: users.id }).from(users).where(eq(users.employeeNo, user.employeeNo));
    if (found) {
      skippedUsers++;
      continue;
    }
    await db.insert(users).values({
      employeeNo: user.employeeNo,
      name: user.name,
      email: user.email,
      passwordHash,
      departmentId: departmentIdByCode.get(user.departmentCode)!,
      role: user.role,
      status: "ACTIVE",
      // 테스트 계정은 로그인할 때마다 비밀번호 변경 화면으로 끌려가면 안 된다.
      // 스키마 기본값이 true 라 반드시 명시해야 한다.
      mustChangePassword: false,
    });
    createdUsers++;
  }

  console.log(`부서: ${createdDepartments}개 생성, ${renamedDepartments}개 이름 정정, ${SEED_TEAMS.length + 1 - createdDepartments}개 기존 유지`);
  console.log(`계정: ${createdUsers}개 생성, ${skippedUsers}개 기존 유지 (공통 비밀번호: ${SEED_PASSWORD})`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("seed-dev 실패", error);
    process.exit(1);
  });
