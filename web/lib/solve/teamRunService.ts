import type { DbConn } from "../db/client";
import type { SolveListRow } from "../db/solveProblems";
import {
  countWrongByDepartment, findSolveRowsByIds, findTeamCounts,
  findTeamProblemIds, findWrongProblemIds,
} from "../db/solveTeams";
import {
  findActiveRun, findActiveRunsByUser, findFinishedDepartmentIds, findLatestFinishedRun,
  findRunById, insertRun, markRunFinished, updateRunProgress,
  type RunMode, type RunStatus, type SolveRunRow,
} from "../db/solveRuns";
import { canAdvance, isRunFinished, nextCursor, summarizeResults, type RunResult } from "./teamRun";
import type { AuthUser } from "../auth/types";
import { BizError } from "../http/errors";
import { ErrorCode } from "../http/errorCode";

/** 바퀴에 담을 문제가 하나도 없을 때. 전체 모드와 복습 모드가 같은 문구를 쓴다. */
export const NO_PROBLEMS_MESSAGE = "풀 문제가 없습니다.";

export type TeamListItem = {
  departmentId: number;
  departmentName: string;
  totalCount: number;
  activeRun: { runId: number; mode: RunMode; cursor: number; total: number } | null;
  hasFinishedRun: boolean;
  wrongCount: number;
};

export type RunView = {
  runId: number;
  departmentId: number;
  departmentName: string;
  mode: RunMode;
  cursor: number;
  total: number;
  status: RunStatus;
  /**
   * 순서의 진실. 화면은 problemIds[cursor] 로 지금 문제를 정한다.
   *
   * problems 로 위치를 정하면 안 된다 — 문제 행이 지워지면 problems 만 짧아져 위치가
   * 한 칸씩 밀리고, 그때부터 다른 문제가 나온다.
   */
  problemIds: number[];
  problems: SolveListRow[];
  results: RunResult[];
  answeredCount: number;
  correctCount: number;
};

/**
 * 팀 목록. 네 가지를 각각 **한 번씩만** 읽어 메모리에서 맞춘다 — 개수·틀린 수·끝난 부서·
 * 진행 중 바퀴. 부서마다 질의를 하나씩 더 쏘면 운영 부서 13개 기준으로 왕복이 16번이 되고,
 * 이 목록은 화면을 열 때마다 불린다.
 */
export async function listTeams(db: DbConn, actor: AuthUser): Promise<TeamListItem[]> {
  const counts = await findTeamCounts(db, actor.track);
  const wrongByDept = await countWrongByDepartment(db, actor.userId, actor.track);
  const finishedDeptIds = await findFinishedDepartmentIds(db, actor.userId);
  const activeRuns = await findActiveRunsByUser(db, actor.userId);

  return counts.map((c) => {
    const active = activeRuns.get(c.departmentId) ?? null;
    return {
      departmentId: c.departmentId,
      departmentName: c.departmentName,
      totalCount: c.totalCount,
      activeRun: active
        ? { runId: active.id, mode: active.mode, cursor: active.cursor, total: active.problemIds.length }
        : null,
      hasFinishedRun: finishedDeptIds.has(c.departmentId),
      wrongCount: wrongByDept.get(c.departmentId) ?? 0,
    };
  });
}

/**
 * 바퀴를 시작한다.
 *
 * 진행 중인 바퀴가 있으면 **모드와 무관하게 그것을 그대로 돌려준다.** 두 탭에서 동시에
 * 눌러도 유니크 인덱스 충돌이 사용자에게 오류로 보이지 않게 하려는 것이고, 진행 중인
 * 진도를 새 바퀴로 덮어쓰지 않으려는 것이기도 하다.
 */
export async function startRun(
  db: DbConn, actor: AuthUser, departmentId: number, mode: RunMode,
): Promise<RunView> {
  const active = await findActiveRun(db, actor.userId, departmentId);
  if (active) return toRunView(db, active);

  const problemIds = mode === "WRONG"
    ? await findWrongProblemIds(db, actor.userId, departmentId, actor.track)
    : await findTeamProblemIds(db, departmentId, actor.track);

  if (problemIds.length === 0) {
    throw new BizError(ErrorCode.INPUT_VALUE_INVALID, NO_PROBLEMS_MESSAGE);
  }

  const created = await insertRun(db, { userId: actor.userId, departmentId, mode, problemIds });
  return toRunView(db, created);
}

