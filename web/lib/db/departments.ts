import { and, asc, eq } from "drizzle-orm";
import type { DbConn } from "./client";
import { departments, problems } from "./schema";
import type { Track } from "../problem/track";

export async function findAllDepartments(db: DbConn) {
  return db.select().from(departments).orderBy(asc(departments.name));
}
/**
 * 그 직군의 ACTIVE 문제가 하나 이상 있는 활성 부서만. 랜덤 풀이의 부서 선택지다.
 *
 * 거르는 규칙이 `findTeamCounts`(lib/db/solveTeams.ts) 와 **같아야 한다** — 어긋나면
 * 랜덤에서는 고를 수 있는데 팀 대항에는 없는 부서가 생긴다.
 *
 * DepartmentMapper.xml:24-26 findAllActive 를 대신한다. 관리자 목록(findAllDepartments)과는
 * 다른 쿼리다 — 여기는 활성만이고 id·name·code 3필드로 줄인다.
 */
export async function findDepartmentsWithProblems(db: DbConn, track: Track) {
  return db.selectDistinct({ id: departments.id, name: departments.name, code: departments.code })
    .from(departments)
    .innerJoin(problems, eq(problems.departmentId, departments.id))
    .where(and(
      eq(departments.status, "ACTIVE"),
      eq(problems.status, "ACTIVE"),
      eq(problems.track, track),
    ))
    .orderBy(asc(departments.name));
}
export async function findDepartmentById(db: DbConn, id: number) {
  return (await db.select().from(departments).where(eq(departments.id, id)).limit(1))[0];
}
export async function findDepartmentByCode(db: DbConn, code: string) {
  return (await db.select().from(departments).where(eq(departments.code, code)).limit(1))[0];
}
export async function insertDepartment(db: DbConn, input: { name: string; code: string }) {
  const [row] = await db.insert(departments).values({ name: input.name, code: input.code, status: "ACTIVE" }).returning();
  return row;
}
export async function updateDepartment(db: DbConn, input: { id: number; name: string; status: string }) {
  await db.update(departments).set({ name: input.name, status: input.status }).where(eq(departments.id, input.id));
}
