import { test } from "vitest";
import assert from "node:assert/strict";
import { filterUsers } from "./userFilters.js";

const USERS = [
  { id: 1, employeeNo: "E001", name: "홍길동", email: "hong@company.com", departmentName: "개발팀", status: "ACTIVE" },
  { id: 2, employeeNo: "E002", name: "김철수", email: "kim@company.com", departmentName: "인사팀", status: "INACTIVE" },
];

test("no filter returns every user", () => {
  assert.deepEqual(filterUsers(USERS), USERS);
});

test("status filter narrows by status", () => {
  assert.deepEqual(filterUsers(USERS, { status: "INACTIVE" }), [USERS[1]]);
});

test("keyword matches name", () => {
  assert.deepEqual(filterUsers(USERS, { keyword: "철수" }), [USERS[1]]);
});

test("keyword matches employeeNo case-insensitively", () => {
  assert.deepEqual(filterUsers(USERS, { keyword: "e001" }), [USERS[0]]);
});

test("keyword matches email", () => {
  assert.deepEqual(filterUsers(USERS, { keyword: "kim@" }), [USERS[1]]);
});

test("keyword matches department name", () => {
  assert.deepEqual(filterUsers(USERS, { keyword: "인사" }), [USERS[1]]);
});

test("keyword and status combine", () => {
  assert.deepEqual(filterUsers(USERS, { keyword: "홍", status: "INACTIVE" }), []);
});

test("no match returns an empty array", () => {
  assert.deepEqual(filterUsers(USERS, { keyword: "없음" }), []);
});
