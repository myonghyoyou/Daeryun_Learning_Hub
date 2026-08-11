import { test } from "node:test";
import assert from "node:assert/strict";
import { parseBlankContent } from "./blankContent.js";

test("splits content into text and input segments for blanks to answer", () => {
  const segments = parseBlankContent("{{blank_1}}은 {{blank_2}}의 수도이다.", ["blank_1"], { blank_2: "대한민국" });

  assert.deepEqual(segments, [
    { type: "input", blankKey: "blank_1" },
    { type: "text", value: "은 " },
    { type: "reveal", blankKey: "blank_2", value: "대한민국" },
    { type: "text", value: "의 수도이다." },
  ]);
});

test("plain text without markers returns single text segment", () => {
  const segments = parseBlankContent("빈칸이 없는 문제입니다.", [], {});
  assert.deepEqual(segments, [{ type: "text", value: "빈칸이 없는 문제입니다." }]);
});

// 서버·지정 모드와 같은 문자 집합([A-Za-z0-9_-]). 하이픈 키도 마커로 인식해야 한다.
test("recognises hyphenated and short keys", () => {
  const segments = parseBlankContent("{{b1}} 그리고 {{k-2}}", ["b1", "k-2"], {});
  assert.deepEqual(segments, [
    { type: "input", blankKey: "b1" },
    { type: "text", value: " 그리고 " },
    { type: "input", blankKey: "k-2" },
  ]);
});
