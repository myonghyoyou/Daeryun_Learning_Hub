import { test } from "node:test";
import assert from "node:assert/strict";
import { buildProblemPayload } from "./problemFormPayload.js";

function baseForm(overrides = {}) {
  return {
    type: "MCQ_SINGLE",
    content: "  1 + 1 = ?  ",
    imageUrl: "",
    referenceText: "",
    explanation: "",
    choices: [
      { text: " 1 ", correct: false },
      { text: " 2 ", correct: true },
    ],
    answers: [],
    blanks: [],
    blankRevealCount: 1,
    tagsInput: "",
    ...overrides,
  };
}

test("buildProblemPayload never includes departmentId or createdBy (server-derived fields)", () => {
  const payload = buildProblemPayload(baseForm());
  assert.equal("departmentId" in payload, false);
  assert.equal("createdBy" in payload, false);
});

test("buildProblemPayload trims content and sends null (not empty string) for empty optional text fields", () => {
  const payload = buildProblemPayload(baseForm({ referenceText: "   ", explanation: "" }));
  assert.equal(payload.content, "1 + 1 = ?");
  assert.equal(payload.referenceText, null);
  assert.equal(payload.explanation, null);
});

test("buildProblemPayload preserves a provided imageUrl and sends null when absent", () => {
  assert.equal(buildProblemPayload(baseForm({ imageUrl: "" })).imageUrl, null);
  assert.equal(buildProblemPayload(baseForm({ imageUrl: "/uploads/images/a.png" })).imageUrl, "/uploads/images/a.png");
});

test("buildProblemPayload sends choices (trimmed text, boolean correct) for MCQ_SINGLE/MCQ_MULTI/OX and omits answers/blanks", () => {
  const payload = buildProblemPayload(baseForm());
  assert.deepEqual(payload.choices, [
    { text: "1", correct: false },
    { text: "2", correct: true },
  ]);
  assert.equal("answers" in payload, false);
  assert.equal("blanks" in payload, false);
  assert.equal("blankRevealCount" in payload, false);
});

test("buildProblemPayload sends trimmed answers for SHORT_ANSWER and omits choices/blanks", () => {
  const payload = buildProblemPayload(
    baseForm({ type: "SHORT_ANSWER", answers: [" 서울 ", "Seoul"], choices: [] }),
  );
  assert.deepEqual(payload.answers, ["서울", "Seoul"]);
  assert.equal("choices" in payload, false);
  assert.equal("blanks" in payload, false);
});

test("buildProblemPayload sends trimmed blanks and a numeric blankRevealCount for FILL_BLANK, and omits choices/answers", () => {
  const payload = buildProblemPayload(
    baseForm({
      type: "FILL_BLANK",
      content: "수도는 {{blank_1}}이다.",
      blanks: [{ blankKey: " blank_1 ", answerText: " 서울 " }],
      blankRevealCount: "1",
      choices: [],
    }),
  );
  assert.deepEqual(payload.blanks, [{ blankKey: "blank_1", answerText: "서울" }]);
  assert.equal(payload.blankRevealCount, 1);
  assert.equal(typeof payload.blankRevealCount, "number");
  assert.equal("choices" in payload, false);
  assert.equal("answers" in payload, false);
});

test("buildProblemPayload normalizes tags (trim, drop empty, case-insensitive dedupe)", () => {
  const payload = buildProblemPayload(baseForm({ tagsInput: " Java, java , React" }));
  assert.deepEqual(payload.tags, ["java", "react"]);
});

test("buildProblemPayload: sourceNumber를 숫자로 담는다", () => {
  const payload = buildProblemPayload({ ...baseForm(), sourceNumber: "13" });
  assert.equal(payload.sourceNumber, 13);
});

test("buildProblemPayload: 빈 sourceNumber는 null로 보낸다", () => {
  // 서버가 "문항 번호를 입력하세요"로 막는다. 화면이 0이나 NaN을 만들어
  // 보내면 그 메시지 대신 엉뚱한 검증에 걸린다.
  for (const empty of ["", null, undefined]) {
    const payload = buildProblemPayload({ ...baseForm(), sourceNumber: empty });
    assert.equal(payload.sourceNumber, null);
  }
});

test("buildProblemPayload: 여전히 departmentId를 넣지 않는다", () => {
  const payload = buildProblemPayload({ ...baseForm(), sourceNumber: "1" });
  assert.equal("departmentId" in payload, false);
});
