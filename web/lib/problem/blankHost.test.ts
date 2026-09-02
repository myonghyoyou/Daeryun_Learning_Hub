import { describe, it, expect } from "vitest";
import { blankHostField, blankHostText } from "./blankHost";

describe("blankHostField", () => {
  it("지문이 있으면 지문이 마커의 집이다", () => {
    expect(blankHostField("지문 {{blank_1}} 입니다")).toBe("referenceText");
  });

  it("지문이 없으면 본문이 집이다", () => {
    expect(blankHostField(null)).toBe("content");
    expect(blankHostField("")).toBe("content");
  });
});

describe("blankHostText", () => {
  it("지문이 있으면 지문 글을 돌려준다", () => {
    expect(blankHostText("질문은?", "지문 {{b1}}")).toBe("지문 {{b1}}");
  });

  it("지문이 없으면 본문 글을 돌려준다", () => {
    expect(blankHostText("본문 {{b1}}", null)).toBe("본문 {{b1}}");
  });

  it("둘 다 없으면 빈 문자열이다 — null 을 흘려보내지 않는다", () => {
    expect(blankHostText(null, null)).toBe("");
  });
});
