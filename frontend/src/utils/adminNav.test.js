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

test("SUPER_ADMIN sees the department, account, and problem management menus", () => {
  assert.deepEqual(toPlain(buildNavGroups("SUPER_ADMIN")), [
    {
      label: "관리 메뉴",
      items: [
        { to: "/admin/dashboard", label: "대시보드", end: false },
        { to: "/admin/departments", label: "부서 관리", end: false },
        { to: "/admin/users", label: "계정 관리", end: true },
        { to: "/admin/users/excel-upload", label: "계정 일괄 등록", end: false },
        { to: "/admin/problems", label: "문제 관리", end: true },
        { to: "/admin/problems/excel-upload", label: "문제 엑셀 일괄 등록", end: false },
        { to: "/admin/stats", label: "통계", end: false },
      ],
    },
  ]);
});

// NavLink 는 기본적으로 접두사로 매칭한다. 따라서 어떤 항목의 경로가 다른 항목의 경로의
// 접두사인데 end:true 가 없으면, 하위 경로 화면에서 두 메뉴가 동시에 활성으로 보인다
// (/admin/users/excel-upload 에서 "계정 관리"까지 켜지던 실제 결함).
test("a menu path that prefixes another menu path must be exact-matched (end)", () => {
  for (const role of ["SUPER_ADMIN", "DEPT_ADMIN", "EMPLOYEE", undefined, null]) {
    const items = buildNavGroups(role).flatMap((group) => group.items);
    for (const item of items) {
      const isPrefixOfAnother = items.some(
        (other) => other !== item && other.to.startsWith(`${item.to}/`)
      );
      if (isPrefixOfAnother) {
        assert.equal(item.end, true, `${item.to} prefixes another menu path but is not exact-matched`);
      }
    }
  }
});

// 대시보드 항목은 /admin 이 아니라 /admin/dashboard 를 가리켜야 한다. /admin 은 라우터가
// 리다이렉트만 하는 경로라 end:true NavLink 가 절대 활성화될 수 없는 죽은 링크가 된다.
test("the dashboard menu points at /admin/dashboard, never at the redirect-only /admin", () => {
  for (const role of ["SUPER_ADMIN", "DEPT_ADMIN", "EMPLOYEE", undefined, null]) {
    for (const group of buildNavGroups(role)) {
      for (const item of group.items) {
        assert.notEqual(item.to, "/admin", `${role} still has a dead /admin link`);
      }
    }
  }
});

test("DEPT_ADMIN does not see department or account management (hidden, not disabled), but does see problem management", () => {
  assert.deepEqual(toPlain(buildNavGroups("DEPT_ADMIN")), [
    {
      label: "관리 메뉴",
      items: [
        { to: "/admin/dashboard", label: "대시보드", end: false },
        { to: "/admin/problems", label: "문제 관리", end: true },
        { to: "/admin/problems/excel-upload", label: "문제 엑셀 일괄 등록", end: false },
        { to: "/admin/stats", label: "통계", end: false },
      ],
    },
  ]);
});

test("EMPLOYEE (should never reach AdminLayout, but defensively) sees no menu at all", () => {
  assert.deepEqual(toPlain(buildNavGroups("EMPLOYEE")), []);
});

test("an undefined or null role does not throw and hides the admin-only menu", () => {
  assert.deepEqual(toPlain(buildNavGroups(undefined)), []);
  assert.deepEqual(toPlain(buildNavGroups(null)), []);
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

test("both admin roles land on the dashboard as the first menu item", () => {
  for (const role of ["SUPER_ADMIN", "DEPT_ADMIN"]) {
    const items = buildNavGroups(role).flatMap((group) => group.items);
    assert.equal(items[0].to, "/admin/dashboard");
  }
});

test("both admin roles see the statistics menu", () => {
  for (const role of ["SUPER_ADMIN", "DEPT_ADMIN"]) {
    const items = buildNavGroups(role).flatMap((group) => group.items);
    assert.ok(items.some((item) => item.to === "/admin/stats"));
  }
});

// /admin/stats/:id 로 들어가도 "통계"가 켜져 있어야 한다. end:true 를 주면 상세 화면에서
// 메뉴가 통째로 꺼진다.
test("the statistics menu is not exact-matched so the detail screen keeps it active", () => {
  const stats = buildNavGroups("SUPER_ADMIN").flatMap((group) => group.items)
    .find((item) => item.to === "/admin/stats");
  assert.notEqual(stats.end, true);
});
