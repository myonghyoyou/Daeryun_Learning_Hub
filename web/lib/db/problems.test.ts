import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { migrateTestDb, testDb, truncateAll } from "../../test/db";
import {
  insertProblem, findProblemById, findMaxSourceNumber,
  updateProblem, updateProblemStatus, updateDepartmentAndSourceNumber,
  listProblems, countProblems, findRecent, type ProblemListFilters,
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
  await truncateAll();
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

describe("problems DAO — 목록·총건수", () => {
  const noFilters: ProblemListFilters = {
    departmentId: null, type: null, status: null,
    createdFrom: null, createdTo: null, tag: null, keyword: null,
  };
  const firstPage = { ...noFilters, limit: 100, offset: 0 };

  async function seed(values: {
    content: string; type?: string; status?: "ACTIVE" | "ARCHIVED"; departmentId?: number;
    sourceNumber?: number | null; createdAt?: string; tags?: string[];
  }) {
    const id = await insertProblem(db, {
      type: values.type ?? "OX", content: values.content, status: values.status ?? "ACTIVE",
      departmentId: values.departmentId ?? deptA, sourceNumber: values.sourceNumber ?? null, createdBy: userId,
    });
    if (values.createdAt) {
      await db.update(problems).set({ createdAt: sql`${values.createdAt}::timestamp` }).where(eq(problems.id, id));
    }
    if (values.tags?.length) {
      await replaceProblemTags(db, id, await findOrCreateTagsByNames(db, values.tags));
    }
    return id;
  }

  it("찾은 행에 부서명과 태그 배열을 함께 싣는다", async () => {
    // 정답지 L14: {id,type,content,status,departmentId,departmentName,createdAt,tags}
    const id = await seed({ content: "SWOT 분석", type: "SHORT_ANSWER", tags: ["회계", "전략"] });
    const [item] = await listProblems(db, firstPage);
    expect(item.id).toBe(id);
    expect(item.type).toBe("SHORT_ANSWER");
    expect(item.content).toBe("SWOT 분석");
    expect(item.status).toBe("ACTIVE");
    expect(item.departmentId).toBe(deptA);
    expect(item.departmentName).toBe("가팀");
    expect(item.createdAt).toBeInstanceOf(Date);
    expect([...item.tags].sort()).toEqual(["전략", "회계"]);
  });

  it("태그가 없는 문제의 tags 는 빈 배열이다", async () => {
    // array_agg 의 FILTER/COALESCE 가 없으면 [null] 이 나가 화면이 빈 칩을 그린다.
    await seed({ content: "태그 없음" });
    expect((await listProblems(db, firstPage))[0].tags).toEqual([]);
  });

  it("countProblems 는 태그 수만큼 부풀지 않는다", async () => {
    // 정답지 L13: countAll 에 태그 조인을 두면 태그 3개짜리 문제 1건이 3건으로 세어진다.
    await seed({ content: "태그 셋", tags: ["가", "나", "다"] });
    expect(await countProblems(db, noFilters)).toBe(1);
    expect(await listProblems(db, firstPage)).toHaveLength(1);
  });

  it("created_at 이 같아도 p.id 타이브레이커로 전순서가 된다", async () => {
    // 정답지 L12: 엑셀 업로드는 created_at 이 같은 행을 무더기로 만든다. 타이브레이커가 없으면
    // LIMIT/OFFSET 페이징에서 중복·누락이 난다.
    const sameInstant = "2026-08-19 09:00:00";
    const ids: number[] = [];
    for (const n of [1, 2, 3, 4, 5, 6]) ids.push(await seed({ content: `행 ${n}`, sourceNumber: n, createdAt: sameInstant }));
    const paged: number[] = [];
    for (const offset of [0, 2, 4]) paged.push(...(await listProblems(db, { ...firstPage, limit: 2, offset })).map((i) => i.id));
    expect(paged).toEqual([...ids].sort((a, b) => b - a));
    expect(new Set(paged).size).toBe(6);
  });

  it("created_at 내림차순이 id 보다 우선한다", async () => {
    const older = await seed({ content: "예전", sourceNumber: 1, createdAt: "2026-08-01 09:00:00" });
    const newer = await seed({ content: "최근", sourceNumber: 2, createdAt: "2026-08-18 09:00:00" });
    expect((await listProblems(db, firstPage)).map((i) => i.id)).toEqual([newer, older]);
  });

  it("departmentId·type·status 필터가 각각 걸린다", async () => {
    await seed({ content: "가팀 OX", sourceNumber: 1 });
    await seed({ content: "나팀 OX", departmentId: deptB, sourceNumber: 1 });
    await seed({ content: "가팀 단답", type: "SHORT_ANSWER", sourceNumber: 2 });
    await seed({ content: "가팀 보관", status: "ARCHIVED", sourceNumber: 3 });

    expect(await countProblems(db, { ...noFilters, departmentId: deptB })).toBe(1);
    expect((await listProblems(db, { ...firstPage, departmentId: deptB }))[0].content).toBe("나팀 OX");
    expect(await countProblems(db, { ...noFilters, type: "SHORT_ANSWER" })).toBe(1);
    expect(await countProblems(db, { ...noFilters, status: "ARCHIVED" })).toBe(1);
    expect(await countProblems(db, { ...noFilters, status: "ACTIVE" })).toBe(3);
  });

  it("createdFrom 은 그 날 0시부터 포함한다", async () => {
    await seed({ content: "전날 늦게", sourceNumber: 1, createdAt: "2026-08-18 23:59:59" });
    await seed({ content: "당일 0시", sourceNumber: 2, createdAt: "2026-08-19 00:00:00" });
    const from = new Date(Date.UTC(2026, 7, 19));
    expect((await listProblems(db, { ...firstPage, createdFrom: from })).map((i) => i.content)).toEqual(["당일 0시"]);
  });

  it("createdTo 는 그 날 전체를 포함한다", async () => {
    // 정답지 L9: `< (createdTo + INTERVAL '1 day')` 가 아니면 그날 등록분이 통째로 빠진다.
    await seed({ content: "그날 23시", sourceNumber: 1, createdAt: "2026-08-19 23:59:59" });
    await seed({ content: "다음날 0시", sourceNumber: 2, createdAt: "2026-08-20 00:00:00" });
    const to = new Date(Date.UTC(2026, 7, 19));
    expect((await listProblems(db, { ...firstPage, createdTo: to })).map((i) => i.content)).toEqual(["그날 23시"]);
    expect(await countProblems(db, { ...noFilters, createdTo: to })).toBe(1);
  });

  it("tag 필터는 대소문자를 가리지 않고, 태그 하나만 맞아도 1건으로 센다", async () => {
    // 정답지 L10: 상관 서브쿼리라 조인 없이도 걸린다 — countProblems 도 같은 답을 내야 한다.
    await seed({ content: "회계 문제", sourceNumber: 1, tags: ["회계", "swot", "전략"] });
    await seed({ content: "무관", sourceNumber: 2, tags: ["기타"] });
    expect((await listProblems(db, { ...firstPage, tag: "회계" })).map((i) => i.content)).toEqual(["회계 문제"]);
    expect((await listProblems(db, { ...firstPage, tag: "SWOT" })).map((i) => i.content)).toEqual(["회계 문제"]);
    expect(await countProblems(db, { ...noFilters, tag: "SWOT" })).toBe(1);
    expect(await countProblems(db, { ...noFilters, tag: "없는태그" })).toBe(0);
  });

  it("keyword 는 본문 부분일치이고 대소문자를 가리지 않는다", async () => {
    // 정답지 L11: p.content ILIKE '%' || keyword || '%'
    await seed({ content: "SWOT 분석이란 무엇인가", sourceNumber: 1 });
    await seed({ content: "손익분기점", sourceNumber: 2 });
    expect((await listProblems(db, { ...firstPage, keyword: "swot" }))).toHaveLength(1);
    expect((await listProblems(db, { ...firstPage, keyword: "분석" }))).toHaveLength(1);
    expect(await countProblems(db, { ...noFilters, keyword: "swot" })).toBe(1);
  });

  it("목록과 총건수가 같은 필터 조각을 쓴다", async () => {
    // 두 벌로 갈라지면 총건수와 실제 결과가 어긋나 마지막 페이지가 빈다(ProblemMapper.xml:76-78).
    await seed({ content: "SWOT 가팀", sourceNumber: 1, tags: ["회계"], createdAt: "2026-08-19 10:00:00" });
    await seed({ content: "SWOT 나팀", departmentId: deptB, sourceNumber: 1, tags: ["회계"], createdAt: "2026-08-19 10:00:00" });
    await seed({ content: "다른 본문", sourceNumber: 2, tags: ["회계"], createdAt: "2026-08-19 10:00:00" });
    const filters: ProblemListFilters = {
      departmentId: deptA, type: "OX", status: "ACTIVE",
      createdFrom: new Date(Date.UTC(2026, 7, 19)), createdTo: new Date(Date.UTC(2026, 7, 19)),
      tag: "회계", keyword: "swot",
    };
    expect(await countProblems(db, filters)).toBe(1);
    expect(await listProblems(db, { ...filters, limit: 100, offset: 0 })).toHaveLength(1);
  });
});

describe("problems DAO — findRecent (B13·B14·B16)", () => {
  async function seed(values: {
    content: string; status?: "ACTIVE" | "ARCHIVED"; departmentId?: number;
    sourceNumber?: number | null; createdAt?: string; tags?: string[];
  }) {
    const id = await insertProblem(db, {
      type: "OX", content: values.content, status: values.status ?? "ACTIVE",
      departmentId: values.departmentId ?? deptA, sourceNumber: values.sourceNumber ?? null, createdBy: userId,
    });
    if (values.createdAt) {
      await db.update(problems).set({ createdAt: sql`${values.createdAt}::timestamp` }).where(eq(problems.id, id));
    }
    if (values.tags?.length) {
      await replaceProblemTags(db, id, await findOrCreateTagsByNames(db, values.tags));
    }
    return id;
  }

  it("B14: 상태 필터가 없다 — 보관 문제도 나온다", async () => {
    const archived = await seed({ content: "보관", status: "ARCHIVED", sourceNumber: 1, createdAt: "2026-08-19 10:00:00" });
    const active = await seed({ content: "활성", sourceNumber: 2, createdAt: "2026-08-18 10:00:00" });
    const items = await findRecent(db, null, 5);
    expect(items.map((i) => i.id)).toEqual([archived, active]); // 최신순 — 보관본이 더 최근이면 먼저 나온다
  });

  it("B13: created_at DESC, p.id DESC — 동시각은 id 로 끊는다", async () => {
    const sameInstant = "2026-08-19 09:00:00";
    const ids: number[] = [];
    for (const n of [1, 2, 3]) ids.push(await seed({ content: `행 ${n}`, sourceNumber: n, createdAt: sameInstant }));
    const items = await findRecent(db, null, 10);
    expect(items.map((i) => i.id)).toEqual([...ids].sort((a, b) => b - a));
  });

  it("B13: 최대 5건으로 잘린다", async () => {
    for (let n = 1; n <= 7; n++) await seed({ content: `행 ${n}`, sourceNumber: n, createdAt: `2026-08-${10 + n} 09:00:00` });
    expect(await findRecent(db, null, 5)).toHaveLength(5);
  });

  it("departmentId 로 거르면 다른 부서는 안 나온다(B16 이 넘겨줄 scope 를 DAO 가 실제로 적용하는지)", async () => {
    const own = await seed({ content: "가팀", sourceNumber: 1 });
    await seed({ content: "나팀", departmentId: deptB, sourceNumber: 1 });
    const items = await findRecent(db, deptA, 10);
    expect(items.map((i) => i.id)).toEqual([own]);
  });

  it("departmentId 가 null 이면 전 부서가 나온다", async () => {
    await seed({ content: "가팀", sourceNumber: 1 });
    await seed({ content: "나팀", departmentId: deptB, sourceNumber: 1 });
    expect(await findRecent(db, null, 10)).toHaveLength(2);
  });

  it("응답 필드는 ProblemListItem 이다 — id 를 쓴다(정답지 B15 의 비대칭 절반)", async () => {
    const id = await seed({ content: "본문", sourceNumber: 1, tags: ["태그"] });
    const [item] = await findRecent(db, null, 5);
    expect(Object.keys(item).sort()).toEqual(["content", "createdAt", "departmentId",
      "departmentName", "id", "status", "tags", "track", "type"]);
    expect(item.id).toBe(id);
    expect(item.tags).toEqual(["태그"]);
  });
});
