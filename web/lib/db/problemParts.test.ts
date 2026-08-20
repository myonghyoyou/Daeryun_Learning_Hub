import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { migrateTestDb, testDb, truncateAll } from "../../test/db";
import { insertProblem } from "./problems";
import {
  insertChoices, findChoicesByProblemId, deleteChoicesByProblemId,
  insertAnswers, findAnswersByProblemId, deleteAnswersByProblemId,
  insertBlanks, findBlanksByProblemId, deleteBlanksByProblemId,
} from "./problemParts";
import { departments, users } from "./schema";

const db = testDb();
let deptId = 0, userId = 0, problemId = 0;

beforeAll(async () => { await migrateTestDb(); });
beforeEach(async () => {
  await truncateAll();
  [{ id: deptId }] = await db.insert(departments).values({ name: "가팀", code: "A", status: "ACTIVE" }).returning({ id: departments.id });
  [{ id: userId }] = await db.insert(users).values({
    employeeNo: "admin", name: "관리자", email: "a@b.c", passwordHash: "x",
    departmentId: deptId, role: "SUPER_ADMIN", status: "ACTIVE", mustChangePassword: false,
  }).returning({ id: users.id });
  problemId = await insertProblem(db, {
    type: "MCQ_SINGLE", content: "본문", status: "ACTIVE",
    departmentId: deptId, sourceNumber: 1, createdBy: userId,
  });
});

describe("problem choices DAO", () => {
  it("insertChoices 후 findChoicesByProblemId 가 넣은 순서대로(displayOrder 오름차순) 돌려주고, displayOrder 는 1부터 부여된다", async () => {
    await insertChoices(db, [
      { problemId, choiceText: "a", isCorrect: false },
      { problemId, choiceText: "b", isCorrect: true },
      { problemId, choiceText: "c", isCorrect: false },
    ]);
    const rows = await findChoicesByProblemId(db, problemId);
    expect(rows.map((r) => r.choiceText)).toEqual(["a", "b", "c"]);
    expect(rows.map((r) => r.displayOrder)).toEqual([1, 2, 3]);
  });

  it("deleteChoicesByProblemId 후에는 빈 배열을 돌려준다", async () => {
    await insertChoices(db, [{ problemId, choiceText: "a", isCorrect: true }]);
    await deleteChoicesByProblemId(db, problemId);
    expect(await findChoicesByProblemId(db, problemId)).toEqual([]);
  });
});

describe("problem answers DAO", () => {
  it("insertAnswers 후 findAnswersByProblemId 가 넣은 순서대로 돌려준다", async () => {
    await insertAnswers(db, [
      { problemId, answerText: "x" },
      { problemId, answerText: "y" },
    ]);
    const rows = await findAnswersByProblemId(db, problemId);
    expect(rows.map((r) => r.answerText)).toEqual(["x", "y"]);
  });

  it("deleteAnswersByProblemId 후에는 빈 배열을 돌려준다", async () => {
    await insertAnswers(db, [{ problemId, answerText: "x" }]);
    await deleteAnswersByProblemId(db, problemId);
    expect(await findAnswersByProblemId(db, problemId)).toEqual([]);
  });
});

describe("problem blanks DAO", () => {
  it("insertBlanks 후 findBlanksByProblemId 가 넣은 순서대로(displayOrder 오름차순) 돌려준다", async () => {
    await insertBlanks(db, [
      { problemId, blankKey: "k1", answerText: "1" },
      { problemId, blankKey: "k2", answerText: "2" },
    ]);
    const rows = await findBlanksByProblemId(db, problemId);
    expect(rows.map((r) => r.blankKey)).toEqual(["k1", "k2"]);
    expect(rows.map((r) => r.displayOrder)).toEqual([1, 2]);
  });

  it("deleteBlanksByProblemId 후에는 빈 배열을 돌려준다", async () => {
    await insertBlanks(db, [{ problemId, blankKey: "k1", answerText: "1" }]);
    await deleteBlanksByProblemId(db, problemId);
    expect(await findBlanksByProblemId(db, problemId)).toEqual([]);
  });
});
