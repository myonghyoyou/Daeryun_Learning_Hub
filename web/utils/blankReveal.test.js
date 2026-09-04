import { describe, it, expect } from "vitest";
import { revealMapFrom } from "./blankReveal.js";

describe("revealMapFrom", () => {
  it("blankKey 로 찾을 수 있게 묶는다", () => {
    const map = revealMapFrom([
      { blankKey: "b2", submittedAnswer: "가", correct: false, correctAnswer: "상법" },
      { blankKey: "b1", submittedAnswer: "나", correct: true, correctAnswer: "정관" },
    ]);
    expect(map.b1.correctAnswer).toBe("정관");
    expect(map.b2.correctAnswer).toBe("상법");
  });

  /**
   * 2026-09-04 에 확인한 결함의 회귀 테스트다.
   *
   * 서버는 출제할 빈칸을 섞어 내려주고(selectRandomBlankKeys 는 shuffle 후 앞에서 자른다),
   * 화면은 그 섞인 차례로 제출한다. 그래서 blankResults 의 차례는 문장 차례가 아니다.
   * 순서로 짝지으면 첫째 빈칸에 둘째 정답이 붙는다 — 위치로 찾지 말고 키로 찾아야 한다.
   */
  it("문장 차례와 결과 차례가 달라도 제 짝을 찾는다", () => {
    // 문장은 b1 이 먼저지만 서버는 b2 를 먼저 돌려줬다.
    const results = [
      { blankKey: "b2", submittedAnswer: "아무거나", correct: false, correctAnswer: "상법" },
      { blankKey: "b1", submittedAnswer: "아무거나", correct: false, correctAnswer: "정관" },
    ];
    const map = revealMapFrom(results);

    // 문장 차례(b1, b2)로 꺼내면 정관·상법이 나와야 한다.
    expect(["b1", "b2"].map((k) => map[k].correctAnswer)).toEqual(["정관", "상법"]);
    // 차례로 짝지었다면 상법·정관이 되어 뒤바뀐다 — 그것이 이 결함이었다.
    expect(results.map((r) => r.correctAnswer)).toEqual(["상법", "정관"]);
  });

  it("없으면 빈 객체다", () => {
    expect(revealMapFrom(null)).toEqual({});
    expect(revealMapFrom([])).toEqual({});
  });
});
