import { test } from "vitest";
import assert from "node:assert/strict";
import { PAGE_SIZE, clampPage, pageCount, pageRange, pageSlice } from "./pagination.js";

test("page size is 20", () => {
  assert.equal(PAGE_SIZE, 20);
});

test("pageCount rounds up and never returns zero", () => {
  assert.equal(pageCount(0, 20), 1, "빈 목록도 1페이지로 센다");
  assert.equal(pageCount(1, 20), 1);
  assert.equal(pageCount(20, 20), 1);
  assert.equal(pageCount(21, 20), 2);
  assert.equal(pageCount(653, 20), 33);
});

test("pageSlice returns the requested page", () => {
  const items = Array.from({ length: 25 }, (_, i) => i + 1);
  assert.deepEqual(pageSlice(items, 1, 20)[0], 1);
  assert.equal(pageSlice(items, 1, 20).length, 20);
  assert.deepEqual(pageSlice(items, 2, 20), [21, 22, 23, 24, 25]);
});

// 마지막 페이지에서 항목을 지우면 페이지 수가 줄어 현재 페이지가 범위를 벗어난다.
// 그대로 두면 빈 화면이 보이므로 마지막 페이지로 당긴다.
test("clampPage pulls an out-of-range page back into range", () => {
  assert.equal(clampPage(5, 25, 20), 2);
  assert.equal(clampPage(0, 25, 20), 1);
  assert.equal(clampPage(-3, 25, 20), 1);
  assert.equal(clampPage(1, 0, 20), 1);
});

test("pageRange reports the 1-based item range on the current page", () => {
  assert.deepEqual(pageRange(1, 25, 20), { from: 1, to: 20 });
  assert.deepEqual(pageRange(2, 25, 20), { from: 21, to: 25 });
  assert.deepEqual(pageRange(1, 0, 20), { from: 0, to: 0 }, "빈 목록은 0으로 표기한다");
});
