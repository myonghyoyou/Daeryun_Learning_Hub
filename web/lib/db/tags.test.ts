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
    expect(second[0]).toBe(first[0]); // 회계는 같은 id
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
