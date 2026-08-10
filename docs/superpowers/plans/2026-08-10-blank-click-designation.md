# 빈칸 채우기 — 본문 클릭 지정 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 빈칸 채우기 문제 등록·수정 시 본문에서 단어를 클릭하면 그 자리가 `{{bN}}` 마커로 치환되고 정답이 자동 등록되는 "지정 모드"를 추가해, 지금의 이중 입력(마커 손타이핑 + 키·정답 별도 입력)을 없앤다.

**Architecture:** 본문 문자열(`{{b1}}` 마커 포함)이 **단일 진실**이다. 화면은 두 모드를 오간다 — 쓰기 모드(기존 `<textarea>` 자유 입력)와 지정 모드(같은 문자열을 파싱해 어절 칩으로 읽기전용 렌더, 클릭해 빈칸 지정). 지정 모드는 contentEditable을 쓰지 않고 순수 렌더 + 클릭이라 한글 IME 문제가 없다. 변환 로직은 전부 순수 함수로 `frontend/src/utils/`에 두고 단위 테스트로 고정한다. **백엔드는 변경하지 않는다** — 저장 payload가 지금과 동일하다.

**Tech Stack:** React 19 / Vite / Tailwind 4. 테스트는 Node 내장 러너 `node --test`(순수 함수만; 이 프로젝트엔 jsdom이 없어 컴포넌트 렌더 테스트 불가).

**근거 문서:**
- 브레인스토밍 합의(이 대화): 결정 6가지 — 본문=마커/정답 분리, 모드 전환, 조사·쉼표 자동 분리+조정 보조, 마커 문자열 단일 진실, 쉼표 제외 공백 어절, 등록·수정 양쪽.
- 서버 검증 규칙: `ProblemServiceImpl.validateBlanks`(빈칸 최소 1·키 정답 비어있지 않음·키 중복 금지·키가 본문에 `{{key}}`로 등장·revealCount 범위). 클라이언트 미러: `frontend/src/utils/problemBlanks.js`의 `validateBlanks`.

## Global Constraints

- 프론트엔드에는 **jsdom이 없다.** 순수 로직을 alias 없는 `frontend/src/utils/*.js`로 뽑아 `.test.js`(`node --test`)로 검증한다. `@/` alias를 쓰는 파일은 `node --test`가 로드하지 못한다.
- **컴포넌트 렌더링은 단위 테스트로 덮이지 않는다.** 화면 배선(Task 4)은 브라우저 검증(Task 5)이 유일한 안전망이다 — 앞선 회차에서 훅 순서 위반을 빌드·테스트가 모두 통과한 상태로 놓쳤다.
- **백엔드 무변경.** 저장 payload(`content` + `blanks` + `blankRevealCount`)는 지금과 같다. 재기동 불필요.
- 빈칸 마커 문법은 **이중 중괄호 `{{key}}`** 다(서버·기존 데이터와 동일). 키는 `b1`, `b2`… 순번.
- 현재 기준선: **백엔드 210 / 프론트엔드 189 전부 통과, 프로덕션 빌드 성공.**
- 커밋 메시지는 `feat:`/`fix:`/`test:`/`docs:` 영문 Conventional Commits.

## 데이터 모델 — 무엇이 단일 진실인가

```
content 문자열 (예):  "예산의 3요소는 {{b1}}, 집행, 결산 이다."
blanks 배열       :  [{ blankKey: "b1", answerText: "편성" }]
```

- 지정 모드는 `content`를 파싱해 "어디가 이미 빈칸(`{{b1}}`)이고 어디가 일반 어절인지" 렌더한다. **위치를 따로 저장하지 않는다.**
- 어절을 클릭하면 그 어절 텍스트가 `{{bN}}`으로 치환된 새 `content`와, 새 `{blankKey, answerText}` 항목이 나온다. `answerText`는 클릭한 어절에서 조사·쉼표를 뗀 값.
- 빈칸을 해제하면 `{{bN}}`이 그 자리 정답 텍스트로 되돌아가고, `blanks`에서 해당 항목이 빠진다.

## 범위 밖 (MVP 제외 — 합의)

| 항목 | 사유 |
|---|---|
| 여러 어절을 한 빈칸으로 묶기 (예: "정기예금 질권설정") | 클릭 단위가 어절이라 개별 빈칸이 된다. 후속 검토 |
| 지정 모드에서 텍스트 자체 편집 | 텍스트 수정은 쓰기 모드에서만. 모드 분리는 합의 사항 |
| contentEditable 제자리 편집 | 한글 IME 리스크. A(모드 전환)로 확정 |

---

## File Structure

