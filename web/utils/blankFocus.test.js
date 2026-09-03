import { describe, it, expect } from "vitest";
import { resolveEnter } from "./blankFocus.js";

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
