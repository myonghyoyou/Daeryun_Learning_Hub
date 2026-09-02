# 문제 본문에서 지문을 참조지문으로 분리 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 질문과 지문이 한 덩어리로 붙어 있는 문제 86개를 `content`(질문)와 `reference_text`(지문)로 나누고, 풀이 화면에서 질문 아래 테두리 박스로 지문을 보여준다.

**Architecture:** `problems.reference_text` 컬럼은 이미 있고 724행 전부 비어 있다. 문제당 물음표가 최대 하나뿐(2개 이상 0건)이라 분리 지점이 확정적이다. 분리 후 빈칸 마커(`{{blank_1}}`)가 `reference_text` 로 옮겨 가므로, "마커가 든 쪽"을 한 곳에서 정하는 `blankHostText` 개념을 도입해 렌더링·검증·관리자 지정 세 곳이 같은 판단을 쓰게 한다.

**Tech Stack:** Next.js 15 App Router, Drizzle ORM + postgres.js, Vitest, React(JSX)

**Spec:** 별도 spec 문서 없음. 이 대화에서 사용자가 before/after 예시로 요구사항을 확정했고("한 줄로 쭉 나오는 게 아니라 질문 밑에 테두리 박스"), 데이터 분리 방식도 사용자가 지정했다("참조 지문 컬럼으로 문제를 분리해야 하는 게 맞는 거 같은데?"). 관리자 빈칸 지정 기능까지 함께 고치기로 승인받았다.

## Global Constraints

- **빈칸 마커는 한 필드에만 있어야 한다.** `content` 와 `reference_text` 양쪽에 걸치면 렌더링·검증·지정이 모두 갈라진다. 검증에서 이를 거부한다. (실측: 분리 대상 16개 FILL_BLANK 전부 마커가 지문 쪽에만 있고, 질문 쪽에 걸친 것 0건)
- **채점은 건드리지 않는다.** FILL_BLANK 채점은 `problem_blanks` 표만 보고 본문 글자를 보지 않는다(`lib/solve/grading.ts` 의 `GradeInput` 에 content 가 없다). 채점 코드에 손대는 변경이 있으면 그것은 이 계획의 오류다.
- **`( )` 는 답을 적을 빈자리다.** 분리 규칙이 이 괄호를 건드리면 안 된다.
- **파리티 주석을 지우지 마라.** `lib/db/solveProblems.ts:30-34`, `lib/problem/problemValidation.ts:198-213` 등은 원본 Spring 동작을 고정한 주석이다. 동작을 바꾸는 곳은 주석도 함께 갱신한다.
- **테스트는 한 러너(vitest)로 모은다.** 매 태스크 끝에 전체 스위트를 돌려 무회귀를 확인한다.
- **새 회귀 테스트는 뮤테이션으로 검증한다.** 방금 만든 분기를 일부러 망가뜨려 그 테스트가 실제로 실패하는지 확인한 뒤 복원한다.
- **마이그레이션은 로컬 DB 에만 돌린다.** `assertSeedableEnvironment`(`lib/devSeed.ts`)를 재사용한다. 운영 반영은 이 계획 밖이다.
- **커밋은 태스크 단위.** `docs/**` 는 사용자 승인 없이 스테이징하지 않는다.

---

## 파일 구성

| 파일 | 책임 |
|---|---|
| `web/lib/problem/blankHost.ts` | 마커가 든 필드를 정하는 단 하나의 판단 (신규) |
| `web/lib/problem/splitReference.ts` | 본문을 질문/지문으로 나누는 순수 규칙 (신규) |
| `web/scripts/split-reference-text.ts` | 분리 마이그레이션 진입점 (신규) |
| `web/lib/problem/problemValidation.ts` | 서버 검증이 두 필드를 보게 |
| `web/utils/problemBlanks.js` | 클라이언트 검증 동기화 |
| `web/components/solve/ProblemSolveCard.jsx` | 질문 + 테두리 박스, 박스 안에서 빈칸 렌더 |
| `web/screens/admin/problems/ProblemFormPage.jsx` | 빈칸 지정을 마커가 든 필드에 연결 |
| `web/lib/db/problems.ts`, `web/lib/db/solveProblems.ts` | 검색이 지문도 훑게 |
| `web/lib/problemSync/proofSheet.ts` 외 | 교정 엑셀·동기화에 `reference_text` 추가 |

---

### Task 1: 분리 규칙과 마커 위치 판단

**Files:**
- Create: `web/lib/problem/splitReference.ts`, `web/lib/problem/blankHost.ts`
- Test: `web/lib/problem/splitReference.test.ts`, `web/lib/problem/blankHost.test.ts`

**Interfaces:**
- Consumes: 없음(순수 모듈)
- Produces: `splitQuestionAndReference(content: string): { question: string; reference: string | null }`, `blankHostText(content: string | null, referenceText: string | null): string`, `blankHostField(referenceText: string | null): "content" | "referenceText"`. Task 2~5 가 전부 이것을 쓴다.

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`web/lib/problem/splitReference.test.ts` 새로 작성:

```typescript
import { describe, it, expect } from "vitest";
import { splitQuestionAndReference } from "./splitReference";

describe("splitQuestionAndReference", () => {
  it("물음표 뒤에 지문이 있으면 나눈다", () => {
    const r = splitQuestionAndReference("다음 괄호 안에 적합한 용어는? ( )의 단가는 총괄원가를 나누어 산정한다.");
    expect(r.question).toBe("다음 괄호 안에 적합한 용어는?");
    expect(r.reference).toBe("( )의 단가는 총괄원가를 나누어 산정한다.");
  });

  it("물음표 뒤가 비어 있으면 나누지 않는다", () => {
    const r = splitQuestionAndReference("도로법 제10조 도로의 종류가 아닌 것은?");
    expect(r.question).toBe("도로법 제10조 도로의 종류가 아닌 것은?");
    expect(r.reference).toBeNull();
  });

  it("물음표 뒤가 짧으면 나누지 않는다 — 꼬리 기호까지 지문으로 삼지 않는다", () => {
    const r = splitQuestionAndReference("빈칸에 들어갈 말은? ( )");
    expect(r.reference).toBeNull();
  });

  it("물음표가 없으면 나누지 않는다", () => {
    const r = splitQuestionAndReference("다음 중 옳은 것을 고르시오.");
    expect(r.question).toBe("다음 중 옳은 것을 고르시오.");
    expect(r.reference).toBeNull();
  });

  it("빈칸 마커는 지문 쪽으로 간다", () => {
    const r = splitQuestionAndReference("다음 괄호 안에 들어갈 용어는? 가스사용자가 {{blank_1}}일 이내에 {{blank_2}}일간의 기한을 정한다.");
    expect(r.question).toBe("다음 괄호 안에 들어갈 용어는?");
    expect(r.reference).toContain("{{blank_1}}");
    expect(r.reference).toContain("{{blank_2}}");
  });

  it("나눈 두 조각을 붙이면 공백만 빼고 원문과 같다 — 글자를 잃지 않는다", () => {
    const original = "다음 기사를 읽고 빈칸에 들어갈 단어는? 김 지사는 도청에서 협약서에 서명했다.";
    const r = splitQuestionAndReference(original);
    const joined = `${r.question} ${r.reference}`;
    expect(joined.replace(/\s/g, "")).toBe(original.replace(/\s/g, ""));
  });

  it("물음표가 여러 개면 첫 번째에서 나눈다", () => {
    const r = splitQuestionAndReference("맞는 것은? 다음 설명이 옳은가? 판단하시오.");
    expect(r.question).toBe("맞는 것은?");
    expect(r.reference).toBe("다음 설명이 옳은가? 판단하시오.");
  });
});
```