| 파일 | 책임 | Task |
|---|---|---|
| `frontend/src/utils/blankTokens.js` | **신규.** 조사·쉼표 분리(`splitTrailing`)·키 발번(`nextBlankKey`)은 Task 1, 어절→빈칸 치환·해제·경계조정(`designateBlank`·`releaseBlank`·`adjustBlankBoundary`)은 Task 3에서 추가 | 1·3 |
| `frontend/src/utils/blankTokens.test.js` | **신규.** 위 함수 고정 | 1·3 |
| `frontend/src/utils/blankSegments.js` | **신규.** `content` 문자열 → `[{type:'text'|'blank', ...}]` 세그먼트, 텍스트 세그먼트는 어절 조각으로 분해(`segmentContent`) | 2 |
| `frontend/src/utils/blankSegments.test.js` | **신규.** 위 함수 고정 | 2 |
| `frontend/src/components/admin/BlankDesignator.jsx` | **신규.** 지정 모드 UI — 어절 칩 클릭, 빈칸 칩(Input 모양), 조사 ±1 조정, 해제 | 3 |
| `frontend/src/pages/admin/problems/ProblemFormPage.jsx` | 모드 토글 + BlankDesignator 배선. 클릭 결과로 `content`·`blanks` 갱신 | 4 |
| `docs/문제은행_엑셀/_수동입력_변환초안.md` | (선택) 이 기능으로 잔여 17행을 넣을 때 참고 | — |

---

### Task 1: 조사·쉼표 분리와 빈칸 치환 순수 함수

**Files:**
- Create: `frontend/src/utils/blankTokens.js`
- Create: `frontend/src/utils/blankTokens.test.js`

**Interfaces:**
- Consumes: 없음
- Produces:
  - `splitTrailing(word)` → `{ core, trailing }` — 어절 끝의 조사·구두점을 떼어 `core`(빈칸 정답)와 `trailing`(본문에 남길 꼬리)로 나눈다.
  - `TRAILING_PARTICLES` → `string[]` — 분리 대상 조사 목록(테스트가 참조).
  - `nextBlankKey(existingKeys)` → `string` — `existingKeys`에 없는 `b<N>` 중 가장 작은 번호. Task 3이 새 키 발번에 쓴다.

**배경:** 한국어 어절은 조사가 붙는다. "배관을"을 클릭하면 정답은 "배관", 본문에는 "을"이 남아야 `{{b1}}을 통하여`가 된다. 쉼표도 같다("편성,"→정답 "편성", 꼬리 ","). 조사 목록은 긴 것부터 매칭해야 한다("에서"를 "에"보다 먼저 봐야 "에서"가 통째로 떨어진다).

- [ ] **Step 1: 실패하는 테스트를 작성한다**

`frontend/src/utils/blankTokens.test.js`:

```javascript
import { test } from "node:test";
import assert from "node:assert/strict";
import { splitTrailing, nextBlankKey } from "./blankTokens.js";

test("splits a common object particle off the core", () => {
  assert.deepEqual(splitTrailing("배관을"), { core: "배관", trailing: "을" });
  assert.deepEqual(splitTrailing("편성,"), { core: "편성", trailing: "," });
});

// 긴 조사를 먼저 떼어낸다 — "에서"를 "에"로 자르면 "서"가 core 에 남는다.
test("prefers the longest matching particle", () => {
  assert.deepEqual(splitTrailing("회사에서"), { core: "회사", trailing: "에서" });
});

// 조사가 없으면 통째로 core.
test("keeps the whole word when there is no trailing particle", () => {
  assert.deepEqual(splitTrailing("결산"), { core: "결산", trailing: "" });
});

// 조사 + 구두점이 함께 붙은 경우 둘 다 뗀다.
test("strips a particle and punctuation together", () => {
  assert.deepEqual(splitTrailing("배관을,"), { core: "배관", trailing: "을," });
});

// 조사로 끝나는 것처럼 보이는 단어를 자르지 않도록 최소 core 길이를 지킨다.
test("does not strip when it would leave an empty core", () => {
  assert.deepEqual(splitTrailing("을"), { core: "을", trailing: "" });
});

test("nextBlankKey returns the smallest unused b-number", () => {
  assert.equal(nextBlankKey([]), "b1");
  assert.equal(nextBlankKey(["b1", "b2"]), "b3");
  assert.equal(nextBlankKey(["b2"]), "b1", "빈 번호를 채운다");
});
```

- [ ] **Step 2: 실패를 확인한다 (RED)**

Run: `cd frontend && node --test src/utils/blankTokens.test.js`
Expected: `ERR_MODULE_NOT_FOUND` — `blankTokens.js`가 없다.

- [ ] **Step 3: 구현한다**

`frontend/src/utils/blankTokens.js`:

