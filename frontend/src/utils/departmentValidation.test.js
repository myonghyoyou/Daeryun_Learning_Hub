import { test } from "node:test";
import assert from "node:assert/strict";
import { validateDepartmentEditForm, validateDepartmentForm } from "./departmentValidation.js";

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

test("edit form accepts a name on its own", () => {
  assert.deepEqual(validateDepartmentEditForm({ name: "개발본부" }), {});
});

test("edit form rejects an empty or whitespace-only name", () => {
  assert.equal(validateDepartmentEditForm({ name: "" }).name, "부서명을 입력하세요.");
  assert.equal(validateDepartmentEditForm({ name: "   " }).name, "부서명을 입력하세요.");
  assert.equal(validateDepartmentEditForm({}).name, "부서명을 입력하세요.");
});

// 수정 폼은 코드를 다루지 않는다(백엔드 PUT payload에 code가 없다) — 코드가 없다는
// 이유로 오류를 만들면 이름만 고치려는 요청이 영영 통과하지 못한다.
test("edit form does not report a missing code", () => {
  assert.equal(validateDepartmentEditForm({ name: "개발본부" }).code, undefined);
});
