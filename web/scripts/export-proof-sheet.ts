// tsx 는 .env 를 로드하지 않는다. 부수효과 import 라 다른 import 보다 먼저 와야 한다
// (scripts/seed-dev.ts 와 같은 이유).
import "dotenv/config";

import * as fs from "node:fs";
import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { asc, eq } from "drizzle-orm";
import * as XLSX from "xlsx";
import { getDb } from "../lib/db/client";
import { departments, problemAnswers, problemBlanks, problemChoices, problems } from "../lib/db/schema";
import { SHEET_COLUMNS, toSheetRow, type ProblemForSheet, type ProofRow } from "../lib/problemSync/proofSheet";

// SheetJS 를 ESM 으로 부르면 파일 쓰기가 꺼져 있다("cannot save file"). fs 를 직접 물려준다.
XLSX.set_fs(fs);

const OUT_PATH = "../docs/문제은행_엑셀/문제은행_교정용.xlsx";

function groupByProblem<T extends { problemId: number }>(rows: T[]): Map<number, T[]> {
  const grouped = new Map<number, T[]>();
  for (const row of rows) {
    const list = grouped.get(row.problemId);
    if (list) list.push(row);
    else grouped.set(row.problemId, [row]);
  }
  return grouped;
}

/** 시트 이름은 31자 제한이고 : \ / ? * [ ] 를 못 쓴다. */
function safeSheetName(name: string): string {
  return name.replace(/[:\\/?*[\]]/g, " ").slice(0, 31);
}

function buildSheet(rows: ProofRow[]): XLSX.WorkSheet {
  const ws = XLSX.utils.json_to_sheet(rows, { header: SHEET_COLUMNS });
  ws["!cols"] = SHEET_COLUMNS.map((c) => {
    if (c === "content" || c === "reference_text") return { wch: 70 };
    if (c === "explanation") return { wch: 40 };
    if (c.startsWith("choice_text") || c.startsWith("answer_text") || c.startsWith("blank_answer_text")) return { wch: 32 };
    if (c.startsWith("is_correct") || c.startsWith("blank_key")) return { wch: 10 };
    return { wch: 14 };
  });
  ws["!freeze"] = { xSplit: 1, ySplit: 1 };
  ws["!autofilter"] = {
    ref: XLSX.utils.encode_range({ s: { c: 0, r: 0 }, e: { c: SHEET_COLUMNS.length - 1, r: rows.length } }),
  };
  const range = XLSX.utils.decode_range(ws["!ref"]!);
  for (let r = range.s.r; r <= range.e.r; r += 1) {
    for (let c = range.s.c; c <= range.e.c; c += 1) {
      const cell = ws[XLSX.utils.encode_cell({ r, c })];
      if (cell) cell.s = { alignment: { wrapText: true, vertical: "top" } };
    }
  }
  return ws;
}

async function main() {
  const db = getDb();

  const problemRows = await db.select({
    id: problems.id, type: problems.type, content: problems.content,
    referenceText: problems.referenceText,
    explanation: problems.explanation, blankRevealCount: problems.blankRevealCount,
    status: problems.status, sourceNumber: problems.sourceNumber,
    departmentCode: departments.code, departmentName: departments.name,
  })
    .from(problems)
    .innerJoin(departments, eq(departments.id, problems.departmentId))
    .orderBy(asc(departments.name), asc(problems.sourceNumber), asc(problems.id));

  // 보기·빈칸은 표시 순서대로, 정답은 삽입 순(id)대로 — DB 의 읽기 순서와 같게 맞춘다
  // (lib/db/problemParts.ts 의 find* 함수들과 동일한 정렬).
  const choices = await db.select({
    problemId: problemChoices.problemId, choiceText: problemChoices.choiceText,
    isCorrect: problemChoices.isCorrect,
  }).from(problemChoices).orderBy(asc(problemChoices.problemId), asc(problemChoices.displayOrder), asc(problemChoices.id));
  const answers = await db.select({
    problemId: problemAnswers.problemId, answerText: problemAnswers.answerText,
  }).from(problemAnswers).orderBy(asc(problemAnswers.problemId), asc(problemAnswers.id));
  const blanks = await db.select({
    problemId: problemBlanks.problemId, blankKey: problemBlanks.blankKey, answerText: problemBlanks.answerText,
  }).from(problemBlanks).orderBy(asc(problemBlanks.problemId), asc(problemBlanks.displayOrder), asc(problemBlanks.id));

  const choicesBy = groupByProblem(choices);
  const answersBy = groupByProblem(answers);
  const blanksBy = groupByProblem(blanks);

  const byDepartment = new Map<string, ProofRow[]>();
  for (const p of problemRows) {
    const forSheet: ProblemForSheet = {
      id: p.id,
      departmentCode: p.departmentCode,
      sourceNumber: p.sourceNumber,
      type: p.type,
      status: p.status,
      content: p.content,
      referenceText: p.referenceText,
      explanation: p.explanation,
      blankRevealCount: p.blankRevealCount,
      choices: choicesBy.get(p.id) ?? [],
      answers: answersBy.get(p.id) ?? [],
      blanks: blanksBy.get(p.id) ?? [],
    };
    const list = byDepartment.get(p.departmentName);
    if (list) list.push(toSheetRow(forSheet));
    else byDepartment.set(p.departmentName, [toSheetRow(forSheet)]);
  }

  const wb = XLSX.utils.book_new();
  // 팀별 시트만 만든다 — 각 팀에 자기 시트만 넘기면 되도록. 요약이나 전체 시트를 함께 두면
  // 되돌릴 때 같은 문제가 두 시트에 있어 어느 쪽이 최신인지 알 수 없다.
  for (const [name, rows] of byDepartment) {
    XLSX.utils.book_append_sheet(wb, buildSheet(rows), safeSheetName(name));
  }

  await mkdir(dirname(OUT_PATH), { recursive: true });
  XLSX.writeFile(wb, OUT_PATH);

  console.log(`교정용 엑셀 저장: ${OUT_PATH}`);
  console.log(`  시트 ${wb.SheetNames.length}개 · 문제 ${problemRows.length}개`);
  for (const [name, rows] of byDepartment) console.log(`    ${name} ${rows.length}개`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("교정용 엑셀 생성 실패", error);
    process.exit(1);
  });
