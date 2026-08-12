import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createSession,
  currentProblemId,
  recordResult,
  isFinished,
  summarize,
} from "./solveSession.js";

test("createSession: starts at the first problem with no results", () => {
  const session = createSession([11, 22, 33]);
  assert.deepStrictEqual(session.problemIds, [11, 22, 33]);
  assert.strictEqual(session.index, 0);
  assert.deepStrictEqual(session.results, []);
  assert.strictEqual(currentProblemId(session), 11);
  assert.strictEqual(isFinished(session), false);
});

test("recordResult: advances and does not mutate the input", () => {
  const session = createSession([11, 22]);
  const next = recordResult(session, true);

  assert.strictEqual(next.index, 1);
  assert.deepStrictEqual(next.results, [{ problemId: 11, correct: true }]);
  assert.strictEqual(currentProblemId(next), 22);

  // 원본이 그대로여야 한다
  assert.strictEqual(session.index, 0);
  assert.deepStrictEqual(session.results, []);
});

test("isFinished: true only after the last problem is recorded", () => {
  let session = createSession([11, 22]);
  session = recordResult(session, true);
  assert.strictEqual(isFinished(session), false);
  session = recordResult(session, false);
  assert.strictEqual(isFinished(session), true);
  assert.strictEqual(currentProblemId(session), null);
});

test("summarize: counts correct answers", () => {
  let session = createSession([11, 22, 33]);
  session = recordResult(session, true);
  session = recordResult(session, false);
  session = recordResult(session, true);
  assert.deepStrictEqual(summarize(session), { total: 3, correctCount: 2 });
});

test("createSession: an empty set is finished immediately", () => {
  const session = createSession([]);
  assert.strictEqual(isFinished(session), true);
  assert.strictEqual(currentProblemId(session), null);
  assert.deepStrictEqual(summarize(session), { total: 0, correctCount: 0 });
});

test("summarize: total is results count, not problemIds count", () => {
  let session = createSession([11, 22, 33]);
  session = recordResult(session, true);
  session = recordResult(session, false);
  // 3 문제 중 2개만 기록 — 1개는 아직 풀지 않음
  assert.strictEqual(isFinished(session), false);
  assert.strictEqual(currentProblemId(session), 33);
  // total은 3(문제 세트 크기)이 아니라 2(푼 개수)여야 한다
  assert.deepStrictEqual(summarize(session), { total: 2, correctCount: 1 });
});
