import { eq, inArray, sql } from "drizzle-orm";
import type { DbConn } from "./client";
import { departments, problems, problemTags, tags } from "./schema";
import type { SolveListRow } from "./solveProblems";
import type { Track } from "../problem/track";

/**
 * 팀 단위 풀이가 쓰는 조회. 문제 줄 세우기 규칙이 사는 유일한 곳이다.
 *
 *   ORDER BY p.source_number ASC NULLS LAST, p.id ASC
 *
 * 종이 문제집 번호 순이되, 번호가 비어 있으면 맨 뒤로 보내고 번호가 겹치면 id 로 가른다.
 * 세 조각이 다 있어야 순서가 한 가지로 정해진다 — 이어 풀기가 성립하려면 매번 같은
 * 줄이 나와야 한다.
 */

export type TeamCountRow = { departmentId: number; departmentName: string; totalCount: number };

/**
 * 팀 목록에 올릴 부서와 그 문제 수.
 *
 * **정상 문제가 하나도 없는 부서는 뺀다.** 운영에는 "본사"(code=HQ) 처럼 조직에 없는데
 * 행만 남은 부서가 있다(2026-09-03 실측: 부서 13개 중 본사만 문제 0개, `lib/devSeed.ts:51-52`
 * 도 "이 회사 조직에 없는 부서"라고 적어 두었다). 이름으로 하드코딩해 거르지 않는 이유는
 * 그런 목록이 또 어긋나기 때문이다 — 풀 문제가 없으면 팀으로 보여 줄 이유도 없다.
 *
 * 부서 상태로도 거른다. 2026-09-03 기준 비활성 부서는 없다. 다만 나중에 어떤 부서를
 * 비활성으로 바꾸면 그 팀은 목록에서 사라지고 진행 중이던 바퀴도 이어 풀 수 없게 된다 —
 * 랜덤 풀기(`lib/db/solveProblems.ts` findRandomActiveProblems)는 부서 상태를 보지 않아
 * 그 문제를 계속 내므로, 두 화면이 갈린다는 것을 알고 있어야 한다.
 */
export async function findTeamCounts(db: DbConn, track: Track): Promise<TeamCountRow[]> {
  // 세는 식과 거르는 식이 **같아야 한다.** FILTER 만 고치고 HAVING 을 두면, 다른 직군
  // 문제만 있는 팀이 totalCount = 0 인 채로 목록에 남는다.
  const rows = await db.execute(sql`
    SELECT d.id::int AS "departmentId", d.name AS "departmentName",
           count(p.id) FILTER (WHERE p.status = 'ACTIVE' AND p.track = ${track})::int AS "totalCount"
    FROM departments d
    LEFT JOIN problems p ON p.department_id = d.id
    WHERE d.status = 'ACTIVE'
    GROUP BY d.id, d.name
    HAVING count(p.id) FILTER (WHERE p.status = 'ACTIVE' AND p.track = ${track}) > 0
    ORDER BY d.id
  `);
  return rows as unknown as TeamCountRow[];
}

export async function findTeamProblemIds(
  db: DbConn, departmentId: number, track: Track,
): Promise<number[]> {
  const rows = await db.execute(sql`
    SELECT p.id::int AS id
    FROM problems p
    WHERE p.department_id = ${departmentId} AND p.status = 'ACTIVE' AND p.track = ${track}
    ORDER BY p.source_number ASC NULLS LAST, p.id ASC
  `);
  return (rows as unknown as { id: number }[]).map((r) => r.id);
}

/**
 * 문제마다 **가장 마지막에 낸 답**을 골라, 그것이 오답인 문제만 모은다.
 *
 * LATERAL 로 문제 하나당 한 줄만 가져온다. 같은 시각에 제출된 답이 둘이면 id 가 큰 쪽을
 * 나중 것으로 본다 — submitted_at 만으로 정렬하면 순서가 흔들려 답이 오락가락한다.
 */
export async function findWrongProblemIds(
  db: DbConn, userId: number, departmentId: number, track: Track,
): Promise<number[]> {
  const rows = await db.execute(sql`
    SELECT p.id::int AS id
    FROM problems p
    JOIN LATERAL (
      SELECT a.is_correct
      FROM attempts a
      WHERE a.user_id = ${userId} AND a.problem_id = p.id
      ORDER BY a.submitted_at DESC, a.id DESC
      LIMIT 1
    ) last ON TRUE
    WHERE p.department_id = ${departmentId} AND p.status = 'ACTIVE' AND p.track = ${track}
      AND last.is_correct = false
    ORDER BY p.source_number ASC NULLS LAST, p.id ASC
  `);
  return (rows as unknown as { id: number }[]).map((r) => r.id);
}

/** 팀 목록의 "틀린 문제 N개" 표시용. 부서마다 한 번에 센다(부서 수만큼 질의하지 않는다). */
export async function countWrongByDepartment(
  db: DbConn, userId: number, track: Track,
): Promise<Map<number, number>> {
  const rows = await db.execute(sql`
    SELECT p.department_id::int AS "departmentId", count(*)::int AS "wrongCount"
    FROM problems p
    JOIN LATERAL (
      SELECT a.is_correct
      FROM attempts a
      WHERE a.user_id = ${userId} AND a.problem_id = p.id
      ORDER BY a.submitted_at DESC, a.id DESC
      LIMIT 1
    ) last ON TRUE
    WHERE p.status = 'ACTIVE' AND p.track = ${track} AND last.is_correct = false
    GROUP BY p.department_id
  `);
  const out = new Map<number, number>();
  for (const r of rows as unknown as { departmentId: number; wrongCount: number }[]) {
    out.set(r.departmentId, r.wrongCount);
  }
  return out;
}

const TAG_AGG = sql<string[]>`COALESCE(array_agg(DISTINCT ${tags.name}) FILTER (WHERE ${tags.name} IS NOT NULL), '{}')`;

/**
 * 바퀴에 담긴 문제들의 요약을 **넘긴 id 순서 그대로** 돌려준다.
 *
 * SQL 의 IN 은 순서를 지키지 않으므로 받아서 다시 줄 세운다. 바퀴의 순서는 시작 시점에
 * 확정된 problem_ids 가 진실이고, 이 함수는 그 줄을 흐트러뜨리면 안 된다.
 */
export async function findSolveRowsByIds(db: DbConn, ids: number[]): Promise<SolveListRow[]> {
  if (ids.length === 0) return [];
  const rows = await db
    .select({
      id: problems.id, type: problems.type, content: problems.content,
      departmentName: departments.name, sourceNumber: problems.sourceNumber, tags: TAG_AGG,
    })
    .from(problems)
    .innerJoin(departments, eq(departments.id, problems.departmentId))
    .leftJoin(problemTags, eq(problemTags.problemId, problems.id))
    .leftJoin(tags, eq(tags.id, problemTags.tagId))
    .where(inArray(problems.id, ids))
    .groupBy(problems.id, departments.name);

  const byId = new Map(rows.map((r) => [r.id, r]));
  return ids.map((id) => byId.get(id)).filter((r): r is SolveListRow => r !== undefined);
}
