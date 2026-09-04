import { test } from "vitest";
import assert from "node:assert/strict";
import { previewContent, previewSegments } from "./problemPreview.js";

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

test("previewSegments: 빈 괄호를 빈칸 조각으로 나눈다", () => {
  assert.deepStrictEqual(previewSegments("답은 ( )이다"), [
    { type: "text", value: "답은 " },
    { type: "blank" },
    { type: "text", value: "이다" },
  ]);
});

/**
 * 마커와 빈 괄호는 실제 데이터에서 같은 본문에 함께 나오지 않는다(2026-09-04 실측: 0건).
 * 그래도 순서를 고정해 둔다 — 마커를 먼저 밑줄로 바꾸고 나서 괄호를 나눈다.
 */
test("previewSegments: 마커는 밑줄로 바꾸고 빈칸으로 세지 않는다", () => {
  assert.deepStrictEqual(previewSegments("수도는 {{blank_1}}이다"), [
    { type: "text", value: "수도는 ____이다" },
  ]);
});

test("previewSegments: 내용이 든 괄호는 건드리지 않는다", () => {
  assert.deepStrictEqual(previewSegments("(서울시 공급규정) 위약금"), [
    { type: "text", value: "(서울시 공급규정) 위약금" },
  ]);
});

test("previewSegments: 빈 값이면 빈 배열이다", () => {
  assert.deepStrictEqual(previewSegments(null), []);
  assert.deepStrictEqual(previewSegments(""), []);
});
