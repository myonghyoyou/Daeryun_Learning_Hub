import { test } from "node:test";
import assert from "node:assert/strict";
import { splitTrailing, nextBlankKey } from "./blankTokens.js";

test("splits a common object particle off the core", () => {
  assert.deepEqual(splitTrailing("배관을"), { core: "배관", trailing: "을" });
  assert.deepEqual(splitTrailing("편성,"), { core: "편성", trailing: "," });
});

// 긴 조사를 먼저 떼어낸다 — "에서"를 "에"로 자르면 "서"가 core 에 남는다.
test("prefers the longest matching particle", () => {
  assert.deepEqual(splitTrailing("회사에서"), { core: "회사", trailing: "에서" });
});

// 조사가 없으면 통째로 core.
test("keeps the whole word when there is no trailing particle", () => {
  assert.deepEqual(splitTrailing("결산"), { core: "결산", trailing: "" });
});

// 조사 + 구두점이 함께 붙은 경우 둘 다 뗀다.
test("strips a particle and punctuation together", () => {
  assert.deepEqual(splitTrailing("배관을,"), { core: "배관", trailing: "을," });
});

// 조사로 끝나는 것처럼 보이는 단어를 자르지 않도록 최소 core 길이를 지킨다.
test("does not strip when it would leave an empty core", () => {
  assert.deepEqual(splitTrailing("을"), { core: "을", trailing: "" });
});

test("nextBlankKey returns the smallest unused b-number", () => {
  assert.equal(nextBlankKey([]), "b1");
  assert.equal(nextBlankKey(["b1", "b2"]), "b3");
  assert.equal(nextBlankKey(["b2"]), "b1", "빈 번호를 채운다");
});
