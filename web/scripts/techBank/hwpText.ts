/**
 * 기술직 문제은행 원본 `.hwp` 에서 문단 텍스트를 읽어, PDF 에서 뽑은 문장의 **띄어쓰기를
 * 원본 기준으로 되돌리는** 도구.
 *
 * 왜 필요한가. PDF 는 조판 결과라 한 낱말이 줄 끝에서 갈리면 낱말 두 개로 나온다. 좌표만으로는
 * 원래 붙어 있었는지 알 수 없어서 이어 붙일 때 공백이 남는다("어 느 것인가?", "석유사 업법").
 * `.hwp` 에는 조판 이전의 문단 텍스트가 그대로 들어 있으므로, 공백을 모두 지운 문자열을 열쇠로
 * 원본에서 같은 자리를 찾아내면 **저자가 실제로 친 띄어쓰기**를 되찾을 수 있다.
 *
 * 원본에 남은 모호함이 하나 있다. 저자가 줄을 맞추려고 낱말 중간에 공백을 여러 칸 넣은 자리다
 * ("관     리에"). 이건 원본 자체의 문제라 hwp 를 봐도 답이 없다. 그래서 **말뭉치 근거**로 푼다 —
 * 붙인 꼴이 문서 안에서 더 자주 쓰이면 붙이고, 아니면 그냥 한 칸으로 둔다.
 */
import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as zlib from "node:zlib";
import * as XLSX from "xlsx";

/** HWP 5.0 레코드 헤더: 하위 10비트 태그 · 다음 10비트 수준 · 상위 12비트 크기(0xFFF 면 확장). */
const HWPTAG_PARA_TEXT = 0x043;
/** 8워드(16바이트)를 차지하는 확장/인라인 제어 문자. 나머지 제어 문자는 1워드. */
const WIDE_CONTROLS = new Set([1, 2, 3, 4, 5, 6, 7, 8, 9, 11, 12, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23]);

export function readHwpParagraphs(hwpPath: string): string[] {
  if (!fs.existsSync(hwpPath)) throw new Error(`원본 HWP 가 없다: ${hwpPath}`);
  const container = XLSX.CFB.read(fs.readFileSync(hwpPath), { type: "buffer" });
  const readStream = (name: string): Buffer => {
    const index = container.FullPaths.indexOf(name);
    if (index < 0) throw new Error(`HWP 안에 ${name} 스트림이 없다: ${hwpPath}`);
    return Buffer.from(container.FileIndex[index].content as Uint8Array);
  };

  const header = readStream("Root Entry/FileHeader");
  if (header.slice(0, 17).toString("latin1") !== "HWP Document File") {
    throw new Error(`HWP 5.0 파일이 아니다: ${hwpPath}`);
  }
  const flags = header.readUInt32LE(36);
  if (flags & 0x2) throw new Error(`암호가 걸린 HWP 는 읽을 수 없다: ${hwpPath}`);

  const paragraphs: string[] = [];
  const sections = (container.FullPaths as string[]).filter((p: string, i: number) =>
    container.FileIndex[i].type === 2 && p.startsWith("Root Entry/BodyText/Section"));
  // Section0, Section1 … 순서를 이름의 숫자로 확정한다(FullPaths 순서에 기대지 않는다).
  sections.sort((a: string, b: string) => Number(a.replace(/\D+/g, "")) - Number(b.replace(/\D+/g, "")));

  for (const name of sections) {
    const stream = readStream(name);
    const body = flags & 0x1 ? zlib.inflateRawSync(stream) : stream;
    let at = 0;
    while (at + 4 <= body.length) {
      const head = body.readUInt32LE(at);
      at += 4;
      const tag = head & 0x3ff;
      let size = (head >> 20) & 0xfff;
      if (size === 0xfff) { size = body.readUInt32LE(at); at += 4; }
      if (tag === HWPTAG_PARA_TEXT) paragraphs.push(decodeParaText(body.subarray(at, at + size)));
      at += size;
    }
  }
  return paragraphs;
}

function decodeParaText(buffer: Buffer): string {
  let out = "";
  for (let i = 0; i + 1 < buffer.length;) {
    const code = buffer.readUInt16LE(i);
    if (WIDE_CONTROLS.has(code)) { i += 16; continue; }
    if (code < 32) { i += 2; continue; }
    out += String.fromCharCode(code);
    i += 2;
  }
  return out;
}

/**
 * 가운뎃점 표기가 원본과 PDF 추출본에서 갈린다(U+00B7 / U+2024 / U+318D / U+30FB 등).
 * **열쇠를 만들 때만** 하나로 맞춘다 — 돌려주는 문장은 원본 글자를 그대로 쓴다.
 */
