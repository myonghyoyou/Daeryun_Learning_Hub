import type { HallOfFameRow, TeamRow } from "../db/hallOfFame";

/** 펼침 목록에 담는 최대 인원(팀도 같다). 나머지는 "외 N명 더"로 접는다. */
export const MAX_OTHERS = 10;

/** 화면에 보여 줄 줄 수. 사람 수가 아니라 순위 수다. */
export const TOP_ROWS = 3;

export type Person = { userId: number; name: string; departmentName: string };
export type Team = { departmentId: number; departmentName: string };

export type RankRow<T> = {
  rank: number;
  correctCount: number;
  leader: T;
  /** 대표 외 동점자. 최대 MAX_OTHERS 개. */
  others: T[];
  /** 대표 외 전체 개수. MAX_OTHERS 를 넘어도 실제 수를 담는다. */
  otherCount: number;
};

export type MyRank = { rank: number; correctCount: number };

type Scored = { correctCount: number };
type Group<T> = { rank: number; correctCount: number; members: T[] };

function toPerson(r: HallOfFameRow): Person {
  return { userId: r.userId, name: r.name, departmentName: r.departmentName };
}

function toTeam(r: TeamRow): Team {
  return { departmentId: r.departmentId, departmentName: r.departmentName };
}

/**
 * 정렬된 행을 맞힌 개수가 같은 무리로 묶고 순위를 붙인다.
 *
 * 순위는 무리의 차례다 — 1위가 5명이어도 다음 무리는 2위다(DENSE_RANK 와 같은 뜻).
 * 목록과 내 순위가 **이 함수 하나에서** 나오므로 두 숫자가 어긋날 수 없다. 각자 계산하면
 * 한쪽이 공동 순위, 다른 쪽이 총 순서가 되어 같은 사람이 3위와 1위로 동시에 보인다.
 *
 * 입력이 개수 내림차순으로 정렬돼 있다는 전제다(lib/db/hallOfFame.ts 의 ORDER BY).
 */
function toGroups<T extends Scored>(rows: T[]): Group<T>[] {
  const groups: Group<T>[] = [];
  for (const r of rows) {
    const last = groups[groups.length - 1];
    if (last && last.correctCount === r.correctCount) {
      last.members.push(r);
    } else {
      groups.push({ rank: groups.length + 1, correctCount: r.correctCount, members: [r] });
    }
  }
  return groups;
}

/**
 * 무리를 줄로 접는 공통 부분. 사람이든 팀이든 접는 규칙이 같아야 하므로 한 곳에 둔다.
 * 다른 것은 무엇을 화면에 실어 보내느냐(toEntity)뿐이다.
 */
function buildRows<T extends Scored, E>(rows: T[], toEntity: (r: T) => E): RankRow<E>[] {
  return toGroups(rows).slice(0, TOP_ROWS).map((g) => {
    const [leader, ...rest] = g.members;
    return {
      rank: g.rank,
      correctCount: g.correctCount,
      leader: toEntity(leader),
      others: rest.slice(0, MAX_OTHERS).map(toEntity),
      otherCount: rest.length,
    };
  });
}

function findRankBy<T extends Scored>(rows: T[], match: (r: T) => boolean): MyRank | null {
  for (const g of toGroups(rows)) {
    if (g.members.some(match)) return { rank: g.rank, correctCount: g.correctCount };
  }
  return null;
}

export function buildTopRows(rows: HallOfFameRow[]): RankRow<Person>[] {
  return buildRows(rows, toPerson);
}

export function buildTopTeamRows(rows: TeamRow[]): RankRow<Team>[] {
  return buildRows(rows, toTeam);
}

export function findMyRank(rows: HallOfFameRow[], userId: number): MyRank | null {
  return findRankBy(rows, (r) => r.userId === userId);
}

export function findMyTeamRank(rows: TeamRow[], departmentId: number): MyRank | null {
  return findRankBy(rows, (r) => r.departmentId === departmentId);
}