```javascript
/**
 * 빈칸 지정의 문자열 처리 순수 함수.
 *
 * 한국어 어절은 조사가 붙는다("배관을"). 클릭해 빈칸으로 만들 때 정답은 명사("배관"),
 * 본문에 남길 꼬리는 조사("을")로 나눠야 {{b1}}을 통하여 처럼 자연스러워진다. 쉼표 같은
 * 구두점도 꼬리로 뗀다.
 *
 * 자동 분리는 완벽하지 않다("야간"→"야"+"간" 오분리 가능). 그래서 화면은 클릭 후 경계를
 * ±1글자 조정하는 보조 수단을 함께 둔다(BlankDesignator). 이 함수는 기본 추정만 한다.
 */

// 긴 것부터. 앞에서부터 첫 매칭을 쓰므로 "에서"가 "에"보다 앞에 있어야 한다.
export const TRAILING_PARTICLES = [
  "으로서", "으로써", "에서는", "에게서", "으로", "에서", "에게", "께서", "이란", "라는",
  "은", "는", "이", "가", "을", "를", "에", "의", "와", "과", "도", "만", "란", "로", "나",
];

const TRAILING_PUNCT = /[,.·:;]+$/;

export function splitTrailing(word) {
  let core = word;
  let trailing = "";

  // 1) 끝의 구두점을 먼저 뗀다.
  const punct = core.match(TRAILING_PUNCT);
  if (punct) {
    trailing = punct[0] + trailing;
    core = core.slice(0, -punct[0].length);
  }

  // 2) 조사를 뗀다. 뗀 뒤 core 가 비면 되돌린다(조사만 있는 어절 방지).
  for (const p of TRAILING_PARTICLES) {
    if (core.length > p.length && core.endsWith(p)) {
      core = core.slice(0, -p.length);
      trailing = p + trailing;
      break;
    }
  }

  return { core, trailing };
}

export function nextBlankKey(existingKeys) {
  const used = new Set(existingKeys);
  let n = 1;
  while (used.has(`b${n}`)) {
    n += 1;
  }
  return `b${n}`;
}
```

- [ ] **Step 4: 통과를 확인한다 (GREEN)**

Run: `cd frontend && node --test src/utils/blankTokens.test.js`
Expected: 6건 전부 통과.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/utils/blankTokens.js frontend/src/utils/blankTokens.test.js
git commit -m "feat: add particle-splitting and blank-key helpers for blank designation"
```

---

### Task 2: 본문 세그먼트 파서

**Files:**
- Create: `frontend/src/utils/blankSegments.js`
- Create: `frontend/src/utils/blankSegments.test.js`

**Interfaces:**
- Consumes: 없음
- Produces: `segmentContent(content, blanks)` → 세그먼트 배열. 각 원소는
  - `{ type: "blank", key, answer }` — `content`의 `{{key}}` 위치. `answer`는 `blanks`에서 찾은 정답(없으면 `""`).
  - `{ type: "word", text, start, end }` — 일반 텍스트 안의 어절(**쉼표·구두점 제외**). `start`/`end`는 **원본 `content` 문자열 기준 인덱스**(Task 3의 `designateBlank`가 치환 위치를 잡는 데 쓴다).
  - `{ type: "punct", text }` — 어절에 붙은 구두점(`,.·:;`). 클릭 대상이 아니고, 어절과 분리해 렌더한다.
  - `{ type: "space", text }` — 어절 사이 공백·개행(렌더용, 클릭 대상 아님).

  Task 3(렌더)과 Task 4(클릭 처리)가 이 배열을 쓴다.

**배경:** 지정 모드는 `content` 문자열 하나를 파싱해 그린다. `{{b1}}` 마커는 빈칸 칩으로, 나머지 텍스트는 어절로 쪼개 클릭 가능하게. 어절의 원본 인덱스(`start`/`end`)를 함께 내보내야, 클릭 시 "content의 이 구간을 `{{bN}}`으로 바꾼다"를 정확히 할 수 있다.

**쉼표를 어절에서 분리하는 것이 결정 5다** — 클릭 단위는 "쉼표 제외 공백 어절"이므로, `편성,`은 어절 `편성` + 구두점 `,` 두 세그먼트가 된다. 칩에는 `편성`만 보이고, `,`는 그 옆 평범한 텍스트로 남는다. `designateBlank`가 어절 `편성`만 치환하므로 결과 `{{b1}},`에서 쉼표는 자연히 보존된다. (조사 분리는 여전히 클릭 시점의 `splitTrailing`이 한다 — 구두점만 여기서 미리 가른다.)

- [ ] **Step 1: 실패하는 테스트를 작성한다**

`frontend/src/utils/blankSegments.test.js`:

```javascript
import { test } from "node:test";
import assert from "node:assert/strict";
import { segmentContent } from "./blankSegments.js";

test("splits plain text into word and space segments with indices", () => {
  const segs = segmentContent("예산의 3요소", []);
  assert.deepEqual(segs, [
    { type: "word", text: "예산의", start: 0, end: 3 },
    { type: "space", text: " " },
    { type: "word", text: "3요소", start: 4, end: 7 },
  ]);
});

test("renders a marker as a blank segment with its answer", () => {
  const segs = segmentContent("A {{b1}} B", [{ blankKey: "b1", answerText: "편성" }]);
  assert.deepEqual(segs, [
    { type: "word", text: "A", start: 0, end: 1 },
    { type: "space", text: " " },
    { type: "blank", key: "b1", answer: "편성" },
    { type: "space", text: " " },
    { type: "word", text: "B", start: 8, end: 9 },
  ]);
});

