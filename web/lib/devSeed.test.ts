import { describe, it, expect } from "vitest";
import { assertSeedableEnvironment } from "./devSeed";

// 이 가드가 뚫리면 운영 DB 에 테스트 계정 29개가 꽂힌다 — 배포 spec D8("운영 DB 는 빈
// 상태에서 시작한다. QA 계정이 운영 통계에 섞이지 않는다")이 막으려던 바로 그 사고다.
// QA 체크리스트 §0.4 "운영 DB에서 실행 금지" 경고를 코드로 옮긴 것이라 테스트를 붙인다.
describe("assertSeedableEnvironment", () => {
  it("로컬 호스트면 통과한다", () => {
    expect(() => assertSeedableEnvironment({ DATABASE_URL: "postgres://probank:pw@localhost:5434/probank_dev" })).not.toThrow();
    expect(() => assertSeedableEnvironment({ DATABASE_URL: "postgres://probank:pw@127.0.0.1:5434/probank_dev" })).not.toThrow();
  });

  it("원격 호스트면 거부한다", () => {
    // 실제 운영 후보 — Supabase 트랜잭션 풀러(6543).
    expect(() => assertSeedableEnvironment({
      DATABASE_URL: "postgres://postgres:pw@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres",
    })).toThrow(/로컬/);
  });

  it("호스트가 로컬이어도 NODE_ENV 가 production 이면 거부한다", () => {
    expect(() => assertSeedableEnvironment({
      DATABASE_URL: "postgres://probank:pw@localhost:5434/probank_dev",
      NODE_ENV: "production",
    })).toThrow(/production/);
  });

  it("DATABASE_URL 이 없으면 거부한다", () => {
    expect(() => assertSeedableEnvironment({})).toThrow(/DATABASE_URL/);
  });

  it("URL 형식이 아니면 거부한다 — 파싱 실패를 통과로 오해하면 안 된다", () => {
    expect(() => assertSeedableEnvironment({ DATABASE_URL: "probank_dev" })).toThrow();
  });
});
