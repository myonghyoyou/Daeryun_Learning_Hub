import { test } from "node:test";
import assert from "node:assert/strict";
import { formatLastLogin } from "./userFormat.js";

test("null lastLoginAt reports no login history", () => {
  assert.equal(formatLastLogin(null), "로그인 이력 없음");
});

test("undefined lastLoginAt reports no login history", () => {
  assert.equal(formatLastLogin(undefined), "로그인 이력 없음");
});

test("an ISO datetime is formatted into a non-empty display string", () => {
  const formatted = formatLastLogin("2026-08-01T09:30:00Z");
  assert.notEqual(formatted, "로그인 이력 없음");
  assert.ok(formatted.length > 0);
});