// 정답을 못 찾아도(데이터 불일치) 빈칸은 그려야 한다.
test("blank answer falls back to empty string when not in blanks", () => {
  const segs = segmentContent("{{b1}}", []);
  assert.deepEqual(segs, [{ type: "blank", key: "b1", answer: "" }]);
});

// 마커가 어절에 붙은 경우: {{b1}}을 → 빈칸 + 어절 "을"
test("a marker glued to a particle yields blank then word", () => {
  const segs = segmentContent("{{b1}}을 통하여", [{ blankKey: "b1", answerText: "배관" }]);
  assert.deepEqual(segs, [
    { type: "blank", key: "b1", answer: "배관" },
    { type: "word", text: "을", start: 6, end: 7 },
    { type: "space", text: " " },
    { type: "word", text: "통하여", start: 8, end: 11 },
  ]);
});

// 결정 5: 쉼표는 어절과 분리해 별도 punct 세그먼트로. 어절 인덱스는 쉼표를 포함하지 않는다.
test("separates a trailing comma from the word", () => {
  const segs = segmentContent("편성, 집행", []);
  assert.deepEqual(segs, [
    { type: "word", text: "편성", start: 0, end: 2 },
    { type: "punct", text: "," },
    { type: "space", text: " " },
    { type: "word", text: "집행", start: 4, end: 6 },
  ]);
});
```

- [ ] **Step 2: 실패를 확인한다 (RED)**

Run: `cd frontend && node --test src/utils/blankSegments.test.js`
Expected: `ERR_MODULE_NOT_FOUND`.

- [ ] **Step 3: 구현한다**

`frontend/src/utils/blankSegments.js`:

```javascript
/**
 * content 문자열을 지정 모드가 렌더할 세그먼트 배열로 파싱한다.
 *
 * {{key}} 마커는 blank 세그먼트(정답 포함)로, 그 사이 텍스트는 공백(space)·구두점(punct)·
 * 어절(word) 세 갈래로 나눈다. word 의 start/end 는 원본 content 인덱스라, 클릭 시 그 구간을
 * {{bN}} 으로 치환할 수 있다(designateBlank, Task 3).
 *
 * 쉼표 등 구두점은 어절에서 떼어 punct 세그먼트로 둔다("편성,"→word "편성" + punct ",";
 * 결정 5, 쉼표 제외 공백 어절). 조사는 여기서 떼지 않고 클릭 시점의 splitTrailing(Task 1)이 뗀다.
 */
const MARKER = /\{\{(b\d+)\}\}/g;

function segmentText(text, offset, out) {
  // 공백 / 구두점(,.·:;) / 어절 세 갈래로 나눈다. 구두점을 별도 세그먼트로 떼어 어절을
  // 클릭 단위에서 제외한다(결정 5: 쉼표 제외 공백 어절). 어절은 공백·구두점이 아닌 연속.
  const re = /(\s+)|([,.·:;]+)|([^\s,.·:;]+)/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    if (m[1] !== undefined) {
      out.push({ type: "space", text: m[1] });
    } else if (m[2] !== undefined) {
      out.push({ type: "punct", text: m[2] });
    } else {
      const start = offset + m.index;
      out.push({ type: "word", text: m[3], start, end: start + m[3].length });
    }
  }
}

export function segmentContent(content, blanks) {
  const answerByKey = new Map(blanks.map((b) => [b.blankKey, b.answerText]));
  const out = [];
  let last = 0;
  let m;
  MARKER.lastIndex = 0;
  while ((m = MARKER.exec(content)) !== null) {
    if (m.index > last) {
      segmentText(content.slice(last, m.index), last, out);
    }
    out.push({ type: "blank", key: m[1], answer: answerByKey.get(m[1]) ?? "" });
    last = m.index + m[0].length;
  }
  if (last < content.length) {
    segmentText(content.slice(last), last, out);
  }
  return out;
}
```

- [ ] **Step 4: 통과를 확인한다 (GREEN)**

Run: `cd frontend && node --test src/utils/blankSegments.test.js`
Expected: 5건 전부 통과.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/utils/blankSegments.js frontend/src/utils/blankSegments.test.js
git commit -m "feat: add content segmenter for blank designation mode"
```

---

### Task 3: 지정 모드 클릭 처리 순수 함수

**Files:**
- Modify: `frontend/src/utils/blankTokens.js`
- Modify: `frontend/src/utils/blankTokens.test.js`

