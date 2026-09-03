import { sql } from "drizzle-orm";
import type { DbConn } from "./client";
import { executeRows } from "./raw";

export type Period = "MONTH" | "ALL";

export type HallOfFameRow = {
  userId: number;
  name: string;
  departmentName: string;
  correctCount: number;
  /** 동점 순서를 가르는 값. 화면에 나가지 않는다. */
  lastCorrectAt: string;
};

/**
 * 서울 기준 이번 달 1일 0시를, 시간대 없는 UTC 값으로 옮긴 것.
 *
 * attempts.submitted_at 은 시간대 없는 컬럼이고 값은 UTC 로 들어간다. 변환 없이 비교하면
 * **매달 1일 오전 9시간 동안 지난달 기록이 섞여 들어온다.** 2026-09-03 실측으로 이 식은
 * 서버 TimeZone 이 Etc/UTC 일 때 '2026-08-31 15:00:00' 을 냈다 — 서울 9월 1일 0시다.
 */
const MONTH_START = sql`((date_trunc('month', now() AT TIME ZONE 'Asia/Seoul')
  AT TIME ZONE 'Asia/Seoul') AT TIME ZONE 'UTC')`;

/**
 * 사람 한 명당 한 행. **정렬까지 여기서 끝낸다** — 순위를 매기는 순수 함수는 이 순서를
 * 그대로 믿는다(lib/solve/hallOfFameRanking.ts).
 *
 * 정렬은 맞힌 개수 내림차순 → 마지막 정답이 이른 순 → 사용자 번호 순이다. 마지막 항이
 * 없으면 개수와 시각이 모두 같은 두 사람의 순서가 실행마다 달라져, 화면에 보이는 대표
 * 이름이 새로고침마다 바뀐다.
 *
 * 집계값에 ::int 를 붙이는 이유는 postgres.js 가 COUNT 를 문자열로 주기 때문이다
 * (lib/db/stats.ts:36 의 같은 주석).
 */
export async function findCorrectCountsByUser(db: DbConn, period: Period): Promise<HallOfFameRow[]> {
  const periodFilter = period === "MONTH" ? sql`AND a.submitted_at >= ${MONTH_START}` : sql``;
  return executeRows<HallOfFameRow>(db, sql`
    SELECT u.id::int AS "userId", u.name, d.name AS "departmentName",
           count(*)::int AS "correctCount",
           max(a.submitted_at)::text AS "lastCorrectAt"
    FROM attempts a
    JOIN users u ON u.id = a.user_id
    JOIN departments d ON d.id = u.department_id
    WHERE a.is_correct = true AND u.status = 'ACTIVE' ${periodFilter}
    GROUP BY u.id, u.name, d.name
    ORDER BY count(*) DESC, max(a.submitted_at) ASC, u.id ASC
  `);
}

export type TeamRow = {
  departmentId: number;
  departmentName: string;
  correctCount: number;
  lastCorrectAt: string;
};

/**
 * 팀 한 곳당 한 행. 사람 것을 부서로 묶어 더한 것뿐이라 규칙이 위와 같다 —
 * 활성 사용자만 세고, 정렬도 합계 내림차순 → 마지막 정답이 이른 순 → 부서 번호 순이다.
 *
 * 부서 상태는 보지 않는다. 부서가 비활성이 되었다고 그 팀이 쌓은 기록이 사라지면 안 된다.
 */
export async function findCorrectCountsByTeam(db: DbConn, period: Period): Promise<TeamRow[]> {
  const periodFilter = period === "MONTH" ? sql`AND a.submitted_at >= ${MONTH_START}` : sql``;
  return executeRows<TeamRow>(db, sql`
    SELECT d.id::int AS "departmentId", d.name AS "departmentName",
           count(*)::int AS "correctCount",
           max(a.submitted_at)::text AS "lastCorrectAt"
    FROM attempts a
    JOIN users u ON u.id = a.user_id
    JOIN departments d ON d.id = u.department_id
    WHERE a.is_correct = true AND u.status = 'ACTIVE' ${periodFilter}
    GROUP BY d.id, d.name
    ORDER BY count(*) DESC, max(a.submitted_at) ASC, d.id ASC
  `);
}
