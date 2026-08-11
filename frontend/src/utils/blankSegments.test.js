import { test } from "node:test";
import assert from "node:assert/strict";
import { segmentContent } from "./blankSegments.js";

test("splits plain text into word and space segments with indices", () => {
  const segs = segmentContent("예산의 3요소", []);
  assert.deepEqual(segs, [
    { type: "word", text: "예산의", start: 0, end: 3 },
    { type: "space", text: " " },
    { type: "word", text: "3요소", start: 4, end: 7 },
  ]);
});

test("renders a marker as a blank segment with its answer", () => {
  const segs = segmentContent("A {{b1}} B", [{ blankKey: "b1", answerText: "편성" }]);
  assert.deepEqual(segs, [
    { type: "word", text: "A", start: 0, end: 1 },
    { type: "space", text: " " },
    { type: "blank", key: "b1", answer: "편성" },
    { type: "space", text: " " },
    { type: "word", text: "B", start: 9, end: 10 },
  ]);
});

// 정답을 못 찾아도(데이터 불일치) 빈칸은 그려야 한다.
test("blank answer falls back to empty string when not in blanks", () => {
  const segs = segmentContent("{{b1}}", []);
  assert.deepEqual(segs, [{ type: "blank", key: "b1", answer: "" }]);
});

// 마커가 어절에 붙은 경우: {{b1}}을 → 빈칸 + 어절 "을"
test("a marker glued to a particle yields blank then word", () => {
  const segs = segmentContent("{{b1}}을 통하여", [{ blankKey: "b1", answerText: "배관" }]);
  assert.deepEqual(segs, [
    { type: "blank", key: "b1", answer: "배관" },
    { type: "word", text: "을", start: 6, end: 7 },
    { type: "space", text: " " },
    { type: "word", text: "통하여", start: 8, end: 11 },
  ]);
});

// 결정 5: 쉼표는 어절과 분리해 별도 punct 세그먼트로. 어절 인덱스는 쉼표를 포함하지 않는다.
test("separates a trailing comma from the word", () => {
  const segs = segmentContent("편성, 집행", []);
  assert.deepEqual(segs, [
    { type: "word", text: "편성", start: 0, end: 2 },
    { type: "punct", text: "," },
    { type: "space", text: " " },
    { type: "word", text: "집행", start: 4, end: 6 },
  ]);
});
