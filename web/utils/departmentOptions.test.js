import { test } from "vitest";
import assert from "node:assert/strict";
import { buildDepartmentOptions } from "./departmentOptions.js";

const DEPARTMENTS = [
  { id: 1, name: "개발팀", status: "ACTIVE" },
  { id: 2, name: "인사팀", status: "INACTIVE" },
  { id: 3, name: "영업팀", status: "ACTIVE" },
];

test("create form (no currentDepartmentId): only ACTIVE departments are offered", () => {
  const options = buildDepartmentOptions(DEPARTMENTS);
  assert.deepEqual(options, [
    { value: "", label: "부서 선택" },
    { value: "1", label: "개발팀" },
    { value: "3", label: "영업팀" },
  ]);
});

test("edit form: the user's current INACTIVE department is retained and labeled, other inactive departments are excluded", () => {
  const options = buildDepartmentOptions(DEPARTMENTS, { currentDepartmentId: 2 });
  assert.deepEqual(options, [
    { value: "", label: "부서 선택" },
    { value: "1", label: "개발팀" },
    { value: "2", label: "인사팀 (비활성)" },
    { value: "3", label: "영업팀" },
  ]);
});

test("edit form: when the current department is ACTIVE, it is included with its plain label (no duplicate, no suffix)", () => {
  const options = buildDepartmentOptions(DEPARTMENTS, { currentDepartmentId: 1 });
  assert.deepEqual(options, [
    { value: "", label: "부서 선택" },
    { value: "1", label: "개발팀" },
    { value: "3", label: "영업팀" },
  ]);
});

test("currentDepartmentId as a string works the same as a number (Select values are always strings)", () => {
  const options = buildDepartmentOptions(DEPARTMENTS, { currentDepartmentId: "2" });
  assert.deepEqual(
    options.map((option) => option.value),
    ["", "1", "2", "3"],
  );
});

test("no departments at all yields just the placeholder", () => {
  assert.deepEqual(buildDepartmentOptions([]), [{ value: "", label: "부서 선택" }]);
});
