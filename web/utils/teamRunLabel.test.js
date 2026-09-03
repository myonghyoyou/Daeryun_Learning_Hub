import { describe, it, expect } from "vitest";
import { teamStateLabel } from "./teamRunLabel.js";

describe("teamStateLabel", () => {
  it("진행 중이면 푼 개수를 적는다", () => {
    const team = { activeRun: { cursor: 12, total: 30 }, hasFinishedRun: false, wrongCount: 0 };
    expect(teamStateLabel(team)).toEqual({ text: "12문제 풀었음", kind: "progress" });
  });

  it("위치가 아니라 푼 개수다 — 진행 화면의 \"n / 총계\"와 섞이지 않아야 한다", () => {
    // 1문제를 푼 상태: 진행 화면은 "2 / 30"(지금 2번째 문제), 목록은 "1문제 풀었음".
    const team = { activeRun: { cursor: 1, total: 30 }, hasFinishedRun: false, wrongCount: 0 };
    expect(teamStateLabel(team).text).toBe("1문제 풀었음");
    expect(teamStateLabel(team).text).not.toContain("/");
  });

  it("끝난 바퀴가 있으면 지금 틀린 문제 수를 적는다", () => {
    const team = { activeRun: null, hasFinishedRun: true, wrongCount: 8 };
    expect(teamStateLabel(team)).toEqual({ text: "틀린 문제 8개", kind: "wrong" });
  });

  it("끝냈고 틀린 것이 없으면 0개로 적는다", () => {
    const team = { activeRun: null, hasFinishedRun: true, wrongCount: 0 };
    expect(teamStateLabel(team)).toEqual({ text: "틀린 문제 0개", kind: "wrong" });
  });

  it("바퀴가 없으면 아직 안 풂이다", () => {
    const team = { activeRun: null, hasFinishedRun: false, wrongCount: 0 };
    expect(teamStateLabel(team)).toEqual({ text: "아직 안 풂", kind: "none" });
  });

  it("진행 중이 끝난 바퀴보다 앞선다", () => {
    const team = { activeRun: { cursor: 3, total: 10 }, hasFinishedRun: true, wrongCount: 5 };
    expect(teamStateLabel(team).kind).toBe("progress");
  });
});
