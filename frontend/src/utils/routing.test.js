import { test } from "node:test";
import assert from "node:assert/strict";
import { canAccessAdmin, resolveLandingPath } from "./routing.js";

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
