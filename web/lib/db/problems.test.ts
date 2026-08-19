import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { migrateTestDb, testDb, truncateAll } from "../../test/db";
import {
  insertProblem, findProblemById, findMaxSourceNumber,
  updateProblem, updateProblemStatus, updateDepartmentAndSourceNumber,
} from "./problems";
import { insertChoices, findChoicesByProblemId } from "./problemParts";
import { findAllTags, findOrCreateTagsByNames, findTagNamesByProblemId, replaceProblemTags } from "./tags";
import { departments, problemChoices, problems, problemTags, users } from "./schema";

// updated_at 검증용. now() 는 트랜잭션 시작 시각이라, 삽입과 수정이 같은 마이크로초에
// 걸리면 두 값이 같아질 수 있다. 그래서 값을 비교하기 전에 행을 과거로 밀어 두고
// (created_at 도 함께) 엄격한 부등호로 확인한다 — 시계 해상도에 기대지 않는다.
async function backdate(id: number) {
  await db.update(problems)
    .set({ createdAt: sql`now() - interval '1 hour'`, updatedAt: sql`now() - interval '1 hour'` })
    .where(eq(problems.id, id));
  const row = await findProblemById(db, id);
  return row!.updatedAt;
}

const db = testDb();
let deptA = 0, deptB = 0, userId = 0;

beforeAll(async () => { await migrateTestDb(); });
beforeEach(async () => {
  await truncateAll(db);
  [{ id: deptA }] = await db.insert(departments).values({ name: "가팀", code: "A", status: "ACTIVE" }).returning({ id: departments.id });
  [{ id: deptB }] = await db.insert(departments).values({ name: "나팀", code: "B", status: "ACTIVE" }).returning({ id: departments.id });
  [{ id: userId }] = await db.insert(users).values({
    employeeNo: "admin", name: "관리자", email: "a@b.c", passwordHash: "x",
    departmentId: deptA, role: "SUPER_ADMIN", status: "ACTIVE", mustChangePassword: false,
  }).returning({ id: users.id });
});

describe("problems DAO", () => {
  it("insert 한 값을 그대로 읽어 온다", async () => {
    const id = await insertProblem(db, {
      type: "OX", content: "본문", status: "ACTIVE",
      departmentId: deptA, sourceNumber: 7, createdBy: userId,
    });
    const row = await findProblemById(db, id);
    expect(row?.sourceNumber).toBe(7);
    expect(row?.departmentId).toBe(deptA);
    expect(row?.type).toBe("OX");
  });

  it("findMaxSourceNumber 는 보관된 문제도 센다", async () => {
    // spec D5: 번호는 재사용하지 않는다. 보관된 문제가 번호를 계속 점유한다.
    // 보관본에 더 높은 번호를 주어, 상태 필터가 끼어들면 실패하는 모양으로 고정한다.
    await insertProblem(db, { type: "OX", content: "활성", status: "ACTIVE", departmentId: deptA, sourceNumber: 5, createdBy: userId });
    await insertProblem(db, { type: "OX", content: "보관", status: "ARCHIVED", departmentId: deptA, sourceNumber: 9, createdBy: userId });
    expect(await findMaxSourceNumber(db, deptA)).toBe(9);
  });

  it("findMaxSourceNumber 는 다른 부서를 세지 않는다", async () => {
    await insertProblem(db, { type: "OX", content: "가", status: "ACTIVE", departmentId: deptA, sourceNumber: 100, createdBy: userId });
    expect(await findMaxSourceNumber(db, deptB)).toBeNull();
  });

  it("번호가 없는 행은 같은 부서에 여러 개 공존한다", async () => {
    // PostgreSQL 의 UNIQUE 는 NULL 을 서로 다른 값으로 본다. 기존 데이터가 이 상태다.
    await insertProblem(db, { type: "OX", content: "1", status: "ACTIVE", departmentId: deptA, sourceNumber: null, createdBy: userId });
    await insertProblem(db, { type: "OX", content: "2", status: "ACTIVE", departmentId: deptA, sourceNumber: null, createdBy: userId });
    expect(await findMaxSourceNumber(db, deptA)).toBeNull();
  });

  it("같은 부서에 같은 번호를 넣으면 23505 로 거부된다", async () => {
    await insertProblem(db, { type: "OX", content: "1", status: "ACTIVE", departmentId: deptA, sourceNumber: 3, createdBy: userId });
    await expect(
      insertProblem(db, { type: "OX", content: "2", status: "ACTIVE", departmentId: deptA, sourceNumber: 3, createdBy: userId }),
    ).rejects.toMatchObject({ code: "23505", constraint_name: "uq_problems_department_source_number" });
  });

  it("updateDepartmentAndSourceNumber 는 두 컬럼을 함께 바꾼다", async () => {
    const id = await insertProblem(db, { type: "OX", content: "x", status: "ACTIVE", departmentId: deptA, sourceNumber: 1, createdBy: userId });
    await updateDepartmentAndSourceNumber(db, id, deptB, 41);
    const row = await findProblemById(db, id);
    expect(row?.departmentId).toBe(deptB);
    expect(row?.sourceNumber).toBe(41);
  });
});

