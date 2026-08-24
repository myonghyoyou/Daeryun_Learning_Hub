import { and, desc, eq, sql, type SQL } from "drizzle-orm";
import type { DbConn } from "./client";
import { departments, problems, problemTags, tags } from "./schema";

export type NewProblem = typeof problems.$inferInsert;
export type ProblemRow = typeof problems.$inferSelect;
// ProblemMapper.xml `update`(:57-64) 가 건드리는 여섯 컬럼으로 좁힌다. type·status·
// departmentId·createdBy 는 전용 statement(updateStatus / updateDepartmentAndSourceNumber)
// 를 갖고 있고, 일반 수정 경로에서는 절대 바뀌면 안 된다 — 여기 넣으면 컴파일 오류다.
export type ProblemPatch = Partial<
  Pick<NewProblem, "content" | "imageUrl" | "referenceText" | "explanation" | "blankRevealCount" | "sourceNumber">
>;

export async function insertProblem(db: DbConn, row: NewProblem): Promise<number> {
  const [inserted] = await db.insert(problems).values(row).returning({ id: problems.id });
  return inserted.id;
}

export async function findProblemById(db: DbConn, id: number): Promise<ProblemRow | null> {
  const rows = await db.select().from(problems).where(eq(problems.id, id)).limit(1);
  return rows[0] ?? null;
}

// updated_at 은 세 UPDATE 모두에서 여기서 찍는다. ProblemMapper.xml 의 update(:62)·
// updateStatus(:67)·updateDepartmentAndSourceNumber(:72) 가 전부 `updated_at = now()` 로
// 끝나는데, DB 쪽에는 그물이 없다 — 기본값은 INSERT 때만 걸리고 트리거도 $onUpdate 도 없다.
// 호출부에 맡기면 M3·M4 가 각자 잊을 수 있으므로 DAO 안에 가둔다.
export async function updateProblem(db: DbConn, id: number, patch: ProblemPatch): Promise<void> {
  await db.update(problems).set({ ...patch, updatedAt: sql`now()` }).where(eq(problems.id, id));
}

export async function updateProblemStatus(db: DbConn, id: number, status: "ACTIVE" | "ARCHIVED"): Promise<void> {
  await db.update(problems).set({ status, updatedAt: sql`now()` }).where(eq(problems.id, id));
}

export async function updateDepartmentAndSourceNumber(
  db: DbConn, id: number, departmentId: number, sourceNumber: number,
): Promise<void> {
  await db.update(problems).set({ departmentId, sourceNumber, updatedAt: sql`now()` }).where(eq(problems.id, id));
}

// 상태로 거르지 않는다 — spec D5: 문항 번호는 재사용하지 않는다. 보관(ARCHIVED)된 문제도
// 번호를 계속 점유하므로, 다음 번호를 매길 때는 보관본까지 포함한 최댓값을 봐야 한다.
export async function findMaxSourceNumber(db: DbConn, departmentId: number): Promise<number | null> {
  const [row] = await db
    .select({ max: sql<number | null>`max(${problems.sourceNumber})` })
    .from(problems)
    .where(eq(problems.departmentId, departmentId));
  return row?.max ?? null;
}

/**
 * `ProblemMapper.xml` 의 `<sql id="problemFilter">`(:79-90) 에 대응하는 아홉 필터 중 일곱
 * (page·size 는 서비스가 클램프한 뒤 limit/offset 으로 넘긴다). 조건은 `p.*` 와 상관
 * 서브쿼리만 참조하므로 태그 조인 없이도 그대로 쓸 수 있다 — countProblems 가 이걸 노린다.
 */
export interface ProblemListFilters {
  departmentId: number | null;
  type: string | null;
  status: string | null;
  /** UTC 자정이어야 한다 — `toDateLiteral` 주석 참고. `parseDateParam` 의 출력이 그렇다. */
  createdFrom: Date | null;
  /** UTC 자정이어야 한다 — `toDateLiteral` 주석 참고. */
  createdTo: Date | null;
  tag: string | null;
  keyword: string | null;
}

