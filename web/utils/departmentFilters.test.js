import { test } from "vitest";
import assert from "node:assert/strict";
import { filterDepartments } from "./departmentFilters.js";

const DEPARTMENTS = [
  { id: 1, name: "개발팀", code: "DEV", status: "ACTIVE" },
  { id: 2, name: "인사팀", code: "HR", status: "INACTIVE" },
  { id: 3, name: "영업개발팀", code: "SALES-DEV", status: "ACTIVE" },
];

test("no filter returns every department", () => {
  assert.deepEqual(filterDepartments(DEPARTMENTS, {}), DEPARTMENTS);
});

test("status filter keeps only matching status", () => {
  assert.deepEqual(
    filterDepartments(DEPARTMENTS, { status: "INACTIVE" }).map((d) => d.id),
    [2],
  );
});

test("keyword matches name case-insensitively", () => {
  assert.deepEqual(
    filterDepartments(DEPARTMENTS, { keyword: "개발" }).map((d) => d.id),
    [1, 3],
  );
});

test("keyword matches code case-insensitively", () => {
  assert.deepEqual(
    filterDepartments(DEPARTMENTS, { keyword: "dev" }).map((d) => d.id),
    [1, 3],
  );
});

test("keyword and status combine as AND", () => {
  assert.deepEqual(
    filterDepartments(DEPARTMENTS, { keyword: "개발", status: "ACTIVE" }).map((d) => d.id),
    [1, 3],
  );
  assert.deepEqual(filterDepartments(DEPARTMENTS, { keyword: "개발", status: "INACTIVE" }), []);
});

test("whitespace-only keyword behaves like no keyword", () => {
  assert.deepEqual(filterDepartments(DEPARTMENTS, { keyword: "   " }), DEPARTMENTS);
});