describe("problems DAO — updated_at", () => {
  // ProblemMapper.xml 의 세 UPDATE 는 모두 `updated_at = now()` 로 끝난다(:62,:67,:72).
  // DB 기본값은 INSERT 때만 걸리고 트리거도 없으므로, DAO 가 쓰지 않으면 영원히
  // updated_at == created_at 인 채로 남는다 — 아무도 읽지 않아서 조용히 썩는 종류의 결함이다.
  async function seed() {
    const id = await insertProblem(db, {
      type: "OX", content: "본문", status: "ACTIVE", departmentId: deptA, sourceNumber: 1, createdBy: userId,
    });
    return { id, before: await backdate(id) };
  }

  it("updateProblem 은 updated_at 을 현재 시각으로 올린다", async () => {
    const { id, before } = await seed();
    await updateProblem(db, id, { content: "고친 본문" });
    const row = await findProblemById(db, id);
    expect(row?.content).toBe("고친 본문");
    expect(row!.updatedAt.getTime()).toBeGreaterThan(before.getTime());
    expect(row!.updatedAt.getTime()).toBeGreaterThan(row!.createdAt.getTime());
  });

  it("updateProblemStatus 는 updated_at 을 현재 시각으로 올린다", async () => {
    const { id, before } = await seed();
    await updateProblemStatus(db, id, "ARCHIVED");
    const row = await findProblemById(db, id);
    expect(row?.status).toBe("ARCHIVED");
    expect(row!.updatedAt.getTime()).toBeGreaterThan(before.getTime());
    expect(row!.updatedAt.getTime()).toBeGreaterThan(row!.createdAt.getTime());
  });

  it("updateDepartmentAndSourceNumber 는 updated_at 을 현재 시각으로 올린다", async () => {
    const { id, before } = await seed();
    await updateDepartmentAndSourceNumber(db, id, deptB, 41);
    const row = await findProblemById(db, id);
    expect(row?.departmentId).toBe(deptB);
    expect(row!.updatedAt.getTime()).toBeGreaterThan(before.getTime());
    expect(row!.updatedAt.getTime()).toBeGreaterThan(row!.createdAt.getTime());
  });
});

describe("DAO 트랜잭션 합성", () => {
  // M2 의 핵심 설계 주장: 모든 DAO 가 DbConn 을 받으므로 Task 9(엑셀 일괄 등록)의
  // 행별 트랜잭션에 그대로 조립된다 — 한 행이 실패해도 이미 커밋된 행은 남아야 한다.
  it("트랜잭션 안의 문제·보기·태그는 함께 롤백되고, 바깥에서 넣은 행은 살아남는다", async () => {
    const survivor = await insertProblem(db, {
      type: "OX", content: "살아남는 행", status: "ACTIVE", departmentId: deptA, sourceNumber: 1, createdBy: userId,
    });
    const survivorTags = await findOrCreateTagsByNames(db, ["유지"]);
    await replaceProblemTags(db, survivor, survivorTags);

    await expect(
      db.transaction(async (tx) => {
        const doomed = await insertProblem(tx, {
          type: "OX", content: "롤백될 행", status: "ACTIVE", departmentId: deptA, sourceNumber: 2, createdBy: userId,
        });
        await insertChoices(tx, [
          { problemId: doomed, choiceText: "O", isCorrect: true },
          { problemId: doomed, choiceText: "X", isCorrect: false },
        ]);
        const tagIds = await findOrCreateTagsByNames(tx, ["롤백"]);
        await replaceProblemTags(tx, doomed, tagIds);
        // 여기까지는 tx 안에서 실제로 보인다 — 롤백 대상이 비어 있어서 통과하는 것을 막는다.
        expect(await findChoicesByProblemId(tx, doomed)).toHaveLength(2);
        expect(await findTagNamesByProblemId(tx, doomed)).toEqual(["롤백"]);
        throw new Error("행 실패");
      }),
    ).rejects.toThrow("행 실패");

    // 롤백된 것: 문제·보기·태그·연결 전부
    expect((await db.select({ id: problems.id }).from(problems)).map((r) => r.id)).toEqual([survivor]);
    expect(await db.select({ id: problemChoices.id }).from(problemChoices)).toEqual([]);
    expect((await findAllTags(db)).map((t) => t.name)).toEqual(["유지"]);
    expect(await db.select({ tagId: problemTags.tagId }).from(problemTags)).toHaveLength(1);

    // 바깥에서 커밋된 행은 그대로다
    expect(await findProblemById(db, survivor)).not.toBeNull();
    expect(await findTagNamesByProblemId(db, survivor)).toEqual(["유지"]);
  });
});
