import { test } from "vitest";
import assert from "node:assert/strict";
import { createBlank, validateBlanks } from "./problemBlanks.js";

test("createBlank returns an empty blank candidate", () => {
  assert.deepEqual(createBlank(), { blankKey: "", answerText: "" });
});

const validForm = {
  content: "대한민국의 수도는 {{blank_1}}이다.",
  blanks: [{ blankKey: "blank_1", answerText: "서울" }],
  blankRevealCount: 1,
};

test("validateBlanks accepts a well-formed single blank", () => {
  assert.equal(validateBlanks(validForm), null);
});

test("validateBlanks rejects a missing or empty blank list", () => {
  assert.equal(validateBlanks({ ...validForm, blanks: [] }), "빈칸을 최소 1개 정의하세요.");
  assert.equal(validateBlanks({ ...validForm, blanks: null }), "빈칸을 최소 1개 정의하세요.");
});

test("validateBlanks rejects a blank entry whose key or answer is empty, including an internal gap between filled entries", () => {
  const blanks = [
    { blankKey: "blank_1", answerText: "서울" },
    { blankKey: "blank_2", answerText: "" },
    { blankKey: "blank_3", answerText: "도쿄" },
  ];
  assert.equal(
    validateBlanks({ content: "{{blank_1}}{{blank_2}}{{blank_3}}", blanks, blankRevealCount: 1 }),
    "빈칸 키와 정답을 모두 입력하세요.",
  );
});

test("validateBlanks rejects an empty blankKey even when answerText is filled", () => {
  const blanks = [{ blankKey: "  ", answerText: "서울" }];
  assert.equal(validateBlanks({ content: "{{blank_1}}", blanks, blankRevealCount: 1 }), "빈칸 키와 정답을 모두 입력하세요.");
});

test("validateBlanks rejects duplicate blank keys, matching the server's HashSet-size check", () => {
  const blanks = [
    { blankKey: "blank_1", answerText: "서울" },
    { blankKey: "blank_1", answerText: "도쿄" },
  ];
  assert.equal(
    validateBlanks({ content: "{{blank_1}}", blanks, blankRevealCount: 1 }),
    "빈칸 키가 중복되었습니다.",
  );
});

test("validateBlanks rejects a declared blank key that does not appear as {{key}} in the content", () => {
  const blanks = [{ blankKey: "blank_1", answerText: "서울" }];
  assert.equal(
    validateBlanks({ content: "마커가 없는 본문입니다.", blanks, blankRevealCount: 1 }),
    "본문에 없는 빈칸 마커입니다: blank_1",
  );
});

test("validateBlanks does not accept a single-brace marker as satisfying the double-brace requirement", () => {
  const blanks = [{ blankKey: "blank_1", answerText: "서울" }];
  assert.equal(
    validateBlanks({ content: "{blank_1} 서울", blanks, blankRevealCount: 1 }),
    "본문에 없는 빈칸 마커입니다: blank_1",
  );
});

test("validateBlanks rejects a blankRevealCount outside [1, blanks.length]", () => {
  const blanks = [
    { blankKey: "blank_1", answerText: "서울" },
    { blankKey: "blank_2", answerText: "도쿄" },
  ];
  const content = "{{blank_1}}{{blank_2}}";
  assert.equal(
    validateBlanks({ content, blanks, blankRevealCount: 0 }),
    "출제할 빈칸 개수가 유효하지 않습니다.",
  );
  assert.equal(
    validateBlanks({ content, blanks, blankRevealCount: 3 }),
    "출제할 빈칸 개수가 유효하지 않습니다.",
  );
  assert.equal(
    validateBlanks({ content, blanks, blankRevealCount: null }),
    "출제할 빈칸 개수가 유효하지 않습니다.",
  );
  assert.equal(
    validateBlanks({ content, blanks, blankRevealCount: "abc" }),
    "출제할 빈칸 개수가 유효하지 않습니다.",
  );
});

test("validateBlanks accepts blankRevealCount as a numeric string from an <input type=number>", () => {
  assert.equal(validateBlanks({ ...validForm, blankRevealCount: "1" }), null);
});

test("validateBlanks: rejects a marker in content that has no blank entry", () => {
  const message = validateBlanks({
    content: "수도는 {{b7}}이고 항구는 {{b1}}이다",
    blanks: [{ blankKey: "b1", answerText: "부산" }],
    blankRevealCount: 1,
  });
  assert.strictEqual(message, "정답이 등록되지 않은 빈칸 마커가 본문에 있습니다: b7");
});

test("validateBlanks: still accepts content whose markers are all declared", () => {
  const message = validateBlanks({
    content: "수도는 {{b1}}이고 항구는 {{b2}}이다",
    blanks: [
      { blankKey: "b1", answerText: "서울" },
      { blankKey: "b2", answerText: "부산" },
    ],
    blankRevealCount: 2,
  });
  assert.strictEqual(message, null);
});

// 2026-09-02: 질문/지문을 나누면서 마커가 참조지문으로 옮겨 갔다.
test("validateBlanks: 마커가 참조지문에 있어도 통과한다", () => {
  const message = validateBlanks({
    content: "다음 괄호 안에 들어갈 용어는?",
    referenceText: "가스사용자가 {{b1}}일 이내에 납부한다",
    blanks: [{ blankKey: "b1", answerText: "30" }],
    blankRevealCount: 1,
  });
  assert.strictEqual(message, null);
});

test("validateBlanks: 마커가 양쪽에 걸쳐 있으면 문구를 돌려준다", () => {
  const message = validateBlanks({
    content: "본문 {{b1}} 질문은?",
    referenceText: "지문 {{b2}} 입니다",
    blanks: [
      { blankKey: "b1", answerText: "가" },
      { blankKey: "b2", answerText: "나" },
    ],
    blankRevealCount: 2,
  });
  assert.strictEqual(message, "빈칸 마커는 문제 본문과 참조지문 중 한쪽에만 있어야 합니다.");
});