export async function advanceRun(
  db: DbConn, actor: AuthUser, runId: number, fromCursor: number, correct: boolean | null,
): Promise<{ cursor: number; status: RunStatus; total: number }> {
  const run = await requireOwnRun(db, actor, runId);
  const total = run.problemIds.length;

  // 이미 끝난 바퀴이거나 보낸 위치가 어긋나면 아무것도 하지 않고 지금 상태를 돌려준다.
  if (run.status === "FINISHED" || !canAdvance(fromCursor, run.cursor)) {
    return { cursor: run.cursor, status: run.status, total };
  }

  const problemId = run.problemIds[run.cursor];
  const results = [...run.results, { problemId, correct }];
  const cursor = nextCursor(run.cursor, total);
  const status: RunStatus = isRunFinished(cursor, total) ? "FINISHED" : "IN_PROGRESS";

  await updateRunProgress(db, runId, { cursor, results, status });
  return { cursor, status, total };
}

/**
 * 바퀴를 지금까지 푼 만큼만 남기고 끝낸다. 진행 화면의 "여기서 그만두고 결과 보기" 가 쓴다.
 *
 * 이 창구가 없으면 중간에 나간 바퀴가 영원히 진행 중으로 남아, 유니크 인덱스 때문에
 * 그 팀을 다시 시작할 수 없다.
 */
export async function finishRun(
  db: DbConn, actor: AuthUser, runId: number,
): Promise<{ runId: number; status: RunStatus }> {
  await requireOwnRun(db, actor, runId);
  await markRunFinished(db, runId);
  return { runId, status: "FINISHED" };
}

export async function getRunView(db: DbConn, actor: AuthUser, runId: number): Promise<RunView> {
  return toRunView(db, await requireOwnRun(db, actor, runId));
}

/**
 * 그 팀에서 가장 최근에 본 바퀴. 진행 중인 것이 있으면 그것, 없으면 마지막으로 끝낸 것이다.
 *
 * 결과 화면이 주소에 바퀴 번호 없이 열렸을 때(북마크·새로고침) 이걸로 되찾는다.
 * 진행 화면도 진입할 때 이 하나만 부르면 되므로 팀 목록을 통째로 읽지 않아도 된다.
 */
export async function getLatestRunView(
  db: DbConn, actor: AuthUser, departmentId: number,
): Promise<RunView | null> {
  const run = await findActiveRun(db, actor.userId, departmentId)
    ?? await findLatestFinishedRun(db, actor.userId, departmentId);
  return run ? toRunView(db, run) : null;
}

async function requireOwnRun(db: DbConn, actor: AuthUser, runId: number): Promise<SolveRunRow> {
  const run = await findRunById(db, runId);
  // 없는 바퀴와 남의 바퀴를 같은 문구로 거절한다 — id 를 훑어 남의 바퀴 존재를 알아내는
  // 길을 열지 않는다.
  if (!run || run.userId !== actor.userId) {
    throw new BizError(ErrorCode.ACCESS_AUTH_DENIED, ErrorCode.ACCESS_AUTH_DENIED.message);
  }
  return run;
}

async function toRunView(db: DbConn, run: SolveRunRow): Promise<RunView> {
  const problems = await findSolveRowsByIds(db, run.problemIds);
  const summary = summarizeResults(run.results);
  return {
    runId: run.id,
    departmentId: run.departmentId,
    // 바퀴의 문제는 모두 같은 부서라 첫 행의 부서명이 곧 팀 이름이다.
    departmentName: problems[0]?.departmentName ?? "",
    mode: run.mode,
    cursor: run.cursor,
    total: run.problemIds.length,
    status: run.status,
    problemIds: run.problemIds,
    problems,
    results: run.results,
    answeredCount: summary.answeredCount,
    correctCount: summary.correctCount,
  };
}
