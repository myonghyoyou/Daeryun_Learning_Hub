import { test } from "node:test";
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

test("REVIEW_MIN_ATTEMPTS는 서버 상수와 같은 5다", () => {
  assert.equal(REVIEW_MIN_ATTEMPTS, 5);
});
