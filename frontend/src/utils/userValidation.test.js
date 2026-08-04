import { test } from "node:test";
import assert from "node:assert/strict";
import { validateUserCreateForm, validateUserEditForm } from "./userValidation.js";

const VALID = { employeeNo: "E001", name: "홍길동", email: "hong@company.com", departmentId: "1", role: "EMPLOYEE" };

test("validateUserCreateForm: valid input produces no errors", () => {
  assert.deepEqual(validateUserCreateForm(VALID), {});
});

test("validateUserCreateForm: empty employeeNo is rejected", () => {
  const errors = validateUserCreateForm({ ...VALID, employeeNo: "" });
  assert.equal(errors.employeeNo, "사번을 입력하세요.");
});

test("validateUserCreateForm: whitespace-only name is rejected", () => {
  const errors = validateUserCreateForm({ ...VALID, name: "   " });
  assert.equal(errors.name, "이름을 입력하세요.");
});

test("validateUserCreateForm: empty email is rejected", () => {
  const errors = validateUserCreateForm({ ...VALID, email: "" });
  assert.equal(errors.email, "회사 이메일을 입력하세요.");
});

test("validateUserCreateForm: malformed email is rejected", () => {
  const errors = validateUserCreateForm({ ...VALID, email: "not-an-email" });
  assert.equal(errors.email, "이메일 형식이 올바르지 않습니다.");
});

test("validateUserCreateForm: missing departmentId is rejected", () => {
  const errors = validateUserCreateForm({ ...VALID, departmentId: "" });
  assert.equal(errors.departmentId, "부서를 선택하세요.");
});

test("validateUserCreateForm: missing role is rejected", () => {
  const errors = validateUserCreateForm({ ...VALID, role: "" });
  assert.equal(errors.role, "역할을 선택하세요.");
});

test("validateUserCreateForm: all missing reports every field", () => {
  const errors = validateUserCreateForm({ employeeNo: "", name: "", email: "", departmentId: "", role: "" });
  assert.deepEqual(Object.keys(errors).sort(), ["departmentId", "email", "employeeNo", "name", "role"]);
});

test("validateUserEditForm: valid input produces no errors", () => {
  assert.deepEqual(validateUserEditForm(VALID), {});
});

test("validateUserEditForm: does not require employeeNo", () => {
  const errors = validateUserEditForm({ name: "홍길동", email: "hong@company.com", departmentId: "1", role: "EMPLOYEE" });
  assert.deepEqual(errors, {});
});

test("validateUserEditForm: still validates email format", () => {
  const errors = validateUserEditForm({ ...VALID, email: "bad" });
  assert.equal(errors.email, "이메일 형식이 올바르지 않습니다.");
});
