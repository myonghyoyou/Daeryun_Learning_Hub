import { test } from "node:test";
import assert from "node:assert/strict";
import { roleLabel, departmentScopeLabel, sessionStatusMeta } from "./adminSession.js";

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

test("sessionStatusMeta maps each known store status to a label with its own tone", () => {
  assert.equal(sessionStatusMeta("authenticated").label, "세션 연결됨");
  assert.equal(sessionStatusMeta("loading").label, "세션 확인 중");
  assert.equal(sessionStatusMeta("unauthenticated").label, "세션 종료됨");
  // 색상 점만으로 상태를 전달하지 않도록(§7.9) dot과 text 톤 클래스가 항상 함께 온다.
  assert.ok(sessionStatusMeta("authenticated").dotClassName);
  assert.ok(sessionStatusMeta("authenticated").textClassName);
});

test("sessionStatusMeta falls back for an unknown status instead of throwing", () => {
  const meta = sessionStatusMeta("something-unexpected");
  assert.equal(meta.label, "세션 상태 확인 불가");
  assert.ok(meta.dotClassName);
  assert.ok(meta.textClassName);
});
