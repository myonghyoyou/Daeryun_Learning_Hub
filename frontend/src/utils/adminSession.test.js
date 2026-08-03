import { test } from "node:test";
import assert from "node:assert/strict";
import { roleLabel, departmentScopeLabel } from "./adminSession.js";

test("roleLabel maps known roles to Korean labels", () => {
  assert.equal(roleLabel("SUPER_ADMIN"), "총괄 관리자");
  assert.equal(roleLabel("DEPT_ADMIN"), "부서 관리자");
});

test("roleLabel falls back to a generic label for unknown roles", () => {
  assert.equal(roleLabel("EMPLOYEE"), "관리자");
  assert.equal(roleLabel(undefined), "관리자");
});

test("departmentScopeLabel always shows 전체 부서 for SUPER_ADMIN", () => {
  assert.equal(departmentScopeLabel({ role: "SUPER_ADMIN", departmentId: 3 }), "전체 부서");
  assert.equal(departmentScopeLabel({ role: "SUPER_ADMIN", departmentId: null }), "전체 부서");
});

test("departmentScopeLabel falls back to a department id for other roles", () => {
  assert.equal(departmentScopeLabel({ role: "DEPT_ADMIN", departmentId: 5 }), "부서 5번");
  assert.equal(departmentScopeLabel({ role: "DEPT_ADMIN", departmentId: null }), "-");
  assert.equal(departmentScopeLabel(null), "-");
});
