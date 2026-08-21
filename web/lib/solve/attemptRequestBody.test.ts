import { describe, it, expect } from "vitest";
import { MessageNotReadableError } from "../http/errors";
import { toAttemptSubmitBody } from "./attemptRequestBody";

function expectUnreadable(body: Record<string, unknown>) {
  expect(() => toAttemptSubmitBody(body)).toThrowError(MessageNotReadableError);
}

describe("toAttemptSubmitBody — 읽을 수 있는 본문", () => {
  it("maps a well-formed MCQ body", () => {
    expect(toAttemptSubmitBody({ selectedChoiceIds: [1, 2] })).toEqual({
      selectedChoiceIds: [1, 2], submittedText: null, blankAnswers: null,
    });
  });

  it("maps a well-formed SHORT_ANSWER body", () => {
    expect(toAttemptSubmitBody({ submittedText: "정답" })).toEqual({
      selectedChoiceIds: null, submittedText: "정답", blankAnswers: null,
    });
  });

  it("maps a well-formed FILL_BLANK body", () => {
    expect(toAttemptSubmitBody({ blankAnswers: [{ blankKey: "a", submittedAnswer: "가" }] })).toEqual({
      selectedChoiceIds: null, submittedText: null,
      blankAnswers: [{ blankKey: "a", submittedAnswer: "가" }],
    });
  });

  it("missing fields are null (Java 참조형 기본값)", () => {
    expect(toAttemptSubmitBody({})).toEqual({
      selectedChoiceIds: null, submittedText: null, blankAnswers: null,
    });
  });

  it("ignores unknown properties (FAIL_ON_UNKNOWN_PROPERTIES is off)", () => {
    expect(toAttemptSubmitBody({ submittedText: "정답", 낯선필드: 1 }).submittedText).toBe("정답");
  });

  it("coerces scalar submittedText the way Jackson does", () => {
    expect(toAttemptSubmitBody({ submittedText: 1000 }).submittedText).toBe("1000");
    expect(toAttemptSubmitBody({ submittedText: true }).submittedText).toBe("true");
  });

  it("keeps an empty selectedChoiceIds array (T5 depends on this)", () => {
    expect(toAttemptSubmitBody({ selectedChoiceIds: [] }).selectedChoiceIds).toEqual([]);
  });

  it("coerces a numeric string element in selectedChoiceIds", () => {
    expect(toAttemptSubmitBody({ selectedChoiceIds: ["1", "2"] }).selectedChoiceIds).toEqual([1, 2]);
  });

  it("truncates a float element the way Jackson's ACCEPT_FLOAT_AS_INT does", () => {
    expect(toAttemptSubmitBody({ selectedChoiceIds: [1.9] }).selectedChoiceIds).toEqual([1]);
  });

  it("keeps a null element in selectedChoiceIds (boxed Long list allows null)", () => {
    expect(toAttemptSubmitBody({ selectedChoiceIds: [1, null] }).selectedChoiceIds).toEqual([1, null]);
  });

  it("keeps multiple blankAnswers entries in submitted order", () => {
    const body = toAttemptSubmitBody({
      blankAnswers: [
        { blankKey: "a", submittedAnswer: "1" },
        { blankKey: "b", submittedAnswer: null },
      ],
    });
    expect(body.blankAnswers).toEqual([
      { blankKey: "a", submittedAnswer: "1" },
      { blankKey: "b", submittedAnswer: null },
    ]);
  });

  it("coerces a scalar blankKey/submittedAnswer", () => {
    const body = toAttemptSubmitBody({ blankAnswers: [{ blankKey: 1, submittedAnswer: 2 }] });
    expect(body.blankAnswers).toEqual([{ blankKey: "1", submittedAnswer: "2" }]);
  });
});

describe("toAttemptSubmitBody — 읽을 수 없는 본문(E6, MessageNotReadableError)", () => {
  it("rejects an object in place of the selectedChoiceIds array", () => {
    expectUnreadable({ selectedChoiceIds: { 0: 1 } });
  });

  it("rejects a single value in place of the selectedChoiceIds array (ACCEPT_SINGLE_VALUE_AS_ARRAY off)", () => {
    expectUnreadable({ selectedChoiceIds: 1 });
  });

  it("rejects a non-numeric selectedChoiceIds element", () => {
    expectUnreadable({ selectedChoiceIds: ["abc"] });
  });

  it("rejects an array/object in place of submittedText", () => {
    expectUnreadable({ submittedText: ["가"] });
    expectUnreadable({ submittedText: { a: 1 } });
  });

  it("rejects a single object in place of the blankAnswers array", () => {
    expectUnreadable({ blankAnswers: { blankKey: "a", submittedAnswer: "1" } });
  });

  it("reports the nested field path in the message (log-only, per problemRequestBody.ts convention)", () => {
    try {
      toAttemptSubmitBody({ blankAnswers: [{ blankKey: "a" }, { blankKey: ["x"] }] });
      throw new Error("should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(MessageNotReadableError);
      expect((error as Error).message).toBe("blankAnswers[1].blankKey");
    }
  });
});
