import { describe, it, expect } from "vitest";
import { blankOrderFrom, resolveEnter } from "./blankFocus.js";
import { parseBlankContent } from "./blankContent.js";

describe("blankOrderFrom", () => {
  it("입력칸만 골라 그려진 순서대로 낸다", () => {
    const segments = [
      { type: "text", value: "가 " },
      { type: "input", blankKey: "blank_1" },
      { type: "text", value: " 나 " },
      { type: "reveal", blankKey: "blank_9", value: "공개" },
      { type: "input", blankKey: "blank_2" },
    ];
    expect(blankOrderFrom(segments)).toEqual(["blank_1", "blank_2"]);
  });

  it("빈 입력이면 빈 배열이다", () => {
    expect(blankOrderFrom([])).toEqual([]);
    expect(blankOrderFrom(undefined)).toEqual([]);
  });

  /**
   * 2026-09-04 에 실제로 난 버그의 회귀 테스트다.
   *
   * 서버는 출제할 빈칸을 섞어 내려주므로 blanksToAnswer 의 차례가 화면 차례와 다르다.
   * 그걸 그대로 "다음 칸" 계산에 쓰면 첫 칸에서 누른 엔터가 곧바로 제출이 됐다.
   */
  it("blanksToAnswer 가 섞여 있어도 본문에 나온 차례를 낸다", () => {
    const text = "가 {{blank_1}} 나 {{blank_2}} 다";
    const shuffled = ["blank_2", "blank_1"];
    const order = blankOrderFrom(parseBlankContent(text, shuffled, {}));

    expect(order).toEqual(["blank_1", "blank_2"]);
    // 화면 차례로 물으면 첫 칸은 "다음으로", 마지막 칸에서만 제출이다.
    expect(resolveEnter(order, "blank_1")).toEqual({ action: "focus", key: "blank_2" });
    expect(resolveEnter(order, "blank_2")).toEqual({ action: "submit" });
    // 섞인 목록을 그대로 쓰면 첫 칸이 곧바로 제출이 된다 — 이것이 그 버그였다.
    expect(resolveEnter(shuffled, "blank_1")).toEqual({ action: "submit" });
  });
});

describe("resolveEnter", () => {
  it("마지막이 아니면 다음 칸으로 옮긴다", () => {
    expect(resolveEnter(["blank_1", "blank_2", "blank_3"], "blank_1"))
      .toEqual({ action: "focus", key: "blank_2" });
    expect(resolveEnter(["blank_1", "blank_2", "blank_3"], "blank_2"))
      .toEqual({ action: "focus", key: "blank_3" });
  });

  it("마지막 칸에서만 제출한다", () => {
    expect(resolveEnter(["blank_1", "blank_2", "blank_3"], "blank_3"))
      .toEqual({ action: "submit" });
  });

  it("칸이 하나뿐이면 그 칸이 곧 마지막이다", () => {
    expect(resolveEnter(["blank_1"], "blank_1")).toEqual({ action: "submit" });
  });

  it("목록에 없는 칸이면 아무것도 하지 않는다", () => {
    expect(resolveEnter(["blank_1", "blank_2"], "blank_9")).toEqual({ action: "none" });
  });

  it("목록이 비었거나 없으면 아무것도 하지 않는다", () => {
    expect(resolveEnter([], "blank_1")).toEqual({ action: "none" });
    expect(resolveEnter(undefined, "blank_1")).toEqual({ action: "none" });
  });

  it("화면에 그려진 순서를 그대로 쓴다 — 이름순으로 다시 세우지 않는다", () => {
    // 서버가 blanksToAnswer 를 섞어 내려줄 수 있다(빈칸은 무작위로 출제된다).
    expect(resolveEnter(["blank_3", "blank_1"], "blank_3"))
      .toEqual({ action: "focus", key: "blank_1" });
    expect(resolveEnter(["blank_3", "blank_1"], "blank_1")).toEqual({ action: "submit" });
  });
});
