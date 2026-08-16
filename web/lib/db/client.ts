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

export type Db = ReturnType<typeof getDb>;
// 트랜잭션 콜백 인자 타입. DAO 가 이 타입을 받으면 db.transaction 안팎 어디서든 재사용된다.
export type DbConn = Db | Parameters<Parameters<Db["transaction"]>[0]>[0];
