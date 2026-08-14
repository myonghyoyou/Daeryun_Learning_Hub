import { test } from "node:test";
import assert from "node:assert/strict";
import { sourceLabel } from "./sourceLabel.js";

test("sourceLabel: 부서명과 번호를 합친다", () => {
  assert.equal(sourceLabel({ departmentName: "정보시스템팀", sourceNumber: 3 }), "정보시스템팀 3번");
});

test("sourceLabel: 번호가 없으면 null", () => {
  // 기존 문제는 번호가 비어 있다. 배지를 아예 그리지 않기 위한 신호다.
  assert.equal(sourceLabel({ departmentName: "정보시스템팀", sourceNumber: null }), null);
  assert.equal(sourceLabel({ departmentName: "정보시스템팀" }), null);
});

test("sourceLabel: 부서명이 없으면 번호만", () => {
  assert.equal(sourceLabel({ sourceNumber: 3 }), "3번");
});

test("sourceLabel: 0번은 번호가 아니다", () => {
  // 서버가 1 이상만 받지만 화면이 0을 "0번"으로 그리면 잘못된 확신을 준다.
  assert.equal(sourceLabel({ departmentName: "회계팀", sourceNumber: 0 }), null);
});

test("sourceLabel: 인자가 없어도 터지지 않는다", () => {
  assert.equal(sourceLabel(null), null);
  assert.equal(sourceLabel(undefined), null);
});