export type ProblemListQuery = ProblemListFilters & { limit: number; offset: number };

/** Spring `ProblemListItem`(dto/problem/ProblemListItem.java) 과 필드·순서가 같다(정답지 L14). */
export interface ProblemListItem {
  id: number;
  type: string;
  content: string;
  status: string;
  departmentId: number;
  departmentName: string;
  createdAt: Date;
  tags: string[];
}

/**
 * LocalDate 바인딩 미러: 날짜만 넘기고 비교는 DB 의 date 타입에 맡긴다. Date 객체를 그대로
 * 바인딩하면 timestamptz 로 나가 세션 타임존만큼 어긋난다(created_at 은 timestamp 무 tz).
 *
 * **호출 계약: `createdFrom`·`createdTo` 는 UTC 자정이어야 한다.** `parseDateParam` 이 항상
 * `Date.UTC` 로 만들므로 지금은 성립한다. 로컬 시각 Date(예: KST 오전 9시 이전의 `new Date()`)
 * 를 넘기면 `toISOString()` 이 전날로 굴러가 필터가 하루 어긋난다 — 조용히 틀리는 종류다.
 * 로컬 시각 Date 를 받아야 할 일이 생기면 여기서 UTC 로 정규화하지 말고 호출부에서
 * `parseDateParam` 과 같은 방식으로 만들어 넘길 것.
 */
