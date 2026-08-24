import { sql, type SQL } from "drizzle-orm";
import type { DbConn } from "./client";
import { executeRows, parseUtcTimestamp } from "./raw";

export type ProblemStatRow = {
  problemId: number; content: string; type: string; status: string;
  departmentId: number; departmentName: string;
  totalAttempts: number; correctAttempts: number; lastAttemptAt: Date | null;
};

// StatsMapper.xml:15-20 statsColumns 미러.
const STAT_COLUMNS = sql`
  p.id AS problem_id, p.content, p.type, p.status, p.department_id, d.name AS department_name,
  COUNT(a.id) AS total_attempts,
  COALESCE(SUM(CASE WHEN a.is_correct THEN 1 ELSE 0 END), 0) AS correct_attempts,
  MAX(a.submitted_at) AS last_attempt_at`;

/**
 * StatsMapper.xml:32-36 accuracyOrder 미러.
 *
 * **승인된 이탈 ㉠ — Java 는 이 정렬을 서비스에서 한 번 더 한다(no-op). 포트는 여기만 한다.**
 * 그래서 이 정렬식이 이 서브플랜에서 **유일한** 정렬 근거다. `NULLIF` 가 시도 0건을 NULL 로
 * 만들고 `NULLS LAST` 가 그것을 맨 뒤로 보낸다(= 미응시, 0% 가 아니다). 마지막 `p.id` 는
 * 동률 타이브레이커다 — 없으면 페이징 경계에서 중복·누락이 생긴다.
 */
const ACCURACY_ORDER = sql`
  ORDER BY (COALESCE(SUM(CASE WHEN a.is_correct THEN 1 ELSE 0 END), 0)::numeric
            / NULLIF(COUNT(a.id), 0)) ASC NULLS LAST,
           p.id`;

type RawStatRow = {
  problem_id: number; content: string; type: string; status: string;
  department_id: number; department_name: string;
  total_attempts: string; correct_attempts: string; last_attempt_at: string | null;
};

// postgres.js 는 COUNT/SUM 을 문자열로 준다(bigint/numeric) — Number 로 바꿔야 한다.
function toStatRow(r: RawStatRow): ProblemStatRow {
  return {
    problemId: Number(r.problem_id), content: r.content, type: r.type, status: r.status,
    departmentId: Number(r.department_id), departmentName: r.department_name,
    totalAttempts: Number(r.total_attempts), correctAttempts: Number(r.correct_attempts),
    lastAttemptAt: parseUtcTimestamp(r.last_attempt_at),
  };
}

function statsWhere(f: { departmentId?: number | null; status?: string | null }): SQL {
  const parts: SQL[] = [];
  if (f.departmentId != null) parts.push(sql`p.department_id = ${f.departmentId}`);
  // 빈 문자열은 필터가 아니다 — MyBatis `<if test="status != '' ">` 미러(정답지 L5).
  if (f.status != null && f.status !== "") parts.push(sql`p.status = ${f.status}`);
  return parts.length === 0 ? sql`` : sql`WHERE ${sql.join(parts, sql` AND `)}`;
}

export async function findProblemStats(
  db: DbConn,
  f: { departmentId?: number | null; status?: string | null; limit: number; offset: number },
): Promise<ProblemStatRow[]> {
  const rows = await executeRows<RawStatRow>(db, sql`
    SELECT ${STAT_COLUMNS}
    FROM problems p
    JOIN departments d ON d.id = p.department_id
    LEFT JOIN attempts a ON a.problem_id = p.id
    ${statsWhere(f)}
    GROUP BY p.id, d.name
    ${ACCURACY_ORDER}
    LIMIT ${f.limit} OFFSET ${f.offset}`);
  return rows.map(toStatRow);
}

// StatsMapper.xml:49-55 — **attempts 조인을 넣지 않는다.** 필터가 p.* 만 보므로 불필요하고,
// 넣은 채 count(*) 를 쓰면 시도 수만큼 부풀어 총건수가 틀린다(정답지 L11).
export async function countProblemStats(
  db: DbConn, f: { departmentId?: number | null; status?: string | null },
): Promise<number> {
  const [row] = await executeRows<{ count: string }>(db, sql`
    SELECT count(*) AS count FROM problems p ${statsWhere(f)}`);
  return Number(row.count);
}

