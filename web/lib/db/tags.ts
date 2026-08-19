import { asc, eq, inArray } from "drizzle-orm";
import type { DbConn } from "./client";
import { tags, problems, problemTags } from "./schema";

export type TagRow = { id: number; name: string; createdAt: Date };

// TagMapper.xml findAll 미러: `SELECT id, name, created_at ... ORDER BY name`.
// created_at 을 빼면 Tag 도메인(Tag.java) 을 그대로 내보내는 Spring 응답과 필드가 어긋난다.
export async function findAllTags(db: DbConn): Promise<TagRow[]> {
  return db.select({ id: tags.id, name: tags.name, createdAt: tags.createdAt })
    .from(tags).orderBy(asc(tags.name));
}

// 활성(ACTIVE) 문제에 하나 이상 붙어 있는 태그만 — 직원 풀이 화면의 필터 선택지용.
// TagMapper.xml findInUse 미러: tags JOIN problem_tags JOIN problems WHERE status='ACTIVE'.
export async function findInUseTags(db: DbConn): Promise<TagRow[]> {
  return db
    .selectDistinct({ id: tags.id, name: tags.name, createdAt: tags.createdAt })
    .from(tags)
    .innerJoin(problemTags, eq(problemTags.tagId, tags.id))
    .innerJoin(problems, eq(problems.id, problemTags.problemId))
    .where(eq(problems.status, "ACTIVE"))
    .orderBy(asc(tags.name));
}

// TagDao.findOrCreateByNames 미러: ON CONFLICT (name) DO NOTHING 으로 삽입한 뒤,
// 커밋된 최종 상태를 name IN (...) 으로 다시 읽는다. 빈 배열이면 DB 를 건드리지 않는다
// (엑셀에서 태그 없는 행이 흔하다).
export async function findOrCreateTagsByNames(db: DbConn, names: string[]): Promise<number[]> {
  if (names.length === 0) return [];
  await db.insert(tags).values(names.map((name) => ({ name }))).onConflictDoNothing({ target: tags.name });
  const rows = await db.select({ id: tags.id }).from(tags).where(inArray(tags.name, names));
  return rows.map((r) => r.id);
}

// ProblemTagDao.replaceTags 미러: 기존 연결을 모두 지우고 새 tagIds 로 다시 연결한다.
export async function replaceProblemTags(db: DbConn, problemId: number, tagIds: number[]): Promise<void> {
  await db.delete(problemTags).where(eq(problemTags.problemId, problemId));
  if (tagIds.length > 0) {
    await db.insert(problemTags).values(tagIds.map((tagId) => ({ problemId, tagId })));
  }
}

export async function findTagNamesByProblemId(db: DbConn, problemId: number): Promise<string[]> {
  const rows = await db
    .select({ name: tags.name })
    .from(problemTags)
    .innerJoin(tags, eq(tags.id, problemTags.tagId))
    .where(eq(problemTags.problemId, problemId))
    .orderBy(asc(tags.name));
  return rows.map((r) => r.name);
}
