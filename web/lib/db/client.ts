import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

// Vercel 서버리스 + Supabase 트랜잭션 풀러(6543): prepare 를 꺼야 한다.
let client: ReturnType<typeof postgres> | undefined;

export function getDb() {
  if (!client) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL 이 설정되지 않았습니다.");
    client = postgres(url, { prepare: false });
  }
  return drizzle(client, { schema });
}
