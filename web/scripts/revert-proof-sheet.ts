// tsx 는 .env 를 로드하지 않는다. 부수효과 import 라 다른 import 보다 먼저 와야 한다
// (scripts/seed-dev.ts 와 같은 이유).
import "dotenv/config";

import { readFile } from "node:fs/promises";
import { getDb, type Db } from "../lib/db/client";
import { assertSeedableEnvironment } from "../lib/devSeed";
import { assertProdSource } from "../lib/problemSync/exportSnapshot";
import { assertConfirmedCount, openProdDb, readFlagValue, type ProofBackup } from "../lib/problemSync/proofTarget";
import { applyRevert, planRevert } from "../lib/problemSync/revertProofSheet";

const PREVIEW_LIMIT = 40;

function visible(text: string): string {
  return text.replace(/ /g, "·").replace(/\n/g, "⏎");
}

async function main() {
  const argv = process.argv.slice(2);
  const toProd = argv.includes("--prod");
  const apply = argv.includes("--apply");
  const confirmArg = readFlagValue(argv, "--confirm");
  const filePath = readFlagValue(argv, "--file");

  if (!filePath) {
    throw new Error("되돌릴 백업 파일을 지정하세요: --file .data/prod-proof-backup-....json");
  }

  const backup = JSON.parse(await readFile(filePath, "utf8")) as ProofBackup;
  if (!Array.isArray(backup.changes)) {
    throw new Error(`백업 파일 형식이 올바르지 않습니다: ${filePath}`);
  }

  let db: Db;
  let close: (() => Promise<void>) | null = null;
  let host: string;

  if (toProd) {
    // process.env 를 그대로 넘기면 TS2559 다(apply-proof-sheet.ts 의 같은 자리 주석 참고).
    const url = assertProdSource({ PROD_DATABASE_URL: process.env.PROD_DATABASE_URL });
    host = new URL(url).hostname;
    const opened = openProdDb(url);
    db = opened.db;
    close = opened.close;
  } else {
    assertSeedableEnvironment(process.env);
    host = new URL(process.env.DATABASE_URL!).hostname;
    db = getDb();
  }

  try {
    // 백업이 다른 대상에서 만들어졌으면 알린다. 막지는 않는다 — 같은 id 체계라 되돌리기 자체는
    // 유효하지만, 사용자가 대상을 착각한 경우를 잡아 준다.
    if (backup.target !== (toProd ? "prod" : "local")) {
      console.log(`주의: 이 백업은 ${backup.target === "prod" ? "운영" : "로컬"}(${backup.host})에서 만들어졌는데, 지금 대상은 ${toProd ? "운영" : "로컬"}(${host})입니다.`);
    }

    console.log(`대상: ${toProd ? "운영" : "로컬"} (${host})`);
    console.log(`백업: ${filePath} (${backup.savedAt}, ${backup.changes.length}개 칸)`);

    const plan = await planRevert(db, backup.changes);
    const alreadyReverted = backup.changes.length - plan.revertable.length - plan.conflicts.length - plan.missing.length;

    console.log(`  되돌릴 수 있는 칸 ${plan.revertable.length}개`);
    if (alreadyReverted > 0) console.log(`  이미 되돌아가 있는 칸 ${alreadyReverted}개`);
    if (plan.conflicts.length > 0) {
      console.log(`  반영 뒤 또 바뀌어 건너뛸 칸 ${plan.conflicts.length}개`);
      for (const c of plan.conflicts.slice(0, 5)) {
        console.log(`    문제 ${c.change.problemId} ${c.change.column}: 지금 값 "${visible(c.current).slice(0, 60)}"`);
      }
    }
    if (plan.missing.length > 0) console.log(`  대상에서 행을 못 찾은 칸 ${plan.missing.length}개`);

    if (plan.revertable.length > 0) {
      console.log(`\n=== 되돌릴 내용 (앞 ${Math.min(PREVIEW_LIMIT, plan.revertable.length)}개) ===`);
      for (const c of plan.revertable.slice(0, PREVIEW_LIMIT)) {
        console.log(`  문제 ${c.problemId} · ${c.column}`);
        console.log(`    지금: ${visible(c.after).slice(0, 110)}`);
        console.log(`    복원: ${visible(c.before).slice(0, 110)}`);
      }
      if (plan.revertable.length > PREVIEW_LIMIT) console.log(`  … 그 외 ${plan.revertable.length - PREVIEW_LIMIT}개`);
    }

    if (plan.revertable.length === 0) {
      console.log(`\n되돌릴 것이 없습니다. DB 를 건드리지 않았습니다.`);
      return;
    }

    if (toProd) {
      assertConfirmedCount(confirmArg, plan.revertable.length);
    } else if (!apply) {
      console.log(`\n확인만 했고 DB 는 건드리지 않았습니다.`);
      console.log(`실제로 되돌리려면: pnpm proof:revert -- --file ${filePath} --apply`);
      return;
    }

    const reverted = await applyRevert(db, plan.revertable);
    console.log(`\n되돌리기 완료: ${reverted}개 칸`);
  } finally {
    if (close) await close();
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("되돌리기 실패:", error instanceof Error ? error.message : error);
    process.exit(1);
  });
