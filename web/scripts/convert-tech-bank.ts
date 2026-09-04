/**
 * 기술직 문제은행 PDF 2종 → 업로드용 엑셀 + 수동입력용 엑셀 변환(1회성 도구).
 *
 * 원본은 한컴 PDF 로 만든 **텍스트 PDF** 라 `pdftotext -bbox-layout` 으로 낱말 좌표까지 뽑힌다.
 * 좌표를 쓰는 이유는 문제 PDF 가 **4단 조판**이어서다 — 단 구분 없이 텍스트만 뽑으면 옆 단
 * 문장이 한 줄에 섞여 들어와 지문이 통째로 망가진다.
 *
 * 산출물은 `docs/문제은행_엑셀_기술직/`. 자동 판정이 조금이라도 어긋나는 문항은 업로드용에
 * 넣지 않고 수동입력용으로 뺀다 — 조용히 틀린 데이터가 DB 에 들어가는 것이 가장 나쁘다.
 */
import * as fs from "node:fs";
import { mkdirSync, writeFileSync } from "node:fs";
import * as path from "node:path";
import * as XLSX from "xlsx";
import {
  looksSame, parseHwpQuestions, readHwpParagraphs, runPdfToText, SpacingAuthority,
  type HwpQuestion,
} from "./techBank/hwpText";

// SheetJS 를 ESM 으로 부르면 파일 쓰기가 꺼져 있다("cannot save file"). fs 를 직접 물려준다
// (scripts/export-proof-sheet.ts 와 같은 이유).
XLSX.set_fs(fs);

const DOCS = path.resolve("../docs");
const QUESTION_PDF = path.join(DOCS, "2. 2025년도 문제은행(기술직).pdf");
const ANSWER_PDF = path.join(DOCS, "3. 2025년도 문제은행 정답(기술직).pdf");
// PDF 는 **구조**(문항 경계·보기 구분)를, HWP 는 **표기**(띄어쓰기)를 맡는다. PDF 는 조판
// 결과라 줄 끝에서 갈린 낱말이 공백을 남기지만, HWP 에는 조판 이전 문단이 그대로 있다.
const QUESTION_HWP = path.join(DOCS, "2. 2025년도 문제은행(기술직).hwp");
const ANSWER_HWP = path.join(DOCS, "3. 2025년도 문제은행 정답(기술직).hwp");
const OUT_DIR = path.join(DOCS, "문제은행_엑셀_기술직");

const TOTAL = 500;
const TAG = "기술직";

/** 업로드 파서가 읽는 컬럼 순서(lib/problem/problemExcel.ts:35-43). 순서를 바꾸면 안 된다. */
const UPLOAD_HEADER = [
  "문제유형", "문제내용", "이미지", "참조지문",
  "보기1", "보기2", "보기3", "보기4", "보기5",
  "정답", "해설", "태그", "문항번호",
] as const;

const MANUAL_HEADER = ["문항번호", "사유", "문제내용(참고)", "정답(참고)"] as const;

const CIRCLED = ["①", "②", "③", "④", "⑤"];
/** 보기가 6개 이상인 문항. 업로드 형식은 보기 5개까지라 자동 변환할 수 없다(426·414·424번 등). */
const BEYOND_FIFTH = /[⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮]/;

interface Word { page: number; x: number; y: number; x2: number; y2: number; text: string }

// ---------------------------------------------------------------- 1단계: 낱말 추출

function extractWords(pdfPath: string): Word[] {
  const xml = runPdfToText(pdfPath);
  const re = /<page width="([\d.]+)"|<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">([^<]*)<\/word>/g;
  const words: Word[] = [];
  let page = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    if (m[1] !== undefined) { page += 1; continue; }
    const text = decodeEntities(m[6]);
    if (text.trim() === "") continue;
    words.push({ page, x: +m[2], y: +m[3], x2: +m[4], y2: +m[5], text });
  }
  return words;
}

function decodeEntities(s: string): string {
  return s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, "\"")
    .replace(/&apos;/g, "'").replace(/&amp;/g, "&");
}

