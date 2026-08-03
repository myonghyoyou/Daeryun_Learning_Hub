import { test } from "node:test";
import assert from "node:assert/strict";
import { classifyDevice, MOBILE_BREAKPOINT } from "./device.js";

test("returns mobile below breakpoint", () => {
  assert.equal(classifyDevice(MOBILE_BREAKPOINT - 1), "mobile");
});

test("returns pc at breakpoint", () => {
  assert.equal(classifyDevice(MOBILE_BREAKPOINT), "pc");
});

test("returns pc above breakpoint", () => {
  assert.equal(classifyDevice(1920), "pc");
});
