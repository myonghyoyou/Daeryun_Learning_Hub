import { describe, it, expect } from "vitest";
import { validateFeedbackInput, FEEDBACK_MAX_INPUT } from "./validate";

describe("validateFeedbackInput", () => {
  it("앞뒤 공백을 뗀다", () => {
    expect(validateFeedbackInput({ body: "  의견  " }).body).toBe("의견");
  });

  it("빈 글은 거절한다", () => {
    expect(() => validateFeedbackInput({ body: "   " })).toThrow("내용을 적어주세요.");
    expect(() => validateFeedbackInput({ body: "" })).toThrow("내용을 적어주세요.");
  });

  it("문자열이 아니면 거절한다", () => {
    expect(() => validateFeedbackInput({ body: 123 })).toThrow("내용을 적어주세요.");
  });

  it("상한을 넘으면 거절한다", () => {
    const long = "가".repeat(FEEDBACK_MAX_INPUT + 1);
    expect(() => validateFeedbackInput({ body: long })).toThrow(`${FEEDBACK_MAX_INPUT}자까지`);
  });

  it("상한과 같으면 통과한다 — 경계", () => {
    const exact = "가".repeat(FEEDBACK_MAX_INPUT);
    expect(validateFeedbackInput({ body: exact }).body).toHaveLength(FEEDBACK_MAX_INPUT);
  });

  /** 외부 URL 이 섞여 들어오면 보드에 남의 주소가 실린다. 우리 화면 경로만 받는다. */
  it("경로가 / 로 시작하지 않으면 버린다", () => {
    expect(validateFeedbackInput({ body: "x", sourcePath: "https://evil.example" }).sourcePath).toBeNull();
    expect(validateFeedbackInput({ body: "x", sourcePath: "solve" }).sourcePath).toBeNull();
    expect(validateFeedbackInput({ body: "x", sourcePath: 5 }).sourcePath).toBeNull();
  });

  it("경로는 200자에서 자른다", () => {
    const long = "/" + "a".repeat(300);
    expect(validateFeedbackInput({ body: "x", sourcePath: long }).sourcePath).toHaveLength(200);
  });
});
