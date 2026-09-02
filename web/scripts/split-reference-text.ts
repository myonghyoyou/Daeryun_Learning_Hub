// 문제 본문에 한 줄로 붙어 있는 질문과 지문을 나눠 reference_text 로 옮긴다.
//
// 종이 문제집을 옮겨 온 데이터라 "다음 괄호 안에 적합한 용어는? ( )의 단가는 …" 처럼
// 질문과 지문이 이어 붙어 있다. 화면은 질문 아래 테두리 박스에 지문을 그리므로,
// 데이터 쪽에서도 두 칸으로 나뉘어 있어야 한다.
//
// tsx 는 .env 를 로드하지 않는다. 부수효과 import 라 다른 import 보다 먼저 와야 한다
// (scripts/seed-dev.ts 와 같은 이유).
import "dotenv/config";

import { mkdir, writeFile } from "node:fs/promises";
import { and, eq, isNull } from "drizzle-orm";
import { getDb } from "../lib/db/client";
import { assertSeedableEnvironment } from "../lib/devSeed";
import { problems } from "../lib/db/schema";
import { splitQuestionAndReference } from "../lib/problem/splitReference";

const BACKUP_DIR = ".data";
const PREVIEW_LIMIT = 10;

type Change = { id: number; type: string; before: string; question: string; reference: string };

async function main() {
  // 로컬 DB 가 아니면 여기서 멈춘다. 아래는 문제 본문을 실제로 바꾼다.
  assertSeedableEnvironment(process.env);

  const apply = process.argv.includes("--apply");
  const db = getDb();

  // 이미 참조지문이 있는 문제는 건드리지 않는다 — 관리자가 직접 채운 값을 덮어쓰면 안 된다.
  const rows = await db.select({ id: problems.id, type: problems.type, content: problems.content })
    .from(problems).where(isNull(problems.referenceText));

  const changes: Change[] = [];
  for (const row of rows) {
    const { question, reference } = splitQuestionAndReference(row.content);
    if (reference === null) continue;
    changes.push({ id: row.id, type: row.type, before: row.content, question, reference });
  }

  console.log(`참조지문이 비어 있는 문제 ${rows.length}개 중 나눌 것 ${changes.length}개`);
  const byType: Record<string, number> = {};
  for (const c of changes) byType[c.type] = (byType[c.type] ?? 0) + 1;
  console.log(`  유형별: ${JSON.stringify(byType)}`);

  console.log(`\n=== 나뉠 모습 (앞 ${Math.min(PREVIEW_LIMIT, changes.length)}개) ===`);
  for (const c of changes.slice(0, PREVIEW_LIMIT)) {
    console.log(`  [${c.id} ${c.type}]`);
    console.log(`    질문: ${c.question}`);
    console.log(`    지문: ${c.reference.slice(0, 90)}${c.reference.length > 90 ? "…" : ""}`);
  }

  if (!apply) {
    console.log(`\n확인만 했고 DB 는 건드리지 않았습니다.`);
    console.log(`실제로 나누려면: pnpm split:reference -- --apply`);
    return;
  }

  await mkdir(BACKUP_DIR, { recursive: true });
  const backupPath = `${BACKUP_DIR}/split-reference-backup-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
  await writeFile(backupPath, JSON.stringify(changes, null, 2), "utf8");
  console.log(`\n백업 저장: ${backupPath}`);

  let applied = 0;
  await db.transaction(async (tx) => {
    for (const c of changes) {
      // before 가 지금도 그대로일 때만 바꾼다 — 읽은 뒤 누가 고쳤다면 건너뛴다.
      const res = await tx.update(problems)
        .set({ content: c.question, referenceText: c.reference })
        .where(and(eq(problems.id, c.id), eq(problems.content, c.before)))
        .returning({ id: problems.id });
      if (res.length === 1) applied += 1;
    }
  });
  console.log(`나누기 완료: ${applied}개 (건너뜀 ${changes.length - applied}개)`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("분리 실패:", error instanceof Error ? error.message : error);
    process.exit(1);
  });
