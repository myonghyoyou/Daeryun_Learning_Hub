import { test } from "vitest";
import assert from "node:assert/strict";
import { hasNoAnswer } from "./answerState.js";

test("hasNoAnswer: choice types require at least one selection", () => {
  for (const type of ["MCQ_SINGLE", "MCQ_MULTI", "OX"]) {
    assert.strictEqual(hasNoAnswer({ type, selectedChoiceIds: [] }), true);
    assert.strictEqual(hasNoAnswer({ type, selectedChoiceIds: [7] }), false);
  }
});

test("hasNoAnswer: short answer ignores whitespace-only input", () => {
  assert.strictEqual(hasNoAnswer({ type: "SHORT_ANSWER", submittedText: "" }), true);
  assert.strictEqual(hasNoAnswer({ type: "SHORT_ANSWER", submittedText: "   " }), true);
  assert.strictEqual(hasNoAnswer({ type: "SHORT_ANSWER", submittedText: "답" }), false);
});

test("hasNoAnswer: fill-blank is empty only when every revealed blank is blank", () => {
  const blanksToAnswer = ["b1", "b2"];
  assert.strictEqual(hasNoAnswer({ type: "FILL_BLANK", blanksToAnswer, blankInputs: {} }), true);
  assert.strictEqual(
    hasNoAnswer({ type: "FILL_BLANK", blanksToAnswer, blankInputs: { b1: "  " } }),
    true
  );
  // 하나라도 채웠으면 제출할 수 있어야 한다 — 나머지는 오답으로 채점되면 된다
  assert.strictEqual(
    hasNoAnswer({ type: "FILL_BLANK", blanksToAnswer, blankInputs: { b1: "편성" } }),
    false
  );
});

test("hasNoAnswer: missing fields are treated as empty, not as a crash", () => {
  assert.strictEqual(hasNoAnswer({ type: "MCQ_SINGLE" }), true);
  assert.strictEqual(hasNoAnswer({ type: "SHORT_ANSWER" }), true);
  assert.strictEqual(hasNoAnswer({ type: "FILL_BLANK" }), true);
});

test("hasNoAnswer: an unknown type never blocks submission", () => {
  // 새 유형이 생겼을 때 제출을 막아 버리면 그 유형을 아예 풀 수 없게 된다
  assert.strictEqual(hasNoAnswer({ type: "SOMETHING_NEW" }), false);
});
