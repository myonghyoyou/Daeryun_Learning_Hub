// tsx 는 .env 를 로드하지 않는다. 부수효과 import 라 다른 import 보다 먼저 와야 한다
// (scripts/seed-dev.ts 와 같은 이유).
import "dotenv/config";

import { readFile } from "node:fs/promises";
import { getDb } from "../lib/db/client";
import { assertSeedableEnvironment } from "../lib/devSeed";
import { importSnapshot } from "../lib/problemSync/importSnapshot";
import { parseSnapshot, SNAPSHOT_PATH } from "../lib/problemSync/snapshot";

async function main() {
  // 로컬 DB 가 아니면 여기서 멈춘다. 이 아래는 기존 문제와 풀이 이력을 전부 지운다.
  assertSeedableEnvironment(process.env);

  const raw = await readFile(SNAPSHOT_PATH, "utf8").catch(() => {
    throw new Error(`스냅샷 파일이 없습니다: ${SNAPSHOT_PATH}. pnpm sync:problems:export 를 먼저 실행하세요.`);
  });
  // DB 를 건드리기 전에 파일 전체를 검증한다 — 절반 읽다 터지면 로컬이 빈 채로 남는다.
  const snapshot = parseSnapshot(JSON.parse(raw));

  const result = await importSnapshot(getDb(), snapshot);

  console.log(`스냅샷: ${snapshot.generatedAt} (${snapshot.source.host})`);
  console.log(`  삭제: 풀이 이력 ${result.deletedAttempts}건 · 기존 문제 ${result.deletedProblems}개`);
  console.log(`  부서: ${result.createdDepartments}개 생성`);
  console.log(`  적재: 문제 ${result.insertedProblems}개`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("들여오기 실패", error);
    process.exit(1);
  });
