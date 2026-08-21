import { and, desc, eq, ilike, sql } from "drizzle-orm";
import type { DbConn } from "./client";
import { departments, problems, problemTags, tags } from "./schema";

export type SolveListRow = {
  id: number; type: string; content: string;
  tags: string[]; departmentName: string; sourceNumber: number | null;
};

// ProblemMapper.xml:13(findAllActive) / :29(findRandomActive) 미러.
// tags 는 array_agg(DISTINCT ...) 라 이름 오름차순으로 나오고, 없으면 '{}' 다(정답지 S6).
const TAG_AGG = sql<string[]>`COALESCE(array_agg(DISTINCT ${tags.name}) FILTER (WHERE ${tags.name} IS NOT NULL), '{}')`;

function baseSelect(db: DbConn) {
  return db
    .select({
      id: problems.id, type: problems.type, content: problems.content,
      departmentName: departments.name, sourceNumber: problems.sourceNumber, tags: TAG_AGG,
    })
    .from(problems)
    .innerJoin(departments, eq(departments.id, problems.departmentId))
    .leftJoin(problemTags, eq(problemTags.problemId, problems.id))
    .leftJoin(tags, eq(tags.id, problemTags.tagId));
}

export async function findActiveSolveProblems(
  db: DbConn,
  filters: { keyword?: string | null; tag?: string | null },
): Promise<SolveListRow[]> {
  // 빈 문자열**만** 필터가 아니다 — MyBatis `<if test="... != null and ... != ''">` 미러.
  // **공백만 있는 값은 필터로 쓴다**(정답지 S5-1). OGNL 의 `"   " != ''` 는 참이라 Spring 은
  // ILIKE '%   %' 를 걸어 0건을 낸다 — 실측 확인. trim() 후 진리값으로 판단하면 전체가 나온다.
  const keyword = filters.keyword != null && filters.keyword !== "" ? filters.keyword : null;
  const tag = filters.tag != null && filters.tag !== "" ? filters.tag : null;

  const where = [eq(problems.status, "ACTIVE")];
  if (keyword) where.push(ilike(problems.content, `%${keyword}%`));
  if (tag) {
    where.push(sql`EXISTS (SELECT 1 FROM problem_tags fpt JOIN tags ft ON ft.id = fpt.tag_id
      WHERE fpt.problem_id = ${problems.id} AND lower(ft.name) = lower(${tag}))`);
  }

  // S9: 부서 필터가 **없다.** 직원은 전 부서 문제를 본다 — 관리자 목록과 다르다.
  //     "직원이니 자기 부서만 보여 주는 게 맞지 않나" 싶어도 넣지 마라. 파리티 위반이다.
  // ORDER BY 는 created_at DESC 뿐이다 — Java 에도 p.id 타이브레이커가 없다(정답지 S7).
  // 페이지네이션이 없어 중복·누락이 생기지 않으므로 그대로 이식한다.
  return baseSelect(db).where(and(...where))
    .groupBy(problems.id, departments.name)
    .orderBy(desc(problems.createdAt));
}

export async function findRandomActiveProblems(
  db: DbConn,
  input: { count: number; departmentId?: number | null },
): Promise<SolveListRow[]> {
  const where = [eq(problems.status, "ACTIVE")];
  if (input.departmentId != null) where.push(eq(problems.departmentId, input.departmentId));
  return baseSelect(db).where(and(...where))
    .groupBy(problems.id, departments.name)
    .orderBy(sql`random()`)
    .limit(input.count);
}
