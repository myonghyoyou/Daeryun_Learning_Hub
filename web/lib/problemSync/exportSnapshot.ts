import postgres from "postgres";
import { SNAPSHOT_VERSION, type ProblemSnapshot, type SnapshotProblem } from "./snapshot";

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

/**
 * 운영 접속 문자열인지 확인하고 돌려준다.
 *
 * lib/devSeed.ts 의 assertSeedableEnvironment 를 뒤집은 형태다 — 저쪽은 "로컬이어야 한다",
 * 이쪽은 "로컬이면 안 된다". 운영용 자리에 로컬 주소를 넣으면 로컬을 읽어 로컬에 덮어쓰는
 * 무의미한 동작이 되므로 여기서 막는다.
 */
export function assertProdSource(env: { PROD_DATABASE_URL?: string }): string {
  const url = env.PROD_DATABASE_URL;
  if (!url) {
    throw new Error("PROD_DATABASE_URL 이 설정되지 않았습니다. web/.env 에 운영 DB 접속 문자열을 넣으세요.");
  }

  let host: string;
  try {
    host = new URL(url).hostname;
  } catch {
    // 파싱 실패를 "확인할 수 없으니 통과"로 처리하면 가드가 무의미해진다.
    throw new Error("PROD_DATABASE_URL 을 URL 로 해석할 수 없습니다.");
  }

  // new URL 은 IPv6 를 대괄호째 hostname 에 넣지 않지만, 구현 차이를 타지 않게 벗겨 둔다.
  const bare = host.replace(/^\[|\]$/g, "");
  if (LOCAL_HOSTS.has(bare)) {
    throw new Error(`PROD_DATABASE_URL 이 로컬을 가리킵니다(host=${host}). 운영 접속 문자열을 넣으세요.`);
  }
  return url;
}

export type ExportRows = {
  departments: { code: string; name: string; status: string }[];
  problems: {
    id: number; type: string; content: string; imageUrl: string | null;
    referenceText: string | null; explanation: string | null; blankRevealCount: number | null;
    status: string; departmentCode: string; sourceNumber: number | null;
    createdAt: Date; updatedAt: Date;
  }[];
  choices: { problemId: number; choiceText: string; isCorrect: boolean; displayOrder: number }[];
  answers: { problemId: number; answerText: string }[];
  blanks: { problemId: number; blankKey: string; answerText: string; displayOrder: number }[];
  problemTags: { problemId: number; name: string }[];
};

/** problemId 로 자식 행을 묶는다. */
function groupBy<T extends { problemId: number }, R>(rows: T[], map: (row: T) => R): Map<number, R[]> {
  const grouped = new Map<number, R[]>();
  for (const row of rows) {
    const list = grouped.get(row.problemId);
    if (list) list.push(map(row));
    else grouped.set(row.problemId, [map(row)]);
  }
  return grouped;
}

/**
 * 조회 결과를 스냅샷으로 바꾼다. DB 를 건드리지 않는 순수 함수라 이 부분만 테스트로 덮인다
 * (운영 접속이 필요한 exportSnapshot 은 자동 테스트 대상이 아니다).
 */
