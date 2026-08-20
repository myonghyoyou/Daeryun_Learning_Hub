import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { sql } from "drizzle-orm";
import * as schema from "../lib/db/schema";

// truncateAll 이 13개 테이블을 CASCADE 로 비운다. 그러므로 이 URL 은 테스트 DB 외에는
// 절대 향해선 안 된다. 앱의 DATABASE_URL 은 여기서 읽지 않는다 — .env 를 로드한 테스트 파일
// 하나가 스위트 전체를 개발 DB 로 돌려 버리기 때문이다(test/env.ts 주석 참고).
const url = process.env.TEST_DATABASE_URL ?? "postgres://probank:probank_dev@localhost:5434/probank_test";

// 조용한 폴백 대신 시끄러운 실패. 이름으로 테스트 DB 임이 증명되지 않으면 아예 붙지 않는다.
const targetDb = new URL(url).pathname.split("/").pop() ?? "";
if (!/_test$/.test(targetDb)) {
  throw new Error(
    `테스트 DB 이름은 _test 로 끝나야 한다(받은 값: ${targetDb}). ` +
      "truncateAll 이 전 테이블을 비우므로 개발·운영 DB 를 향할 수 없다.",
  );
}

// Vitest는 테스트 파일마다 모듈을 격리하므로, 모듈 단위로 클라이언트를 한 번만 만들면
// 파일당 커넥션 1개로 수렴한다(호출마다 새 커넥션을 여는 대신). idle_timeout으로 유휴 커넥션도 정리한다.
let client: ReturnType<typeof drizzle<typeof schema>> | null = null;

export function testDb() {
  if (!client) {
    client = drizzle(postgres(url, { prepare: false, max: 1, idle_timeout: 20 }), { schema });
  }
  return client;
}

export async function migrateTestDb() {
  const migrationClient = postgres(url, { prepare: false, max: 1 });
  await migrate(drizzle(migrationClient), { migrationsFolder: "./drizzle" });
  await migrationClient.end();
}

// FK 순서를 신경 쓰지 않도록 CASCADE 로 전부 비운다.
// 인자를 받지 않고 모듈 클라이언트(testDb())를 직접 쓴다 — 인자로 받으면 타입만
// ReturnType<typeof testDb> 를 만족하는 다른 db(예: getDb())를 실수로 넘겨도 tsc 가
// 잡아내지 못한다. test/db.ts 상단의 URL 가드는 이 모듈의 URL만 지킬 뿐, 호출부를
// 지키지 않는다.
export async function truncateAll() {
  const db = testDb();
  await db.execute(sql`TRUNCATE TABLE
    audit_logs, problem_tags, tags, excel_upload_logs, attempt_choices,
    attempt_blank_answers, attempts, problem_blanks, problem_answers,
    problem_choices, problems, users, departments RESTART IDENTITY CASCADE`);
}
