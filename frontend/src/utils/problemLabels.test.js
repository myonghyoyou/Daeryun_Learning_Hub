import { test } from "node:test";
import assert from "node:assert/strict";
import { PROBLEM_TYPE_OPTIONS, PROBLEM_STATUS_OPTIONS, problemTypeLabel, problemStatusLabel } from "./problemLabels.js";

test("problemTypeLabel maps all five backend problem types to Korean labels", () => {
  assert.equal(problemTypeLabel("MCQ_SINGLE"), "객관식(단일)");
  assert.equal(problemTypeLabel("MCQ_MULTI"), "객관식(다중)");
  assert.equal(problemTypeLabel("OX"), "OX");
  assert.equal(problemTypeLabel("SHORT_ANSWER"), "주관식");
  assert.equal(problemTypeLabel("FILL_BLANK"), "빈칸 채우기");
});

test("problemTypeLabel falls back to the raw value for an unknown type", () => {
  assert.equal(problemTypeLabel("UNKNOWN"), "UNKNOWN");
});

test("problemStatusLabel maps both backend problem statuses to Korean labels", () => {
  assert.equal(problemStatusLabel("ACTIVE"), "활성");
  assert.equal(problemStatusLabel("ARCHIVED"), "보관됨");
});

test("problemStatusLabel falls back to the raw value for an unknown status", () => {
  assert.equal(problemStatusLabel("UNKNOWN"), "UNKNOWN");
});

test("PROBLEM_TYPE_OPTIONS starts with an 'all types' sentinel option followed by the five types", () => {
  assert.deepEqual(
    PROBLEM_TYPE_OPTIONS.map((option) => option.value),
    ["ALL", "MCQ_SINGLE", "MCQ_MULTI", "OX", "SHORT_ANSWER", "FILL_BLANK"],
  );
  assert.equal(PROBLEM_TYPE_OPTIONS[0].label, "전체 유형");
  for (const option of PROBLEM_TYPE_OPTIONS.slice(1)) {
    assert.equal(option.label, problemTypeLabel(option.value));
  }
});

test("PROBLEM_STATUS_OPTIONS starts with an 'all statuses' sentinel option followed by both statuses", () => {
  assert.deepEqual(
    PROBLEM_STATUS_OPTIONS.map((option) => option.value),
    ["ALL", "ACTIVE", "ARCHIVED"],
  );
  assert.equal(PROBLEM_STATUS_OPTIONS[0].label, "전체 상태");
  for (const option of PROBLEM_STATUS_OPTIONS.slice(1)) {
    assert.equal(option.label, problemStatusLabel(option.value));
  }
});
