import { describe, it, expect } from "vitest";
import type { HallOfFameRow, TeamRow } from "../db/hallOfFame";
import {
  buildTopRows, buildTopTeamRows, findMyRank, findMyTeamRank, MAX_OTHERS,
} from "./hallOfFameRanking";

// 입력은 DB 가 이미 정렬해 준 순서다(개수 내림차순 → 마지막 정답 이른 순 → id 순).
function row(userId: number, name: string, correctCount: number): HallOfFameRow {
  return { userId, name, departmentName: "기획팀", correctCount, lastCorrectAt: "2026-09-01 00:00:00" };
}

describe("buildTopRows", () => {
  it("동점은 한 줄로 접고 대표는 맨 앞 사람이다", () => {
    const out = buildTopRows([row(1, "가", 5), row(2, "나", 5), row(3, "다", 3)]);
    expect(out).toHaveLength(2);
    expect(out[0].rank).toBe(1);
    expect(out[0].leader.name).toBe("가");
    expect(out[0].others.map((p) => p.name)).toEqual(["나"]);
    expect(out[0].otherCount).toBe(1);
  });

  it("동점 다음 줄은 바로 다음 숫자다 — 6위로 건너뛰지 않는다", () => {
    const out = buildTopRows([
      row(1, "가", 5), row(2, "나", 5), row(3, "다", 5),
      row(4, "라", 3),
    ]);
    expect(out.map((r) => r.rank)).toEqual([1, 2]);
    expect(out[1].leader.name).toBe("라");
  });

  it("줄은 최대 세 개다", () => {
    const out = buildTopRows([row(1, "가", 5), row(2, "나", 4), row(3, "다", 3), row(4, "라", 2)]);
    expect(out.map((r) => r.rank)).toEqual([1, 2, 3]);
  });

  it("동점 무리를 쪼개지 않는다 — 세 번째 줄에 다섯 명이면 다섯 명 다 담는다", () => {
    const out = buildTopRows([
      row(1, "가", 9), row(2, "나", 8),
      row(3, "다", 7), row(4, "라", 7), row(5, "마", 7), row(6, "바", 7), row(7, "사", 7),
    ]);
    expect(out[2].otherCount).toBe(4);
    expect(out[2].others.map((p) => p.name)).toEqual(["라", "마", "바", "사"]);
  });

  it("동점자가 많으면 목록은 10명까지만 담되 인원수는 실제 수를 적는다", () => {
    const rows = Array.from({ length: 30 }, (_, i) => row(i + 1, `사람${i + 1}`, 5));
    const out = buildTopRows(rows);
    expect(out[0].leader.name).toBe("사람1");
    expect(out[0].others).toHaveLength(MAX_OTHERS);
    expect(out[0].otherCount).toBe(29);
  });

  it("혼자면 others 는 비고 인원수는 0이다", () => {
    const out = buildTopRows([row(1, "가", 5)]);
    expect(out[0].others).toEqual([]);
    expect(out[0].otherCount).toBe(0);
  });

  it("아무도 없으면 빈 배열이다", () => {
    expect(buildTopRows([])).toEqual([]);
  });
});

describe("buildTopTeamRows · findMyTeamRank", () => {
  function team(departmentId: number, departmentName: string, correctCount: number): TeamRow {
    return { departmentId, departmentName, correctCount, lastCorrectAt: "2026-09-01 00:00:00" };
  }

  it("사람과 같은 규칙으로 접힌다 — 동점은 한 줄, 대표는 맨 앞", () => {
    const out = buildTopTeamRows([team(1, "기획팀", 40), team(2, "영업팀", 40), team(3, "회계팀", 12)]);
    expect(out).toHaveLength(2);
    expect(out[0].rank).toBe(1);
    // departmentId 까지 본다. 이름만 보면 사람 변환을 써도 통과해 버린다 —
    // toPerson 도 departmentName 을 그대로 복사하기 때문이다.
    expect(out[0].leader).toEqual({ departmentId: 1, departmentName: "기획팀" });
    expect(out[0].others).toEqual([{ departmentId: 2, departmentName: "영업팀" }]);
    expect(out[0].otherCount).toBe(1);
    expect(out[1].rank).toBe(2);
  });

  it("우리 팀 순위가 목록의 순위와 같은 값이다", () => {
    const rows = [team(1, "기획팀", 40), team(2, "영업팀", 40), team(3, "회계팀", 12)];
    expect(findMyTeamRank(rows, 2)).toEqual({ rank: 1, correctCount: 40 });
    expect(buildTopTeamRows(rows)[0].rank).toBe(1);
  });

  it("점수가 없는 팀은 목록에 없어 null 이다", () => {
    expect(findMyTeamRank([team(1, "기획팀", 40)], 99)).toBeNull();
  });
});

describe("findMyRank", () => {
  it("목록과 같은 순위 값을 준다", () => {
    const rows = [row(1, "가", 5), row(2, "나", 5), row(3, "다", 3)];
    expect(findMyRank(rows, 2)).toEqual({ rank: 1, correctCount: 5 });
    expect(buildTopRows(rows)[0].rank).toBe(1);
  });

  it("상위 세 줄 밖에 있어도 순위를 준다", () => {
    const rows = [row(1, "가", 9), row(2, "나", 8), row(3, "다", 7), row(4, "라", 6), row(5, "마", 5)];
    expect(findMyRank(rows, 5)).toEqual({ rank: 5, correctCount: 5 });
  });

  it("맞힌 것이 없어 목록에 없으면 null 이다", () => {
    expect(findMyRank([row(1, "가", 5)], 99)).toBeNull();
  });

  it("아무도 없으면 null 이다", () => {
    expect(findMyRank([], 1)).toBeNull();
  });
});