`web/lib/problem/blankHost.test.ts` 새로 작성:

```typescript
import { describe, it, expect } from "vitest";
import { blankHostField, blankHostText } from "./blankHost";

describe("blankHostField", () => {
  it("지문이 있으면 지문이 마커의 집이다", () => {
    expect(blankHostField("지문 {{blank_1}} 입니다")).toBe("referenceText");
  });

  it("지문이 없으면 본문이 집이다", () => {
    expect(blankHostField(null)).toBe("content");
    expect(blankHostField("")).toBe("content");
  });
});

describe("blankHostText", () => {
  it("지문이 있으면 지문 글을 돌려준다", () => {
    expect(blankHostText("질문은?", "지문 {{b1}}")).toBe("지문 {{b1}}");
  });

  it("지문이 없으면 본문 글을 돌려준다", () => {
    expect(blankHostText("본문 {{b1}}", null)).toBe("본문 {{b1}}");
  });

  it("둘 다 없으면 빈 문자열이다 — null 을 흘려보내지 않는다", () => {
    expect(blankHostText(null, null)).toBe("");
  });
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인한다**

Run: `cd web && npx vitest run lib/problem/splitReference.test.ts lib/problem/blankHost.test.ts`
Expected: FAIL — 두 모듈이 없어 import 에러.

- [ ] **Step 3: 구현한다**

`web/lib/problem/blankHost.ts` 새로 작성:

```typescript
/**
 * 빈칸 마커(`{{blank_1}}`)가 어느 필드에 있는지 정하는 단 하나의 판단.
 *
 * 2026-09-02 에 질문/지문을 나누면서 마커가 지문 쪽으로 옮겨 갔다. 렌더링·서버 검증·
 * 클라이언트 검증·관리자 빈칸 지정 네 곳이 각자 판단하면 서로 어긋나므로 여기로 모은다.
 *
 * **마커는 한 필드에만 있어야 한다**(계획서 Global Constraints). 양쪽에 걸친 데이터는
 * validateFillBlank 가 거부한다 — 이 함수는 그 규칙이 지켜졌다고 전제한다.
 */
export function blankHostField(referenceText: string | null | undefined): "content" | "referenceText" {
  return referenceText ? "referenceText" : "content";
}

/** 마커가 든 글. 어느 쪽도 없으면 빈 문자열이다(null 을 아래로 흘려보내지 않는다). */
export function blankHostText(
  content: string | null | undefined,
  referenceText: string | null | undefined,
): string {
  return (referenceText ? referenceText : content) ?? "";
}
```

`web/lib/problem/splitReference.ts` 새로 작성:

```typescript
/**
 * 문제 본문을 질문과 지문으로 나눈다.
 *
 * 종이 문제집을 옮겨 온 데이터라 "다음 괄호 안에 적합한 용어는? ( )의 단가는 …" 처럼
 * 질문과 지문이 한 줄로 이어 붙어 있다. 실측 결과 문제당 물음표가 최대 하나뿐이라
 * (724문제 중 2개 이상인 것 0건) 첫 물음표가 곧 경계다.
 *
 * 나누지 않는 경우가 두 가지다:
 *  - 물음표가 없다 → 지시문형 문제("…고르시오.")
 *  - 물음표 뒤가 너무 짧다 → "빈칸에 들어갈 말은? ( )" 처럼 답 자리만 남은 경우.
 *    이걸 지문으로 떼면 빈 박스만 생긴다.
 */
const MIN_REFERENCE_LENGTH = 10;

