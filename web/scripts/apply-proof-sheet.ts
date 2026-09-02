// tsx 는 .env 를 로드하지 않는다. 부수효과 import 라 다른 import 보다 먼저 와야 한다
// (scripts/seed-dev.ts 와 같은 이유).
import "dotenv/config";

import * as fs from "node:fs";
import * as XLSX from "xlsx";
import { getDb } from "../lib/db/client";
import { assertSeedableEnvironment } from "../lib/devSeed";
import { applyProofChanges, planProofChanges } from "../lib/problemSync/applyProofSheet";
import type { ProofRow } from "../lib/problemSync/proofSheet";

XLSX.set_fs(fs);

const IN_PATH = "../docs/문제은행_엑셀/문제은행_교정용.xlsx";
const PREVIEW_LIMIT = 40;

/** 눈으로 대조할 수 있게 바뀐 자리를 드러낸다. 공백만 바뀐 교정이 대부분이라 그냥 찍으면 구분이 안 된다. */
function visible(text: string): string {
  return text.replace(/ /g, "·").replace(/\n/g, "⏎");
}

async function main() {
  // 로컬 DB 가 아니면 여기서 멈춘다. 아래는 문제 본문을 실제로 수정한다.
  assertSeedableEnvironment(process.env);

  const apply = process.argv.includes("--apply");

  if (!fs.existsSync(IN_PATH)) {
    throw new Error(`교정용 엑셀이 없습니다: ${IN_PATH}. pnpm proof:export 를 먼저 실행하세요.`);
  }
  const wb = XLSX.readFile(IN_PATH);
  const sheets = new Map<string, ProofRow[]>();
  for (const name of wb.SheetNames) {
    sheets.set(name, XLSX.utils.sheet_to_json<ProofRow>(wb.Sheets[name], { defval: "" }));
  }

  const db = getDb();
  const diff = await planProofChanges(db, sheets);

  console.log(`엑셀: ${IN_PATH}`);
  console.log(`  시트 ${sheets.size}개 · 행 ${diff.scannedRows}개`);
  console.log(`  바뀐 칸 ${diff.changes.length}개`);
  if (diff.missingProblemIds.length > 0) {
    console.log(`  DB 에 없는 id ${diff.missingProblemIds.length}개: ${diff.missingProblemIds.slice(0, 10).join(", ")}`);
  }
  if (diff.extraCells.length > 0) {
    console.log(`  DB 에 자리가 없어 무시한 칸 ${diff.extraCells.length}개 (보기·정답을 새로 추가한 것으로 보임)`);
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

  if (!apply) {
    console.log(`\n확인만 했고 DB 는 건드리지 않았습니다.`);
    console.log(`실제로 반영하려면: pnpm proof:apply -- --apply`);
    return;
  }

  const applied = await applyProofChanges(db, diff.changes);
  console.log(`\n반영 완료: ${applied}개 칸`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("교정 반영 실패", error);
    process.exit(1);
  });
