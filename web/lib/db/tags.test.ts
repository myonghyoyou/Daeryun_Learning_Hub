import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { migrateTestDb, testDb, truncateAll } from "../../test/db";
import { findAllTags, findInUseTags, findOrCreateTagsByNames, replaceProblemTags, findTagNamesByProblemId } from "./tags";
import { insertProblem } from "./problems";
import { departments, users } from "./schema";

const db = testDb();
let deptId = 0, userId = 0, problemId = 0;

beforeAll(async () => { await migrateTestDb(); });
beforeEach(async () => {
  await truncateAll(db);
  [{ id: deptId }] = await db.insert(departments).values({ name: "가팀", code: "A", status: "ACTIVE" }).returning({ id: departments.id });
  [{ id: userId }] = await db.insert(users).values({
    employeeNo: "admin", name: "관리자", email: "a@b.c", passwordHash: "x",
    departmentId: deptId, role: "SUPER_ADMIN", status: "ACTIVE", mustChangePassword: false,
  }).returning({ id: users.id });
  problemId = await insertProblem(db, {
    type: "OX", content: "본문", status: "ACTIVE", departmentId: deptId, sourceNumber: 1, createdBy: userId,
  });
});

describe("tags DAO", () => {
  it("findOrCreateTagsByNames 는 있는 태그를 다시 만들지 않는다", async () => {
    const first = await findOrCreateTagsByNames(db, ["회계", "자금"]);
    const second = await findOrCreateTagsByNames(db, ["회계", "예산"]);
    // 반환 순서로 단정하지 않는다 — TagMapper.findIdsByNames 도 이 DAO 도 `WHERE name IN (...)`
    // 에 ORDER BY 가 없어서, 플래너가 unique 인덱스를 타면 결과가 이름순으로 나온다.
    // 인덱스 스캔으로 계획이 바뀌는 순간 second[0]===first[0] 같은 단정은 무너진다.
    expect(first).toHaveLength(2);
    expect(second).toHaveLength(2);
    // 겹치는 "회계" 가 재생성되면 합집합이 4가 된다 — 순서와 무관하게 id 재사용을 증명한다.
    expect(new Set([...first, ...second]).size).toBe(3); // 회계·자금·예산
  });

  it("findOrCreateTagsByNames 는 빈 배열을 받으면 DB 를 건드리지 않고 [] 를 돌려준다", async () => {
    expect(await findOrCreateTagsByNames(db, [])).toEqual([]);
    expect(await findAllTags(db)).toEqual([]);
  });

  it("replaceProblemTags 는 기존 연결을 지우고 새로 건다", async () => {
    const ids = await findOrCreateTagsByNames(db, ["가", "나"]);
    await replaceProblemTags(db, problemId, ids);
    const only = await findOrCreateTagsByNames(db, ["다"]);
    await replaceProblemTags(db, problemId, only);
    expect(await findTagNamesByProblemId(db, problemId)).toEqual(["다"]);
  });

  it("replaceProblemTags 는 빈 배열을 받으면 연결을 전부 지운다", async () => {
    // 엑셀 업로드에서 태그 칸이 빈 행이 흔하다 — tagIds.length > 0 가드가 delete 까지
    // 건너뛰면 수정 시 예전 태그가 그대로 남는다.
    const ids = await findOrCreateTagsByNames(db, ["가", "나"]);
    await replaceProblemTags(db, problemId, ids);
    await replaceProblemTags(db, problemId, []);
    expect(await findTagNamesByProblemId(db, problemId)).toEqual([]);
    // 태그 마스터는 지우지 않는다 — 연결만 끊는다(ProblemTagMapper.deleteByProblemId).
    expect((await findAllTags(db)).map((t) => t.name)).toEqual(["가", "나"]);
  });

  it("findAllTags 는 created_at 까지 돌려준다", async () => {
    // TagMapper.xml findAll 은 id, name, created_at 을 고른다(Tag.java 필드 3개).
    await findOrCreateTagsByNames(db, ["가"]);
    const [row] = await findAllTags(db);
    expect(row.createdAt).toBeInstanceOf(Date);
  });

  it("findInUseTags 는 문제에 연결된 태그만 돌려준다", async () => {
    const [used] = await findOrCreateTagsByNames(db, ["쓰임"]);
    await findOrCreateTagsByNames(db, ["안쓰임"]);
    await replaceProblemTags(db, problemId, [used]);
    expect((await findInUseTags(db)).map((t) => t.name)).toEqual(["쓰임"]);
  });

  it("findInUseTags 는 보관된 문제에 붙은 태그는 제외한다", async () => {
    const archived = await insertProblem(db, {
      type: "OX", content: "보관", status: "ARCHIVED", departmentId: deptId, sourceNumber: 2, createdBy: userId,
    });
    const [tagId] = await findOrCreateTagsByNames(db, ["보관태그"]);
    await replaceProblemTags(db, archived, [tagId]);
    expect(await findInUseTags(db)).toEqual([]);
  });

  it("findAllTags 는 이름 오름차순으로 전체 태그를 돌려준다", async () => {
    await findOrCreateTagsByNames(db, ["다", "가", "나"]);
    expect((await findAllTags(db)).map((t) => t.name)).toEqual(["가", "나", "다"]);
  });
});