export function splitQuestionAndReference(content: string): { question: string; reference: string | null } {
  const index = content.indexOf("?");
  if (index < 0) return { question: content, reference: null };

  const question = content.slice(0, index + 1).trim();
  const reference = content.slice(index + 1).trim();
  if (reference.length < MIN_REFERENCE_LENGTH) return { question: content, reference: null };

  return { question, reference };
}
```

- [ ] **Step 4: 테스트가 통과하는지 확인한다**

Run: `cd web && npx vitest run lib/problem/splitReference.test.ts lib/problem/blankHost.test.ts`
Expected: PASS, 10개 전부.

- [ ] **Step 5: 뮤테이션 테스트**

`splitReference.ts` 의 `if (reference.length < MIN_REFERENCE_LENGTH)` 줄을 잠시 지우고 재실행 → "물음표 뒤가 짧으면 나누지 않는다" 테스트가 실패하는지 확인 → 복원 → 다시 통과 확인.

- [ ] **Step 6: 전체 스위트 확인 + 커밋**

```bash
cd web && npx vitest run
```

```bash
git add web/lib/problem/splitReference.ts web/lib/problem/splitReference.test.ts web/lib/problem/blankHost.ts web/lib/problem/blankHost.test.ts
git commit -m "[ADD] 질문/지문 분리 규칙과 빈칸 마커 위치 판단"
```

---

### Task 2: 검증이 두 필드를 보게

**Files:**
- Modify: `web/lib/problem/problemValidation.ts:186-224`(`validateFillBlank`), 그 호출부
- Modify: `web/utils/problemBlanks.js:20-57`(`validateBlanks`)
- Test: `web/lib/problem/problemValidation.test.ts`, `web/utils/problemBlanks.test.js`

**Interfaces:**
- Consumes: `blankHostText(content, referenceText)`(Task 1)
- Produces: `validateFillBlank` 가 `referenceText` 를 받는다. `validateBlanks({ content, referenceText, blanks, blankRevealCount })` 로 인자가 바뀐다. Task 4(관리자 화면)가 이 새 시그니처를 쓴다.

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`web/lib/problem/problemValidation.test.ts` 의 기존 `describe` 안에 추가(파일 상단의 기존 헬퍼·import 를 그대로 쓴다. 기존 FILL_BLANK 픽스처가 `content` 에 마커를 넣는 형태이므로 그 형태를 참고해 작성한다):

```typescript
  it("빈칸 마커가 참조지문에 있어도 통과한다 — 분리 이후의 정상 형태다", () => {
    expect(() => validateProblem({
      type: "FILL_BLANK",
      content: "다음 괄호 안에 들어갈 용어는?",
      referenceText: "가스사용자가 {{b1}}일 이내에 납부한다",
      blanks: [{ blankKey: "b1", answerText: "30" }],
      blankRevealCount: 1,
    })).not.toThrow();
  });

  it("마커가 본문과 참조지문에 걸쳐 있으면 거부한다 — 한쪽에만 있어야 한다", () => {
    expect(() => validateProblem({
      type: "FILL_BLANK",
      content: "본문 {{b1}} 질문은?",
      referenceText: "지문 {{b2}} 입니다",
      blanks: [{ blankKey: "b1", answerText: "가" }, { blankKey: "b2", answerText: "나" }],
      blankRevealCount: 2,
    })).toThrow(/한쪽/);
  });

  it("참조지문이 없으면 예전처럼 본문에서 마커를 찾는다", () => {
    expect(() => validateProblem({
      type: "FILL_BLANK",
      content: "수도는 {{b1}}이다",
      referenceText: null,
      blanks: [{ blankKey: "b1", answerText: "서울" }],
      blankRevealCount: 1,
    })).not.toThrow();
  });
```

`web/utils/problemBlanks.test.js` 에 추가(기존 import 를 그대로 쓴다):

```javascript
  it("마커가 참조지문에 있어도 통과한다", () => {
    expect(validateBlanks({
      content: "다음 괄호 안에 들어갈 용어는?",
      referenceText: "가스사용자가 {{b1}}일 이내에 납부한다",
      blanks: [{ blankKey: "b1", answerText: "30" }],
      blankRevealCount: 1,
    })).toBeNull();
  });

  it("마커가 양쪽에 걸쳐 있으면 문구를 돌려준다", () => {
    expect(validateBlanks({
      content: "본문 {{b1}} 질문은?",
      referenceText: "지문 {{b2}} 입니다",
      blanks: [{ blankKey: "b1", answerText: "가" }, { blankKey: "b2", answerText: "나" }],
      blankRevealCount: 2,
    })).toMatch(/한쪽/);
  });