const MIDDLE_DOTS = "·․‧∙⋅ㆍ・•";

function normalizeChar(ch: string): string {
  return MIDDLE_DOTS.includes(ch) ? "·" : ch;
}

function strip(text: string): string {
  let out = "";
  for (const ch of text) if (!/\s/.test(ch)) out += normalizeChar(ch);
  return out;
}

export interface FixResult {
  text: string;
  /** 원본에서 자리를 찾지 못해 손대지 못한 경우. */
  unmatched: boolean;
  /** PDF 판과 표기가 달라져 고쳐진 경우. */
  changed: boolean;
  /** 글자 차례까지 어긋나 있어 원본 순서로 되돌린 경우("PG를 … L" → "LPG를 …"). */
  reordered: boolean;
  /** 이 문장 안에서 붙인 자리들("관"+"리에" → "관리에"). */
  joins: string[];
}

/**
 * 원본 문단을 공백 없는 한 줄 스트림으로 펴 두고, 문장을 그 안에서 찾아 **원본의 띄어쓰기**로
 * 돌려준다. 문서 순서대로 물어본다는 전제 아래 커서를 앞으로만 옮긴다 — 같은 보기 문장이
 * 문서 안에 여러 번 나와도 제자리를 짚기 위해서다.
 */
export class SpacingAuthority {
  private readonly raw: string;
  private readonly stream: string;
  private readonly offsets: number[];
  private readonly vocabulary: Map<string, number>;
  /** 줄맞춤 공백을 경계로 자른 어절 묶음. 앞뒤 낱말(문맥)을 보는 데 쓴다. */
  private readonly segments: string[][];
  private cursor = 0;

  constructor(paragraphs: string[]) {
    this.raw = paragraphs.join("\n");
    let stream = "";
    const offsets: number[] = [];
    for (let i = 0; i < this.raw.length; i += 1) {
      const ch = this.raw[i];
      if (/\s/.test(ch)) continue;
      stream += normalizeChar(ch);
      offsets.push(i);
    }
    this.stream = stream;
    this.offsets = offsets;
    this.segments = splitSegments(paragraphs);
    this.vocabulary = new Map();
    for (const tokens of this.segments) {
      for (const token of tokens) this.vocabulary.set(token, (this.vocabulary.get(token) ?? 0) + 1);
    }
  }

  fix(text: string): FixResult {
    const source = String(text);
    const key = strip(source);
    if (key === "") return { text: source, unmatched: false, changed: false, reordered: false, joins: [] };

    let at = this.stream.indexOf(key, this.cursor);
    // 앞에서 못 찾으면 문서 전체를 다시 본다. 커서가 어긋난 문항 하나 때문에 뒤가 전부
    // 미매칭이 되는 것을 막는다.
    if (at < 0) at = this.stream.indexOf(key);

    // 그래도 못 찾으면 **글자 차례가 어긋난** 경우다. 위첨자·아래첨자(H₂O, LPG 의 L)는 기준선이
    // 달라 PDF 추출에서 딴 줄로 밀려 나가고, 그 결과 "PG를 연료로 하는 보일러 L" 처럼 글자가
    // 자리를 바꾼다. 글자 구성은 그대로이므로 같은 글자 묶음을 가진 자리를 찾아 원본 차례로
    // 되돌린다.
    let reordered = false;
    if (at < 0) {
      at = this.findAnagram(key);
      reordered = at >= 0;
    }
    if (at < 0) return { text: source, unmatched: true, changed: false, reordered: false, joins: [] };
    this.cursor = at + key.length;

    const original = this.raw.slice(this.offsets[at], this.offsets[at + key.length - 1] + 1);
    const { text: rebuilt, joins } = this.rejoin(original);
    return { text: rebuilt, unmatched: false, changed: rebuilt !== collapse(source), reordered, joins };
  }

