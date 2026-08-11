import { test } from "node:test";
import assert from "node:assert/strict";
import { splitTrailing, nextBlankKey, designateBlank, releaseBlank, adjustBlankBoundary } from "./blankTokens.js";
import { segmentContent } from "./blankSegments.js";

function wordSeg(content, text) {
  return segmentContent(content, []).find((s) => s.type === "word" && s.text === text);
}

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

test("designateBlank replaces a word with a marker and captures the answer", () => {
  const content = "예산의 3요소는 편성, 집행, 결산 이다.";
  const seg = wordSeg(content, "편성"); // 쉼표는 segmentContent가 이미 분리해 어절은 "편성"
  const next = designateBlank(content, [], seg);

  assert.equal(next.content, "예산의 3요소는 {{b1}}, 집행, 결산 이다.", "쉼표는 본문에 남는다");
  assert.deepEqual(next.blanks, [{ blankKey: "b1", answerText: "편성" }]);
});

test("designateBlank keeps a trailing particle in the content", () => {
  const content = "배관을 통하여";
  const seg = wordSeg(content, "배관을");
  const next = designateBlank(content, [], seg);

  assert.equal(next.content, "{{b1}}을 통하여");
  assert.deepEqual(next.blanks, [{ blankKey: "b1", answerText: "배관" }]);
});

test("designateBlank assigns the next free key", () => {
  const content = "{{b1}} 집행";
  const seg = wordSeg(content, "집행");
  const next = designateBlank(content, [{ blankKey: "b1", answerText: "편성" }], seg);

  assert.equal(next.content, "{{b1}} {{b2}}");
  assert.equal(next.blanks[1].blankKey, "b2");
});

test("releaseBlank puts the answer text back and drops the blank", () => {
  const next = releaseBlank("{{b1}}을 통하여", [{ blankKey: "b1", answerText: "배관" }], "b1");
  assert.equal(next.content, "배관을 통하여");
  assert.deepEqual(next.blanks, []);
});

// +1: 뒤 본문 글자를 정답으로 흡수 (조사를 정답에 다시 붙이고 싶을 때)
test("adjustBlankBoundary +1 absorbs the next content char into the answer", () => {
  const next = adjustBlankBoundary("{{b1}}을 통하여", [{ blankKey: "b1", answerText: "배관" }], "b1", 1);
  assert.equal(next.content, "{{b1}} 통하여");
  assert.equal(next.blanks[0].answerText, "배관을");
});

// -1: 정답 마지막 글자를 본문으로 내보냄 (과분리 보정)
test("adjustBlankBoundary -1 pushes the last answer char back to content", () => {
  const next = adjustBlankBoundary("{{b1}} 통하여", [{ blankKey: "b1", answerText: "배관을" }], "b1", -1);
  assert.equal(next.content, "{{b1}}을 통하여");
  assert.equal(next.blanks[0].answerText, "배관");
});
