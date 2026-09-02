import { asc, eq } from "drizzle-orm";
import type { Db } from "../db/client";
import { problemAnswers, problemBlanks, problemChoices, problems } from "../db/schema";
import { MAX_ANSWERS, MAX_BLANKS, MAX_CHOICES, type ProofRow } from "./proofSheet";

/** 한 칸의 변경. `table`·`rowId` 로 정확히 어느 행의 어느 칸인지 가리킨다. */
export type CellChange = {
  problemId: number;
  sheet: string;
  column: string;
  table: "problems" | "problem_choices" | "problem_answers" | "problem_blanks";
  rowId: number;
  field: "content" | "referenceText" | "explanation" | "choiceText" | "answerText";
  before: string;
  after: string;
};

export type ProofDiff = {
  changes: CellChange[];
  /** 엑셀에 있는데 DB 에서 못 찾은 id. 행을 지웠거나 id 를 건드린 경우다. */
  missingProblemIds: number[];
  /** 엑셀에는 값이 있는데 DB 에는 그 자리(보기 3번 등)가 없는 경우. 칸을 새로 채웠다는 뜻이라 무시한다. */
  extraCells: { problemId: number; column: string; value: string }[];
  scannedRows: number;
};

type LoadedProblem = {
  id: number;
  content: string;
  referenceText: string | null;
  explanation: string | null;
  choices: { id: number; choiceText: string }[];
  answers: { id: number; answerText: string }[];
  blanks: { id: number; answerText: string }[];
};

function cell(row: ProofRow, column: string): string {
  const value = row[column];
  if (value === null || value === undefined) return "";
  return String(value);
}

/**
 * 엑셀 행과 DB 를 대조해 글자가 달라진 칸만 모은다. DB 는 건드리지 않는다.
 *
 * 대조 기준은 `id` 다 — 엑셀의 행 순서나 위치가 아니라. 그래서 교정하는 사람이 행을
 * 정렬하거나 시트를 나눠도 안전하고, 대신 id 칸을 지우면 그 행은 반영되지 않는다.
 *
 * 자식 표(보기·정답·빈칸)는 순서로 짝을 맞춘다. 교정은 글자만 고치는 작업이라
 * 보기를 넣거나 빼지 않는다는 전제다 — 개수가 달라진 경우는 extraCells 로 보고만 하고
 * 반영하지 않는다.
 */
