import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { eq } from "drizzle-orm";
import { migrateTestDb, testDb, truncateAll } from "../../test/db";
import { departments, problemChoices, problems, users } from "../db/schema";
import type { CellChange } from "./applyProofSheet";
import { applyRevert, planRevert } from "./revertProofSheet";

const db = testDb();
let deptId = 0;
let adminId = 0;
let problemId = 0;
let choiceId = 0;

beforeAll(async () => { await migrateTestDb(); });
beforeEach(async () => {
  await truncateAll();
  [{ id: deptId }] = await db.insert(departments)
    .values({ name: "개발팀", code: "IT", status: "ACTIVE" }).returning({ id: departments.id });
  [{ id: adminId }] = await db.insert(users).values({
    employeeNo: "admin", name: "관리자", email: "a@b.c", passwordHash: "x",
    departmentId: deptId, role: "SUPER_ADMIN", status: "ACTIVE", mustChangePassword: false,
  }).returning({ id: users.id });
  [{ id: problemId }] = await db.insert(problems).values({
    type: "MCQ_SINGLE", content: "고친 본문", departmentId: deptId, status: "ACTIVE",
    createdBy: adminId, sourceNumber: 1,
  }).returning({ id: problems.id });
  [{ id: choiceId }] = await db.insert(problemChoices).values({
    problemId, choiceText: "고친 보기", isCorrect: true, displayOrder: 1,
  }).returning({ id: problemChoices.id });
});

function contentChange(over: Partial<CellChange> = {}): CellChange {
  return {
    problemId, sheet: "개발팀", column: "content", table: "problems",
    rowId: problemId, field: "content", before: "원래 본문", after: "고친 본문", ...over,
  };
}

describe("planRevert", () => {
  it("지금 값이 백업의 after 와 같으면 되돌릴 수 있다고 본다", async () => {
    const plan = await planRevert(db, [contentChange()]);
    expect(plan.revertable).toHaveLength(1);
    expect(plan.conflicts).toHaveLength(0);
    expect(plan.missing).toHaveLength(0);
  });

  it("반영 뒤 누가 또 고쳤으면 충돌로 빼고 건드리지 않는다", async () => {
    await db.update(problems).set({ content: "제3자가 고친 본문" }).where(eq(problems.id, problemId));
    const plan = await planRevert(db, [contentChange()]);
    expect(plan.revertable).toHaveLength(0);
    expect(plan.conflicts).toHaveLength(1);
    expect(plan.conflicts[0].current).toBe("제3자가 고친 본문");
  });

  it("이미 되돌아가 있으면 할 일 없음으로 본다 — 충돌이 아니다", async () => {
    await db.update(problems).set({ content: "원래 본문" }).where(eq(problems.id, problemId));
    const plan = await planRevert(db, [contentChange()]);
    expect(plan.revertable).toHaveLength(0);
    expect(plan.conflicts).toHaveLength(0);
    expect(plan.missing).toHaveLength(0);
  });

  it("행이 사라졌으면 missing 으로 뺀다", async () => {
    const plan = await planRevert(db, [contentChange({ rowId: 999999 })]);
    expect(plan.missing).toHaveLength(1);
    expect(plan.revertable).toHaveLength(0);
  });

  it("보기 글자도 같은 규칙으로 본다", async () => {
    const change: CellChange = {
      problemId, sheet: "개발팀", column: "choice_text_1", table: "problem_choices",
      rowId: choiceId, field: "choiceText", before: "원래 보기", after: "고친 보기",
    };
    const plan = await planRevert(db, [change]);
    expect(plan.revertable).toHaveLength(1);
  });
});

describe("applyRevert", () => {
  it("before 값을 다시 써 넣는다", async () => {
    await applyRevert(db, [contentChange()]);
    const [row] = await db.select({ content: problems.content }).from(problems).where(eq(problems.id, problemId));
    expect(row.content).toBe("원래 본문");
  });

  it("보기 글자를 되돌린다", async () => {
    await applyRevert(db, [{
      problemId, sheet: "개발팀", column: "choice_text_1", table: "problem_choices",
      rowId: choiceId, field: "choiceText", before: "원래 보기", after: "고친 보기",
    }]);
    const [row] = await db.select({ v: problemChoices.choiceText })
      .from(problemChoices).where(eq(problemChoices.id, choiceId));
    expect(row.v).toBe("원래 보기");
  });

  it("해설을 빈 값으로 되돌리면 null 로 넣는다 — 빈 문자열을 남기지 않는다", async () => {
    await db.update(problems).set({ explanation: "고친 해설" }).where(eq(problems.id, problemId));
    await applyRevert(db, [contentChange({
      column: "explanation", field: "explanation", before: "", after: "고친 해설",
    })]);
    const [row] = await db.select({ v: problems.explanation }).from(problems).where(eq(problems.id, problemId));
    expect(row.v).toBeNull();
  });

  it("빈 목록이면 아무것도 하지 않는다", async () => {
    expect(await applyRevert(db, [])).toBe(0);
    const [row] = await db.select({ content: problems.content }).from(problems).where(eq(problems.id, problemId));
    expect(row.content).toBe("고친 본문");
  });
});
