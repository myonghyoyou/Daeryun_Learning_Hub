import { test } from "vitest";
import assert from "node:assert/strict";
import { ROLE_OPTIONS, roleLabel } from "./userRole.js";

test("roleLabel maps all three backend roles to Korean labels", () => {
  assert.equal(roleLabel("SUPER_ADMIN"), "총괄 관리자");
  assert.equal(roleLabel("DEPT_ADMIN"), "부서 관리자");
  assert.equal(roleLabel("EMPLOYEE"), "직원");
});

test("roleLabel falls back to the raw value for an unknown role", () => {
  assert.equal(roleLabel("UNKNOWN"), "UNKNOWN");
});

test("ROLE_OPTIONS carries one option per backend role for the Select", () => {
  assert.deepEqual(
    ROLE_OPTIONS.map((option) => option.value),
    ["SUPER_ADMIN", "DEPT_ADMIN", "EMPLOYEE"],
  );
  for (const option of ROLE_OPTIONS) {
    assert.equal(option.label, roleLabel(option.value));
  }
});
