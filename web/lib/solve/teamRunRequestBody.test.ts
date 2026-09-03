import { describe, it, expect } from "vitest";
import { toAdvanceBody, toStartRunBody } from "./teamRunRequestBody";

describe("toStartRunBody", () => {
  it("ALL 과 WRONG 만 받는다", () => {
    expect(toStartRunBody({ mode: "ALL" })).toEqual({ mode: "ALL" });
    expect(toStartRunBody({ mode: "WRONG" })).toEqual({ mode: "WRONG" });
  });

  it("모르는 모드는 거절한다", () => {
    expect(() => toStartRunBody({ mode: "SOMETHING" })).toThrow();
    expect(() => toStartRunBody({})).toThrow();
  });
});

describe("toAdvanceBody", () => {
  it("위치와 정답 여부를 읽는다", () => {
    expect(toAdvanceBody({ fromCursor: 2, correct: true })).toEqual({ fromCursor: 2, correct: true });
    expect(toAdvanceBody({ fromCursor: 0, correct: false })).toEqual({ fromCursor: 0, correct: false });
  });

  it("건너뛴 문제는 correct 가 null 이다", () => {
    expect(toAdvanceBody({ fromCursor: 1, correct: null })).toEqual({ fromCursor: 1, correct: null });
  });

  it("correct 를 안 보내면 건너뛴 것으로 본다", () => {
    expect(toAdvanceBody({ fromCursor: 1 })).toEqual({ fromCursor: 1, correct: null });
  });

  it("위치가 정수가 아니면 거절한다", () => {
    expect(() => toAdvanceBody({ fromCursor: "둘", correct: true })).toThrow();
    expect(() => toAdvanceBody({ fromCursor: 1.5, correct: true })).toThrow();
    expect(() => toAdvanceBody({ correct: true })).toThrow();
  });

  it("음수 위치는 거절한다", () => {
    expect(() => toAdvanceBody({ fromCursor: -1, correct: true })).toThrow();
  });

  it("정답 여부가 참거짓이 아니면 거절한다", () => {
    expect(() => toAdvanceBody({ fromCursor: 0, correct: "yes" })).toThrow();
  });
});
