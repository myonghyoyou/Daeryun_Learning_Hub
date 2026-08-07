import { test } from "node:test";
import assert from "node:assert/strict";
import { EMPTY_PROBLEM_FILTERS, buildProblemListParams } from "./problemListParams.js";

test("default filters (all ALL/empty) produce an empty params object", () => {
  assert.deepEqual(buildProblemListParams(EMPTY_PROBLEM_FILTERS), {
    keyword: undefined,
    type: undefined,
    status: undefined,
    tag: undefined,
    createdFrom: undefined,
    createdTo: undefined,
  });
});

test("the 'ALL' sentinel for type/status is dropped, not sent as a literal 'ALL' query value", () => {
  const params = buildProblemListParams({ ...EMPTY_PROBLEM_FILTERS, type: "ALL", status: "ALL" });
  assert.equal(params.type, undefined);
  assert.equal(params.status, undefined);
});

test("a concrete type/status passes through unchanged", () => {
  const params = buildProblemListParams({ ...EMPTY_PROBLEM_FILTERS, type: "OX", status: "ARCHIVED" });
  assert.equal(params.type, "OX");
  assert.equal(params.status, "ARCHIVED");
});

test("keyword is trimmed, and a whitespace-only keyword becomes undefined", () => {
  assert.equal(buildProblemListParams({ ...EMPTY_PROBLEM_FILTERS, keyword: "  근태  " }).keyword, "근태");
  assert.equal(buildProblemListParams({ ...EMPTY_PROBLEM_FILTERS, keyword: "   " }).keyword, undefined);
});

test("tag and date range pass through when set, and empty strings become undefined", () => {
  const params = buildProblemListParams({
    ...EMPTY_PROBLEM_FILTERS,
    tag: "필수",
    createdFrom: "2026-01-01",
    createdTo: "2026-01-31",
  });
  assert.equal(params.tag, "필수");
  assert.equal(params.createdFrom, "2026-01-01");
  assert.equal(params.createdTo, "2026-01-31");

  const empty = buildProblemListParams(EMPTY_PROBLEM_FILTERS);
  assert.equal(empty.tag, undefined);
  assert.equal(empty.createdFrom, undefined);
  assert.equal(empty.createdTo, undefined);
});

test("buildProblemListParams does not mutate the input filters object", () => {
  const filters = { ...EMPTY_PROBLEM_FILTERS, keyword: "  a  " };
  const snapshot = { ...filters };
  buildProblemListParams(filters);
  assert.deepEqual(filters, snapshot);
});
