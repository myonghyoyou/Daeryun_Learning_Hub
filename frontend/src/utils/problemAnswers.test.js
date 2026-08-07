import { test } from "node:test";
import assert from "node:assert/strict";
import { validateAnswers } from "./problemAnswers.js";

test("validateAnswers rejects a missing or empty answer list", () => {
  assert.equal(validateAnswers(null), "정답을 최소 1개 입력하세요.");
  assert.equal(validateAnswers([]), "정답을 최소 1개 입력하세요.");
});

test("validateAnswers rejects a blank answer anywhere in the list, including an internal gap", () => {
  assert.equal(validateAnswers(["a", "", "b"]), "빈 정답은 입력할 수 없습니다.");
  assert.equal(validateAnswers(["a", "   "]), "빈 정답은 입력할 수 없습니다.");
});

test("validateAnswers rejects a trailing blank answer too (no silent compaction on submit)", () => {
  assert.equal(validateAnswers(["a", "b", ""]), "빈 정답은 입력할 수 없습니다.");
});

test("validateAnswers accepts one or more non-blank answers", () => {
  assert.equal(validateAnswers(["a"]), null);
  assert.equal(validateAnswers(["a", "b", "c"]), null);
});
