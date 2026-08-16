import type { SQL } from "drizzle-orm";
import type { DbConn } from "./client";

// db.execute(raw) 의 이중 캐스팅을 한 곳에 가둔다(Auth 리뷰 M5).
export async function executeRows<T>(db: DbConn, query: SQL): Promise<T[]> {
  const rows = await db.execute(query);
  return rows as unknown as T[];
}

// timestamp(무 tz) 텍스트를 Drizzle 컨벤션(UTC, +0000)으로 파싱한다.
export function parseUtcTimestamp(value: string | null): Date | null {
  return value === null ? null : new Date(value.replace(" ", "T") + "+0000");
}