**Interfaces:**
- Consumes: Task 1의 `splitTrailing`·`nextBlankKey`, Task 2의 `segmentContent` (테스트에서만)
- Produces:
  - `designateBlank(content, blanks, wordSeg)` → `{ content, blanks }` — `wordSeg`(Task 2의 word 세그먼트)를 빈칸으로 만든 새 상태. 어절에서 조사·쉼표를 떼어 정답으로, 나머지는 본문에 남긴다.
  - `releaseBlank(content, blanks, key)` → `{ content, blanks }` — `{{key}}`를 그 정답 텍스트로 되돌리고 `blanks`에서 제거.
  - `adjustBlankBoundary(content, blanks, key, delta)` → `{ content, blanks }` — 빈칸 정답 경계를 `delta`(±1글자) 옮긴다. `+1`은 바로 뒤 본문 글자를 정답에 흡수, `-1`은 정답 마지막 글자를 본문으로 내보낸다(조사 자동분리 보정용).

  Task 4가 세 함수를 이벤트 핸들러에서 호출한다.

**배경:** 상태 변경을 순수 함수로 몰아넣어야 화면 없이 테스트할 수 있다(jsdom 부재). 세 함수 모두 `(content, blanks, ...) → {content, blanks}` 꼴이라 React `setState`에 그대로 흘린다.

- [ ] **Step 1: 실패하는 테스트를 추가한다**

`blankTokens.test.js`에 추가한다.

```javascript
import { designateBlank, releaseBlank, adjustBlankBoundary } from "./blankTokens.js";
import { segmentContent } from "./blankSegments.js";

function wordSeg(content, text) {
  return segmentContent(content, []).find((s) => s.type === "word" && s.text === text);
}

test("designateBlank replaces a word with a marker and captures the answer", () => {
  const content = "예산의 3요소는 편성, 집행, 결산 이다.";
  const seg = wordSeg(content, "편성"); // 쉼표는 segmentContent가 이미 분리해 어절은 "편성"
  const next = designateBlank(content, [], seg);

  assert.equal(next.content, "예산의 3요소는 {{b1}}, 집행, 결산 이다.", "쉼표는 본문에 남는다");
  assert.deepEqual(next.blanks, [{ blankKey: "b1", answerText: "편성" }]);
});

test("designateBlank keeps a trailing particle in the content", () => {
  const content = "배관을 통하여";
  const seg = wordSeg(content, "배관을");
  const next = designateBlank(content, [], seg);

  assert.equal(next.content, "{{b1}}을 통하여");
  assert.deepEqual(next.blanks, [{ blankKey: "b1", answerText: "배관" }]);
});

test("designateBlank assigns the next free key", () => {
  const content = "{{b1}} 집행";
  const seg = wordSeg(content, "집행");
  const next = designateBlank(content, [{ blankKey: "b1", answerText: "편성" }], seg);

  assert.equal(next.content, "{{b1}} {{b2}}");
  assert.equal(next.blanks[1].blankKey, "b2");
});

test("releaseBlank puts the answer text back and drops the blank", () => {
  const next = releaseBlank("{{b1}}을 통하여", [{ blankKey: "b1", answerText: "배관" }], "b1");
  assert.equal(next.content, "배관을 통하여");
  assert.deepEqual(next.blanks, []);
});

// +1: 뒤 본문 글자를 정답으로 흡수 (조사를 정답에 다시 붙이고 싶을 때)
test("adjustBlankBoundary +1 absorbs the next content char into the answer", () => {
  const next = adjustBlankBoundary("{{b1}}을 통하여", [{ blankKey: "b1", answerText: "배관" }], "b1", 1);
  assert.equal(next.content, "{{b1}} 통하여");
  assert.equal(next.blanks[0].answerText, "배관을");
});

// -1: 정답 마지막 글자를 본문으로 내보냄 (과분리 보정)
test("adjustBlankBoundary -1 pushes the last answer char back to content", () => {
  const next = adjustBlankBoundary("{{b1}} 통하여", [{ blankKey: "b1", answerText: "배관을" }], "b1", -1);
  assert.equal(next.content, "{{b1}}을 통하여");
  assert.equal(next.blanks[0].answerText, "배관");
});
```

- [ ] **Step 2: 실패를 확인한다 (RED)**

Run: `cd frontend && node --test src/utils/blankTokens.test.js`
Expected: 새 6건 FAIL (`designateBlank` 등 미정의).

- [ ] **Step 3: 구현을 추가한다**

`blankTokens.js`에 추가한다.