/** 같은 구역 안의 낱말을 y 근접으로 한 줄씩 묶는다. 줄 간격은 약 9pt, 4pt 를 경계로 쓴다. */
function toLines(words: Word[], yTolerance = 4): { y: number; text: string }[] {
  const sorted = [...words].sort((a, b) => a.y - b.y || a.x - b.x);
  const lines: { y: number; words: Word[] }[] = [];
  for (const w of sorted) {
    const last = lines[lines.length - 1];
    if (last && Math.abs(w.y - last.y) <= yTolerance) last.words.push(w);
    else lines.push({ y: w.y, words: [w] });
  }
  return lines.map((l) => ({
    y: l.y,
    text: l.words.sort((a, b) => a.x - b.x).map((w) => w.text).join(" "),
  }));
}

// ---------------------------------------------------------------- 2단계: 정답표

/**
 * 정답 PDF 는 쪽마다 좌·우 두 개의 `문제번호 | 정답` 표다.
 *
 * 번호가 셀 안에서 **세로 가운데 정렬**이라, 번호의 y 를 그대로 행의 시작으로 쓰면 여러 줄짜리
 * 셀에서 앞뒤 행이 섞인다(실제로 3·12·37번이 밀렸다). 가까운 번호에 붙이는 방식도 4줄짜리
 * 셀(415·427)에서 맨 위·맨 아래 줄을 옆 행에 빼앗긴다.
 *
 * 그래서 `segmentRows` 의 DP 로 푼다 — 가운데 정렬이라는 사실 자체를 조건으로 쓴다.
 */
function parseAnswers(): Map<number, string> {
  const words = extractWords(ANSWER_PDF);
  const HALF_X = 300;            // 쪽 가운데(595pt 폭) — 좌/우 표 구분
  const NUM_MAX_LEFT = 70;       // 좌표로 확인한 번호 칸 오른쪽 끝
  const NUM_MIN_RIGHT = 315, NUM_MAX_RIGHT = 340;

  const result = new Map<number, string>();
  const pages = Math.max(...words.map((w) => w.page));

  for (let page = 1; page <= pages; page += 1) {
    for (const half of [0, 1] as const) {
      const inHalf = words.filter((w) => w.page === page && (half === 0 ? w.x < HALF_X : w.x >= HALF_X));
      if (inHalf.length === 0) continue;

      const isNumberCell = (w: Word) => /^\d{1,3}$/.test(w.text)
        && (half === 0 ? w.x < NUM_MAX_LEFT : w.x >= NUM_MIN_RIGHT && w.x < NUM_MAX_RIGHT);

      const anchors = inHalf.filter(isNumberCell).sort((a, b) => a.y - b.y);
      if (anchors.length === 0) continue;

      // 표 머리("문제번호 / 정 답")도 정답 칸 x 범위에 들어온다. 첫 번호보다 위에 있는 줄을
      // 버리지 않으면 1·71·116… 처럼 각 표의 첫 문항 정답이 머리글로 오염된다.
      const headerCutoff = anchors[0].y - 8;
      const answerWords = inHalf.filter((w) => !isNumberCell(w) && w.y >= headerCutoff
        && (half === 0 ? w.x >= NUM_MAX_LEFT : w.x >= NUM_MAX_RIGHT));
      const answerLines = toLines(answerWords);
      const segments = segmentRows(anchors, answerLines);

      anchors.forEach((anchor, i) => {
        const n = Number(anchor.text);
        if (result.has(n)) throw new Error(`정답표에 문제번호 ${n} 이 두 번 나온다`);
        result.set(n, segments[i].map((l) => l.text).join(" ").replace(/\s+/g, " ").trim());
      });
    }
  }
  return result;
}

/**
 * 정답 줄들을 번호 앤커별로 **연속 구간**으로 자른다.
 *
 * 표의 번호가 셀 안에서 세로 가운데 정렬이라는 사실이 곧 목적함수다 — 각 셀의 줄 y 평균이
 * 그 셀 번호의 y 와 같아야 한다. 그 오차 합을 최소로 만드는 자르기를 DP 로 고른다. 가까운
 * 앤커에 붙이는 국소 판단과 달리, 4줄짜리 셀 옆에 1줄짜리 셀이 와도 밀리지 않는다.
 */