export function buildSnapshot(rows: ExportRows, source: { host: string; database: string }): ProblemSnapshot {
  const choicesByProblem = groupBy(rows.choices, (c) => ({
    choiceText: c.choiceText, isCorrect: c.isCorrect, displayOrder: c.displayOrder,
  }));
  const answersByProblem = groupBy(rows.answers, (a) => ({ answerText: a.answerText }));
  const blanksByProblem = groupBy(rows.blanks, (b) => ({
    blankKey: b.blankKey, answerText: b.answerText, displayOrder: b.displayOrder,
  }));
  const tagsByProblem = groupBy(rows.problemTags, (t) => t.name);

  const problems: SnapshotProblem[] = rows.problems.map((p) => ({
    id: p.id,
    type: p.type,
    content: p.content,
    imageUrl: p.imageUrl,
    referenceText: p.referenceText,
    explanation: p.explanation,
    blankRevealCount: p.blankRevealCount,
    status: p.status,
    departmentCode: p.departmentCode,
    sourceNumber: p.sourceNumber,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
    choices: choicesByProblem.get(p.id) ?? [],
    answers: answersByProblem.get(p.id) ?? [],
    blanks: blanksByProblem.get(p.id) ?? [],
    tags: tagsByProblem.get(p.id) ?? [],
  }));

  return {
    version: SNAPSHOT_VERSION,
    generatedAt: new Date().toISOString(),
    source,
    counts: {
      departments: rows.departments.length,
      problems: problems.length,
      tags: new Set(rows.problemTags.map((t) => t.name)).size,
    },
    departments: rows.departments,
    problems,
  };
}

/**
 * 운영 DB 를 읽어 스냅샷을 만든다.
 *
 * 모든 조회를 `read only` 트랜잭션 안에서 한다 — 실수로 쓰기 구문이 섞여도 Postgres 가
 * 거부한다. "쓰지 않기로 한다"가 아니라 쓸 수 없게 만드는 것이 요점이다.
 *
 * lib/db/client.ts 의 getDb() 를 쓰지 않는 이유: 그 함수는 연결을 하나만 캐시해서
 * 운영·로컬 두 곳에 동시에 붙을 수 없다. prepare: false 는 Supabase 풀러에 필수다.
 */
export async function exportSnapshot(url: string): Promise<ProblemSnapshot> {
  const sql = postgres(url, { prepare: false });
  try {
    return await sql.begin("read only", async (tx) => {
      // id 계열은 bigint 라 postgres.js 가 문자열로 돌려줄 수 있다. ::int 로 캐스팅해
      // 스냅샷에 숫자로 담는다(parseSnapshot 이 문자열을 거부한다).
      const departments = await tx<{ code: string; name: string; status: string }[]>`
        SELECT code, name, status FROM departments ORDER BY id`;
      const problems = await tx<ExportRows["problems"]>`
        SELECT p.id::int AS id, p.type, p.content,
               p.image_url AS "imageUrl", p.reference_text AS "referenceText",
               p.explanation, p.blank_reveal_count AS "blankRevealCount", p.status,
               d.code AS "departmentCode", p.source_number AS "sourceNumber",
               p.created_at AS "createdAt", p.updated_at AS "updatedAt"
        FROM problems p JOIN departments d ON d.id = p.department_id
        ORDER BY p.id`;
      const choices = await tx<ExportRows["choices"]>`
        SELECT problem_id::int AS "problemId", choice_text AS "choiceText",
               is_correct AS "isCorrect", display_order AS "displayOrder"
        FROM problem_choices ORDER BY problem_id, display_order, id`;
      const answers = await tx<ExportRows["answers"]>`
        SELECT problem_id::int AS "problemId", answer_text AS "answerText"
        FROM problem_answers ORDER BY problem_id, id`;
      const blanks = await tx<ExportRows["blanks"]>`
        SELECT problem_id::int AS "problemId", blank_key AS "blankKey",
               answer_text AS "answerText", display_order AS "displayOrder"
        FROM problem_blanks ORDER BY problem_id, display_order, id`;
      const problemTags = await tx<ExportRows["problemTags"]>`
        SELECT pt.problem_id::int AS "problemId", t.name
        FROM problem_tags pt JOIN tags t ON t.id = pt.tag_id
        ORDER BY pt.problem_id, t.name`;

      return buildSnapshot(
        { departments: [...departments], problems: [...problems], choices: [...choices],
          answers: [...answers], blanks: [...blanks], problemTags: [...problemTags] },
        { host: new URL(url).hostname, database: new URL(url).pathname.replace(/^\//, "") },
      );
    });
  } finally {
    await sql.end();
  }
}