```javascript
/**
 * word 세그먼트(Task 2)를 빈칸으로 만든다. 어절에서 조사·쉼표를 떼어 정답으로, 꼬리는
 * 본문에 남긴다. content 의 [start, end) 구간을 "{{key}}" + 꼬리로 치환한다.
 */
export function designateBlank(content, blanks, wordSeg) {
  const { core, trailing } = splitTrailing(wordSeg.text);
  const key = nextBlankKey(blanks.map((b) => b.blankKey));
  const replacement = `{{${key}}}${trailing}`;
  const nextContent = content.slice(0, wordSeg.start) + replacement + content.slice(wordSeg.end);
  return {
    content: nextContent,
    blanks: [...blanks, { blankKey: key, answerText: core }],
  };
}

export function releaseBlank(content, blanks, key) {
  const answer = blanks.find((b) => b.blankKey === key)?.answerText ?? "";
  const nextContent = content.replace(`{{${key}}}`, answer);
  return { content: nextContent, blanks: blanks.filter((b) => b.blankKey !== key) };
}

/**
 * 빈칸 정답 경계를 delta(±1)만큼 옮긴다.
 *  +1: 마커 바로 뒤 본문 글자 1개를 정답 끝에 붙이고 본문에서 제거.
 *  -1: 정답 마지막 글자 1개를 마커 바로 뒤 본문으로 내보냄.
 * 조사 자동분리가 과했거나 모자랄 때 손으로 보정하는 용도.
 */
export function adjustBlankBoundary(content, blanks, key, delta) {
  const marker = `{{${key}}}`;
  const at = content.indexOf(marker);
  if (at < 0) {
    return { content, blanks };
  }
  const after = at + marker.length;
  const blank = blanks.find((b) => b.blankKey === key);
  if (!blank) {
    return { content, blanks };
  }

  if (delta > 0) {
    const ch = content[after];
    if (!ch || /\s/.test(ch)) {
      return { content, blanks }; // 뒤가 공백/끝이면 흡수할 것이 없다
    }
    const nextContent = content.slice(0, after) + content.slice(after + 1);
    return {
      content: nextContent,
      blanks: blanks.map((b) => (b.blankKey === key ? { ...b, answerText: b.answerText + ch } : b)),
    };
  }

  if (delta < 0) {
    if (blank.answerText.length <= 1) {
      return { content, blanks }; // 정답이 비면 안 된다
    }
    const moved = blank.answerText.slice(-1);
    const nextContent = content.slice(0, after) + moved + content.slice(after);
    return {
      content: nextContent,
      blanks: blanks.map((b) =>
        b.blankKey === key ? { ...b, answerText: b.answerText.slice(0, -1) } : b,
      ),
    };
  }

  return { content, blanks };
}
```

- [ ] **Step 4: 통과를 확인한다 (GREEN)**

Run: `cd frontend && node --test src/utils/blankTokens.test.js`
Expected: 12건 전부 통과.

- [ ] **Step 5: 전체 프론트 테스트로 회귀 확인**

Run: `cd frontend && npm test`
Expected: 189 → 206 통과(Task 1 6건 + Task 2 5건 + Task 3 6건 = 17건 추가).

- [ ] **Step 6: Commit**

```bash
git add frontend/src/utils/blankTokens.js frontend/src/utils/blankTokens.test.js
git commit -m "feat: add designate/release/adjust blank transforms"
```

---

### Task 4: 지정 모드 컴포넌트 + 폼 배선

**Files:**
- Create: `frontend/src/components/admin/BlankDesignator.jsx`
- Modify: `frontend/src/pages/admin/problems/ProblemFormPage.jsx`

**Interfaces:**
- Consumes: Task 2 `segmentContent`, Task 3 `designateBlank`·`releaseBlank`·`adjustBlankBoundary`
- Produces: 없음(최종 화면).

**배경:** 지금 FILL_BLANK 폼은 (1) `problem-content` textarea, (2) "빈칸 후보" 목록(키·정답 수기 입력), (3) 노출 개수로 구성된다(`ProblemFormPage.jsx:575-640`). 이 Task는 (1)과 (2) 사이에 **모드 토글 + 지정 모드**를 넣는다. 지정 모드에서 클릭하면 `content`와 `blanks` 상태가 함께 갱신되므로, 아래 "빈칸 후보" 목록은 **그 결과를 보여주는 읽기 위주**가 된다(키는 자동, 정답은 여기서도 손볼 수 있게 남긴다).

**BlankDesignator 는 순수 표현 컴포넌트다** — 자기 상태를 갖지 않고 `content`/`blanks`와 콜백만 받는다. 로직은 전부 Task 1~3의 순수 함수에 있다.

- [ ] **Step 1: BlankDesignator 컴포넌트를 만든다**

`frontend/src/components/admin/BlankDesignator.jsx`:

