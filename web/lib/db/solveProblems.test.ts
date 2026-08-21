import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { migrateTestDb, testDb, truncateAll } from "../../test/db";
import { departments, problems, tags, problemTags, users } from "./schema";
import { findActiveSolveProblems, findRandomActiveProblems } from "./solveProblems";

const db = testDb();
let deptId = 0;
let userId = 0;

beforeAll(async () => { await migrateTestDb(); });
beforeEach(async () => {
  await truncateAll();
  [{ id: deptId }] = await db.insert(departments)
    .values({ name: "가팀", code: "A", status: "ACTIVE" }).returning({ id: departments.id });
  // problems.created_by 는 NOT NULL + users FK 다(schema.ts). 문제를 만들려면 사용자가 먼저다 —
  // 기존 lib/db/problems.test.ts:30-36 과 같은 형태를 쓴다.
  [{ id: userId }] = await db.insert(users).values({
    employeeNo: "admin", name: "관리자", email: "a@b.c", passwordHash: "x",
    departmentId: deptId, role: "SUPER_ADMIN", status: "ACTIVE", mustChangePassword: false,
  }).returning({ id: users.id });
});

async function seed(over: Partial<typeof problems.$inferInsert> = {}) {
  const [row] = await db.insert(problems).values({
    type: "OX", content: "본문", departmentId: deptId, status: "ACTIVE",
    createdBy: userId, sourceNumber: null, ...over,
  }).returning({ id: problems.id });
  return row.id;
}

describe("findActiveSolveProblems", () => {
  it("S9: 부서 필터가 없다 — 직원은 전 부서 문제를 본다", async () => {
    // 리뷰에서 변이로 드러난 구멍이다. 부서 필터를 하드코딩해도 나머지 테스트가 전부
    // 통과했다 — 두 번째 부서를 심는 테스트가 하나도 없었기 때문이다.
    // 정답지 S9 가 "직원이니 자기 부서만 보여 주는 게 맞지 않나 싶어도 넣지 마라" 고
    // 경고하는 자리라, 그 유혹이 실제로 코드에 들어오면 여기서 잡힌다.
    const [other] = await db.insert(departments)
      .values({ name: "나팀", code: "B", status: "ACTIVE" }).returning({ id: departments.id });
    await seed({ content: "가팀 문제" });
    await seed({ content: "나팀 문제", departmentId: other.id });
    const rows = await findActiveSolveProblems(db, {});
    expect(rows.map((r) => r.departmentName).sort()).toEqual(["가팀", "나팀"]);
  });

  it("S2: ARCHIVED 는 제외한다", async () => {
    await seed({ content: "살아있음" });
    await seed({ content: "보관됨", status: "ARCHIVED" });
    const rows = await findActiveSolveProblems(db, {});
    expect(rows.map((r) => r.content)).toEqual(["살아있음"]);
  });

  it("S3: keyword 는 대소문자를 무시하고 부분 일치한다", async () => {
    await seed({ content: "SWOT 분석" });
    await seed({ content: "무관" });
    expect((await findActiveSolveProblems(db, { keyword: "swot" })).length).toBe(1);
  });

  it("S5: keyword 가 빈 문자열이면 필터를 적용하지 않는다", async () => {
    await seed(); await seed();
    expect((await findActiveSolveProblems(db, { keyword: "" })).length).toBe(2);
  });

  it("S4: tag 는 대소문자를 무시하고 정확히 일치해야 한다", async () => {
    const pid = await seed();
    const [tag] = await db.insert(tags).values({ name: "Alpha" }).returning({ id: tags.id });
    await db.insert(problemTags).values({ problemId: pid, tagId: tag.id });
    expect((await findActiveSolveProblems(db, { tag: "alpha" })).length).toBe(1);
    // 부분 일치가 아니다 — 'Alph' 로는 안 잡힌다.
    expect((await findActiveSolveProblems(db, { tag: "Alph" })).length).toBe(0);
  });

  it("S6: tags 는 이름 오름차순이고, 없으면 빈 배열이다", async () => {
    const pid = await seed();
    const rows = await db.insert(tags).values([{ name: "나" }, { name: "가" }]).returning({ id: tags.id });
    await db.insert(problemTags).values(rows.map((t) => ({ problemId: pid, tagId: t.id })));
    await seed({ content: "태그없음" });
    const list = await findActiveSolveProblems(db, {});
    expect(list.find((r) => r.id === pid)!.tags).toEqual(["가", "나"]);
    expect(list.find((r) => r.content === "태그없음")!.tags).toEqual([]);
  });

  it("S10: 태그가 여러 개여도 행이 부풀지 않는다", async () => {
    const pid = await seed();
    const rows = await db.insert(tags).values([{ name: "t1" }, { name: "t2" }, { name: "t3" }])
      .returning({ id: tags.id });
    await db.insert(problemTags).values(rows.map((t) => ({ problemId: pid, tagId: t.id })));
    expect((await findActiveSolveProblems(db, {})).length).toBe(1);
  });

  it("S1: 페이지네이션이 없다 — 전부 돌려준다", async () => {
    // 승인된 이탈 ㉰. 나중에 누가 LIMIT 을 '성능 개선'으로 끼워 넣으면 이 테스트가 잡는다.
    for (let i = 0; i < 30; i++) await seed({ content: `q${i}` });
    expect((await findActiveSolveProblems(db, {})).length).toBe(30);
  });

  it("S8: 응답 필드가 정확히 6개이고 정답 관련 필드가 없다", async () => {
    // 정답 비노출은 상세(Q11)만의 문제가 아니다. 목록이 새면 똑같이 망가진다.
    await seed();
    const row = (await findActiveSolveProblems(db, {}))[0];
    expect(Object.keys(row).sort()).toEqual(
      ["content", "departmentName", "id", "sourceNumber", "tags", "type"]);
    for (const leak of ["isCorrect", "explanation", "answerText", "choiceText"]) {
      expect(JSON.stringify(row)).not.toContain(leak);
    }
  });
});

describe("findRandomActiveProblems", () => {
  it("P8: count 만큼만 돌려준다", async () => {
    for (let i = 0; i < 5; i++) await seed({ content: `q${i}` });
    expect((await findRandomActiveProblems(db, { count: 3 })).length).toBe(3);
  });

  it("P6: 있는 문제가 count 보다 적으면 있는 만큼만 — 오류가 아니다", async () => {
    await seed();
    expect((await findRandomActiveProblems(db, { count: 10 })).length).toBe(1);
  });

  it("P7: departmentId 를 주면 그 부서만", async () => {
    const [other] = await db.insert(departments)
      .values({ name: "나팀", code: "B", status: "ACTIVE" }).returning({ id: departments.id });
    await seed();
    await seed({ departmentId: other.id });
    const rows = await findRandomActiveProblems(db, { count: 10, departmentId: other.id });
    expect(rows.map((r) => r.departmentName)).toEqual(["나팀"]);
  });

  it("S2 와 같은 규칙: ARCHIVED 는 랜덤에도 안 나온다", async () => {
    await seed({ status: "ARCHIVED" });
    expect((await findRandomActiveProblems(db, { count: 10 })).length).toBe(0);
  });
});