function segmentRows<T extends { y: number }>(anchors: Word[], lines: T[]): T[][] {
  const A = anchors.length;
  const N = lines.length;
  if (N < A) throw new Error(`정답 줄(${N})이 문항 수(${A})보다 적다 — 좌표 기준을 다시 봐야 한다`);

  const prefix = [0];
  for (let i = 0; i < N; i += 1) prefix.push(prefix[i] + lines[i].y);
  // 앤커 a 가 줄 [j, k] 를 가질 때의 비용 = |앤커 y - 그 줄들의 y 평균|.
  const cost = (a: number, j: number, k: number) =>
    Math.abs(anchors[a].y - (prefix[k + 1] - prefix[j]) / (k - j + 1));

  const INF = Number.POSITIVE_INFINITY;
  const dp = Array.from({ length: A + 1 }, () => new Float64Array(N + 1).fill(INF));
  const back = Array.from({ length: A + 1 }, () => new Int32Array(N + 1).fill(-1));
  dp[0][0] = 0;
  for (let a = 1; a <= A; a += 1) {
    // 앞의 a-1 개 앤커가 최소 a-1 줄, 뒤의 A-a 개가 최소 A-a 줄을 가져가야 한다.
    for (let k = a; k <= N - (A - a); k += 1) {
      for (let j = a - 1; j < k; j += 1) {
        if (dp[a - 1][j] === INF) continue;
        const candidate = dp[a - 1][j] + cost(a - 1, j, k - 1);
        if (candidate < dp[a][k]) { dp[a][k] = candidate; back[a][k] = j; }
      }
    }
  }
  if (dp[A][N] === INF) throw new Error("정답표 행 분할에 실패했다");

  const segments: T[][] = new Array(A);
  let k = N;
  for (let a = A; a >= 1; a -= 1) {
    const j = back[a][k];
    segments[a - 1] = lines.slice(j, k);
    k = j;
  }
  return segments;
}

// ---------------------------------------------------------------- 3단계: 문제 본문

/** 문제 PDF 는 가로 A4 4단. 좌표 점유도로 확인한 단 경계(가운데 세로줄 425, 단 사이 212·633). */
const COLUMN_BOUNDS = [212, 425, 633];

function columnOf(x: number): number {
  for (let i = 0; i < COLUMN_BOUNDS.length; i += 1) if (x < COLUMN_BOUNDS[i]) return i;
  return COLUMN_BOUNDS.length;
}

interface RawQuestion { number: number; lines: string[] }

/** 종이의 머리표 번호가 잘못 찍힌 자리. `parseQuestions` 가 채우고 로그에 남긴다. */
const numberFixes: { printed: string; used: number }[] = [];

