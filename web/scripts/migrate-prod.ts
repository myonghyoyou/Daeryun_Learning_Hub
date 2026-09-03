// tsx 는 .env 를 로드하지 않는다. 부수효과 import 라 다른 import 보다 먼저 와야 한다
// (scripts/seed-dev.ts 와 같은 이유).
import "dotenv/config";

import * as fs from "node:fs";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { assertProdSource } from "../lib/problemSync/exportSnapshot";
import { readFlagValue } from "../lib/problemSync/proofTarget";

/**
 * 운영 DB 에 drizzle 마이그레이션을 적용한다.
 *
 * 기본은 **확인만** 한다 — 저장소 저널과 운영의 적용 이력을 대조해 무엇이 밀려 있는지
 * 보여 주고 끝난다. 실제로 적용하려면 `--apply --confirm <밀린 개수>` 를 붙여야 한다.
 * 운영 스키마를 바꾸는 일은 이 저장소에서 가장 되돌리기 어려운 축이라, 숫자를 옮겨
 * 적게 해서 미리보기를 실제로 보게 만든다(scripts/apply-proof-sheet.ts 와 같은 규칙).
 */

type JournalEntry = { idx: number; tag: string; when: number };

function readJournal(): JournalEntry[] {
  const raw = fs.readFileSync("drizzle/meta/_journal.json", "utf8");
  return (JSON.parse(raw) as { entries: JournalEntry[] }).entries;
}

async function main() {
  const argv = process.argv.slice(2);
  const apply = argv.includes("--apply");
  const confirmArg = readFlagValue(argv, "--confirm");

  // 운영 자리에 로컬 주소를 넣은 실수를 막는다. process.env 를 그대로 넘기면 TS2559 다 —
  // 객체를 새로 만들어 넘긴다(scripts/apply-proof-sheet.ts 의 같은 주석 참고).
  const url = assertProdSource({ PROD_DATABASE_URL: process.env.PROD_DATABASE_URL });
  const host = new URL(url).hostname;
  const journal = readJournal();

  const sql = postgres(url, { prepare: false, max: 1 });
  try {
    console.log(`대상: 운영 (${host})`);
    console.log(`저장소 저널: ${journal.length}개 — ${journal.map((e) => e.tag).join(", ")}`);

    // 적용 이력 표가 아예 없을 수 있다. 그 경우 drizzle 은 "하나도 적용 안 됨"으로 보고
    // 0000 부터 다시 돌린다 — 표가 이미 있는 DB 에서는 위험하므로 여기서 갈라 보여 준다.
    const [{ exists }] = await sql<{ exists: boolean }[]>`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'drizzle' AND table_name = '__drizzle_migrations'
      ) AS exists
    `;

    let appliedTags: string[] = [];
    if (exists) {
      const rows = await sql<{ hash: string; created_at: string }[]>`
        SELECT hash, created_at::text FROM drizzle.__drizzle_migrations ORDER BY created_at
      `;
      appliedTags = rows.map((r) => r.hash);
      console.log(`운영 적용 이력: ${rows.length}건`);
    } else {
      console.log(`운영 적용 이력: 표(drizzle.__drizzle_migrations)가 없습니다.`);
    }

    // 저널의 when 값이 곧 drizzle 이 기록하는 created_at(밀리초)이다. 해시로는 대조할 수
    // 없으므로(파일 내용 해시라 여기서 다시 계산해야 한다) 개수와 표 존재 여부로 판단한다.
    const pending = exists ? journal.length - appliedTags.length : journal.length;

    // 이번에 넣으려는 표가 이미 있는지도 함께 본다 — 가장 알기 쉬운 신호다.
    const [{ has_solve_runs }] = await sql<{ has_solve_runs: boolean }[]>`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'solve_runs'
      ) AS has_solve_runs
    `;
    console.log(`운영에 solve_runs 표: ${has_solve_runs ? "있음" : "없음"}`);
    console.log(`밀린 마이그레이션: ${pending}개`);

    if (!exists && journal.length > 0) {
      console.log(
        `\n주의: 운영에 적용 이력 표가 없습니다. 이 상태로 적용하면 drizzle 이 0000 부터\n` +
          `모두 실행합니다. 0000 은 CREATE TABLE IF NOT EXISTS 와 DO $$ ... EXCEPTION 으로\n` +
          `감싸여 있어 이미 있는 것을 다시 만들지는 않지만, 정말 그런지 눈으로 확인한 뒤\n` +
          `진행하세요: drizzle/0000_*.sql`,
      );
    }

    if (!apply) {
      console.log(`\n확인만 했고 운영을 건드리지 않았습니다.`);
      console.log(`실제로 적용하려면: pnpm migrate:prod -- --apply --confirm ${pending}`);
      return;
    }

    if (pending === 0) {
      console.log(`\n밀린 것이 없습니다. 운영을 건드리지 않았습니다.`);
      return;
    }

    if (confirmArg === undefined) {
      throw new Error(
        `운영에 적용하려면 밀린 개수를 함께 적어야 합니다: --confirm ${pending}\n` +
          `위 확인 결과를 본 뒤 그 숫자를 그대로 넣으세요.`,
      );
    }
    if (Number(confirmArg) !== pending) {
      throw new Error(`--confirm 값이 다릅니다: 적으신 값 ${confirmArg}, 실제 ${pending}.`);
    }

    await migrate(drizzle(sql), { migrationsFolder: "./drizzle" });
    console.log(`\n운영 적용 완료.`);

    const [{ has_solve_runs: after }] = await sql<{ has_solve_runs: boolean }[]>`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'solve_runs'
      ) AS has_solve_runs
    `;
    console.log(`운영에 solve_runs 표: ${after ? "있음" : "없음"}`);
  } finally {
    await sql.end();
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("운영 마이그레이션 실패:", error instanceof Error ? error.message : error);
    process.exit(1);
  });
