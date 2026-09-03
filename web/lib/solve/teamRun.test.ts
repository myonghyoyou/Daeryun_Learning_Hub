import { describe, it, expect } from "vitest";
import { canAdvance, isRunFinished, nextCursor, summarizeResults } from "./teamRun";

describe("isRunFinished", () => {
  it("위치가 총 개수에 닿으면 끝이다", () => {
    expect(isRunFinished(3, 3)).toBe(true);
    expect(isRunFinished(2, 3)).toBe(false);
  });

  it("총 개수가 0이면 시작하자마자 끝이다", () => {
    expect(isRunFinished(0, 0)).toBe(true);
  });
});

describe("nextCursor", () => {
  it("한 칸 전진한다", () => {
    expect(nextCursor(0, 3)).toBe(1);
  });

  it("총 개수를 넘지 않는다", () => {
    expect(nextCursor(3, 3)).toBe(3);
  });
});

describe("canAdvance", () => {
  it("보낸 위치가 지금 위치와 같을 때만 전진한다", () => {
    expect(canAdvance(2, 2)).toBe(true);
  });

  it("새로고침 뒤 옛 위치를 보내면 전진하지 않는다 — 두 칸 건너뛰기 방지", () => {
    expect(canAdvance(1, 2)).toBe(false);
    expect(canAdvance(3, 2)).toBe(false);
  });
});

describe("summarizeResults", () => {
  it("맞은 개수와 답한 개수를 센다", () => {
    const s = summarizeResults([
      { problemId: 1, correct: true },
      { problemId: 2, correct: false },
      { problemId: 3, correct: true },
    ]);
    expect(s.answeredCount).toBe(3);
    expect(s.correctCount).toBe(2);
    expect(s.wrongProblemIds).toEqual([2]);
  });

  it("건너뛴 문제(correct 가 null)는 어느 쪽으로도 세지 않는다", () => {
    const s = summarizeResults([
      { problemId: 1, correct: true },
      { problemId: 2, correct: null },
      { problemId: 3, correct: false },
    ]);
    expect(s.answeredCount).toBe(2);
    expect(s.correctCount).toBe(1);
    expect(s.wrongProblemIds).toEqual([3]);
  });

  it("빈 목록은 0 이다", () => {
    expect(summarizeResults([])).toEqual({ answeredCount: 0, correctCount: 0, wrongProblemIds: [] });
  });
});