```

- [ ] **Step 2: 테스트가 실패하는지 확인한다**

Run: `cd web && npx vitest run lib/problem/problemValidation.test.ts utils/problemBlanks.test.js`
Expected: FAIL — 마커가 지문에 있는 경우 `본문에 없는 빈칸 마커입니다` 로 거부된다.

- [ ] **Step 3: 서버 검증을 고친다**

`web/lib/problem/problemValidation.ts` 상단 import 에 추가:

```typescript
import { blankHostText } from "./blankHost";
```

`validateFillBlank` 의 시그니처와 마커 검사 부분(186행·210-219행)을 다음으로 교체:

```typescript
function validateFillBlank(
  content: string | null, referenceText: string | null | undefined,
  blanks: BlankInput[], blankRevealCount: number | null | undefined,
): void {
  if (blanks.length === 0) invalid("빈칸을 최소 1개 정의하세요.");

  // Java 는 blanks 를 한 번만 순회하며 각 빈칸에 세 검사를 모두 적용한 뒤 다음 빈칸으로
  // 넘어간다(ProblemServiceImpl.java:407-420) — 규칙별 전체 스캔이 아니다. 두 개의 다른 빈칸이
  // 서로 다른 규칙을 위반할 때 어느 문구가 먼저 뜨는지가 이 순서에 달려 있다.
  for (const b of blanks) {
    if (isBlank(b.blankKey) || isBlank(b.answerText)) invalid("빈칸 키와 정답을 모두 입력하세요.");
    if ((b.blankKey ?? "").length > MAX_BLANK_KEY_LENGTH) invalid("빈칸 키는 50자 이하여야 합니다.");
    if ((b.answerText ?? "").length > MAX_BLANK_ANSWER_LENGTH) invalid("빈칸 정답은 500자 이하여야 합니다.");
  }

  // Java 는 trim 하지 않은 원본 키를 그대로 쓴다(keys.add(blank.getBlankKey())) — 중복 검사와
  // 마커 매칭 모두 이 값을 기준으로 한다.
  const keys = blanks.map((b) => b.blankKey ?? "");
  if (new Set(keys).size !== keys.length) invalid("빈칸 키가 중복되었습니다.");

  // 2026-09-02: 질문/지문을 나누면서 마커가 참조지문으로 옮겨 갔다. 마커가 양쪽에 걸치면
  // 렌더링·지정·검증이 서로 다른 글을 보게 되므로 여기서 막는다.
  if (referenceText && extractMarkers(content).length > 0 && extractMarkers(referenceText).length > 0) {
    invalid("빈칸 마커는 문제 본문과 참조지문 중 한쪽에만 있어야 합니다.");
  }

  // 마커가 든 쪽에서 검사한다. 참조지문이 있으면 거기가, 없으면 본문이 집이다(blankHost.ts).
  //
  // Java 는 이 방향(선언된 키가 본문에 있는가)을 리터럴 부분 문자열로 검사한다
  // (`content.contains("{{" + key + "}}")`, ProblemServiceImpl.java:425-429) — 정규식이 아니다.
  // 정규식(BLANK_MARKER_PATTERN)은 반대 방향(본문의 마커가 선언돼 있는가, :433-440)에만 쓰인다.
  // 두 방향에 같은 정규식 charset([A-Za-z0-9_-]+)을 쓰면, 그 charset 밖의 키(한글, "b.1" 처럼
  // "."을 포함하는 키 등)가 본문에 실제로 있어도 이 방향에서 false 로 거부된다.
  const hostText = blankHostText(content, referenceText);
  for (const key of keys) {
    if (!hostText.includes(`{{${key}}}`)) invalid(`본문에 없는 빈칸 마커입니다: ${key}`);
  }

  const markers = extractMarkers(hostText);
  const keySet = new Set(keys);
  for (const marker of markers) {
    if (!keySet.has(marker)) invalid(`정답이 등록되지 않은 빈칸 마커가 본문에 있습니다: ${marker}`);
  }

  if (blankRevealCount == null || blankRevealCount < 1 || blankRevealCount > blanks.length) {
    invalid("출제할 빈칸 개수가 유효하지 않습니다.");
  }
}
```

그리고 `validateFillBlank` 를 부르는 자리(같은 파일 아래쪽 `validateProblem` 안)에서 인자를 하나 더 넘기도록 고친다. 호출부를 찾아 `validateFillBlank(req.content, req.blanks, req.blankRevealCount)` 형태를 `validateFillBlank(req.content, req.referenceText, req.blanks, req.blankRevealCount)` 로 바꾼다.

- [ ] **Step 4: 클라이언트 검증을 같은 규칙으로 고친다**

`web/utils/problemBlanks.js` 의 `validateBlanks`(20-57행)를 다음으로 교체:

```javascript
export function validateBlanks({ content, referenceText, blanks, blankRevealCount }) {
  if (!blanks || blanks.length === 0) {
    return "빈칸을 최소 1개 정의하세요.";
  }

  if (blanks.some((blank) => isBlankText(blank.blankKey) || isBlankText(blank.answerText))) {
    return "빈칸 키와 정답을 모두 입력하세요.";
  }

  const keys = blanks.map((blank) => blank.blankKey.trim());
  if (new Set(keys).size !== keys.length) {
    return "빈칸 키가 중복되었습니다.";
  }

  // 서버 validateFillBlank 와 같은 순서·같은 문구. 정규식은 blankSegments.js 의 MARKER 와
  // 같은 문자 집합이어야 지정 모드가 칩으로 그리는 것과 검증이 보는 것이 일치한다.
  const markerPattern = /\{\{([A-Za-z0-9_-]+)\}\}/g;
  const countMarkers = (text) => ((text ?? "").match(markerPattern) || []).length;

  // 2026-09-02: 마커가 참조지문으로 옮겨 갔다. 양쪽에 걸치면 렌더링·지정·검증이 어긋난다.
  if (referenceText && countMarkers(content) > 0 && countMarkers(referenceText) > 0) {
    return "빈칸 마커는 문제 본문과 참조지문 중 한쪽에만 있어야 합니다.";
  }

  // 마커가 든 쪽에서 검사한다(lib/problem/blankHost.ts 와 같은 규칙).
  const hostText = (referenceText ? referenceText : content) ?? "";

  for (const key of keys) {
    if (!hostText.includes(`{{${key}}}`)) {
      return `본문에 없는 빈칸 마커입니다: ${key}`;
    }
  }

  const declared = new Set(keys);
  let m;
  markerPattern.lastIndex = 0;
  while ((m = markerPattern.exec(hostText)) !== null) {
    if (!declared.has(m[1])) {
      return `정답이 등록되지 않은 빈칸 마커가 본문에 있습니다: ${m[1]}`;
    }
  }

  const count = Number(blankRevealCount);
  if (!Number.isInteger(count) || count < 1 || count > blanks.length) {
    return "출제할 빈칸 개수가 유효하지 않습니다.";
  }

  return null;
}
```

- [ ] **Step 5: 테스트가 통과하는지 확인한다**

Run: `cd web && npx vitest run lib/problem/problemValidation.test.ts utils/problemBlanks.test.js`
Expected: PASS. 기존 테스트(마커가 본문에 있는 픽스처)도 그대로 통과해야 한다 — 참조지문이 없으면 예전 동작과 같기 때문이다.

- [ ] **Step 6: 뮤테이션 테스트**

서버 쪽 "양쪽에 걸치면 거부" 분기를 잠시 지우고 재실행 → 해당 테스트가 실패하는지 확인 → 복원 → 다시 통과 확인.

- [ ] **Step 7: 전체 스위트 + 타입 검사 + 커밋**

```bash
cd web && npx vitest run
cd web && npx tsc --noEmit
```

```bash
git add web/lib/problem/problemValidation.ts web/lib/problem/problemValidation.test.ts web/utils/problemBlanks.js web/utils/problemBlanks.test.js
git commit -m "[MOD] 빈칸 마커 검증이 참조지문도 보게"
```

---

### Task 3: 풀이 화면 — 질문 아래 테두리 박스

**Files:**
- Modify: `web/components/solve/ProblemSolveCard.jsx:96-124`

**Interfaces:**
- Consumes: `blankHostField(referenceText)`(Task 1), 기존 `parseBlankContent(content, blanksToAnswer, revealedAnswers)`(`web/utils/blankContent.js`)
- Produces: 없음(화면 종단)

- [ ] **Step 1: 렌더링을 고친다**

`web/components/solve/ProblemSolveCard.jsx` 상단 import 에 추가:

```jsx
import { blankHostField } from "@/lib/problem/blankHost";
```

96-124행(이미지·참조지문·본문을 그리는 구간)을 다음으로 교체:

```jsx
        {problem.imageUrl && (
          <img src={problem.imageUrl} alt="문제 이미지" className="mb-4 max-h-60 rounded-md border border-line-default" />
        )}

        {/* 질문. 빈칸 마커가 본문 쪽에 있는 문제(참조지문이 없는 FILL_BLANK)는 여기서 입력칸을 그린다. */}
        {problem.type === "FILL_BLANK" && blankHostField(problem.referenceText) === "content" ? (
          <p className="text-body leading-loose text-ink-strong">
            {parseBlankContent(problem.content, problem.blanksToAnswer, revealedAnswers).map((segment, index) => {
              if (segment.type === "text") return <span key={index}>{segment.value}</span>;
              if (segment.type === "reveal") return <strong key={index} className="font-semibold text-ink-strong">{segment.value}</strong>;
              return (
                <input
                  key={index}
                  aria-label={`빈칸 ${segment.blankKey}`}
                  disabled={answered}
                  className="mx-1 inline-block w-28 rounded-sm border-0 border-b-2 border-brand-blue bg-surface-blue px-1 text-center py-0.5 text-body text-ink-strong focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-brand-aqua disabled:opacity-60"
                  value={blankInputs[segment.blankKey] ?? ""}
                  onChange={(event) => setBlankInputs({ ...blankInputs, [segment.blankKey]: event.target.value })}
                />
              );
            })}
          </p>
        ) : (
          <p className="whitespace-pre-wrap text-body leading-relaxed text-ink-strong">{problem.content}</p>
        )}

        {/* 지문은 질문 아래 테두리 박스에 넣는다. 빈칸 마커가 지문에 있으면 입력칸도 이 안에 그린다. */}
        {problem.referenceText && (
          <div className="mt-4 rounded-md border border-line-default bg-surface-subtle p-4">
            {problem.type === "FILL_BLANK" ? (
              <p className="text-body leading-loose text-ink-strong">
                {parseBlankContent(problem.referenceText, problem.blanksToAnswer, revealedAnswers).map((segment, index) => {
                  if (segment.type === "text") return <span key={index}>{segment.value}</span>;
                  if (segment.type === "reveal") return <strong key={index} className="font-semibold text-ink-strong">{segment.value}</strong>;
                  return (
                    <input
                      key={index}
                      aria-label={`빈칸 ${segment.blankKey}`}
                      disabled={answered}
                      className="mx-1 inline-block w-28 rounded-sm border-0 border-b-2 border-brand-blue bg-surface-default px-1 text-center py-0.5 text-body text-ink-strong focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-brand-aqua disabled:opacity-60"
                      value={blankInputs[segment.blankKey] ?? ""}
                      onChange={(event) => setBlankInputs({ ...blankInputs, [segment.blankKey]: event.target.value })}
                    />
                  );
                })}
              </p>
            ) : (
              <p className="whitespace-pre-wrap text-body leading-relaxed text-ink-default">{problem.referenceText}</p>
            )}
          </div>
        )}
