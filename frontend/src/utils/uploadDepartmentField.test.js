import { test } from "node:test";
import assert from "node:assert/strict";
import { buildUploadDepartmentField } from "./uploadDepartmentField.js";

const DEPARTMENTS = [
  { id: 1, name: "본사", code: "HQ", status: "ACTIVE" },
  { id: 2, name: "개발팀", code: "DEV", status: "ACTIVE" },
  { id: 3, name: "폐지팀", code: "OLD", status: "INACTIVE" },
];

test("super admin can choose among active departments", () => {
  const field = buildUploadDepartmentField({
    session: { role: "SUPER_ADMIN", departmentId: 1, departmentName: "본사" },
    departments: DEPARTMENTS,
  });

  assert.equal(field.disabled, false);
  assert.deepEqual(
    field.options.map((o) => o.label),
    ["부서 선택", "본사", "개발팀"]
  );
});

// 선택을 잊었을 때 조용히 본인 부서로 들어가면 안 된다. 서버도 같은 이유로 null 을 거부한다.
test("super admin starts with no department selected", () => {
  const field = buildUploadDepartmentField({
    session: { role: "SUPER_ADMIN", departmentId: 1, departmentName: "본사" },
    departments: DEPARTMENTS,
  });

  assert.equal(field.value, "");
});

test("dept admin is locked to their own department", () => {
  const field = buildUploadDepartmentField({
    session: { role: "DEPT_ADMIN", departmentId: 2, departmentName: "개발팀" },
    departments: [],
  });

  assert.equal(field.disabled, true);
  assert.equal(field.value, "2");
  assert.deepEqual(field.options, [{ value: "2", label: "개발팀" }]);
});

// 부서 목록 API 는 총괄 관리자 전용이라 부서 관리자에게는 departments 가 빈 배열로 들어온다.
// 그래도 목록이 어쩌다 넘어오더라도 다른 부서가 보이면 안 된다.
test("dept admin never sees other departments even if a list is passed", () => {
  const field = buildUploadDepartmentField({
    session: { role: "DEPT_ADMIN", departmentId: 2, departmentName: "개발팀" },
    departments: DEPARTMENTS,
  });

  assert.equal(field.options.length, 1);
  assert.equal(field.disabled, true);
});

test("falls back to a dash when the session has no department name", () => {
  const field = buildUploadDepartmentField({
    session: { role: "DEPT_ADMIN", departmentId: 2 },
    departments: [],
  });

  assert.equal(field.options[0].label, "-");
});
