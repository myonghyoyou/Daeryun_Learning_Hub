import { test } from "vitest";
import assert from "node:assert/strict";
import { previewContent } from "./problemPreview.js";

test("previewContent: replaces blank markers with an underscore run", () => {
  assert.strictEqual(
    previewContent("예산의 3요소는 {{b1}}, {{b2}}, {{b3}} 이다."),
    "예산의 3요소는 ____, ____, ____ 이다."
  );
});

test("previewContent: handles legacy blank_N style keys", () => {
  assert.strictEqual(
    previewContent("수도는 {{blank_1}}이다"),
    "수도는 ____이다"
  );
});

test("previewContent: leaves content without markers untouched", () => {
  assert.strictEqual(previewContent("HTTP 404는 무엇인가?"), "HTTP 404는 무엇인가?");
});

test("previewContent: does not touch marker lookalikes", () => {
  // 서버·지정 모드와 같은 문자 집합만 마커로 본다. 한 겹 중괄호·내부 공백·빈 키는 마커가 아니다.
  assert.strictEqual(previewContent("{b1} {{ b1 }} {{}}"), "{b1} {{ b1 }} {{}}");
});

test("previewContent: tolerates null and empty input", () => {
  assert.strictEqual(previewContent(null), "");
  assert.strictEqual(previewContent(undefined), "");
  assert.strictEqual(previewContent(""), "");
});