```

`Collapsible` 을 더 안 쓰게 되면 그 import 도 지운다(같은 파일에서 다른 곳이 쓰고 있으면 남긴다 — 지우기 전에 파일 안을 확인한다).

- [ ] **Step 2: 전체 스위트 + 빌드 확인**

```bash
cd web && npx vitest run
cd web && npx next build
```

이 저장소에는 React 렌더 테스트 인프라가 없다(기존 계획서들이 같은 이유로 화면 변경을 브라우저 실측으로 검증했다). 자동 테스트로 덮였다고 적지 마라.

- [ ] **Step 3: 커밋**

```bash
git add web/components/solve/ProblemSolveCard.jsx
git commit -m "[MOD] 풀이 화면에서 지문을 질문 아래 테두리 박스로"
```

---

### Task 4: 관리자 빈칸 지정을 마커가 든 필드에 연결

**Files:**
- Modify: `web/screens/admin/problems/ProblemFormPage.jsx` (빈칸 지정 핸들러 3개와 `BlankDesignator` 바인딩, `validateBlanks` 호출부)

**Interfaces:**
- Consumes: `blankHostField(referenceText)`(Task 1), `validateBlanks({ content, referenceText, blanks, blankRevealCount })`(Task 2), 기존 `designateBlank`/`releaseBlank`/`adjustBlankBoundary`(`web/utils/blankDesignate.js` 또는 같은 유틸)
- Produces: 없음(화면 종단)

- [ ] **Step 1: 지정 핸들러가 마커가 든 필드를 읽고 쓰게 한다**

`web/screens/admin/problems/ProblemFormPage.jsx` 상단 import 에 추가:

```jsx
import { blankHostField } from "@/lib/problem/blankHost";
```

빈칸 지정 핸들러 세 개(`handleDesignate` 계열, `handleRelease`, `handleAdjust` — 238-260행 부근)를 다음으로 교체한다. 어느 필드를 고칠지 한 곳에서 정하고 세 핸들러가 같은 판단을 쓴다:

```jsx
  // 빈칸 마커는 참조지문이 있으면 거기에, 없으면 본문에 있다(lib/problem/blankHost.ts).
  // 지정·해제·경계조정 세 동작이 모두 같은 필드를 읽고 써야 마커와 본문이 어긋나지 않는다.
  const blankField = blankHostField(referenceText);
  const blankSourceText = blankField === "referenceText" ? referenceText : content;
  const setBlankSourceText = blankField === "referenceText" ? setReferenceText : setContent;

  function handleDesignate(wordSeg) {
    // 키·정답이 "둘 다" 빈 행만 지운다(OR): 키만 먼저 채워 넣은 행은 사용자 입력이 있으므로 살려야 한다.
    const seeded = blanks.filter((b) => b.blankKey.trim() || b.answerText.trim());
    const next = designateBlank(blankSourceText, seeded, wordSeg);
    setBlankSourceText(next.content);
    setBlanks(next.blanks);
    clearError("blanks");
  }

  function handleRelease(key) {
    const next = releaseBlank(blankSourceText, blanks, key);
    setBlankSourceText(next.content);
    setBlanks(next.blanks);
    clearError("blanks");
  }

  function handleAdjust(key, delta) {
    const next = adjustBlankBoundary(blankSourceText, blanks, key, delta);
    setBlankSourceText(next.content);
    setBlanks(next.blanks);
    clearError("blanks");
  }
```

핸들러 이름 세 개(`handleDesignate`·`handleRelease`·`handleAdjust`)는 그대로 두고 본문만 바꾼다 — 이름을 바꾸면 JSX 의 연결이 끊어진다. `handleDesignate` 는 234행에 있다.

`blankField`·`blankSourceText`·`setBlankSourceText` 세 줄은 이 핸들러들보다 **위**에 와야 한다. `content`·`referenceText` state 선언(103·126행 부근) 다음이면 어디든 좋다.

- [ ] **Step 2: 지정 화면이 그 필드를 그리게 한다**

`BlankDesignator` 에 넘기는 `content` prop(690행 부근)을 `blankSourceText` 로 바꾼다:

```jsx
              <BlankDesignator content={blankSourceText} ... />
```

`...` 부분의 나머지 prop 은 그대로 둔다. 그리고 지정 화면 위에 어느 글을 편집 중인지 한 줄로 알린다(참조지문이 있을 때만):

```jsx
              {blankField === "referenceText" && (
                <p className="mb-2 text-body-small text-ink-muted">참조지문에서 빈칸을 지정합니다.</p>
              )}
```

- [ ] **Step 3: 저장 전 검증 호출을 새 시그니처에 맞춘다**

같은 파일에서 `validateBlanks({ content, blanks, blankRevealCount })` 형태로 부르는 자리를 찾아 `referenceText` 를 넘기도록 고친다:

```jsx
    const blankError = validateBlanks({ content, referenceText, blanks, blankRevealCount });
