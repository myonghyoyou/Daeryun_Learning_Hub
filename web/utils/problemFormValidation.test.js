import { test } from "vitest";
import assert from "node:assert/strict";
import { validateProblemForm } from "./problemFormValidation.js";

function baseForm(overrides = {}) {
  return {
    type: "MCQ_SINGLE",
    content: "1 + 1 = ?",
    choices: [
      { text: "1", correct: false },
      { text: "2", correct: true },
    ],
    answers: [""],
    blanks: [{ blankKey: "", answerText: "" }],
    blankRevealCount: 1,
    tagsInput: "",
    ...overrides,
  };
}

test("validateProblemForm requires non-blank content regardless of type", () => {
  const errors = validateProblemForm(baseForm({ content: "   " }));
  assert.equal(errors.content, "문제 내용을 입력하세요.");
});

test("validateProblemForm returns no errors for a valid MCQ_SINGLE form", () => {
  assert.deepEqual(validateProblemForm(baseForm()), {});
});

test("validateProblemForm delegates to validateChoices for MCQ_SINGLE/MCQ_MULTI/OX", () => {
  const errors = validateProblemForm(
    baseForm({
      choices: [
        { text: "1", correct: false },
        { text: "2", correct: false },
      ],
    }),
  );
  assert.equal(errors.choices, "정답 개수가 올바르지 않습니다.");
});

test("validateProblemForm delegates to validateAnswers for SHORT_ANSWER and does not require choices", () => {
  const errors = validateProblemForm(
    baseForm({ type: "SHORT_ANSWER", answers: [], choices: [] }),
  );
  assert.equal(errors.answers, "정답을 최소 1개 입력하세요.");
  assert.equal(errors.choices, undefined);
});

test("validateProblemForm accepts a valid SHORT_ANSWER form", () => {
  const errors = validateProblemForm(baseForm({ type: "SHORT_ANSWER", answers: ["서울"], choices: [] }));
  assert.deepEqual(errors, {});
});

test("validateProblemForm delegates to validateBlanks for FILL_BLANK, checking markers against content", () => {
  const errors = validateProblemForm(
    baseForm({
      type: "FILL_BLANK",
      content: "수도는 {{blank_1}}이다.",
      blanks: [{ blankKey: "blank_2", answerText: "서울" }],
      blankRevealCount: 1,
      choices: [],
    }),
  );
  assert.equal(errors.blanks, "본문에 없는 빈칸 마커입니다: blank_2");
});

test("validateProblemForm accepts a valid FILL_BLANK form", () => {
  const errors = validateProblemForm(
    baseForm({
      type: "FILL_BLANK",
      content: "수도는 {{blank_1}}이다.",
      blanks: [{ blankKey: "blank_1", answerText: "서울" }],
      blankRevealCount: 1,
      choices: [],
    }),
  );
  assert.deepEqual(errors, {});
});

test("validateProblemForm rejects more than 20 normalized tags", () => {
  const tagsInput = Array.from({ length: 21 }, (_, i) => `tag${i}`).join(",");
  const errors = validateProblemForm(baseForm({ tagsInput }));
  assert.match(errors.tags, /20/);
});

test("validateProblemForm can report multiple field errors at once", () => {
  const errors = validateProblemForm(
    baseForm({
      content: "",
      choices: [{ text: "", correct: false }],
    }),
  );
  assert.equal(errors.content, "문제 내용을 입력하세요.");
  assert.ok(errors.choices);
});
