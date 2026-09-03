import { describe, it, expect } from "vitest";
import { splitAnswerBlanks } from "./answerBlank.js";

describe("splitAnswerBlanks", () => {
  it("빈 괄호를 빈칸 조각으로 바꾸고 앞뒤 글자를 남긴다", () => {
    expect(splitAnswerBlanks("사항은 ( )가 결정한다")).toEqual([
      { type: "text", value: "사항은 " },
      { type: "blank" },
      { type: "text", value: "가 결정한다" },
    ]);
  });

  it("빈 괄호가 여럿이면 각각 나눈다", () => {
    // 문제 46 의 실제 문장 구조다.
    expect(splitAnswerBlanks("각 직위별 ( ) 및 ( )를 명확히")).toEqual([
      { type: "text", value: "각 직위별 " },
      { type: "blank" },
      { type: "text", value: " 및 " },
      { type: "blank" },
      { type: "text", value: "를 명확히" },
    ]);
  });

  /**
   * 이것이 이 함수의 핵심이다. 빈 괄호 261개와 내용이 든 괄호가 같은 문장에 섞여 있다
   * (2026-09-04 실측: 주관식에만 내용 든 괄호가 55개). 내용이 든 것을 잡으면 원문이 사라진다.
   */
  it("내용이 든 괄호는 건드리지 않는다", () => {
    // 문제 72 의 실제 문장이다.
    const text = "(서울시 공급규정) 위약금 관련, 최근 ( ) 이내 평균 사용량";
    expect(splitAnswerBlanks(text)).toEqual([
      { type: "text", value: "(서울시 공급규정) 위약금 관련, 최근 " },
      { type: "blank" },
      { type: "text", value: " 이내 평균 사용량" },
    ]);
  });

  it("조사 괄호처럼 짧은 것도 내용이 있으면 그대로 둔다", () => {
    expect(splitAnswerBlanks("금액(를) 적는다")).toEqual([
      { type: "text", value: "금액(를) 적는다" },
    ]);
  });

  it("공백이 없거나 여럿이어도 빈칸으로 본다", () => {
    expect(splitAnswerBlanks("가()나")).toEqual([
      { type: "text", value: "가" }, { type: "blank" }, { type: "text", value: "나" },
    ]);
    expect(splitAnswerBlanks("가(   )나")).toEqual([
      { type: "text", value: "가" }, { type: "blank" }, { type: "text", value: "나" },
    ]);
  });

  it("빈 괄호가 문장 처음이나 끝에 있어도 된다", () => {
    expect(splitAnswerBlanks("( )의 단가")).toEqual([
      { type: "blank" }, { type: "text", value: "의 단가" },
    ]);
    expect(splitAnswerBlanks("답은 ( )")).toEqual([
      { type: "text", value: "답은 " }, { type: "blank" },
    ]);
  });

  it("빈 괄호가 없으면 글자 한 조각이다", () => {
    expect(splitAnswerBlanks("괄호가 없는 문장")).toEqual([
      { type: "text", value: "괄호가 없는 문장" },
    ]);
  });

  it("빈 글이면 빈 배열이다", () => {
    expect(splitAnswerBlanks("")).toEqual([]);
    expect(splitAnswerBlanks(null)).toEqual([]);
    expect(splitAnswerBlanks(undefined)).toEqual([]);
  });

  it("여러 번 불러도 같은 결과다 — 정규식 lastIndex 가 남지 않는다", () => {
    const text = "가 ( ) 나";
    const first = splitAnswerBlanks(text);
    const second = splitAnswerBlanks(text);
    expect(second).toEqual(first);
  });
});