```

- [ ] **Step 4: 전체 스위트 + 빌드 + 타입 검사**

```bash
cd web && npx vitest run
cd web && npx next build
cd web && npx tsc --noEmit
```

- [ ] **Step 5: 커밋**

```bash
git add web/screens/admin/problems/ProblemFormPage.jsx
git commit -m "[MOD] 관리자 빈칸 지정을 참조지문에도 쓰게"
```

---

### Task 5: 검색이 지문도 훑게

**Files:**
- Modify: `web/lib/db/problems.ts:125-127`, `web/lib/db/solveProblems.ts:37`
- Test: `web/lib/problem/problemListService.test.ts`

**Interfaces:**
- Consumes: 없음
- Produces: 없음

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`web/lib/problem/problemListService.test.ts` 의 기존 keyword 테스트("keyword 는 본문 부분일치이고 대소문자를 가리지 않는다", 129-132행 부근) 뒤에 추가한다. 이 파일은 `seed()` 헬퍼(18-33행)로 문제를 심고 `listProblems(db, req, actor)` 로 조회하며, `none`(13-16행)이 필터 기본값이다. `seed()` 는 `referenceText` 를 받지 않으므로 심은 뒤 따로 채운다:

```typescript
  it("keyword 가 참조지문에도 걸린다 — 지문을 분리한 뒤에도 검색이 문제를 찾아야 한다", async () => {
    const id = await seed({ content: "다음 괄호 안에 적합한 용어는?", type: "SHORT_ANSWER" });
    await db.update(problems)
      .set({ referenceText: "총괄원가를 판매열량으로 나누어 산정한다" })
      .where(eq(problems.id, id));

    const res = await listProblems(db, { ...none, keyword: "판매열량" }, superAdmin);
    expect(res.items.map((p) => p.id)).toContain(id);
  });
```

- [ ] **Step 2: 테스트가 실패하는지 확인한다**

Run: `cd web && npx vitest run lib/problem/problemListService.test.ts`
Expected: FAIL — 검색이 `content` 만 보므로 못 찾는다.

- [ ] **Step 3: 관리자 목록 검색을 고친다**

`web/lib/db/problems.ts:125-127` 을 다음으로 교체:

```typescript
  // 2026-09-02: 질문/지문을 나누면서 본문의 절반이 reference_text 로 갔다. 본문만 훑으면
  // 지문에만 있는 낱말로는 문제를 못 찾는다 — 두 컬럼을 함께 본다.
  if (filters.keyword != null && filters.keyword !== "") {
    conditions.push(sql`(${problems.content} ILIKE '%' || ${filters.keyword} || '%'
      OR coalesce(${problems.referenceText}, '') ILIKE '%' || ${filters.keyword} || '%')`);
  }
```

- [ ] **Step 4: 풀이 목록 검색을 고친다**

`web/lib/db/solveProblems.ts:37` 을 다음으로 교체:

```typescript
  // 관리자 목록(lib/db/problems.ts)과 같은 이유로 참조지문도 함께 본다.
  if (keyword) {
    where.push(sql`(${problems.content} ILIKE ${`%${keyword}%`}
      OR coalesce(${problems.referenceText}, '') ILIKE ${`%${keyword}%`})`);
  }
```

`ilike` 를 더 안 쓰게 되면 그 import 를 지운다(같은 파일 다른 곳에서 쓰고 있으면 남긴다). `sql` 은 이미 import 되어 있다.

- [ ] **Step 5: 테스트가 통과하는지 확인한다**

Run: `cd web && npx vitest run lib/problem/problemListService.test.ts`
Expected: PASS. 기존 keyword 테스트도 그대로 통과해야 한다.

- [ ] **Step 6: 뮤테이션 테스트**

`problems.ts` 의 `OR coalesce(...)` 절을 잠시 지우고 재실행 → 새 테스트가 실패하는지 확인 → 복원 → 다시 통과 확인.

- [ ] **Step 7: 전체 스위트 + 타입 검사 + 커밋**

```bash
cd web && npx vitest run
cd web && npx tsc --noEmit
```

```bash
git add web/lib/db/problems.ts web/lib/db/solveProblems.ts web/lib/problem/problemListService.test.ts
git commit -m "[MOD] 문제 검색이 참조지문도 훑게"
```

---

### Task 6: 교정 엑셀에 참조지문 칸 추가

**Files:**
- Modify: `web/lib/problemSync/proofSheet.ts`, `web/lib/problemSync/applyProofSheet.ts`, `web/lib/problemSync/revertProofSheet.ts`, `web/scripts/export-proof-sheet.ts`
- Test: `web/lib/problemSync/revertProofSheet.test.ts`

**Interfaces:**
- Consumes: 없음
- Produces: 교정 시트에 `reference_text` 칸이 생기고, 되돌리기가 `field: "referenceText"` 를 다룬다.

**이미 되어 있어 손대지 않는 것 (2026-09-02 확인):** 동기화 도구(`snapshot.ts`·`exportSnapshot.ts`·`importSnapshot.ts`)는 **이미 참조지문을 완전히 나른다.** `SnapshotProblem.referenceText`(snapshot.ts:22), `parseSnapshot` 의 검증(:120), 내보내기 SQL 의 `p.reference_text AS "referenceText"`(exportSnapshot.ts:127), 들여오기 insert 의 `referenceText`(importSnapshot.ts:87)가 모두 있다. **이 네 파일은 건드리지 마라.** 빠진 것은 교정 엑셀 경로뿐이다.

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`web/lib/problemSync/revertProofSheet.test.ts` 에 추가(파일의 기존 `contentChange` 헬퍼를 쓴다):

```typescript
  it("참조지문도 되돌린다", async () => {
    await db.update(problems).set({ referenceText: "고친 지문" }).where(eq(problems.id, problemId));
    await applyRevert(db, [contentChange({
      column: "reference_text", field: "referenceText", before: "원래 지문", after: "고친 지문",
    })]);
    const [row] = await db.select({ v: problems.referenceText }).from(problems).where(eq(problems.id, problemId));
    expect(row.v).toBe("원래 지문");
  });

  it("참조지문을 빈 값으로 되돌리면 null 로 넣는다", async () => {
    await db.update(problems).set({ referenceText: "고친 지문" }).where(eq(problems.id, problemId));
    await applyRevert(db, [contentChange({
      column: "reference_text", field: "referenceText", before: "", after: "고친 지문",
    })]);
    const [row] = await db.select({ v: problems.referenceText }).from(problems).where(eq(problems.id, problemId));
    expect(row.v).toBeNull();
  });
