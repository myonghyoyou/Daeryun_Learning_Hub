import { test } from "vitest";
import assert from "node:assert/strict";
import { formatFileSize } from "./formatFileSize.js";

test("formatFileSize renders sub-1KB sizes in bytes", () => {
  assert.equal(formatFileSize(0), "0B");
  assert.equal(formatFileSize(512), "512B");
});

test("formatFileSize renders sub-1MB sizes in KB with one decimal", () => {
  assert.equal(formatFileSize(1024), "1.0KB");
  assert.equal(formatFileSize(1536), "1.5KB");
});

test("formatFileSize renders 1MB and above in MB with one decimal", () => {
  assert.equal(formatFileSize(1024 * 1024), "1.0MB");
  assert.equal(formatFileSize(5 * 1024 * 1024), "5.0MB");
});

test("formatFileSize treats a missing/invalid size as unknown", () => {
  assert.equal(formatFileSize(null), "");
  assert.equal(formatFileSize(undefined), "");
});