function parseQuestions(): Map<number, RawQuestion> {
  const words = extractWords(QUESTION_PDF);
  const pages = Math.max(...words.map((w) => w.page));

  // 읽는 순서 = 쪽 → 단 → y. 이 순서로 이어 붙여야 종이의 문항 순서와 같아진다.
  const ordered: { y: number; text: string }[] = [];
  for (let page = 1; page <= pages; page += 1) {
    for (let col = 0; col <= COLUMN_BOUNDS.length; col += 1) {
      const inCol = words.filter((w) => w.page === page && columnOf(w.x) === col);
      if (inCol.length === 0) continue;
      ordered.push(...toLines(inCol));
    }
  }

  // 머리표 후보 = 줄머리가 `숫자.` 인 줄. 낱말이 갈라져 "311 ." 로 떨어진 경우도 잡는다.
  // 435번은 원본에 마침표 없이 "435 " 로 찍혀 있어 마침표 없는 꼴도 후보로 받되(`dotted:false`),
  // 그런 후보는 번호가 정확히 맞을 때만 인정한다 — "3000만원" 같은 줄을 머리표로 오인하지 않도록.
  const DOTTED = /^(\d{1,3})\s*\.\s*(.*)$/;
  const BARE = /^(\d{1,3})\s+(\D.*)$/;
  const candidateAt = new Map<number, { printed: string; rest: string; dotted: boolean }>();
  ordered.forEach((line, i) => {
    const dotted = line.text.match(DOTTED);
    if (dotted) { candidateAt.set(i, { printed: dotted[1], rest: dotted[2], dotted: true }); return; }
    const bare = line.text.match(BARE);
    if (bare) candidateAt.set(i, { printed: bare[1], rest: bare[2], dotted: false });
  });
  const candidateIndexes = [...candidateAt.keys()];

  const questions = new Map<number, RawQuestion>();
  let current: RawQuestion | null = null;
  let nextCandidateSlot = 0;

  // 마지막 문항 뒤에는 개정 이력과 국가법령정보센터 안내가 20쪽 가까이 붙어 있다. 멈추지
  // 않으면 그게 전부 500번 지문으로 딸려 들어간다. 저자가 붙인 "♣" 표시가 그 경계다.
  const APPENDIX = /^\s*♣/;

  for (let i = 0; i < ordered.length; i += 1) {
    if (APPENDIX.test(ordered[i].text)) break;
    const candidate = candidateAt.get(i);
    const expected: number = current === null ? 1 : current.number + 1;
    let accept = false;

    if (candidate) {
      while (nextCandidateSlot < candidateIndexes.length && candidateIndexes[nextCandidateSlot] <= i) {
        nextCandidateSlot += 1;
      }
      if (Number(candidate.printed) === expected) {
        accept = true;
        if (!candidate.dotted) numberFixes.push({ printed: `${candidate.printed}(마침표 없음)`, used: expected });
      } else if (candidate.dotted) {
        // 원본에 번호 오타가 있다(311번이 "31." 로 찍혀 있다). 바로 **다음** 머리표 후보가
        // expected+1 일 때만 오타로 보고 받아들인다 — 본문 속 "1." 같은 줄에 속지 않기 위해서다.
        const next = candidateAt.get(candidateIndexes[nextCandidateSlot]);
        if (next && Number(next.printed) === expected + 1) {
          numberFixes.push({ printed: `${candidate.printed}.`, used: expected });
          accept = true;
        }
      }
    }

    if (accept && candidate) {
      current = { number: expected, lines: [candidate.rest] };
      questions.set(expected, current);
    } else if (current) {
      current.lines.push(ordered[i].text);
    }
  }
  return questions;
}

// ---------------------------------------------------------------- 4단계: 유형 판정