```

- [ ] **Step 2: 테스트가 실패하는지 확인한다**

Run: `cd web && npx vitest run lib/problemSync/revertProofSheet.test.ts`
Expected: FAIL — `field: "referenceText"` 가 타입에 없고, `applyRevert` 가 그 갈래를 모른다.

- [ ] **Step 3: 교정 시트에 참조지문 칸을 넣는다**

`web/lib/problemSync/proofSheet.ts`:

`EDITABLE_COLUMNS` 의 `"content",` 뒤에 `"reference_text",` 를 추가한다.
`SHEET_COLUMNS` 의 `"content",` 뒤에 `"reference_text",` 를 추가한다.
`ProblemForSheet` 타입의 `content: string;` 뒤에 `referenceText: string | null;` 을 추가한다.
`toSheetRow` 의 `content: problem.content,` 뒤에 다음을 추가한다:

```typescript
    reference_text: problem.referenceText ?? "",
```

`web/scripts/export-proof-sheet.ts` 의 문제 조회 select 에 `referenceText: problems.referenceText,` 를 추가하고, `forSheet` 객체에 `referenceText: p.referenceText,` 를 추가한다. 컬럼 폭 지정에서 `content` 와 같은 폭을 쓰도록 `if (c === "content")` 를 `if (c === "content" || c === "reference_text")` 로 바꾼다.

`web/lib/problemSync/applyProofSheet.ts`:

`CellChange` 의 `field` 유니온에 `"referenceText"` 를 추가한다.
`LoadedProblem` 타입에 `referenceText: string | null;` 을 추가한다.
문제 조회 select 에 `referenceText: problems.referenceText` 를 추가하고, `loaded.set(...)` 에 `referenceText: p.referenceText` 를 넣는다.
`content` 를 비교하는 `push(...)` 줄 아래에 추가한다:

```typescript
    // 참조지문도 교정 대상이다. 비울 수 있어야 하므로 빈 문자열도 값으로 본다.
    push("reference_text", "problems", id, "referenceText", db_.referenceText ?? "", cell(row, "reference_text"));
```

`applyProofChanges` 의 `problems` 분기에서 `content`/`explanation` 을 가르는 곳에 세 번째 갈래를 넣는다:

```typescript
        if (c.field === "content") {
          await tx.update(problems).set({ content: c.after }).where(eq(problems.id, c.rowId));
        } else if (c.field === "referenceText") {
          await tx.update(problems).set({ referenceText: c.after === "" ? null : c.after })
            .where(eq(problems.id, c.rowId));
        } else {
          await tx.update(problems).set({ explanation: c.after === "" ? null : c.after })
            .where(eq(problems.id, c.rowId));
        }
```

`web/lib/problemSync/revertProofSheet.ts` 의 `readCurrent` 에서 `problems` 분기도 세 갈래로 만든다:

```typescript
  if (change.table === "problems") {
    const [row] = await db.select({
      content: problems.content, explanation: problems.explanation, referenceText: problems.referenceText,
    }).from(problems).where(eq(problems.id, change.rowId)).limit(1);
    if (!row) return null;
    if (change.field === "content") return row.content;
    if (change.field === "referenceText") return row.referenceText ?? "";
    return row.explanation ?? "";
  }
```

`applyRevert` 의 `problems` 분기에도 같은 세 갈래를 넣는다(위 `applyProofChanges` 와 같은 모양, `c.after` 대신 `c.before` 를 쓴다).

- [ ] **Step 6: 테스트가 통과하는지 확인한다**

Run: `cd web && npx vitest run lib/problemSync/`
Expected: PASS.

- [ ] **Step 7: 전체 스위트 + 타입 검사 + 커밋**

```bash
cd web && npx vitest run
cd web && npx tsc --noEmit
```

```bash
git add web/lib/problemSync/ web/scripts/export-proof-sheet.ts
git commit -m "[MOD] 교정 엑셀과 동기화가 참조지문을 다루게"
```

---

### Task 7: 분리 마이그레이션 실행과 실측

**Files:**
- Create: `web/scripts/split-reference-text.ts`
- Modify: `web/package.json`(scripts)

**Interfaces:**
- Consumes: `splitQuestionAndReference(content)`(Task 1), `assertSeedableEnvironment(env)`(`web/lib/devSeed.ts`), `getDb()`(`web/lib/db/client.ts`)
- Produces: 없음(종단)

- [ ] **Step 1: 마이그레이션 스크립트를 만든다**

`web/scripts/split-reference-text.ts` 새로 작성:

```typescript
// tsx 는 .env 를 로드하지 않는다. 부수효과 import 라 다른 import 보다 먼저 와야 한다
// (scripts/seed-dev.ts 와 같은 이유).
import "dotenv/config";

import { mkdir, writeFile } from "node:fs/promises";
import { eq, isNull, and } from "drizzle-orm";
import { getDb } from "../lib/db/client";
import { assertSeedableEnvironment } from "../lib/devSeed";
import { problems } from "../lib/db/schema";
import { splitQuestionAndReference } from "../lib/problem/splitReference";

const BACKUP_DIR = ".data";
const PREVIEW_LIMIT = 10;

