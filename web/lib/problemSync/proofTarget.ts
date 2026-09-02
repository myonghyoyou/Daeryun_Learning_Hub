import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../db/schema";
import type { Db } from "../db/client";
import type { CellChange } from "./applyProofSheet";

export type ProofTarget = "local" | "prod";

/**
 * 교정 반영 대상을 연다.
 *
 * lib/db/client.ts 의 getDb() 를 운영에 쓸 수 없어서 여기서 직접 연다 — 그 함수는 연결을
 * 하나만 캐시해 두는 구조라 로컬과 운영에 동시에 붙지 못한다. prepare: false 는 Supabase
 * 풀러에 필수다(lib/db/client.ts 의 같은 주석 참고).
 *
 * 반환한 핸들은 반드시 close() 해야 한다 — 스크립트가 끝나지 않고 매달린다.
 */
export function openProdDb(url: string): { db: Db; close: () => Promise<void> } {
  const client = postgres(url, { prepare: false });
  return { db: drizzle(client, { schema }) as unknown as Db, close: () => client.end() };
}

export type ProofBackup = {
  savedAt: string;
  target: ProofTarget;
  host: string;
  /** 되돌릴 때 쓰는 값. before 로 돌리기 전에 현재 값이 after 인지 확인한다. */
  changes: CellChange[];
};

export function buildBackup(target: ProofTarget, host: string, changes: CellChange[]): ProofBackup {
  return { savedAt: new Date().toISOString(), target, host, changes };
}

/**
 * `--confirm <숫자>` 를 검사한다. 미리보기에서 본 건수를 그대로 적어야 통과한다.
 *
 * 플래그 하나로 끝내지 않는 이유는, 운영에 쓰는 순간이 이 도구에서 유일하게 되돌리기 어려운
 * 지점이기 때문이다. 숫자를 옮겨 적으려면 미리보기를 실제로 봐야 한다.
 */
export function assertConfirmedCount(confirmArg: string | undefined, actual: number): void {
  if (confirmArg === undefined) {
    throw new Error(
      `운영에 반영하려면 바뀔 건수를 함께 적어야 합니다: --confirm ${actual}\n` +
        `위 미리보기를 확인한 뒤 그 숫자를 그대로 넣으세요.`,
    );
  }
  const given = Number(confirmArg);
  if (!Number.isInteger(given)) {
    throw new Error(`--confirm 에는 숫자를 적어야 합니다(받은 값: ${confirmArg}).`);
  }
  if (given !== actual) {
    throw new Error(
      `--confirm 값이 실제 건수와 다릅니다: 적으신 값 ${given}, 실제 ${actual}.\n` +
        `엑셀이 바뀌었을 수 있습니다. 미리보기를 다시 확인하세요.`,
    );
  }
}

/** `--confirm 54` 또는 `--confirm=54` 를 읽는다. */
export function readFlagValue(argv: string[], flag: string): string | undefined {
  const withEquals = argv.find((a) => a.startsWith(`${flag}=`));
  if (withEquals) return withEquals.slice(flag.length + 1);
  const index = argv.indexOf(flag);
  if (index >= 0 && index + 1 < argv.length && !argv[index + 1].startsWith("--")) {
    return argv[index + 1];
  }
  return undefined;
}
