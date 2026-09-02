import { describe, it, expect } from "vitest";
import { splitQuestionAndReference } from "./splitReference";

describe("splitQuestionAndReference", () => {
  it("물음표 뒤에 지문이 있으면 나눈다", () => {
    const r = splitQuestionAndReference("다음 괄호 안에 적합한 용어는? ( )의 단가는 총괄원가를 나누어 산정한다.");
    expect(r.question).toBe("다음 괄호 안에 적합한 용어는?");
    expect(r.reference).toBe("( )의 단가는 총괄원가를 나누어 산정한다.");
  });

  it("물음표 뒤가 비어 있으면 나누지 않는다", () => {
    const r = splitQuestionAndReference("도로법 제10조 도로의 종류가 아닌 것은?");
    expect(r.question).toBe("도로법 제10조 도로의 종류가 아닌 것은?");
    expect(r.reference).toBeNull();
  });

  it("물음표 뒤가 짧으면 나누지 않는다 — 꼬리 기호까지 지문으로 삼지 않는다", () => {
    const r = splitQuestionAndReference("빈칸에 들어갈 말은? ( )");
    expect(r.reference).toBeNull();
  });

  it("물음표가 없으면 나누지 않는다", () => {
    const r = splitQuestionAndReference("다음 중 옳은 것을 고르시오.");
    expect(r.question).toBe("다음 중 옳은 것을 고르시오.");
    expect(r.reference).toBeNull();
  });

  it("빈칸 마커는 지문 쪽으로 간다", () => {
    const r = splitQuestionAndReference("다음 괄호 안에 들어갈 용어는? 가스사용자가 {{blank_1}}일 이내에 {{blank_2}}일간의 기한을 정한다.");
    expect(r.question).toBe("다음 괄호 안에 들어갈 용어는?");
    expect(r.reference).toContain("{{blank_1}}");
    expect(r.reference).toContain("{{blank_2}}");
  });

  it("나눈 두 조각을 붙이면 공백만 빼고 원문과 같다 — 글자를 잃지 않는다", () => {
    const original = "다음 기사를 읽고 빈칸에 들어갈 단어는? 김 지사는 도청에서 협약서에 서명했다.";
    const r = splitQuestionAndReference(original);
    const joined = `${r.question} ${r.reference}`;
    expect(joined.replace(/\s/g, "")).toBe(original.replace(/\s/g, ""));
  });

  it("물음표가 여러 개면 첫 번째에서 나눈다", () => {
    const r = splitQuestionAndReference("맞는 것은? 다음 설명이 옳은가? 판단하시오.");
    expect(r.question).toBe("맞는 것은?");
    expect(r.reference).toBe("다음 설명이 옳은가? 판단하시오.");
  });
});