  /**
   * 같은 글자 묶음(순서만 다른)을 가진 구간의 시작 위치. 없으면 -1.
   *
   * 후보가 여럿일 수 있다 — 앞뒤 문장과 글자 하나를 주고받은 자리도 묶음은 같기 때문이다
   * (마침표 하나가 앞 문장에서 넘어와 ". 다음 …" 이 되는 식). 그래서 후보를 모두 모아
   * **자리까지 맞는 글자가 가장 많은** 것을 고른다.
   */
  private findAnagram(key: string): number {
    const want = new Map<string, number>();
    for (const ch of key) want.set(ch, (want.get(ch) ?? 0) + 1);

    const window = new Map<string, number>();
    let deficit = want.size;
    const bump = (ch: string, delta: number) => {
      const before = window.get(ch) ?? 0;
      const after = before + delta;
      if (after === 0) window.delete(ch); else window.set(ch, after);
      const target = want.get(ch);
      if (target === undefined) return;
      if (before === target && after !== target) deficit += 1;
      if (before !== target && after === target) deficit -= 1;
    };

    const candidates: number[] = [];
    for (let i = 0; i < this.stream.length; i += 1) {
      bump(this.stream[i], 1);
      if (i >= key.length) bump(this.stream[i - key.length], -1);
      // 창 안에 남는 글자가 없고(크기가 같고) 필요한 글자 수가 전부 맞으면 같은 묶음이다.
      if (i >= key.length - 1 && deficit === 0 && window.size === want.size) candidates.push(i - key.length + 1);
    }
    if (candidates.length === 0) return -1;

    let best = -1;
    let bestScore = -1;
    for (const start of candidates) {
      let same = 0;
      for (let k = 0; k < key.length; k += 1) if (this.stream[start + k] === key[k]) same += 1;
      // 자리까지 맞는 글자가 많은 쪽이 참 위치다. 같으면 커서에 가까운(문서 순서상 앞선) 쪽.
      if (same > bestScore || (same === bestScore && start >= this.cursor && best < this.cursor)) {
        bestScore = same;
        best = start;
      }
    }
    return best;
  }

  /**
   * 저자가 줄맞춤으로 넣은 공백 구간(두 칸 이상, 또는 문단 나눔)마다 붙일지 띄울지 정한다.
   * 붙인 꼴이 문서에 있고 조각들보다 흔하면 붙인다 — "통하"+"여" → "통하여".
   */
  private rejoin(original: string): { text: string; joins: string[] } {
    // 줄맞춤 공백(두 칸 이상)과 문단 나눔이 곧 모호한 자리다. 그 자리에서만 잘라 낸다.
    const GAPS = /[ \t]*\n[ \t]*|[ \t]{2,}/;
    const parts = original.split(GAPS).map((p) => p.trim()).filter((p) => p !== "");
    if (parts.length === 0) return { text: "", joins: [] };

    const joins: string[] = [];
    let out = parts[0];
    for (let i = 1; i < parts.length; i += 1) {
      const left = out.split(/\s+/).pop() ?? "";
      const right = parts[i].split(/\s+/)[0] ?? "";
      if (this.shouldJoin(left, right)) {
        joins.push(`${left} + ${right} → ${left}${right}`);
        out += parts[i];
      } else {
        out += " " + parts[i];
      }
    }
    return { text: collapse(out), joins };
  }

  private shouldJoin(left: string, right: string): boolean {
    if (left === "" || right === "") return false;
    const merged = this.vocabulary.get(left + right) ?? 0;
    if (merged === 0) return false;
    return merged >= (this.vocabulary.get(left) ?? 0) && merged >= (this.vocabulary.get(right) ?? 0);
  }

