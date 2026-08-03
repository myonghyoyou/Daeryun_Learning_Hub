import { test } from "node:test";
import assert from "node:assert/strict";
import { formatLastLogin } from "./userFormat.js";

test("null lastLoginAt reports no login history", () => {
  assert.equal(formatLastLogin(null), "로그인 이력 없음");
});

test("undefined lastLoginAt reports no login history", () => {
  assert.equal(formatLastLogin(undefined), "로그인 이력 없음");
});

test("an ISO datetime is formatted in the fixed Asia/Seoul timezone, independent of the host's local timezone", () => {
  // 09:30 UTC = 18:30 KST(UTC+9) — 호스트 머신의 TZ 환경변수와 무관하게 항상 이 값이어야
  // 한다(구현이 timeZone: "Asia/Seoul"을 명시하기 때문). 연-월-일과 시:분을 각각 검증해
  // ko-KR 로케일의 정확한 구두점/공백 표기에는 의존하지 않는다.
  const formatted = formatLastLogin("2026-08-01T09:30:00Z");
  assert.match(formatted, /2026/);
  assert.match(formatted, /8/);
  assert.match(formatted, /1/);
  assert.match(formatted, /6:30/);
  assert.match(formatted, /PM|오후/);
});

test("a different instant produces a different formatted value (not a constant)", () => {
  const first = formatLastLogin("2026-08-01T09:30:00Z");
  const second = formatLastLogin("2026-01-15T00:00:00Z");
  assert.notEqual(first, second);
});
