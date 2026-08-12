import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createSession,
  currentProblemId,
  problemById,
  recordResult,
  isFinished,
  summarize,
  parseSession,
  endSessionEarly,
} from "./solveSession.js";

const P = (id) => ({ id, type: "OX", content: `문제 ${id}` });

test("createSession: starts at the first problem with no results", () => {
  const session = createSession([P(11), P(22), P(33)]);
  assert.deepStrictEqual(session.problemIds, [11, 22, 33]);
  assert.strictEqual(session.index, 0);
  assert.deepStrictEqual(session.results, []);
  assert.strictEqual(currentProblemId(session), 11);
  assert.strictEqual(isFinished(session), false);
});

test("createSession: keeps both the id order and the problem metadata", () => {
  const session = createSession([P(11), P(22)]);
  assert.deepStrictEqual(session.problemIds, [11, 22]);
  assert.deepStrictEqual(session.problems, [
    { id: 11, type: "OX", content: "문제 11" },
    { id: 22, type: "OX", content: "문제 22" },
  ]);
});

test("problemById: finds the stored metadata", () => {
  const session = createSession([P(11), P(22)]);
  assert.deepStrictEqual(problemById(session, 22), { id: 22, type: "OX", content: "문제 22" });
  assert.strictEqual(problemById(session, 999), undefined);
});

test("recordResult: advances and does not mutate the input", () => {
  const session = createSession([P(11), P(22)]);
  const next = recordResult(session, true);

  assert.strictEqual(next.index, 1);
  assert.deepStrictEqual(next.results, [{ problemId: 11, correct: true }]);
  assert.strictEqual(currentProblemId(next), 22);

  // 원본이 그대로여야 한다
  assert.strictEqual(session.index, 0);
  assert.deepStrictEqual(session.results, []);
});

test("isFinished: true only after the last problem is recorded", () => {
  let session = createSession([P(11), P(22)]);
  session = recordResult(session, true);
  assert.strictEqual(isFinished(session), false);
  session = recordResult(session, false);
  assert.strictEqual(isFinished(session), true);
  assert.strictEqual(currentProblemId(session), null);
});

test("summarize: counts correct answers", () => {
  let session = createSession([P(11), P(22), P(33)]);
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
  let session = createSession([P(11), P(22), P(33)]);
  session = recordResult(session, true);
  session = recordResult(session, false);
  // 3 문제 중 2개만 기록 — 1개는 아직 풀지 않음
  assert.strictEqual(isFinished(session), false);
  assert.strictEqual(currentProblemId(session), 33);
  // total은 3(문제 세트 크기)이 아니라 2(푼 개수)여야 한다
  assert.deepStrictEqual(summarize(session), { total: 2, correctCount: 1 });
});

test("parseSession: accepts a well-formed session", () => {
  const raw = JSON.stringify({
    problemIds: [11, 22],
    problems: [P(11), P(22)],
    index: 1,
    results: [{ problemId: 11, correct: true }],
  });
  assert.deepStrictEqual(parseSession(raw), {
    problemIds: [11, 22],
    problems: [P(11), P(22)],
    index: 1,
    results: [{ problemId: 11, correct: true }],
  });
});

test("parseSession: null or empty raw value returns null", () => {
  assert.strictEqual(parseSession(null), null);
  assert.strictEqual(parseSession(undefined), null);
  assert.strictEqual(parseSession(""), null);
});

test("parseSession: broken JSON returns null", () => {
  assert.strictEqual(parseSession("{not valid json"), null);
});

test("parseSession: rejects a non-array problemIds", () => {
  const raw = JSON.stringify({ problemIds: "11,22", index: 0, results: [], problems: [] });
  assert.strictEqual(parseSession(raw), null);
});

test("parseSession: rejects a non-number index", () => {
  const raw = JSON.stringify({ problemIds: [11, 22], index: "0", results: [], problems: [] });
  assert.strictEqual(parseSession(raw), null);
});

test("parseSession: rejects a non-array results", () => {
  const raw = JSON.stringify({ problemIds: [11, 22], index: 0, results: null, problems: [] });
  assert.strictEqual(parseSession(raw), null);
});

test("parseSession: rejects a session whose problems field is not an array", () => {
  const raw = JSON.stringify({ problemIds: [1], index: 0, results: [], problems: "x" });
  assert.strictEqual(parseSession(raw), null);
});

test("parseSession: rejects a pre-migration session with no problems field at all", () => {
  // 이 변경 전에 저장된 세션의 실제 형태 — problems 키가 아예 없다(비배열이 아니라
  // undefined). 의도적으로 거부한다: 이미 제출한 답은 서버에 남아 있고, 느슨하게
  // 받아들이면 결과 화면이 문제 본문을 못 찾아 조용히 망가진다.
  const raw = JSON.stringify({ problemIds: [11, 22], index: 0, results: [] });
  assert.strictEqual(parseSession(raw), null);
});

test("endSessionEarly: truncates problemIds to what was already answered, keeps results", () => {
  let session = createSession([P(11), P(22), P(33), P(44)]);
  session = recordResult(session, true);
  session = recordResult(session, false);
  // 4문제 세트 중 2개만 기록된 상태에서 3번째 로드가 계속 실패한다고 가정
  assert.strictEqual(isFinished(session), false);

  const ended = endSessionEarly(session);
  assert.strictEqual(isFinished(ended), true);
  assert.deepStrictEqual(ended.results, session.results);
  assert.deepStrictEqual(summarize(ended), { total: 2, correctCount: 1 });

  // 원본은 그대로여야 한다
  assert.strictEqual(isFinished(session), false);
});

test("endSessionEarly: keeps the problem metadata intact", () => {
  let session = createSession([P(11), P(22), P(33)]);
  session = recordResult(session, true);
  const ended = endSessionEarly(session);
  assert.strictEqual(ended.problemIds.length, 1);
  // 잘린 문제의 메타까지 지우면 결과 화면이 이미 푼 문제를 못 찾는다
  assert.deepStrictEqual(ended.problems, session.problems);
});