  /**
   * 오타 후보. 한 글자만 다른 흔한 낱말이 있다는 것만으로는 부족하다 — 객관식 오답 보기는
   * 일부러 한 글자만 바꿔 만들기 때문에("가스도매사업자" ↔ "가스판매사업자") 그렇게 걸면
   * 진짜 오타가 수백 건의 정상 낱말에 묻힌다.
   *
   * 그래서 **틀린 글자 자체가 문서에서 거의 안 쓰이는 글자**일 때만 고른다. "찿아내는" 의
   * "찿" 은 문서 전체에 한 번뿐이고 "찾" 은 여러 번 나온다 — 이건 오타다. 반면 "판" 과 "도"
   * 는 둘 다 흔하므로 걸리지 않는다.
   */
  suspectTypos(): { rare: string; common: string; badChar: string; goodChar: string }[] {
    const syllables = new Map<string, number>();
    for (const [word, count] of this.vocabulary) {
      for (const ch of word) syllables.set(ch, (syllables.get(ch) ?? 0) + count);
    }
    const RARE_SYLLABLE = 2;   // 이 이하로 쓰인 글자는 오타로 의심
    const COMMON_SYLLABLE = 10; // 이 이상 쓰인 글자를 정상형으로 본다
    const MIN_COMMON_WORD = 3;

    const byLength = new Map<number, string[]>();
    for (const [word, count] of this.vocabulary) {
      if (count < MIN_COMMON_WORD) continue;
      const list = byLength.get(word.length);
      if (list) list.push(word); else byLength.set(word.length, [word]);
    }

    // 앞낱말→낱말, 낱말→뒷낱말 짝의 빈도. "다음 중" 처럼 늘 붙어 다니는 짝을 알기 위해서다.
    const pairs = new Map<string, number>();
    const contexts = new Map<string, { prev: string; next: string }>();
    for (const tokens of this.segments) {
      for (let i = 0; i < tokens.length; i += 1) {
        if (i + 1 < tokens.length) {
          const k = `${tokens[i]}${tokens[i + 1]}`;
          pairs.set(k, (pairs.get(k) ?? 0) + 1);
        }
        if (!contexts.has(tokens[i])) {
          contexts.set(tokens[i], { prev: tokens[i - 1] ?? "", next: tokens[i + 1] ?? "" });
        }
      }
    }

    const found: { rare: string; common: string; badChar: string; goodChar: string }[] = [];
    for (const [word, count] of this.vocabulary) {
      if (count > 1 || word.length < 2 || !/[가-힣]/.test(word)) continue;
      const context = contexts.get(word);
      if (!context) continue;
      for (const candidate of byLength.get(word.length) ?? []) {
        const at = onlyDifferenceAt(word, candidate);
        if (at < 0) continue;
        const bad = word[at];
        const good = candidate[at];
        if (!/[가-힣]/.test(bad)) continue;
        if ((syllables.get(bad) ?? 0) > RARE_SYLLABLE) continue;
        if ((syllables.get(good) ?? 0) < COMMON_SYLLABLE) continue;
        // 결정적 조건: **바른 낱말이 바로 이 자리에 자주 오는가.** "디음 중" 은 "다음 중" 이
        // 수백 번 나오므로 오타로 판정되고, "옳은 것은" 은 "함은 것은" 이 없으므로 걸러진다.
        const before = pairs.get(`${context.prev}${candidate}`) ?? 0;
        const after = pairs.get(`${candidate}${context.next}`) ?? 0;
        if (before + after < 3) continue;
        found.push({ rare: word, common: candidate, badChar: bad, goodChar: good });
        break;
      }
    }
    return found;
  }

  /** 구두점이 겹치거나 어긋난 자리 — ",," 나 " ." 같은 것. 사람이 보고 고칠 목록. */
  suspectPunctuation(): string[] {
    const hits = new Set<string>();
    for (const word of this.vocabulary.keys()) {
      if (/([,.·․])\1/.test(word) || /,{2,}/.test(word)) hits.add(word);
    }
    return [...hits];
  }
}

function collapse(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/**
 * 문서를 어절 묶음으로 자른다. 줄맞춤 공백 구간은 낱말을 조각내므로 **그 구간을 경계로**
 * 자른다 — 조각("관", "리에")도 어절로 세지만, 붙인 꼴이 조각보다 흔한지 비교하는 데 쓰므로
 * 문제되지 않는다. 묶음 안에서는 앞뒤가 진짜 이웃이라 문맥 판단에 쓸 수 있다.
 */
function splitSegments(paragraphs: string[]): string[][] {
  const segments: string[][] = [];
  for (const paragraph of paragraphs) {
    for (const segment of paragraph.split(/[ \t]{2,}/)) {
      const tokens = segment.trim().split(/\s+/).filter((t) => t !== "");
      if (tokens.length > 0) segments.push(tokens);
    }
  }
  return segments;
}

/** 두 낱말이 딱 한 글자만 다르면 그 자리, 아니면 -1. */
function onlyDifferenceAt(a: string, b: string): number {
  if (a.length !== b.length || a === b) return -1;
  let at = -1;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] === b[i]) continue;
    if (at >= 0) return -1;
    at = i;
  }
  return at;
}

export interface HwpQuestion { content: string; choices: string[] }

/**
 * 원본 문단에서 문항 구조(지문 + 보기)를 **PDF 와 무관하게** 다시 읽는다.
 *
 * PDF 경로가 놓치는 것이 있다. 위첨자·아래첨자는 기준선이 달라 딴 보기로 넘어가고
 * (361번의 H₂O 아래첨자 2가 ③에서 ④로 옮겨 갔다), 동그라미 번호가 통째로 빠지기도 한다
 * (485번의 ⑤). 좌표를 아무리 잘 다뤄도 조판 결과만 봐서는 알 수 없는 종류의 손상이다.
 *
 * 그래서 문단 구조라는 **다른 길**로 한 번 더 읽어 두고, 두 길의 결과가 어긋나는 문항은
 * 업로드에서 빼 버린다. 조용히 틀린 보기가 DB 에 들어가는 것보다 수동 입력이 낫다.
 */
