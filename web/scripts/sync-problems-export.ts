// tsx 는 .env 를 로드하지 않는다. 이 import 가 없으면 .env 가 채워져 있어도
// PROD_DATABASE_URL 을 못 찾는다. 부수효과 import 라 다른 import 보다 먼저 와야 한다
// (scripts/seed-dev.ts 와 같은 이유).
import "dotenv/config";

import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { assertProdSource, exportSnapshot } from "../lib/problemSync/exportSnapshot";
import { parseSnapshot, SNAPSHOT_PATH } from "../lib/problemSync/snapshot";

async function main() {
  // 운영 자리에 로컬을 넣은 실수를 여기서 막는다.
  // process.env 는 Next.js 가 NODE_ENV 를 명시 속성으로 선언해 둔 탓에 나머지 키에는
  // "약한 타입과 공통 속성 없음"(TS2559) 검사가 걸린다 — 캐스트로 우회한다(동작은 동일).
  const url = assertProdSource(process.env as { PROD_DATABASE_URL?: string });

  const snapshot = await exportSnapshot(url);
  await mkdir(dirname(SNAPSHOT_PATH), { recursive: true });

  // 쓰기 전에 두 반쪽이 실제로 맞는지 확인한다. 내보내기와 들여오기는 형식만 공유할 뿐
  // 서로를 호출하지 않아, 별칭 오타로 필드가 undefined 가 되면(JSON.stringify 가 조용히
  // 지운다) 운영을 상대로 처음 돌릴 때에야 드러난다. 여기서 걸리면 어느 필드인지 알려준다.
  const json = JSON.stringify(snapshot, null, 2);
  parseSnapshot(JSON.parse(json));
  await writeFile(SNAPSHOT_PATH, json, "utf8");

  console.log(`스냅샷 저장: ${SNAPSHOT_PATH}`);
  console.log(`  출처: ${snapshot.source.host}/${snapshot.source.database}`);
  console.log(`  부서 ${snapshot.counts.departments}개 · 문제 ${snapshot.counts.problems}개 · 태그 ${snapshot.counts.tags}개`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("내보내기 실패", error);
    process.exit(1);
  });
