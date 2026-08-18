import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { sql } from "drizzle-orm";
import * as schema from "../lib/db/schema";

const url = process.env.DATABASE_URL ?? "postgres://probank:probank_dev@localhost:5434/probank_test";

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
export async function truncateAll(db: ReturnType<typeof testDb>) {
  await db.execute(sql`TRUNCATE TABLE
    audit_logs, problem_tags, tags, excel_upload_logs, attempt_choices,
    attempt_blank_answers, attempts, problem_blanks, problem_answers,
    problem_choices, problems, users, departments RESTART IDENTITY CASCADE`);
}
