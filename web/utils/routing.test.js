import { test } from "vitest";
import assert from "node:assert/strict";
import { canAccessAdmin, resolveLandingPath, resolvePrivateRedirect } from "./routing.js";

test("pc + SUPER_ADMIN can access admin", () => {
  assert.equal(canAccessAdmin({ device: "pc", role: "SUPER_ADMIN" }), true);
});

test("pc + DEPT_ADMIN can access admin", () => {
  assert.equal(canAccessAdmin({ device: "pc", role: "DEPT_ADMIN" }), true);
});

test("pc + EMPLOYEE cannot access admin", () => {
  assert.equal(canAccessAdmin({ device: "pc", role: "EMPLOYEE" }), false);
});

test("mobile + SUPER_ADMIN cannot access admin", () => {
  assert.equal(canAccessAdmin({ device: "mobile", role: "SUPER_ADMIN" }), false);
});

test("landing path for pc admin roles is /admin", () => {
  assert.equal(resolveLandingPath({ device: "pc", role: "SUPER_ADMIN" }), "/admin");
  assert.equal(resolveLandingPath({ device: "pc", role: "DEPT_ADMIN" }), "/admin");
});

test("landing path for pc employee is /solve", () => {
  assert.equal(resolveLandingPath({ device: "pc", role: "EMPLOYEE" }), "/solve");
});

test("landing path for any mobile role is /solve", () => {
  assert.equal(resolveLandingPath({ device: "mobile", role: "SUPER_ADMIN" }), "/solve");
  assert.equal(resolveLandingPath({ device: "mobile", role: "EMPLOYEE" }), "/solve");
});

// --- resolvePrivateRedirect: 보호 라우트 가드 ---

test("private guard never redirects while the session is still loading", () => {
  assert.equal(resolvePrivateRedirect({ status: "loading", session: null, pathname: "/solve" }), null);
  // 로딩 중에는 mustChangePassword 가 켜져 있어도 이동하지 않는다.
  assert.equal(
    resolvePrivateRedirect({
      status: "loading",
      session: { mustChangePassword: true },
      pathname: "/solve",
    }),
    null,
  );
});

test("private guard sends unauthenticated users to /login", () => {
  assert.equal(
    resolvePrivateRedirect({ status: "unauthenticated", session: null, pathname: "/solve" }),
    "/login",
  );
});

test("must-change-password users cannot reach /solve or /admin", () => {
  const session = { mustChangePassword: true, role: "EMPLOYEE" };
  assert.equal(resolvePrivateRedirect({ status: "authenticated", session, pathname: "/solve" }), "/change-password");
  assert.equal(resolvePrivateRedirect({ status: "authenticated", session, pathname: "/admin" }), "/change-password");
  assert.equal(resolvePrivateRedirect({ status: "authenticated", session, pathname: "/" }), "/change-password");
});

test("must-change-password users are not redirected away from /change-password itself", () => {
  assert.equal(
    resolvePrivateRedirect({
      status: "authenticated",
      session: { mustChangePassword: true },
      pathname: "/change-password",
    }),
    null,
  );
});

test("authenticated users without mustChangePassword pass through", () => {
  const session = { mustChangePassword: false, role: "EMPLOYEE" };
  assert.equal(resolvePrivateRedirect({ status: "authenticated", session, pathname: "/solve" }), null);
  assert.equal(resolvePrivateRedirect({ status: "authenticated", session, pathname: "/change-password" }), null);
});