```jsx
import { CaretLeft, CaretRight, X } from "@phosphor-icons/react";
import { segmentContent } from "@/utils/blankSegments.js";

/**
 * 빈칸 지정 모드. content 문자열을 세그먼트로 렌더한다 — 일반 어절은 클릭하면 빈칸이 되고,
 * 빈칸은 Input 모양 칩으로 보이며 해제·경계조정 버튼을 갖는다. 자기 상태는 없다: 클릭 결과를
 * onDesignate/onRelease/onAdjust 콜백으로 상위(ProblemFormPage)에 올린다.
 */
export default function BlankDesignator({ content, blanks, onDesignate, onRelease, onAdjust }) {
  const segments = segmentContent(content, blanks);

  return (
    <div
      className="min-h-[76px] rounded-sm border border-line-default bg-surface-subtle p-3 leading-9"
      aria-label="빈칸 지정 영역"
    >
      {segments.map((seg, i) => {
        if (seg.type === "space" || seg.type === "punct") {
          // 공백·구두점은 클릭 대상이 아니고 평범한 텍스트로 그린다.
          return <span key={i}>{seg.text}</span>;
        }
        if (seg.type === "word") {
          return (
            <button
              key={i}
              type="button"
              onClick={() => onDesignate(seg)}
              className="cursor-pointer rounded-xs px-0.5 hover:bg-surface-blue focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-brand-aqua"
              title="클릭해 빈칸으로 지정"
            >
              {seg.text}
            </button>
          );
        }
        // blank: Input 모양 칩 + 조정/해제
        return (
          <span
            key={i}
            className="mx-0.5 inline-flex h-[30px] items-center gap-1 rounded-sm border border-brand-aqua bg-surface-default px-2 align-middle"
          >
            <button type="button" onClick={() => onAdjust(seg.key, -1)} aria-label={`${seg.key} 정답 한 글자 줄이기`}>
              <CaretLeft size={12} aria-hidden="true" />
            </button>
            <span className="text-body-small text-ink-strong">{seg.answer || "빈칸"}</span>
            <button type="button" onClick={() => onAdjust(seg.key, 1)} aria-label={`${seg.key} 정답 한 글자 늘리기`}>
              <CaretRight size={12} aria-hidden="true" />
            </button>
            <button type="button" onClick={() => onRelease(seg.key)} aria-label={`${seg.key} 빈칸 해제`}>
              <X size={12} aria-hidden="true" />
            </button>
          </span>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: ProblemFormPage 에 모드 상태와 핸들러를 추가한다**

import를 추가한다.

```javascript
import BlankDesignator from "@/components/admin/BlankDesignator.jsx";
import { designateBlank, releaseBlank, adjustBlankBoundary } from "@/utils/blankTokens.js";
```

`blanks` 상태 선언(`ProblemFormPage.jsx:103`) 아래에 모드 상태를 추가한다.

```javascript
  // 쓰기 모드(textarea 자유 입력) ↔ 지정 모드(어절 클릭). 기본은 쓰기.
  const [blankMode, setBlankMode] = useState("write");
```

핸들러 세 개를 추가한다(`handleBlankAnswerChange` 부근). 세 함수 모두 순수 함수 결과를 `content`·`blanks`에 흘린다.

```javascript
  function handleDesignate(wordSeg) {
    const next = designateBlank(content, blanks, wordSeg);
    setContent(next.content);
    setBlanks(next.blanks);
    clearError("blanks");
  }

  function handleRelease(key) {
    const next = releaseBlank(content, blanks, key);
    setContent(next.content);
    setBlanks(next.blanks);
    clearError("blanks");
  }

  function handleAdjust(key, delta) {
    const next = adjustBlankBoundary(content, blanks, key, delta);
    setContent(next.content);
    setBlanks(next.blanks);
    clearError("blanks");
  }
