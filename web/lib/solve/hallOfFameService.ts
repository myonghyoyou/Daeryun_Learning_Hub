import type { DbConn } from "../db/client";
import { findCorrectCountsByTeam, findCorrectCountsByUser, type Period } from "../db/hallOfFame";
import {
  buildTopRows, buildTopTeamRows, findMyRank, findMyTeamRank,
  type MyRank, type Person, type RankRow, type Team,
} from "./hallOfFameRanking";
import type { AuthUser } from "../auth/types";

export type PeriodBoard = {
  people: { top: RankRow<Person>[]; me: MyRank | null };
  teams: { top: RankRow<Team>[]; mine: MyRank | null };
};
export type HallOfFame = { month: PeriodBoard; allTime: PeriodBoard };

/**
 * 한 기간의 개인·팀 순위표.
 *
 * 목록과 내 순위는 **같은 행 묶음**에서 뽑는다. 각각 따로 질의하면 그 사이에 누가 문제를
 * 맞혔을 때 두 숫자가 어긋난다.
 *
 * 내 순위와 우리 팀 순위는 따로 계산한다 — 내가 하나도 못 맞혀도 팀원이 맞혔으면 팀은
 * 점수가 있다.
 */
async function buildPeriod(db: DbConn, actor: AuthUser, period: Period): Promise<PeriodBoard> {
  const peopleRows = await findCorrectCountsByUser(db, period);
  const teamRows = await findCorrectCountsByTeam(db, period);
  return {
    people: { top: buildTopRows(peopleRows), me: findMyRank(peopleRows, actor.userId) },
    teams: { top: buildTopTeamRows(teamRows), mine: findMyTeamRank(teamRows, actor.departmentId) },
  };
}

export async function getHallOfFame(db: DbConn, actor: AuthUser): Promise<HallOfFame> {
  return {
    month: await buildPeriod(db, actor, "MONTH"),
    allTime: await buildPeriod(db, actor, "ALL"),
  };
}
