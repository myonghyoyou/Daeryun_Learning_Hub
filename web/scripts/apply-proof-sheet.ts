// tsx 는 .env 를 로드하지 않는다. 부수효과 import 라 다른 import 보다 먼저 와야 한다
// (scripts/seed-dev.ts 와 같은 이유).
import "dotenv/config";

import * as fs from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import * as XLSX from "xlsx";
import { getDb, type Db } from "../lib/db/client";
import { assertSeedableEnvironment } from "../lib/devSeed";
import { applyProofChanges, planProofChanges } from "../lib/problemSync/applyProofSheet";
import { assertProdSource } from "../lib/problemSync/exportSnapshot";
import type { ProofRow } from "../lib/problemSync/proofSheet";
import { assertConfirmedCount, buildBackup, openProdDb, readFlagValue } from "../lib/problemSync/proofTarget";

XLSX.set_fs(fs);

const IN_PATH = "../docs/문제은행_엑셀/문제은행_교정용.xlsx";
const BACKUP_DIR = ".data";
const PREVIEW_LIMIT = 40;

/** 눈으로 대조할 수 있게 바뀐 자리를 드러낸다. 공백만 바뀐 교정이 대부분이라 그냥 찍으면 구분이 안 된다. */
function visible(text: string): string {
  return text.replace(/ /g, "·").replace(/\n/g, "⏎");
}

function readSheets(): Map<string, ProofRow[]> {
  if (!fs.existsSync(IN_PATH)) {
    throw new Error(`교정용 엑셀이 없습니다: ${IN_PATH}. pnpm proof:export 를 먼저 실행하세요.`);
  }
  const wb = XLSX.readFile(IN_PATH);
  const sheets = new Map<string, ProofRow[]>();
  for (const name of wb.SheetNames) {
    sheets.set(name, XLSX.utils.sheet_to_json<ProofRow>(wb.Sheets[name], { defval: "" }));
  }
  return sheets;
}

async function main() {
  const argv = process.argv.slice(2);
  const toProd = argv.includes("--prod");
  const apply = argv.includes("--apply");
  const confirmArg = readFlagValue(argv, "--confirm");

  let db: Db;
  let close: (() => Promise<void>) | null = null;
  let host: string;

  if (toProd) {
    // 운영 자리에 로컬 주소를 넣은 실수를 막는다(내보내기와 같은 가드).
    // process.env 를 그대로 넘기면 TS2559 다 — Next 가 ProcessEnv 에 NODE_ENV 를 선언 병합해
    // 두어, 이름이 겹치지 않는 이 인자 타입과는 "약한 타입" 검사에 걸린다. 객체를 새로 만들어
    // 넘기면 이름이 겹쳐 통과한다(as 캐스트보다 이쪽이 낫다).
    const url = assertProdSource({ PROD_DATABASE_URL: process.env.PROD_DATABASE_URL });
    host = new URL(url).hostname;
    const opened = openProdDb(url);
    db = opened.db;
    close = opened.close;
  } else {
    // 로컬 DB 가 아니면 여기서 멈춘다.
    assertSeedableEnvironment(process.env);
    host = new URL(process.env.DATABASE_URL!).hostname;
    db = getDb();
  }

  try {
    const sheets = readSheets();
    // 대조 상대는 **반영할 그 DB 자체**다. 로컬과 비교하면, 동기화 이후 운영에서 누가 고친
    // 내용을 모르고 덮어쓸 수 있다. 대상과 직접 대조하면 그 사고가 구조적으로 안 난다.
    const diff = await planProofChanges(db, sheets);

    console.log(`대상: ${toProd ? "운영" : "로컬"} (${host})`);
    console.log(`엑셀: ${IN_PATH}`);
    console.log(`  시트 ${sheets.size}개 · 행 ${diff.scannedRows}개`);
    console.log(`  바뀔 칸 ${diff.changes.length}개`);
    if (diff.missingProblemIds.length > 0) {
      console.log(`  대상 DB 에 없는 id ${diff.missingProblemIds.length}개: ${diff.missingProblemIds.slice(0, 10).join(", ")}`);
    }
    if (diff.extraCells.length > 0) {
      console.log(`  자리가 없어 무시한 칸 ${diff.extraCells.length}개 (보기·정답을 새로 추가한 것으로 보임)`);
      for (const e of diff.extraCells.slice(0, 5)) console.log(`    문제 ${e.problemId} ${e.column}: ${e.value.slice(0, 40)}`);
    }

    if (diff.changes.length > 0) {
      console.log(`\n=== 바뀔 내용 (앞 ${Math.min(PREVIEW_LIMIT, diff.changes.length)}개) ===`);
      for (const c of diff.changes.slice(0, PREVIEW_LIMIT)) {
        console.log(`  [${c.sheet}] 문제 ${c.problemId} · ${c.column}`);
        console.log(`    전: ${visible(c.before).slice(0, 110)}`);
        console.log(`    후: ${visible(c.after).slice(0, 110)}`);
      }
      if (diff.changes.length > PREVIEW_LIMIT) {
        console.log(`  … 그 외 ${diff.changes.length - PREVIEW_LIMIT}개`);
      }
    }

    if (toProd) {
      if (diff.changes.length === 0) {
        console.log(`\n바뀔 것이 없습니다. 운영을 건드리지 않았습니다.`);
        return;
      }
      // 숫자를 옮겨 적으려면 미리보기를 실제로 봐야 한다. 운영 쓰기는 이 도구에서 유일하게
      // 되돌리기 어려운 지점이라, 플래그 하나로 통과시키지 않는다.
      assertConfirmedCount(confirmArg, diff.changes.length);

      // 바꾸기 전에 백업부터. 여기서 실패하면 아무것도 바꾸지 않는다.
      await mkdir(BACKUP_DIR, { recursive: true });
      const backupPath = `${BACKUP_DIR}/prod-proof-backup-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
      await writeFile(backupPath, JSON.stringify(buildBackup("prod", host, diff.changes), null, 2), "utf8");
      console.log(`\n백업 저장: ${backupPath}`);

      const applied = await applyProofChanges(db, diff.changes);
      console.log(`운영 반영 완료: ${applied}개 칸`);
      console.log(`되돌리려면: pnpm proof:revert -- --prod --file ${backupPath}`);
      return;
    }

    if (!apply) {
      console.log(`\n확인만 했고 DB 는 건드리지 않았습니다.`);
      console.log(`로컬에 반영: pnpm proof:apply -- --apply`);
      console.log(`운영에 반영: pnpm proof:apply -- --prod   (먼저 확인한 뒤 --confirm 을 붙인다)`);
      return;
    }

    const applied = await applyProofChanges(db, diff.changes);
    console.log(`\n로컬 반영 완료: ${applied}개 칸`);
  } finally {
    if (close) await close();
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("교정 반영 실패:", error instanceof Error ? error.message : error);
    process.exit(1);
  });
