import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { sql } from "drizzle-orm";
import * as schema from "../lib/db/schema";

const url = process.env.DATABASE_URL ?? "postgres://probank:probank_dev@localhost:5434/probank_test";

export function testDb() {
  return drizzle(postgres(url, { prepare: false, max: 1 }), { schema });
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
