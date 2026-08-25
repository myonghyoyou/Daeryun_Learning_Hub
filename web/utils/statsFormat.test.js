import { test } from "vitest";
import assert from "node:assert/strict";
import { formatAccuracyRate, isReviewNeeded, REVIEW_MIN_ATTEMPTS } from "./statsFormat.js";

test("formatAccuracyRate: null은 0%가 아니라 미응시다", () => {
  assert.equal(formatAccuracyRate(null), "미응시");
  assert.equal(formatAccuracyRate(undefined), "미응시");
});

test("formatAccuracyRate: 0은 미응시가 아니라 0%다", () => {
  assert.equal(formatAccuracyRate(0), "0%");
});

test("formatAccuracyRate: 백분율로 반올림한다", () => {
  assert.equal(formatAccuracyRate(0.2), "20%");
  assert.equal(formatAccuracyRate(0.666), "67%");
  assert.equal(formatAccuracyRate(1), "100%");
});

test("isReviewNeeded: 활성 + 시도 5회 이상 + 정답률 50% 미만", () => {
  assert.equal(isReviewNeeded({ status: "ACTIVE", totalAttempts: 8, accuracyRate: 0.25 }), true);
});

test("isReviewNeeded: 표본이 적으면 정답률이 0이어도 아니다", () => {
  assert.equal(isReviewNeeded({ status: "ACTIVE", totalAttempts: 3, accuracyRate: 0 }), false);
});

test("isReviewNeeded: 보관 문제는 고칠 대상이 아니다", () => {
  assert.equal(isReviewNeeded({ status: "ARCHIVED", totalAttempts: 8, accuracyRate: 0.25 }), false);
});

test("isReviewNeeded: 정확히 50%는 대상이 아니다", () => {
  assert.equal(isReviewNeeded({ status: "ACTIVE", totalAttempts: 10, accuracyRate: 0.5 }), false);
});

test("isReviewNeeded: 미응시는 대상이 아니다", () => {
  assert.equal(isReviewNeeded({ status: "ACTIVE", totalAttempts: 0, accuracyRate: null }), false);
});

// 위 테스트는 totalAttempts 0 에서 먼저 걸러져 null 가드까지 도달하지 않는다. 가드를 지워도
// 통과하므로 별도로 고정한다 — 그런데 그 가드는 실제로 하중을 받는다. JS 에서 null < 0.5 는
// null 을 0 으로 강제 변환해 true 가 되므로, 가드가 없으면 정답률이 null 인 항목이 "검토 필요"로
// 잡힌다. 시도 수가 5회 이상인데 정답률이 null 인 조합은 서버가 만들지 않지만, 방어는 남긴다.
test("isReviewNeeded: 시도 수가 충분해도 정답률이 null 이면 대상이 아니다", () => {
  assert.equal(isReviewNeeded({ status: "ACTIVE", totalAttempts: 8, accuracyRate: null }), false);
});

test("REVIEW_MIN_ATTEMPTS는 서버 상수와 같은 5다", () => {
  assert.equal(REVIEW_MIN_ATTEMPTS, 5);
});