export function parseHwpQuestions(paragraphs: string[], total: number): Map<number, HwpQuestion> {
  const MARKS = ["①", "②", "③", "④", "⑤", "⑥", "⑦", "⑧", "⑨", "⑩"];

  // 머리표 후보를 먼저 모은다 — 원본에 번호 오타가 있어서(311이 "31.", 435는 마침표 없음,
  // 456이 "466.") 번호만 믿으면 그 지점부터 통째로 밀린다.
  const heads = new Map<number, { printed: number; rest: string; dotted: boolean }>();
  paragraphs.forEach((para, i) => {
    const dotted = para.match(/^\s*(\d{1,3})\s*\.\s*(.*)$/);
    if (dotted) { heads.set(i, { printed: Number(dotted[1]), rest: dotted[2], dotted: true }); return; }
    const bare = para.match(/^\s*(\d{1,3})\s+(\D.*)$/);
    if (bare) heads.set(i, { printed: Number(bare[1]), rest: bare[2], dotted: false });
  });
  const headIndexes = [...heads.keys()];

  const result = new Map<number, HwpQuestion>();
  let expect = 1;
  let current: { n: number; parts: string[] } | null = null;

  const flush = () => {
    if (!current) return;
    const joined = collapse(current.parts.join(" "));
    const first = joined.indexOf(MARKS[0]);
    const content = (first < 0 ? joined : joined.slice(0, first)).trim();
    const choices: string[] = [];
    if (first >= 0) {
      const rest = joined.slice(first);
      for (let m = 0; m < MARKS.length; m += 1) {
        const start = rest.indexOf(MARKS[m]);
        if (start < 0) break;
        const nextMark = m + 1 < MARKS.length ? rest.indexOf(MARKS[m + 1], start) : -1;
        const piece = rest.slice(start + MARKS[m].length, nextMark < 0 ? rest.length : nextMark).trim();
        if (piece === "") break;
        choices.push(piece);
      }
    }
    result.set(current.n, { content, choices });
  };

  for (let i = 0; i < paragraphs.length; i += 1) {
    // 마지막 문항 뒤의 개정 이력·법령정보센터 안내는 문항이 아니다.
    if (/^\s*♣/.test(paragraphs[i])) break;
    const head = heads.get(i);
    let accept = false;
    if (head && expect <= total) {
      if (head.printed === expect) accept = true;
      else if (head.dotted) {
        // 번호가 안 맞아도 **바로 다음 머리표**가 expect+1 이면 원본 오타로 보고 받아들인다.
        const nextIndex = headIndexes.find((x) => x > i);
        const next = nextIndex === undefined ? undefined : heads.get(nextIndex);
        if (next && next.printed === expect + 1) accept = true;
      }
    }
    if (accept && head) {
      flush();
      current = { n: expect, parts: [head.rest] };
      expect += 1;
    } else if (current) {
      current.parts.push(paragraphs[i]);
    }
  }
  flush();
  return result;
}

/**
 * 두 경로의 문장이 같은지 볼 때 쓰는 열쇠. 공백과 함께 **종이에만 있는 장식**(밑줄용 줄표,
 * 빈 정답 기입란)을 지운다 — 그것들은 파이프라인이 일부러 지우므로 차이로 세면 안 된다.
 */
export function comparisonKey(text: string): string {
  return strip(String(text).replace(/[-‐‑‒–—―]+/g, "").replace(/\(\s*\)/g, ""));
}

/**
 * 두 문장이 사실상 같은가. 한쪽이 다른 쪽을 품기만 해서는 안 된다 — 보기 하나가 옆 보기의
 * 첫 줄을 삼켜도(486번이 그랬다) 품기 검사는 통과해 버린다. 길이까지 비슷해야 같다고 본다.
 */
export function looksSame(a: string, b: string): boolean {
  const x = comparisonKey(a);
  const y = comparisonKey(b);
  if (x === y) return true;
  if (x === "" || y === "") return false;
  if (!x.includes(y) && !y.includes(x)) return false;
  return Math.min(x.length, y.length) >= Math.max(x.length, y.length) * 0.95;
}

/** `pdftotext`(poppler) 실행. 없으면 설치 안내와 함께 멈춘다. */
export function runPdfToText(pdfPath: string): string {
  if (!fs.existsSync(pdfPath)) throw new Error(`원본 PDF 가 없다: ${pdfPath}`);
  try {
    return execFileSync("pdftotext", ["-bbox-layout", pdfPath, "-"], {
      encoding: "utf8", maxBuffer: 64 * 1024 * 1024,
    });
  } catch (error) {
    throw new Error(
      `pdftotext 실행 실패. poppler-utils 가 PATH 에 있어야 한다.\n  원인: ${(error as Error).message}`,
    );
  }
}