/** 종이의 밑줄·점선과 그 끝의 정답 기입란은 화면에서 뜻이 없다. 지운다. */
function cleanContent(text: string): string {
  return text
    .replace(/[-‐‑‒–—―]{2,}\s*\(\s*\)/g, " ")
    .replace(/[·ㄱ-ㆎ.]{4,}\s*\(\s*\)/g, " ")
    .replace(/[-‐‑‒–—―]{3,}/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function countBlanks(text: string): number {
  return (text.match(/\(\s*\)/g) ?? []).length;
}

interface Split { content: string; choices: string[] }

/** `①` 첫 등장 앞이 지문, 그 뒤를 ①②③④⑤ 로 잘라 보기로 만든다. */
function splitChoices(body: string): Split {
  const first = body.indexOf(CIRCLED[0]);
  if (first < 0) return { content: cleanContent(body), choices: [] };
  const content = cleanContent(body.slice(0, first));
  const rest = body.slice(first);
  const choices: string[] = [];
  for (let i = 0; i < CIRCLED.length; i += 1) {
    const start = rest.indexOf(CIRCLED[i]);
    if (start < 0) break;
    const nextMark = i + 1 < CIRCLED.length ? rest.indexOf(CIRCLED[i + 1], start) : -1;
    const end = nextMark < 0 ? rest.length : nextMark;
    const piece = cleanContent(rest.slice(start + CIRCLED[i].length, end));
    if (piece === "") break;
    choices.push(piece);
  }
  return { content, choices };
}

type UploadRow = [string, string, string, string, string, string, string, string, string, string, string, string, number];
interface ManualRow { number: number; reason: string; content: string; answer: string }

/** 맞춤법·띄어쓰기 교정 내역. 로그로 남겨 사람이 훑을 수 있게 한다. */
const spacing = {
  fixedCells: 0,
  unmatched: [] as { number: number; where: string; text: string }[],
  joins: new Map<string, number>(),
  samples: [] as { number: number; before: string; after: string }[],
  reordered: [] as { number: number; where: string; before: string; after: string }[],
};

function main(): void {
  console.log("원본 HWP 에서 띄어쓰기 기준 읽는 중…");
  const questionParagraphs = readHwpParagraphs(QUESTION_HWP);
  const hwpQuestions = parseHwpQuestions(questionParagraphs, TOTAL);
  const questionSpacing = new SpacingAuthority(questionParagraphs);
  const answerSpacing = new SpacingAuthority(readHwpParagraphs(ANSWER_HWP));
  typoCandidates = questionSpacing.suspectTypos();
  punctuationCandidates = [...questionSpacing.suspectPunctuation(), ...answerSpacing.suspectPunctuation()];

  console.log("정답표 읽는 중…");
  const answers = parseAnswers();
  assertComplete(answers, "정답표");
  const emptyAnswers = [...answers].filter(([, v]) => v === "").map(([k]) => k);
  if (emptyAnswers.length > 0) throw new Error(`정답이 빈 문항: ${emptyAnswers.join(", ")}`);

  console.log("문제 본문 읽는 중…");
  const questions = parseQuestions();
  assertComplete(questions, "문제 본문");

  const upload: UploadRow[] = [];
  const manual: ManualRow[] = [];
  const counts: Record<string, number> = {};

  // 원본과 대조해 표기를 바로잡는다. 문서 순서대로(1→500, 지문→보기) 물어야 커서가 맞으므로
  // 이 루프 안에서 부른다.
  const correct = (raw: string, authority: SpacingAuthority, n: number, where: string): string => {
    const result = authority.fix(raw);
    if (result.unmatched) {
      spacing.unmatched.push({ number: n, where, text: raw });
      return raw;
    }
    if (result.reordered) {
      spacing.reordered.push({ number: n, where, before: raw, after: result.text });
    } else if (result.changed) {
      spacing.fixedCells += 1;
      if (spacing.samples.length < 25) spacing.samples.push({ number: n, before: raw, after: result.text });
    }
    for (const join of result.joins) spacing.joins.set(join, (spacing.joins.get(join) ?? 0) + 1);
    return result.text;
  };

  for (let n = 1; n <= TOTAL; n += 1) {
    const rawBody = questions.get(n)!.lines.join(" ");
    const split = splitChoices(rawBody);
    const content = correct(split.content, questionSpacing, n, "문제내용");
    const choices = split.choices.map((c, i) => correct(c, questionSpacing, n, `보기${i + 1}`));
    const answer = correct(answers.get(n)!, answerSpacing, n, "정답");
    const numeric = /^\d+(\s*[,，]\s*\d+)*$/.test(answer);
    const answerNumbers = numeric ? answer.split(/[,，]/).map((t) => Number(t.trim())) : [];
    const push = (reason: string) => manual.push({ number: n, reason, content, answer });

    if (content === "") { push("본문 파싱 실패(지문이 비었다)"); continue; }

    // PDF 경로와 HWP 문단 구조가 어긋나면 업로드하지 않는다. 조판만 봐서는 못 잡는 손상이
    // 있기 때문이다 — 361번은 아래첨자 2가 ③에서 ④로 넘어갔고, 485번은 ⑤가 통째로 빠져
    // ④·⑤가 한 칸에 붙어 버렸다. 둘 다 정답 번호는 범위 안이라 기존 검사에 걸리지 않았다.
    const disagreement = crossCheck(hwpQuestions.get(n), content, choices);
    if (disagreement) { push(`원본 대조 불일치 — ${disagreement}`); continue; }
    // 보기 6개 이상은 5칸짜리 업로드 형식에 담기지 않는다. 그냥 두면 ⑥ 이후가 통째로
    // 보기5 셀에 눌려 들어가 **조용히 틀린 보기**가 된다(426번이 실제로 그랬다).
    if (BEYOND_FIFTH.test(rawBody)) { push("보기가 6개 이상 — 엑셀 형식(보기 5칸)에 담을 수 없다"); continue; }

    if (choices.length > 0) {
      if (!numeric) { push("보기는 있는데 정답이 서술형 — 원본 확인 필요"); continue; }
      if (choices.length < 2) { push(`보기가 ${choices.length}개만 추출됐다 — 원본 확인 필요`); continue; }
      if (answerNumbers.some((i) => i < 1 || i > choices.length)) {
        push(`정답 번호가 보기 범위(1~${choices.length})를 벗어난다: ${answer}`); continue;
      }
      const type = new Set(answerNumbers).size > 1 ? "MCQ_MULTI" : "MCQ_SINGLE";
      counts[type] = (counts[type] ?? 0) + 1;
      const cells = ["", "", "", "", ""];
      choices.forEach((c, i) => { cells[i] = c; });
      // 객관식 지문 끝의 정답 기입란("… -( )")은 종이에서만 뜻이 있다. 빈칸 문제의 괄호와
      // 헷갈릴 일이 없는 객관식에서만 지운다.
      const stem = content.replace(/[-‐‑‒–—―]*\s*\(\s*\)\s*$/, "").trim();
      upload.push([type, stem, "", "", ...cells, [...new Set(answerNumbers)].join(","), "", TAG, n] as UploadRow);
      continue;
    }

    // 보기가 없는 문항 — 단답이거나 빈칸 채우기다.
    if (numeric) {
      // 보기가 표·수식으로 조판돼 추출이 안 됐거나, 정답이 숫자인 빈칸 문제다. 어느 쪽이든 눈으로 봐야 한다.
      push("보기가 없는데 정답이 숫자 — 보기 추출 실패이거나 숫자 빈칸, 원본 확인 필요");
      continue;
    }
    const blanks = countBlanks(content);
    const answerItems = answer.split(/[,，]/).map((t) => t.trim()).filter((t) => t !== "");
    if (blanks >= 2 || answerItems.length > 1) {
      // SHORT_ANSWER 의 정답 열은 '허용 정답 목록'(하나만 맞으면 정답)이지 여러 칸이 아니다
      // (problemExcel.ts:197-202). 콤마가 든 정답을 여기에 넣으면 채점이 조용히 틀어진다.
      counts["FILL_BLANK"] = (counts["FILL_BLANK"] ?? 0) + 1;
      const base = blanks >= 2
        ? `다중빈칸(FILL_BLANK) — 괄호 ${blanks}개`
        : "정답이 여러 항목(콤마) — 빈칸 채우기로 입력";
      push(blanks >= 2 && blanks !== answerItems.length
        ? `${base}, 정답 항목 ${answerItems.length}개와 개수가 다르다 — 대조 필요`
        : base);
      continue;
    }
    // SHORT_ANSWER 는 '적어 낸 한 마디가 정답 목록에 있으면 정답' 이다. 여러 항목을 늘어놓은
    // 긴 답(260번 "안전관리총괄자 : 1명 …")을 여기 넣으면 그 문장 전체를 토씨까지 똑같이
    // 쳐야만 정답이 된다 — 사실상 아무도 못 맞힌다. 빈칸 채우기로 손입력하는 게 맞다.
    if (answer.length > 30 || answer.includes(":") || answer.includes("：")) {
      counts["FILL_BLANK"] = (counts["FILL_BLANK"] ?? 0) + 1;
      push("정답이 여러 항목을 늘어놓은 긴 문장 — 단답으로 채점할 수 없다, 빈칸 채우기로 입력");
      continue;
    }
    counts["SHORT_ANSWER"] = (counts["SHORT_ANSWER"] ?? 0) + 1;
    upload.push(["SHORT_ANSWER", content, "", "", "", "", "", "", "", answer, "", TAG, n] as UploadRow);
  }

  writeOutputs(upload, manual, counts);
}

/**
 * PDF 로 뽑은 지문·보기를 원본 문단 구조와 맞춰 본다. 어긋나면 그 사유를, 같으면 null.
 * 종이에만 있는 줄표·기입란은 `comparisonKey` 가 지우므로 차이로 세지 않는다.
 */
function crossCheck(hwp: HwpQuestion | undefined, content: string, choices: string[]): string | null {
  if (!hwp) return "원본 문단에서 이 문항을 찾지 못했다";

  if (!looksSame(content, hwp.content)) return "지문이 원본과 다르다";
  if (choices.length !== hwp.choices.length) {
    return `보기 개수가 원본과 다르다(엑셀 ${choices.length} vs 원본 ${hwp.choices.length})`;
  }
  for (let i = 0; i < choices.length; i += 1) {
    if (!looksSame(choices[i], hwp.choices[i])) return `보기${i + 1} 이 원본과 다르다`;
  }
  return null;
}

function assertComplete(map: Map<number, unknown>, label: string): void {
  const missing: number[] = [];
  for (let i = 1; i <= TOTAL; i += 1) if (!map.has(i)) missing.push(i);
  if (missing.length > 0) throw new Error(`${label} 에서 빠진 문항: ${missing.join(", ")}`);
  if (map.size !== TOTAL) throw new Error(`${label} 문항 수가 ${map.size} — ${TOTAL} 이어야 한다`);
}

function writeOutputs(upload: UploadRow[], manual: ManualRow[], counts: Record<string, number>): void {
  mkdirSync(OUT_DIR, { recursive: true });

  const wbUpload = XLSX.utils.book_new();
  const wsUpload = XLSX.utils.aoa_to_sheet([[...UPLOAD_HEADER], ...upload]);
  // 문항번호는 반드시 정수 숫자 셀이어야 한다 — 파서가 화면에 보이는 문자열을 ^[+-]?\d+$ 로
  // 검사하므로 서식이 소수점으로 잡히면 "5.00" 으로 읽혀 그 행이 실패한다(problemExcel.ts:92).
  for (let r = 1; r <= upload.length; r += 1) {
    const ref = XLSX.utils.encode_cell({ r, c: UPLOAD_HEADER.length - 1 });
    if (wsUpload[ref]) { wsUpload[ref].t = "n"; wsUpload[ref].z = "0"; }
  }
  wsUpload["!cols"] = UPLOAD_HEADER.map((h) =>
    h === "문제내용" ? { wch: 60 } : h.startsWith("보기") ? { wch: 34 } : { wch: 12 });
  XLSX.utils.book_append_sheet(wbUpload, wsUpload, "문제");
  const uploadPath = path.join(OUT_DIR, "문제_기술직.xlsx");
  XLSX.writeFile(wbUpload, uploadPath);

  const wbManual = XLSX.utils.book_new();
  const wsManual = XLSX.utils.aoa_to_sheet([
    [...MANUAL_HEADER],
    ...manual.map((m) => [m.number, m.reason, m.content, m.answer]),
  ]);
  wsManual["!cols"] = [{ wch: 10 }, { wch: 44 }, { wch: 70 }, { wch: 50 }];
  XLSX.utils.book_append_sheet(wbManual, wsManual, "수동입력");
  const manualPath = path.join(OUT_DIR, "_미업로드_빈칸_수동입력.xlsx");
  XLSX.writeFile(wbManual, manualPath);

  const log: string[] = [];
  log.push("기술직 문제은행 변환 로그");
  log.push(`생성: ${new Date().toISOString()}`);
  log.push("");
  log.push(`원본 문항 수: ${TOTAL}`);
  log.push(`업로드용: ${upload.length}행 (문제_기술직.xlsx)`);
  log.push(`수동입력: ${manual.length}행 (_미업로드_빈칸_수동입력.xlsx)`);
  log.push(`합계 검증: ${upload.length} + ${manual.length} = ${upload.length + manual.length}` +
    (upload.length + manual.length === TOTAL ? " OK" : " 불일치!"));
  if (numberFixes.length > 0) {
    log.push("");
    log.push("원본 머리표 번호 오타 보정 (앞뒤 번호로 자리를 확정했다)");
    for (const f of numberFixes) log.push(`  종이에 "${f.printed}" 로 찍힘 → ${f.used}번으로 넣음`);
  }
  log.push("");
  log.push("유형별 판정");
  for (const [k, v] of Object.entries(counts).sort()) log.push(`  ${k}: ${v}`);
  log.push("");
  log.push("수동입력으로 뺀 문항");
  const byReason = new Map<string, number[]>();
  for (const m of manual) {
    const key = m.reason.replace(/괄호 \d+개/, "괄호 N개").replace(/정답 항목 \d+개/, "정답 항목 N개");
    const list = byReason.get(key);
    if (list) list.push(m.number); else byReason.set(key, [m.number]);
  }
  for (const [reason, nums] of [...byReason].sort((a, b) => b[1].length - a[1].length)) {
    log.push(`  [${nums.length}건] ${reason}`);
    log.push(`    ${nums.join(", ")}`);
  }
  const logPath = path.join(OUT_DIR, "_검증로그.txt");
  writeFileSync(logPath, log.join("\n") + "\n", "utf8");
  const spellPath = writeSpacingReport();

  console.log("");
  console.log(log.join("\n"));
  console.log("");
  console.log(`저장: ${uploadPath}`);
  console.log(`저장: ${manualPath}`);
  console.log(`저장: ${logPath}`);
  console.log(`저장: ${spellPath}`);
}

/**
 * 맞춤법·띄어쓰기 교정 결과 보고서. 자동으로 고친 것과 **사람이 봐야 하는 것**을 나눠 적는다.
 * 오타 후보는 고치지 않는다 — 법령 용어를 기계가 손대면 뜻이 바뀔 수 있다.
 */
function writeSpacingReport(): string {
  const out: string[] = [];
  out.push("기술직 문제은행 맞춤법·띄어쓰기 검사 결과");
  out.push(`생성: ${new Date().toISOString()}`);
  out.push("");
  out.push("검사 대상: 500문항의 모든 문제내용·보기·정답");
  out.push("기준: 원본 .hwp 의 문단 텍스트(조판 이전이라 저자가 친 띄어쓰기가 그대로 있다)");
  out.push("");
  out.push("[자동 교정] PDF 조판 때문에 어긋났던 표기를 원본대로 되돌림");
  out.push(`  고친 칸: ${spacing.fixedCells}개`);
  out.push("  예시");
  for (const s of spacing.samples) {
    out.push(`    #${s.number}`);
    out.push(`      전: ${s.before}`);
    out.push(`      후: ${s.after}`);
  }
  out.push("");
  out.push("[자동 교정] 원본에서 줄맞춤 공백으로 갈려 있던 낱말을 도로 붙임");
  out.push("  판정 근거: 붙인 꼴이 문서 안에서 조각들보다 자주 쓰이면 붙였다.");
  const joins = [...spacing.joins].sort((a, b) => b[1] - a[1]);
  out.push(`  붙인 자리: ${joins.length}종 · 연 ${joins.reduce((s, [, n]) => s + n, 0)}회`);
  for (const [join, count] of joins) out.push(`    ${join}  (${count}회)`);
  out.push("");
  out.push("[자동 교정] 글자 차례가 어긋나 있던 칸을 원본 차례로 되돌림");
  out.push("  PDF 에서 위첨자·아래첨자(H₂O 의 2, LPG 의 L)는 기준선이 달라 딴 줄로 밀려 나온다.");
  out.push(`  되돌린 칸: ${spacing.reordered.length}개`);
  for (const r of spacing.reordered) {
    out.push(`    #${r.number} ${r.where}`);
    out.push(`      전: ${r.before}`);
    out.push(`      후: ${r.after}`);
  }
  out.push("");
  out.push("[사람이 볼 것] 원본에서 자리를 못 찾아 손대지 못한 칸");
  if (spacing.unmatched.length === 0) out.push("  없음");
  for (const u of spacing.unmatched) out.push(`  #${u.number} ${u.where}: ${u.text}`);
  out.push("");
  out.push("[사람이 볼 것] 오타 후보");
  out.push("  고른 기준: 문서에 한 번만 나오는 어절 + 틀린 글자가 문서에서 거의 안 쓰이는 글자 +");
  out.push("  바른 낱말이 바로 그 자리(앞뒤 낱말 사이)에 자주 오는 것. 셋을 다 만족해야 올린다.");
  out.push("  자동으로 고치지 않았다 — 법령 용어는 기계가 판단할 수 없다. 후보일 뿐이니 눈으로 봐라.");
  if (typoCandidates.length === 0) out.push("  없음");
  for (const t of typoCandidates) {
    out.push(`  "${t.rare}" → "${t.common}" 인가?  ("${t.badChar}" 은 문서에 거의 없고 "${t.goodChar}" 은 흔하다)`);
  }
  out.push("");
  out.push("[사람이 볼 것] 구두점이 겹친 자리");
  if (punctuationCandidates.length === 0) out.push("  없음");
  for (const p of punctuationCandidates) out.push(`  ${p}`);

  const reportPath = path.join(OUT_DIR, "_맞춤법검사.txt");
  writeFileSync(reportPath, out.join("\n") + "\n", "utf8");
  return reportPath;
}

let typoCandidates: { rare: string; common: string; badChar: string; goodChar: string }[] = [];
let punctuationCandidates: string[] = [];

try {
  main();
} catch (error) {
  console.error("변환 실패:", (error as Error).message);
  process.exit(1);
}
