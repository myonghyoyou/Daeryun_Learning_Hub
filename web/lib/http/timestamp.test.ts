import { describe, it, expect } from "vitest";
import { parseUtcTimestamp } from "../db/raw";

describe("타임스탬프 컨벤션 (서브플랜 3 이탈 ⑦ 확정)", () => {
  it("timestamp(무 tz) 텍스트를 UTC 로 읽는다 — DB 세션 TZ 에 의존하지 않는다", () => {
    // Drizzle 이 `value + "+0000"` 으로 파싱하는 것과 같은 규칙이다.
    expect(parseUtcTimestamp("2026-08-21 17:30:05.907")!.toISOString())
      .toBe("2026-08-21T17:30:05.907Z");
  });

  it("JSON 직렬화는 Z 접미사를 단다 — Java LocalDateTime 과 다르다(이탈 ⑦)", () => {
    // Java: "2026-08-21T17:30:05.907937" (존 없음)
    // 포트: "2026-08-21T17:30:05.907Z"
    // 프론트가 `new Date(v).toLocaleString()` 으로 현지화하므로 화면 표시는 같다.
    expect(JSON.stringify({ at: parseUtcTimestamp("2026-08-21 17:30:05.907") }))
      .toBe('{"at":"2026-08-21T17:30:05.907Z"}');
  });

  it("null 은 null 이다", () => expect(parseUtcTimestamp(null)).toBeNull());
});
