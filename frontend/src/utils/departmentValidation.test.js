import { test } from "node:test";
import assert from "node:assert/strict";
import { validateDepartmentForm } from "./departmentValidation.js";

test("valid input produces no errors", () => {
  assert.deepEqual(validateDepartmentForm({ name: "개발팀", code: "DEV" }), {});
});

test("empty name is rejected", () => {
  const errors = validateDepartmentForm({ name: "", code: "DEV" });
  assert.equal(errors.name, "부서명을 입력하세요.");
  assert.equal(errors.code, undefined);
});

test("whitespace-only name is rejected", () => {
  const errors = validateDepartmentForm({ name: "   ", code: "DEV" });
  assert.equal(errors.name, "부서명을 입력하세요.");
});

test("empty code is rejected", () => {
  const errors = validateDepartmentForm({ name: "개발팀", code: "" });
  assert.equal(errors.code, "부서 코드를 입력하세요.");
});

test("both missing reports both errors", () => {
  const errors = validateDepartmentForm({ name: "", code: "" });
  assert.deepEqual(Object.keys(errors).sort(), ["code", "name"]);
});