async function main() {
  // 로컬 DB 가 아니면 여기서 멈춘다. 아래는 문제 본문을 실제로 바꾼다.
  assertSeedableEnvironment(process.env);

  const apply = process.argv.includes("--apply");
  const db = getDb();

  // 이미 참조지문이 있는 문제는 건드리지 않는다 — 관리자가 직접 채운 값을 덮어쓰면 안 된다.
  const rows = await db.select({ id: problems.id, type: problems.type, content: problems.content })
    .from(problems).where(isNull(problems.referenceText));

  const changes = [];
  for (const row of rows) {
    const { question, reference } = splitQuestionAndReference(row.content);
    if (reference === null) continue;
    changes.push({ id: row.id, type: row.type, before: row.content, question, reference });
  }

  console.log(`참조지문이 비어 있는 문제 ${rows.length}개 중 나눌 것 ${changes.length}개`);
  const byType: Record<string, number> = {};
  for (const c of changes) byType[c.type] = (byType[c.type] ?? 0) + 1;
  console.log(`  유형별: ${JSON.stringify(byType)}`);

  console.log(`\n=== 나뉠 모습 (앞 ${Math.min(PREVIEW_LIMIT, changes.length)}개) ===`);
  for (const c of changes.slice(0, PREVIEW_LIMIT)) {
    console.log(`  [${c.id} ${c.type}]`);
    console.log(`    질문: ${c.question}`);
    console.log(`    지문: ${c.reference.slice(0, 90)}${c.reference.length > 90 ? "…" : ""}`);
  }

  if (!apply) {
    console.log(`\n확인만 했고 DB 는 건드리지 않았습니다.`);
    console.log(`실제로 나누려면: pnpm split:reference -- --apply`);
    return;
  }

  await mkdir(BACKUP_DIR, { recursive: true });
  const backupPath = `${BACKUP_DIR}/split-reference-backup-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
  await writeFile(backupPath, JSON.stringify(changes, null, 2), "utf8");
  console.log(`\n백업 저장: ${backupPath}`);

  let applied = 0;
  await db.transaction(async (tx) => {
    for (const c of changes) {
      // before 가 지금도 그대로일 때만 바꾼다.
      const res = await tx.update(problems)
        .set({ content: c.question, referenceText: c.reference })
        .where(and(eq(problems.id, c.id), eq(problems.content, c.before)))
        .returning({ id: problems.id });
      if (res.length === 1) applied += 1;
    }
  });
  console.log(`나누기 완료: ${applied}개 (건너뜀 ${changes.length - applied}개)`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("분리 실패:", error instanceof Error ? error.message : error);
    process.exit(1);
  });
```

- [ ] **Step 2: 명령어를 등록한다**

`web/package.json` 의 `scripts` 에서 `"proof:revert"` 줄 뒤에 추가:

```json
    "split:reference": "tsx scripts/split-reference-text.ts"
```

앞 줄 끝에 쉼표를 넣는 것을 잊지 마라.

- [ ] **Step 3: 확인만 돌려본다**

```bash
cd web && pnpm split:reference
```

확인할 것:
- 나눌 문제가 **86개**로 나오는지(2026-09-02 실측치)
- 유형별이 `MCQ_SINGLE 22 · SHORT_ANSWER 46 · MCQ_MULTI 2 · FILL_BLANK 16` 인지
- 미리보기의 질문이 온전한 문장이고, 지문이 `( )` 나 `{{blank_N}}` 을 잃지 않았는지

숫자가 다르면 **멈추고 보고한다** — 1차·2차 교정으로 본문이 바뀌었으니 소폭 차이는 있을 수 있으나, 크게 다르면 분리 규칙을 다시 봐야 한다.

- [ ] **Step 4: 실제로 나눈다**

```bash
cd web && pnpm split:reference -- --apply
```

- [ ] **Step 5: 데이터를 검증한다**

```bash
cd web && npx vitest run
cd web && npx tsc --noEmit
```

그리고 나뉜 결과를 직접 확인한다. 아래를 `web/_tmp_verify_split.mjs` 로 만들어 돌리고, 확인 뒤 파일을 지운다:

```javascript
import postgres from "postgres";
import "dotenv/config";
const db = postgres(process.env.DATABASE_URL, { prepare: false });
const rows = await db`SELECT id::int, type, content, reference_text FROM problems WHERE reference_text IS NOT NULL`;
console.log(`참조지문이 채워진 문제 ${rows.length}개`);
let bad = 0;
for (const r of rows) {
  // 빈칸 마커가 양쪽에 걸치면 안 된다
  const inContent = (r.content.match(/\{\{[A-Za-z0-9_-]+\}\}/g) || []).length;
  const inRef = (r.reference_text.match(/\{\{[A-Za-z0-9_-]+\}\}/g) || []).length;
  if (inContent > 0 && inRef > 0) { bad++; console.log(`  [${r.id}] 마커가 양쪽에 걸침`); }
  if (r.type === "FILL_BLANK" && inContent + inRef === 0) { bad++; console.log(`  [${r.id}] 빈칸 문제인데 마커가 없다`); }
  if (!r.content.trim().endsWith("?")) { bad++; console.log(`  [${r.id}] 질문이 물음표로 안 끝남: ${r.content.slice(0, 60)}`); }
}
const blanks = await db`SELECT count(*)::int n FROM problems p WHERE p.type = 'FILL_BLANK'
  AND NOT EXISTS (SELECT 1 FROM problem_blanks b WHERE b.problem_id = p.id)`;
console.log(`빈칸 정의가 없는 FILL_BLANK: ${blanks[0].n}개 (0이어야 한다)`);
console.log(bad === 0 ? "이상 없음" : `이상 ${bad}건`);
await db.end();
```

- [ ] **Step 6: 브라우저로 실측한다**

```bash
cd web && rm -rf .next && npx next dev -p 3200
```

`next build` 를 dev 서버와 동시에 돌리지 마라 — 같은 `.next` 를 함께 써서 화면이 "세션 확인 중..."에서 멈춘다(2026-09-01 확인).

`dev_emp` / `Test1234!` 로 로그인해 확인한다:
- **주관식** 문제 하나(예: 문제 45) — 질문 아래 테두리 박스에 지문이 들어가는지
- **빈칸 채우기** 문제 하나(예: 문제 659) — 박스 **안에** 입력칸이 그려지고, 값을 넣어 제출하면 채점이 되는지
- **한 줄짜리 문제**(물음표 뒤에 지문이 없는 것) — 박스가 안 생기고 예전 그대로인지
- **관리자 화면**에서 빈칸 문제를 열어 지정 화면이 참조지문을 그리는지, 빈칸을 하나 해제했다가 다시 지정하고 저장이 되는지
- **검색** — 지문에만 있는 낱말로 문제가 찾아지는지
- 콘솔 오류 0건

- [ ] **Step 7: 커밋**

```bash
git add web/scripts/split-reference-text.ts web/package.json
git commit -m "[ADD] 본문에서 지문을 분리하는 마이그레이션 명령어"
```

---

## 이 계획이 다루지 않는 것 (일부러 뺀 것)

- **운영 반영** — 마이그레이션은 로컬에만 돌린다. 운영은 교정 결과와 함께 별도로 정한다.
- **목록 미리보기** — 분리 후 미리보기에 질문만 나오는데, 목록에서는 오히려 읽기 좋아 그대로 둔다.
- **문제 651·661 등 OCR 훼손부** — 원문 확인이 필요한 별개 사안이다.
- **`( )` 를 빈칸 마커로 바꾸는 일** — 주관식의 `( )` 는 지금도 그냥 글자다. 이 계획은 위치만 옮긴다.