// StatsMapper.xml:57-67 findAllProblemStats 미러. 페이징 없이 전부 반환한다(승인된 이탈 ㉡).
// status 필터가 없다 — listAllProblemStats 는 대시보드 집계용으로 활성·보관을 모두 본다.
export async function findAllProblemStats(db: DbConn, departmentId?: number | null): Promise<ProblemStatRow[]> {
  const where = departmentId != null ? sql`WHERE p.department_id = ${departmentId}` : sql``;
  const rows = await executeRows<RawStatRow>(db, sql`
    SELECT ${STAT_COLUMNS}
    FROM problems p
    JOIN departments d ON d.id = p.department_id
    LEFT JOIN attempts a ON a.problem_id = p.id
    ${where}
    GROUP BY p.id, d.name
    ${ACCURACY_ORDER}`);
  return rows.map(toStatRow);
}

// StatsMapper.xml:69-74 미러. 활성 문제만 센다(대시보드 totalProblems, 정답지 B2).
export async function countActiveProblems(db: DbConn, departmentId?: number | null): Promise<number> {
  const deptFilter = departmentId != null ? sql`AND p.department_id = ${departmentId}` : sql``;
  const [row] = await executeRows<{ count: string }>(db, sql`
    SELECT count(*) AS count FROM problems p WHERE p.status = 'ACTIVE' ${deptFilter}`);
  return Number(row.count);
}

// StatsMapper.xml:76-83 findProblemStat 미러. 상태 필터가 없다 — 보관 문제도 상세 조회 대상이다(정답지 D2).
export async function findProblemStat(db: DbConn, problemId: number): Promise<ProblemStatRow | null> {
  const rows = await executeRows<RawStatRow>(db, sql`
    SELECT ${STAT_COLUMNS}
    FROM problems p
    JOIN departments d ON d.id = p.department_id
    LEFT JOIN attempts a ON a.problem_id = p.id
    WHERE p.id = ${problemId}
    GROUP BY p.id, d.name`);
  return rows.length === 0 ? null : toStatRow(rows[0]);
}

// AttemptChoiceMapper.xml:24-30 countAnalyzedAttempts 미러.
// **`c.problem_id = a.problem_id` 조인 조건이 핵심이다.** 이걸 빼면 문제 수정으로 재발급된
// choiceId 를 가진 다른 문제 시도까지 세게 되어 excludedAttempts(정답지 D11·D13)가 틀린다.
export async function countAnalyzedAttempts(db: DbConn, problemId: number): Promise<number> {
  const [row] = await executeRows<{ count: string }>(db, sql`
    SELECT count(DISTINCT ac.attempt_id) AS count
    FROM attempt_choices ac
    JOIN attempts a ON a.id = ac.attempt_id
    JOIN problem_choices c ON c.id = ac.choice_id AND c.problem_id = a.problem_id
    WHERE a.problem_id = ${problemId}`);
  return Number(row.count);
}

// AttemptChoiceMapper.xml:13-19 findDistribution 미러.
export async function findChoiceDistribution(
  db: DbConn, problemId: number,
): Promise<{ choiceId: number; selectedCount: number }[]> {
  const rows = await executeRows<{ choice_id: number; selected_count: string }>(db, sql`
    SELECT ac.choice_id, count(*) AS selected_count
    FROM attempt_choices ac
    JOIN attempts a ON a.id = ac.attempt_id
    WHERE a.problem_id = ${problemId}
    GROUP BY ac.choice_id`);
  return rows.map((r) => ({ choiceId: Number(r.choice_id), selectedCount: Number(r.selected_count) }));
}

// AttemptMapper.xml:23-29 findRecentWrong 미러.
// submitted_at DESC, id DESC — 같은 시각의 오답이 있어도 순서가 흔들리지 않게 id 로 타이브레이크한다(정답지 D15).
export async function findRecentWrong(
  db: DbConn, problemId: number, limit: number,
): Promise<{ submittedAnswer: string | null; submittedAt: Date }[]> {
  const rows = await executeRows<{ submitted_answer: string | null; submitted_at: string }>(db, sql`
    SELECT submitted_answer, submitted_at
    FROM attempts
    WHERE problem_id = ${problemId} AND is_correct = FALSE
    ORDER BY submitted_at DESC, id DESC
    LIMIT ${limit}`);
  return rows.map((r) => ({
    submittedAnswer: r.submitted_answer,
    submittedAt: parseUtcTimestamp(r.submitted_at) as Date,
  }));
}
