import { test } from "node:test";
import assert from "node:assert/strict";
import { buildNavGroups } from "./adminNav.js";

// 아이콘 컴포넌트 참조 자체는 비교하지 않고(구현 세부사항), 라우트/라벨/노출 여부만
// 검증한다 — 이 함수가 실제로 지켜야 하는 계약이다.
function toPlain(groups) {
  return groups.map((group) => ({
    label: group.label,
    items: group.items.map((item) => ({ to: item.to, label: item.label, end: item.end ?? false })),
  }));
}

const DASHBOARD_ONLY = [{ label: "주요 메뉴", items: [{ to: "/admin", label: "대시보드", end: true }] }];

test("SUPER_ADMIN sees the dashboard, department management, and account management menus", () => {
  assert.deepEqual(toPlain(buildNavGroups("SUPER_ADMIN")), [
    ...DASHBOARD_ONLY,
    {
      label: "관리 메뉴",
      items: [
        { to: "/admin/departments", label: "부서 관리", end: false },
        { to: "/admin/users", label: "계정 관리", end: false },
        { to: "/admin/users/excel-upload", label: "계정 일괄 등록", end: false },
      ],
    },
  ]);
});

test("DEPT_ADMIN does not see department or account management (hidden, not disabled)", () => {
  assert.deepEqual(toPlain(buildNavGroups("DEPT_ADMIN")), DASHBOARD_ONLY);
});

test("EMPLOYEE (should never reach AdminLayout, but defensively) also only sees the dashboard", () => {
  assert.deepEqual(toPlain(buildNavGroups("EMPLOYEE")), DASHBOARD_ONLY);
});

test("an undefined or null role does not throw and hides the admin-only menu", () => {
  assert.deepEqual(toPlain(buildNavGroups(undefined)), DASHBOARD_ONLY);
  assert.deepEqual(toPlain(buildNavGroups(null)), DASHBOARD_ONLY);
});

test("every rendered item carries an icon component", () => {
  for (const role of ["SUPER_ADMIN", "DEPT_ADMIN", undefined]) {
    for (const group of buildNavGroups(role)) {
      for (const item of group.items) {
        assert.ok(item.icon, `${role} item ${item.to} is missing an icon`);
      }
    }
  }
});