function toDateLiteral(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * 목록과 총건수는 **반드시** 이 한 조각을 함께 쓴다. 두 벌로 갈라지면 총건수와 실제 결과가
 * 어긋나 마지막 페이지가 비는 버그가 난다(ProblemMapper.xml:76-78).
 *
 * MyBatis `<if>` 를 글자대로 옮긴다: 빈 문자열 방어(`!= ''`)는 tag·keyword 에만 있다.
 * `?type=` 처럼 빈 값이 오면 Spring 도 `p.type = ''` 로 0건을 낸다 — 화면은 "전체" 를
 * 파라미터 자체를 빼는 방식으로 보내므로(frontend/src/utils/problemListParams.js) 도달하지 않는다.
 */
function problemFilterConditions(filters: ProblemListFilters): SQL[] {
  const conditions: SQL[] = [];
  if (filters.departmentId != null) conditions.push(eq(problems.departmentId, filters.departmentId));
  if (filters.type != null) conditions.push(eq(problems.type, filters.type));
  if (filters.status != null) conditions.push(eq(problems.status, filters.status));
  if (filters.createdFrom != null) {
    conditions.push(sql`${problems.createdAt} >= ${toDateLiteral(filters.createdFrom)}::date`);
  }
  // 정답지 L9: `<= createdTo` 로 쓰면 그날 00:00 이후 등록분이 통째로 빠진다.
  if (filters.createdTo != null) {
    conditions.push(sql`${problems.createdAt} < (${toDateLiteral(filters.createdTo)}::date + INTERVAL '1 day')`);
  }
  // 정답지 L10: 상관 서브쿼리 — 바깥 태그 조인에 기대지 않으므로 countProblems 에서도 쓸 수 있다.
  // 별칭을 fpt/ft 로 두는 것은 findAll 의 바깥 조인(problem_tags/tags)과 이름이 겹치지 않게 하기 위함이다.
  if (filters.tag != null && filters.tag !== "") {
    conditions.push(sql`EXISTS (
      SELECT 1 FROM problem_tags fpt JOIN tags ft ON ft.id = fpt.tag_id
      WHERE fpt.problem_id = ${problems.id} AND lower(ft.name) = lower(${filters.tag})
    )`);
  }
  if (filters.keyword != null && filters.keyword !== "") {
    conditions.push(sql`${problems.content} ILIKE '%' || ${filters.keyword} || '%'`);
  }
  return conditions;
}

/**
 * `ProblemMapper.xml findAll`(:91-105) 이식. 태그를 `array_agg` 로 한 행에 접어 넣으므로
 * LEFT JOIN + GROUP BY 가 필요하다. FILTER/COALESCE 를 빼면 태그 없는 문제의 tags 가
 * `[null]` 로 나간다.
 *
 * `ORDER BY p.created_at DESC, p.id DESC` — `p.id` 타이브레이커는 장식이 아니다(정답지 L12).
 * 엑셀 업로드가 created_at 이 같은 행을 무더기로 만들면, 타이브레이커 없이는 전순서가 아니라
 * LIMIT/OFFSET 페이징에서 같은 행이 두 번 나오거나 아예 빠진다.
 */
export async function listProblems(db: DbConn, query: ProblemListQuery): Promise<ProblemListItem[]> {
  const conditions = problemFilterConditions(query);
  const rows = await db
    .select({
      id: problems.id,
      type: problems.type,
      content: problems.content,
      status: problems.status,
      departmentId: problems.departmentId,
      departmentName: departments.name,
      createdAt: problems.createdAt,
      tags: sql<string[]>`COALESCE(array_agg(DISTINCT ${tags.name}) FILTER (WHERE ${tags.name} IS NOT NULL), '{}')`,
    })
    .from(problems)
    .innerJoin(departments, eq(departments.id, problems.departmentId))
    .leftJoin(problemTags, eq(problemTags.problemId, problems.id))
    .leftJoin(tags, eq(tags.id, problemTags.tagId))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .groupBy(problems.id, departments.name)
    .orderBy(desc(problems.createdAt), desc(problems.id))
    .limit(query.limit)
    .offset(query.offset);
  return rows;
}

/**
 * `ProblemMapper.xml countAll`(:106-115) 이식. **태그 조인을 넣지 않는다**(정답지 L13):
 * 필터가 `p.*` 와 상관 서브쿼리만 보므로 조인이 필요 없고, 빼면 문제 1건당 정확히 1행이라
 * `count(*)` 가 그대로 정답이다. 조인을 둔 채 세면 태그 수만큼 부풀어 총건수가 틀린다
 * (departments 는 NOT NULL FK 에 대한 1:1 조인이라 행 수를 바꾸지 않는다).
 */
export async function countProblems(db: DbConn, filters: ProblemListFilters): Promise<number> {
  const conditions = problemFilterConditions(filters);
  const [row] = await db
    .select({ total: sql<number>`count(*)` })
    .from(problems)
    .innerJoin(departments, eq(departments.id, problems.departmentId))
    .where(conditions.length > 0 ? and(...conditions) : undefined);
  return Number(row?.total ?? 0);
}

/**
 * `ProblemMapper.xml findRecent`(:117-131) 이식 — 대시보드의 "최근 문제" 목록(정답지 B13).
 * `findAll` 과 같은 `array_agg` 태그 조립, 같은 `p.id` 타이브레이커를 쓰지만 두 가지가 다르다:
 * **상태 필터가 없다**(정답지 B14 — 보관 문제도 나온다, `<where>` 에 status 조건이 없다) 그리고
 * `departmentId` 하나만 거른다(원시 DAO라 부서 스코프를 스스로 강제하지 않는다 — 호출부인
 * `DashboardServiceImpl.java:44-46` 이 유효 부서 ID 를 계산해 넘긴다, 정답지 R6·B16).
 */
export async function findRecent(db: DbConn, departmentId: number | null, limit: number): Promise<ProblemListItem[]> {
  const rows = await db
    .select({
      id: problems.id,
      type: problems.type,
      content: problems.content,
      status: problems.status,
      departmentId: problems.departmentId,
      departmentName: departments.name,
      createdAt: problems.createdAt,
      tags: sql<string[]>`COALESCE(array_agg(DISTINCT ${tags.name}) FILTER (WHERE ${tags.name} IS NOT NULL), '{}')`,
    })
    .from(problems)
    .innerJoin(departments, eq(departments.id, problems.departmentId))
    .leftJoin(problemTags, eq(problemTags.problemId, problems.id))
    .leftJoin(tags, eq(tags.id, problemTags.tagId))
    .where(departmentId != null ? eq(problems.departmentId, departmentId) : undefined)
    .groupBy(problems.id, departments.name)
    .orderBy(desc(problems.createdAt), desc(problems.id))
    .limit(limit);
  return rows;
}
