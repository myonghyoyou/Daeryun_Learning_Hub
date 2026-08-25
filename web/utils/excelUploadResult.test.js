import { test } from "vitest";
import assert from "node:assert/strict";
import { parseExcelErrorDetail } from "./excelUploadResult.js";

test("null errorDetail (전체 성공) parses to an empty list", () => {
  assert.deepEqual(parseExcelErrorDetail(null), []);
});

test("empty string parses to an empty list", () => {
  assert.deepEqual(parseExcelErrorDetail(""), []);
});

test("parses newline-separated '행 N: 사유' lines", () => {
  const errorDetail = "행 3: 사번 중복\n행 7: 이메일 형식 오류";
  assert.deepEqual(parseExcelErrorDetail(errorDetail), [
    { row: 3, reason: "사번 중복" },
    { row: 7, reason: "이메일 형식 오류" },
  ]);
});

test("skips blank lines between entries", () => {
  const errorDetail = "행 1: 부서코드 없음\n\n행 2: 역할 값 오류";
  assert.deepEqual(parseExcelErrorDetail(errorDetail), [
    { row: 1, reason: "부서코드 없음" },
    { row: 2, reason: "역할 값 오류" },
  ]);
});

test("a line that does not match '행 N: 사유' is kept as-is with a null row", () => {
  assert.deepEqual(parseExcelErrorDetail("알 수 없는 오류"), [{ row: null, reason: "알 수 없는 오류" }]);
});
