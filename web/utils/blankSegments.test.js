import { test } from "vitest";
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
    { type: "blank", key: "b1", answer: "편성", start: 2, end: 8 },
    { type: "space", text: " " },
    { type: "word", text: "B", start: 9, end: 10 },
  ]);
});

// 정답을 못 찾아도(데이터 불일치) 빈칸은 그려야 한다.
test("blank answer falls back to empty string when not in blanks", () => {
  const segs = segmentContent("{{b1}}", []);
  assert.deepEqual(segs, [{ type: "blank", key: "b1", answer: "", start: 0, end: 6 }]);
});

// 마커가 어절에 붙은 경우: {{b1}}을 → 빈칸 + 어절 "을"
test("a marker glued to a particle yields blank then word", () => {
  const segs = segmentContent("{{b1}}을 통하여", [{ blankKey: "b1", answerText: "배관" }]);
  assert.deepEqual(segs, [
    { type: "blank", key: "b1", answer: "배관", start: 0, end: 6 },
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

test("segmentContent: recognizes blank_1 style keys as markers", () => {
  const content = "수도는 {{blank_1}}이고";
  const segs = segmentContent(content, [{ blankKey: "blank_1", answerText: "서울" }]);
  const blank = segs.find((s) => s.type === "blank");
  assert.strictEqual(blank.key, "blank_1");
  assert.strictEqual(blank.answer, "서울");
  assert.strictEqual(content.slice(blank.start, blank.end), "{{blank_1}}");
  // 마커가 어절로 새어 나오지 않아야 한다
  assert.ok(!segs.some((s) => s.type === "word" && s.text.includes("{{")));
});

test("segmentContent: blank segments carry exact source offsets", () => {
  const content = "가 {{b1}} 나 {{b1}} 다";
  const segs = segmentContent(content, [{ blankKey: "b1", answerText: "값" }]);
  const blanks = segs.filter((s) => s.type === "blank");
  assert.strictEqual(blanks.length, 2);
  assert.notStrictEqual(blanks[0].start, blanks[1].start);
  for (const b of blanks) {
    assert.strictEqual(content.slice(b.start, b.end), "{{b1}}");
  }
});

// B3 회귀 방지 + MARKER 확장의 부작용 확인: 마커 유사물은 여전히 마커로 인식되면 안 된다.
test("segmentContent: marker look-alikes are not recognized as markers", () => {
  assert.ok(
    !segmentContent("{b1}", []).some((s) => s.type === "blank"),
    "중괄호 1겹은 마커가 아니다",
  );
  assert.ok(
    !segmentContent("{{ b1 }}", []).some((s) => s.type === "blank"),
    "내부 공백이 있으면 마커가 아니다",
  );
  assert.ok(
    !segmentContent("{{}}", []).some((s) => s.type === "blank"),
    "빈 키는 마커가 아니다",
  );
});
