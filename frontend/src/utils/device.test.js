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

/*
 * QA D5: 브라우저 확대는 CSS 뷰포트 너비를 줄인다. 1440px 화면에서 200% 확대하면
 * 720px가 되는데, 임계값이 768px이던 동안에는 이것이 "mobile"로 분류되어 관리자가
 * /solve로 튕겨나갔다(WCAG 2.1 SC 1.4.4 위반). 실사용 해상도의 200% 확대 폭을
 * 고정해 임계값이 다시 올라가면 이 테스트가 깨지게 한다.
 */
test("keeps 200% zoom on common desktop widths on the pc side", () => {
  assert.equal(classifyDevice(960), "pc", "1920px 화면의 200% 확대");
  assert.equal(classifyDevice(720), "pc", "1440px 화면의 200% 확대");
  assert.equal(classifyDevice(683), "pc", "1366px 화면의 200% 확대");
  assert.equal(classifyDevice(640), "pc", "1280px 화면의 200% 확대");
});

// 확대를 살리더라도 실제 모바일 기기는 계속 차단되어야 한다.
test("still classifies phone-sized viewports as mobile", () => {
  assert.equal(classifyDevice(390), "mobile", "iPhone 세로");
  assert.equal(classifyDevice(430), "mobile", "대형 폰 세로");
  assert.equal(classifyDevice(639), "mobile", "임계값 바로 아래");
});