```

- [ ] **Step 3: FILL_BLANK Surface 안에 모드 토글과 지정 모드를 배선한다**

`{type === "FILL_BLANK" && (` 로 시작하는 Surface(`:575`) 안, "빈칸 후보" 문단 아래·`blanks.map` 목록 위에 넣는다.

```jsx
              {/* 쓰기/지정 모드 토글. 지정 모드는 위 문제 내용(content)을 어절로 렌더해 클릭으로
                  빈칸을 만든다. content 는 마커 문자열 하나가 단일 진실이라 두 모드가 같은 값을 공유한다. */}
              <div className="mt-3 flex gap-2">
                <Button
                  type="button"
                  variant={blankMode === "write" ? "primary" : "secondary"}
                  size="sm"
                  onClick={() => setBlankMode("write")}
                >
                  쓰기 모드
                </Button>
                <Button
                  type="button"
                  variant={blankMode === "designate" ? "primary" : "secondary"}
                  size="sm"
                  onClick={() => setBlankMode("designate")}
                >
                  빈칸 지정 모드
                </Button>
              </div>

              {blankMode === "designate" ? (
                <div className="mt-3">
                  <p className="mb-2 text-body-small text-ink-muted">
                    문장의 단어를 클릭하면 빈칸이 됩니다. 조사·쉼표는 자동으로 분리되며, 빈칸 칩의
                    화살표로 정답 범위를 한 글자씩 조정할 수 있습니다.
                  </p>
                  <BlankDesignator
                    content={content}
                    blanks={blanks}
                    onDesignate={handleDesignate}
                    onRelease={handleRelease}
                    onAdjust={handleAdjust}
                  />
                </div>
              ) : null}
```

> 기존 "빈칸 후보" 목록(키·정답 Input)과 노출 개수 입력은 **그대로 둔다.** 지정 모드로 만든 결과가 그 목록에 반영되고(키 자동), 정답 미세 수정이나 수동 추가는 거기서도 된다. 두 방식이 같은 `blanks` 상태를 공유하므로 충돌하지 않는다.

- [ ] **Step 4: 프론트 테스트와 빌드를 확인한다**

Run: `cd frontend && npm test`
Expected: 206 통과(이 Task는 컴포넌트 배선이라 신규 단위 테스트 없음 — 로직은 Task 1~3에서 고정).

Run: `cd frontend && rtk proxy npm run build`
Expected: 빌드 성공.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/admin/BlankDesignator.jsx frontend/src/pages/admin/problems/ProblemFormPage.jsx
git commit -m "feat: add click-to-designate blank mode to the problem form"
```

---

### Task 5: 브라우저 검증

**Files:**
- 없음(검증만). 결함 발견 시 해당 파일 수정.

**Interfaces:**
- Consumes: Task 1~4
- Produces: 없음.

**배경:** 컴포넌트 렌더링·이벤트는 단위 테스트로 덮이지 않는다. 앞선 회차에서 훅 순서 위반을 빌드·테스트가 모두 통과한 상태로 놓쳤다. 이 Task가 유일한 안전망이다. **백엔드 무변경이라 재기동은 불필요**하고, 프론트 dev 서버만 있으면 된다.

- [ ] **Step 1: 등록 화면 — 지정 → 저장**

`admin` 로그인 후 `/admin/problems/new`에서 유형을 "빈칸 채우기"로.

| 절차 | 기대 |
|---|---|
| 문제 내용에 `예산의 3요소는 편성, 집행, 결산 이다.` 입력 | 쓰기 모드 textarea에 그대로 |
| "빈칸 지정 모드" 클릭 | 문장이 어절 칩으로 렌더, 각 단어에 hover 배경 |
| "편성," 클릭 | 그 자리가 빈칸 칩(`편성`)으로, 본문(쓰기 모드로 돌아가 확인)이 `{{b1}}, 집행…` |
| "집행," 클릭 | 두 번째 빈칸 `{{b2}}` |
| 귀속 부서 선택 후 저장 | 성공. 목록에 새 문제 |

DB로 확인: `content`에 `{{b1}}, {{b2}}`가 있고 `problem_blanks`에 편성·집행이 정답으로.

```sql
SELECT content FROM problems ORDER BY id DESC LIMIT 1;
SELECT blank_key, answer_text FROM problem_blanks
  WHERE problem_id = (SELECT max(id) FROM problems) ORDER BY blank_key;
```

- [ ] **Step 2: 조사 분리와 경계 조정**

새 문제에서 `배관을 통하여` 입력 → 지정 모드 → "배관을" 클릭.

| 확인 | 기대 |
|---|---|
| 빈칸 칩 | `배관` (조사 "을" 분리됨) |
| 쓰기 모드 본문 | `{{b1}}을 통하여` |
| 칩의 오른쪽 화살표(▶) 1회 | 정답 `배관을`, 본문 `{{b1}} 통하여` |
| 왼쪽 화살표(◀) 1회 | 정답 `배관`, 본문 `{{b1}}을 통하여` (원복) |

- [ ] **Step 3: 해제와 수정 화면**

- 지정한 빈칸의 X 버튼 클릭 → 빈칸이 정답 텍스트로 되돌아오고 어절로 복귀.
- 기존 빈칸 문항(예: 방금 등록한 것)의 수정 화면(`/admin/problems/:id/edit`)을 연다 → **지정 모드로 전환 시 기존 `{{b1}}`이 빈칸 칩으로 보인다**(파싱만으로 됨). 어절 하나를 추가 지정 → 저장 → 반영 확인.

- [ ] **Step 4: 콘솔 오류 없음 확인**

지정 모드 전환·클릭·해제 중 브라우저 콘솔에 React 오류(특히 "Rendered more hooks…")가 없어야 한다. `blankMode` 상태와 핸들러가 조기 return보다 위에 있는지 확인(ProblemFormPage의 기존 훅 위치 규칙).

- [ ] **Step 5: 결과를 문서에 기록하고 커밋**

`docs/문제은행_엑셀/_수동입력_변환초안.md`에 "이제 이 기능으로 잔여 빈칸 문항을 화면에서 넣을 수 있다"는 한 줄과 검증 결과를 남긴다.

```bash
git add docs/문제은행_엑셀/_수동입력_변환초안.md
git commit -m "docs: verify click-to-designate blank mode in the browser"
```

---

## 완료 기준

- [ ] 지정 모드에서 어절을 클릭하면 `{{bN}}` 마커 + 정답이 함께 생긴다 (이중 입력 제거)
- [ ] 조사·쉼표가 자동 분리되고, 화살표로 ±1글자 보정된다
- [ ] 빈칸 해제 시 정답 텍스트가 본문으로 되돌아온다
- [ ] 쓰기 모드에서 본문을 고쳐도 지정 모드가 다시 파싱해 어긋나지 않는다
- [ ] 수정 화면에서 기존 `{{b1}}`이 빈칸 칩으로 보인다 (추가 코드 없이)
- [ ] 백엔드 무변경 — 저장 payload가 기존과 동일
- [ ] 프론트엔드 189 → **206** 전부 통과, 빌드 성공
- [ ] 브라우저 콘솔에 React 훅 오류 없음
