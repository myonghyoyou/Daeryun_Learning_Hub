import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { migrateTestDb, testDb, truncateAll } from "../../test/db";
import { departments, problemBlanks, problemChoices, problems, users } from "../db/schema";
import { BizError } from "../http/errors";
import {
  getSolveDetail, listSolveProblems, randomSolveSet, selectRandomBlankKeys,
} from "./solveQueryService";

const db = testDb();
let deptId = 0;
let userId = 0;

beforeAll(async () => { await migrateTestDb(); });
beforeEach(async () => {
  await truncateAll();
  [{ id: deptId }] = await db.insert(departments)
    .values({ name: "가팀", code: "A", status: "ACTIVE" }).returning({ id: departments.id });
  // problems.created_by 는 NOT NULL + users FK 다 — 문제를 만들려면 사용자가 먼저다.
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

async function seedMcq() {
  const id = await seed({ type: "MCQ_SINGLE" });
  await db.insert(problemChoices).values([
    { problemId: id, choiceText: "가", isCorrect: true, displayOrder: 1 },
    { problemId: id, choiceText: "나", isCorrect: false, displayOrder: 2 },
  ]);
  return id;
}

async function seedShort() {
  return seed({ type: "SHORT_ANSWER" });
}

async function seedFillBlank(blankKeys: string[], revealCount: number) {
  const id = await seed({ type: "FILL_BLANK", blankRevealCount: revealCount });
  await db.insert(problemBlanks).values(
    blankKeys.map((k, i) => ({ problemId: id, blankKey: k, answerText: `정답-${k}`, displayOrder: i + 1 })),
  );
  return id;
}

describe("getSolveDetail", () => {
  it("Q1: 없는 문제와 보관된 문제가 같은 문구다", async () => {
    await expect(getSolveDetail(db, 999999)).rejects
      .toMatchObject({ message: "존재하지 않거나 보관된 문제입니다." });
    const archived = await seed({ status: "ARCHIVED" });
    await expect(getSolveDetail(db, archived)).rejects
      .toMatchObject({ message: "존재하지 않거나 보관된 문제입니다." });
  });

  it("Q1: BizError 이고 INPUT_VALUE_INVALID 코드다", async () => {
    await expect(getSolveDetail(db, 999999)).rejects.toBeInstanceOf(BizError);
  });

  it("Q2/Q3: 객관식 보기는 {id, text} 뿐이고 정답 플래그가 없다", async () => {
    const mcqId = await seedMcq();
    const detail = await getSolveDetail(db, mcqId);
    expect(Object.keys(detail.choices![0]).sort()).toEqual(["id", "text"]);
    expect(JSON.stringify(detail)).not.toContain("isCorrect");
    expect(JSON.stringify(detail)).not.toContain("choiceText");
  });

  it("Q11: 응답 전체에 정답성 키가 하나도 없다", async () => {
    const mcqId = await seedMcq();
    const oxId = await seed({ type: "OX" });
    const shortId = await seedShort();
    const blankId = await seedFillBlank(["a", "b"], 1);
    for (const id of [mcqId, oxId, shortId, blankId]) {
      const json = JSON.stringify(await getSolveDetail(db, id));
      for (const leak of ["\"correct\"", "\"isCorrect\"", "\"explanation\""]) {
        expect(json).not.toContain(leak);
      }
    }
  });

  it("Q4: 단답은 choices·blanksToAnswer·revealedBlanks 가 전부 null 이다", async () => {
    const shortId = await seedShort();
    const d = await getSolveDetail(db, shortId);
    expect([d.choices, d.blanksToAnswer, d.revealedBlanks]).toEqual([null, null, null]);
  });

  it("Q5/Q6: 빈칸은 revealCount 개만 묻고 나머지는 정답째로 공개한다", async () => {
    const blank3Id = await seedFillBlank(["a", "b", "c"], 1);
    const d = await getSolveDetail(db, blank3Id);
    expect(d.blanksToAnswer!.length).toBe(1);
    expect(d.revealedBlanks!.length).toBe(2);
    expect(d.revealedBlanks![0].answerText).toBeTruthy();
    expect(d.revealedBlanks!.map((b) => b.blankKey)).not.toContain(d.blanksToAnswer![0]);
  });

  it("Q6-1: 전부 묻는 문제면 revealedBlanks 는 빈 배열이지 null 이 아니다", async () => {
    const blankAllId = await seedFillBlank(["a", "b"], 2);
    const d = await getSolveDetail(db, blankAllId);
    expect(d.revealedBlanks).toEqual([]);
  });

  it("Q7: FILL_BLANK 는 choices 가 null 이다", async () => {
    const blankId = await seedFillBlank(["a"], 1);
    expect((await getSolveDetail(db, blankId)).choices).toBeNull();
  });

  it("Q10: 부서명은 별도 조회다", async () => {
    const mcqId = await seedMcq();
    expect((await getSolveDetail(db, mcqId)).departmentName).toBe("가팀");
  });

  it("Q12: imageUrl 은 저장된 값 그대로다", async () => {
    const id = await seed({ imageUrl: "/api/problem-images/x.png" });
    expect((await getSolveDetail(db, id)).imageUrl).toBe("/api/problem-images/x.png");
  });
});

// selectRandomBlankKeys 는 순수 함수라 무작위여도 성질은 결정적으로 고정된다(Q8·Q9).
describe("selectRandomBlankKeys", () => {
  it("Q8: count 개를 고르고, 원본의 부분집합이며, 중복이 없다", () => {
    const keys = ["a", "b", "c", "d"];
    for (let i = 0; i < 50; i++) {
      const picked = selectRandomBlankKeys(keys, 2);
      expect(picked).toHaveLength(2);
      expect(new Set(picked).size).toBe(2);
      expect(picked.every((k) => keys.includes(k))).toBe(true);
    }
  });

  it("Q8: 실제로 섞인다 — 50회 중 두 가지 이상의 결과가 나온다", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 50; i++) seen.add(selectRandomBlankKeys(["a", "b", "c"], 2).join(","));
    expect(seen.size).toBeGreaterThan(1);
  });

  it("Q9: count 가 빈칸 수보다 크면 전체를 돌려준다 — 오류가 아니다", () => {
    expect(selectRandomBlankKeys(["a", "b"], 5)).toHaveLength(2);
  });

  it("빈 배열이면 빈 배열", () => expect(selectRandomBlankKeys([], 3)).toEqual([]));
});

describe("listSolveProblems / randomSolveSet", () => {
  it("목록·랜덤은 findActiveSolveProblems·findRandomActiveProblems 를 그대로 위임한다", async () => {
    await seed({ content: "본문1" });
    await seed({ content: "본문2" });
    expect((await listSolveProblems(db, {})).length).toBe(2);
    expect((await randomSolveSet(db, { count: 1 })).length).toBe(1);
  });
});