export async function planProofChanges(db: Db, sheets: Map<string, ProofRow[]>): Promise<ProofDiff> {
  const wanted = new Map<number, { sheet: string; row: ProofRow }>();
  let scannedRows = 0;
  for (const [sheet, rows] of sheets) {
    for (const row of rows) {
      scannedRows += 1;
      const id = Number(row.id);
      if (!Number.isInteger(id) || id <= 0) continue;
      wanted.set(id, { sheet, row });
    }
  }

  const loaded = new Map<number, LoadedProblem>();
  const ids = [...wanted.keys()];
  // 문제 수가 1000 단위라 통째로 읽어 메모리에서 맞춘다. inArray 로 잘라 읽을 만큼 크지 않다.
  const problemRows = await db.select({
    id: problems.id, content: problems.content, referenceText: problems.referenceText,
    explanation: problems.explanation,
  }).from(problems);
  const choiceRows = await db.select({
    id: problemChoices.id, problemId: problemChoices.problemId, choiceText: problemChoices.choiceText,
  }).from(problemChoices).orderBy(asc(problemChoices.problemId), asc(problemChoices.displayOrder), asc(problemChoices.id));
  const answerRows = await db.select({
    id: problemAnswers.id, problemId: problemAnswers.problemId, answerText: problemAnswers.answerText,
  }).from(problemAnswers).orderBy(asc(problemAnswers.problemId), asc(problemAnswers.id));
  const blankRows = await db.select({
    id: problemBlanks.id, problemId: problemBlanks.problemId, answerText: problemBlanks.answerText,
  }).from(problemBlanks).orderBy(asc(problemBlanks.problemId), asc(problemBlanks.displayOrder), asc(problemBlanks.id));

  for (const p of problemRows) {
    loaded.set(p.id, {
      id: p.id, content: p.content, referenceText: p.referenceText, explanation: p.explanation,
      choices: [], answers: [], blanks: [],
    });
  }
  for (const c of choiceRows) loaded.get(c.problemId)?.choices.push({ id: c.id, choiceText: c.choiceText });
  for (const a of answerRows) loaded.get(a.problemId)?.answers.push({ id: a.id, answerText: a.answerText });
  for (const b of blankRows) loaded.get(b.problemId)?.blanks.push({ id: b.id, answerText: b.answerText });

  const changes: CellChange[] = [];
  const missingProblemIds: number[] = [];
  const extraCells: ProofDiff["extraCells"] = [];

  for (const [id, { sheet, row }] of wanted) {
    const db_ = loaded.get(id);
    if (!db_) {
      missingProblemIds.push(id);
      continue;
    }

    const push = (
      column: string, table: CellChange["table"], rowId: number,
      field: CellChange["field"], before: string, after: string,
    ) => {
      if (before === after) return;
      changes.push({ problemId: id, sheet, column, table, rowId, field, before, after });
    };

    push("content", "problems", id, "content", db_.content, cell(row, "content"));
    // 해설은 비울 수도 있어야 하므로 빈 문자열도 값으로 본다. DB 의 null 은 "" 로 맞춰 비교한다.
    // 참조지문도 교정 대상이다. 비울 수 있어야 하므로 빈 문자열도 값으로 본다.
    push("reference_text", "problems", id, "referenceText", db_.referenceText ?? "", cell(row, "reference_text"));
    push("explanation", "problems", id, "explanation", db_.explanation ?? "", cell(row, "explanation"));

    for (let i = 0; i < MAX_CHOICES; i += 1) {
      const column = `choice_text_${i + 1}`;
      const after = cell(row, column);
      const target = db_.choices[i];
      if (!target) {
        if (after !== "") extraCells.push({ problemId: id, column, value: after });
        continue;
      }
      // 보기 글자를 통째로 지우는 것은 교정이 아니라 삭제다. 실수로 비운 칸에 이끌려
      // NOT NULL 컬럼을 빈 값으로 만들지 않도록 건너뛴다.
      if (after === "") continue;
      push(column, "problem_choices", target.id, "choiceText", target.choiceText, after);
    }

    for (let i = 0; i < MAX_ANSWERS; i += 1) {
      const column = `answer_text_${i + 1}`;
      const after = cell(row, column);
      const target = db_.answers[i];
      if (!target) {
        if (after !== "") extraCells.push({ problemId: id, column, value: after });
        continue;
      }
      if (after === "") continue;
      push(column, "problem_answers", target.id, "answerText", target.answerText, after);
    }

    for (let i = 0; i < MAX_BLANKS; i += 1) {
      const column = `blank_answer_text_${i + 1}`;
      const after = cell(row, column);
      const target = db_.blanks[i];
      if (!target) {
        if (after !== "") extraCells.push({ problemId: id, column, value: after });
        continue;
      }
      if (after === "") continue;
      push(column, "problem_blanks", target.id, "answerText", target.answerText, after);
    }
  }

  changes.sort((a, b) => a.problemId - b.problemId || a.column.localeCompare(b.column));
  return { changes, missingProblemIds, extraCells, scannedRows };
}

/**
 * planProofChanges 가 모은 변경을 실제로 반영한다. 한 트랜잭션이라 중간에 실패하면 전부 되돌아간다.
 *
 * **첫 인자가 `Db` 다 — `DbConn` 이 아니다.** 이 함수가 트랜잭션을 연다(lib/solve/attemptService.ts
 * 와 같은 규칙). 호출 전에 assertSeedableEnvironment 로 로컬 DB 인지 확인해야 한다.
 */
export async function applyProofChanges(db: Db, changes: CellChange[]): Promise<number> {
  if (changes.length === 0) return 0;
  return db.transaction(async (tx) => {
    for (const c of changes) {
      if (c.table === "problems") {
        // updated_at 은 여기서 찍지 않는다. 교정은 문제의 내용 변경 이력이 아니라 표기 정정이라,
        // 운영과 대조할 때 시각이 어긋나면 오히려 헷갈린다.
        if (c.field === "content") {
          await tx.update(problems).set({ content: c.after }).where(eq(problems.id, c.rowId));
        } else if (c.field === "referenceText") {
          await tx.update(problems).set({ referenceText: c.after === "" ? null : c.after })
            .where(eq(problems.id, c.rowId));
        } else {
          await tx.update(problems).set({ explanation: c.after === "" ? null : c.after })
            .where(eq(problems.id, c.rowId));
        }
      } else if (c.table === "problem_choices") {
        await tx.update(problemChoices).set({ choiceText: c.after }).where(eq(problemChoices.id, c.rowId));
      } else if (c.table === "problem_answers") {
        await tx.update(problemAnswers).set({ answerText: c.after }).where(eq(problemAnswers.id, c.rowId));
      } else {
        await tx.update(problemBlanks).set({ answerText: c.after }).where(eq(problemBlanks.id, c.rowId));
      }
    }
    return changes.length;
  });
}
