import { test } from "node:test";
import assert from "node:assert/strict";
import { MIN_CHOICES, MAX_CHOICES, createChoice, setChoiceCorrect, validateChoices } from "./problemChoices.js";

test("createChoice returns an empty, non-correct choice", () => {
  assert.deepEqual(createChoice(), { text: "", correct: false });
});

test("MIN_CHOICES/MAX_CHOICES match the server's bounds (ProblemServiceImpl)", () => {
  assert.equal(MIN_CHOICES, 2);
  assert.equal(MAX_CHOICES, 5);
});

test("setChoiceCorrect for MCQ_SINGLE selects exactly the target index (radio behavior)", () => {
  const choices = [
    { text: "a", correct: true },
    { text: "b", correct: false },
    { text: "c", correct: false },
  ];
  const next = setChoiceCorrect(choices, 2, "MCQ_SINGLE");
  assert.deepEqual(
    next.map((c) => c.correct),
    [false, false, true],
  );
});

test("setChoiceCorrect for OX behaves like MCQ_SINGLE (radio behavior)", () => {
  const choices = [
    { text: "O", correct: true },
    { text: "X", correct: false },
  ];
  const next = setChoiceCorrect(choices, 1, "OX");
  assert.deepEqual(
    next.map((c) => c.correct),
    [false, true],
  );
});

test("setChoiceCorrect for MCQ_MULTI toggles only the target index (checkbox behavior)", () => {
  const choices = [
    { text: "a", correct: true },
    { text: "b", correct: false },
  ];
  const next = setChoiceCorrect(choices, 1, "MCQ_MULTI");
  assert.deepEqual(
    next.map((c) => c.correct),
    [true, true],
  );
  const toggledBack = setChoiceCorrect(next, 1, "MCQ_MULTI");
  assert.deepEqual(
    toggledBack.map((c) => c.correct),
    [true, false],
  );
});

test("validateChoices rejects fewer than 2 choices for MCQ_SINGLE", () => {
  assert.equal(validateChoices("MCQ_SINGLE", [{ text: "a", correct: true }]), "보기는 2개 이상 5개 이하이어야 합니다.");
});

test("validateChoices rejects more than 5 choices for MCQ_MULTI", () => {
  const choices = Array.from({ length: 6 }, (_, i) => ({ text: `c${i}`, correct: i === 0 }));
  assert.equal(validateChoices("MCQ_MULTI", choices), "보기는 2개 이상 5개 이하이어야 합니다.");
});

test("validateChoices rejects a blank choice text anywhere in the list, including an internal gap between filled choices", () => {
  const choices = [
    { text: "a", correct: true },
    { text: "  ", correct: false },
    { text: "c", correct: false },
  ];
  assert.equal(validateChoices("MCQ_SINGLE", choices), "빈 보기는 입력할 수 없습니다.");
});

test("validateChoices rejects a trailing blank choice too (no silent compaction)", () => {
  const choices = [
    { text: "a", correct: true },
    { text: "b", correct: false },
    { text: "", correct: false },
  ];
  assert.equal(validateChoices("MCQ_SINGLE", choices), "빈 보기는 입력할 수 없습니다.");
});

test("validateChoices requires exactly one correct choice for MCQ_SINGLE", () => {
  const none = [
    { text: "a", correct: false },
    { text: "b", correct: false },
  ];
  const two = [
    { text: "a", correct: true },
    { text: "b", correct: true },
  ];
  assert.equal(validateChoices("MCQ_SINGLE", none), "정답을 1개 선택하세요.");
  assert.equal(validateChoices("MCQ_SINGLE", two), "정답을 1개 선택하세요.");
});

test("validateChoices requires at least one correct choice for MCQ_MULTI, and allows more than one", () => {
  const none = [
    { text: "a", correct: false },
    { text: "b", correct: false },
  ];
  const two = [
    { text: "a", correct: true },
    { text: "b", correct: true },
  ];
  assert.equal(validateChoices("MCQ_MULTI", none), "정답을 최소 1개 선택하세요.");
  assert.equal(validateChoices("MCQ_MULTI", two), null);
});

test("validateChoices requires exactly 2 choices for OX, independent of the general 2-5 range message", () => {
  const one = [{ text: "O", correct: true }];
  const three = [
    { text: "O", correct: true },
    { text: "X", correct: false },
    { text: "Extra", correct: false },
  ];
  assert.equal(validateChoices("OX", one), "OX 문제는 보기 2개(O/X)가 필요합니다.");
  assert.equal(validateChoices("OX", three), "OX 문제는 보기 2개(O/X)가 필요합니다.");
});

test("validateChoices requires exactly one correct choice for OX", () => {
  const zero = [
    { text: "O", correct: false },
    { text: "X", correct: false },
  ];
  assert.equal(validateChoices("OX", zero), "정답을 1개 선택하세요.");
});

test("validateChoices returns null for a valid MCQ_SINGLE, MCQ_MULTI, and OX set", () => {
  assert.equal(
    validateChoices("MCQ_SINGLE", [
      { text: "a", correct: true },
      { text: "b", correct: false },
    ]),
    null,
  );
  assert.equal(
    validateChoices("OX", [
      { text: "O", correct: true },
      { text: "X", correct: false },
    ]),
    null,
  );
});

test("validateChoices treats a missing choices array as invalid rather than throwing", () => {
  assert.equal(validateChoices("MCQ_SINGLE", null), "보기는 2개 이상 5개 이하이어야 합니다.");
  assert.equal(validateChoices("OX", undefined), "OX 문제는 보기 2개(O/X)가 필요합니다.");
});
