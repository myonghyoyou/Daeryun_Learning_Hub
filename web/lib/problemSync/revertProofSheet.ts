import { eq } from "drizzle-orm";
import type { Db } from "../db/client";
import { problemAnswers, problemBlanks, problemChoices, problems } from "../db/schema";
import type { CellChange } from "./applyProofSheet";

export type RevertPlan = {
  /** 지금 값이 백업의 after 와 같아 안전하게 되돌릴 수 있는 것. */
  revertable: CellChange[];
  /** 반영 이후 누가 또 고쳐서 지금 값이 after 와 다른 것. 건드리지 않는다. */
  conflicts: { change: CellChange; current: string }[];
  /** 백업에는 있는데 DB 에서 행을 못 찾은 것. */
  missing: CellChange[];
};

async function readCurrent(db: Db, change: CellChange): Promise<string | null> {
  if (change.table === "problems") {
    const [row] = await db.select({
      content: problems.content, explanation: problems.explanation, referenceText: problems.referenceText,
    }).from(problems).where(eq(problems.id, change.rowId)).limit(1);
    if (!row) return null;
    if (change.field === "content") return row.content;
    if (change.field === "referenceText") return row.referenceText ?? "";
    return row.explanation ?? "";
  }
  if (change.table === "problem_choices") {
    const [row] = await db.select({ v: problemChoices.choiceText })
      .from(problemChoices).where(eq(problemChoices.id, change.rowId)).limit(1);
    return row ? row.v : null;
  }
  if (change.table === "problem_answers") {
    const [row] = await db.select({ v: problemAnswers.answerText })
      .from(problemAnswers).where(eq(problemAnswers.id, change.rowId)).limit(1);
    return row ? row.v : null;
  }
  const [row] = await db.select({ v: problemBlanks.answerText })
    .from(problemBlanks).where(eq(problemBlanks.id, change.rowId)).limit(1);
  return row ? row.v : null;
}

/**
 * 백업을 되돌릴 수 있는지 하나씩 확인한다. DB 는 건드리지 않는다.
 *
 * 지금 값이 백업의 `after` 와 같을 때만 되돌린다 — 반영한 뒤 누가 또 고쳤다면 그 사람의
 * 수정을 지우게 되므로, 그런 칸은 충돌로 빼서 보고만 한다.
 */
export async function planRevert(db: Db, changes: CellChange[]): Promise<RevertPlan> {
  const revertable: CellChange[] = [];
  const conflicts: RevertPlan["conflicts"] = [];
  const missing: CellChange[] = [];

  for (const change of changes) {
    const current = await readCurrent(db, change);
    if (current === null) {
      missing.push(change);
      continue;
    }
    if (current === change.after) revertable.push(change);
    else if (current === change.before) continue; // 이미 되돌아가 있다 — 할 일이 없다
    else conflicts.push({ change, current });
  }
  return { revertable, conflicts, missing };
}

/**
 * 되돌린다. `before` 값을 다시 써 넣는다. 한 트랜잭션이라 중간에 실패하면 전부 되돌아간다.
 *
 * **첫 인자가 `Db` 다 — `DbConn` 이 아니다.** 이 함수가 트랜잭션을 연다
 * (lib/solve/attemptService.ts 와 같은 규칙).
 */
export async function applyRevert(db: Db, changes: CellChange[]): Promise<number> {
  if (changes.length === 0) return 0;
  return db.transaction(async (tx) => {
    for (const c of changes) {
      if (c.table === "problems") {
        if (c.field === "content") {
          await tx.update(problems).set({ content: c.before }).where(eq(problems.id, c.rowId));
        } else if (c.field === "referenceText") {
          await tx.update(problems).set({ referenceText: c.before === "" ? null : c.before })
            .where(eq(problems.id, c.rowId));
        } else {
          await tx.update(problems).set({ explanation: c.before === "" ? null : c.before })
            .where(eq(problems.id, c.rowId));
        }
      } else if (c.table === "problem_choices") {
        await tx.update(problemChoices).set({ choiceText: c.before }).where(eq(problemChoices.id, c.rowId));
      } else if (c.table === "problem_answers") {
        await tx.update(problemAnswers).set({ answerText: c.before }).where(eq(problemAnswers.id, c.rowId));
      } else {
        await tx.update(problemBlanks).set({ answerText: c.before }).where(eq(problemBlanks.id, c.rowId));
      }
    }
    return changes.length;
  });
}
