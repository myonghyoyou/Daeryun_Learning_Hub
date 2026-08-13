# 풀이 화면 디자인 시스템 정합 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Plan 4 대비 검토에서 나온 디자인 시스템 미준수를 바로잡고, 학습 홈에 추천 문제 세트와 학습 루틴을 넣는다.

**Architecture:** 백엔드는 건드리지 않는다. 화면 로직 중 **순수하게 뽑을 수 있는 것은 `utils/`로 분리해 `node --test`로 검증한다** — jsdom이 없어 컴포넌트는 자동 검증이 0이므로, 검증 가능한 표면을 늘리는 것이 이 계획의 부수 목표다. 추천 세트와 학습 루틴은 집계 데이터 없이 만들 수 있는 범위로 한정한다.

**Tech Stack:** React 19 / Vite / Tailwind 4 / react-router-dom 7 (프론트엔드 전용, **백엔드 무변경**)

**근거 문서:** `docs/qa/2026-08-12-plan4-conformance-review.md`

## 확정된 결정

- **G1: 추천 문제 세트와 학습 루틴을 지금 넣는다.** *"일단 넣어두고 수요에 따라 기능 삭제를 하든 하면 될 것 같다."* → **나중에 통째로 들어내기 쉬운 형태**로 만든다.
- **G2: 학습 현황·최근 활동은 넣지 않는다.** 집계 데이터가 선행 조건이고 그것이 Plan 5다.
- **G3: 주관식 입력 높이는 44px.** §7.5(38px)와 §8.4.2(44px)가 충돌하는데 풀이 화면은 터치가 주 사용처다. **명세의 충돌도 함께 고친다.**
- **G4: 단건 풀이에 진행률·12열 분할은 넣지 않는다.** 목록에서 하나 고른 화면이라 "몇 번째"가 없다. **명세를 코드에 맞춰 고친다.**
- **G5: "과목·단원·난이도"는 다루지 않는다.** 데이터 모델에 없다.
- **G6: 모바일 하단 고정 제출 영역을 넣는다.** 보기가 5개인 문제는 모바일에서 제출 버튼이 화면 밖으로 나간다. **단 채점 후에는 고정을 풀어** 결과를 가리지 않게 한다.
- **G7: 목록을 단일 Surface 행으로 바꾼다.** 명세가 카드 형태를 명시적으로 금지한다. 이미 출고된 화면이라 시각적 변화가 크다는 점을 알고 진행한다.

## Global Constraints

- **현재 기준선: 백엔드 230 통과 / 프론트엔드 249 통과, 프로덕션 빌드 성공(경고 없음).** 하나도 깨뜨리지 않는다.
- **백엔드를 건드리지 않는다.** 프론트엔드 + 명세 문서 전용이다.
- **관리자 화면(`frontend/src/pages/admin/**`)을 건드리지 않는다.**
- **프론트엔드에 jsdom이 없다.** 컴포넌트 단위 테스트를 쓸 수 없다. ⚠️ **`utils/*.js`에 `@/` alias를 쓰면 `node --test`가 로드하지 못한다** — import는 상대 경로. `.jsx`에서는 alias를 쓴다.
- **디자인 토큰만 쓴다.** `bg-blue-600`·`bg-gray-50` 같은 날 Tailwind 유틸은 금지다(**현재 잔재 0건 — 이 상태를 유지한다**).
- 이 저장소는 과거 **"Rendered more hooks than during the previous render"** 오류를 겪었다. 훅은 모든 조기 return보다 위에 둔다.
- 커밋 메시지는 영문 Conventional Commits.

## 사전 확인된 사실 (구현자가 다시 조사하지 않아도 된다)

- `Button`은 `disabled`·`className`·`loading`을 받는다. **단 `loading`이면 children을 "처리 중"으로 교체한다** — 아이콘을 넣은 버튼이 로딩되면 아이콘도 사라진다.
- `EmptyState`는 `title`·`description`·`action`을 받는다.
- `@phosphor-icons/react`에 `Sparkle`·`Lightning`·`Target`·`BookOpen`·`Stack`·`Compass`가 있다.
- ⚠️ **`SolveProblemListPage`의 `refresh()`는 인자를 받지 않고 `keyword`/`tag` state를 직접 읽는다.** `setKeyword("")` 직후 `refresh()`를 부르면 갱신 전 값으로 조회한다.

---

## File Structure

### 신규

| 파일 | 책임 |
|---|---|
| `frontend/src/utils/answerState.js` | 답안 미입력 판정 (**alias 금지, 테스트 대상**) |
| `frontend/src/utils/answerState.test.js` | 위 테스트 |
| `frontend/src/components/solve/choiceLayout.js` | 보기 높이·간격 클래스 **단일 정의** (카드와 skeleton이 공유) |
| `frontend/src/components/solve/ProblemSkeleton.jsx` | 로딩 skeleton |
| `frontend/src/components/solve/RecommendedSetCard.jsx` | 추천 문제 세트 (**독립, 삭제 쉽게**) |
| `frontend/src/components/solve/RoutineCard.jsx` | 학습 루틴 (**독립, 삭제 쉽게**) |
| `frontend/src/components/ui/Collapsible.jsx` | 긴 텍스트 접기/펼치기 (참조 지문·이력 답안 공용) |

### 수정

| 파일 | 변경 |
|---|---|
| `frontend/src/components/solve/ProblemSolveCard.jsx` | 유형 배지, 보기 수치, 주관식 44px, 제출 상태·폭·모바일 고정, 빈칸 입력 상태, 선택지 포커스, 참조 지문 접기 |
| `frontend/src/pages/solve/SolveShell.jsx` | 콘텐츠 최대 폭 1120px |
| `frontend/src/pages/solve/SolveProblemListPage.jsx` | 단일 Surface + row separator, 태그, 필터 초기화 |
| `frontend/src/pages/solve/ProblemSolvePage.jsx` | 로딩 skeleton |
| `frontend/src/pages/solve/RandomPlayPage.jsx` | 로딩 skeleton |
| `frontend/src/pages/solve/AttemptHistoryPage.jsx` | 긴 답안 접기 |
| `frontend/src/pages/solve/SolveHomePage.jsx` | 추천 세트·학습 루틴 |
| `docs/superpowers/specs/2026-07-29-blue-bento-design-system.md` | 충돌·오류 3건 정정 |

---

## Task 1: 답안 미입력 판정을 순수 함수로

**Files:**
- Create: `frontend/src/utils/answerState.js`
- Create: `frontend/src/utils/answerState.test.js`

**Interfaces:**
- Produces: `hasNoAnswer({ type, selectedChoiceIds, submittedText, blankInputs, blanksToAnswer })` → `boolean`

**배경:** 디자인 시스템 §8.4.3이 *"답안 미선택 시 제출 버튼 disabled"*를 요구한다. 그 판정은 유형마다 다르다 — 객관식은 선택 0개, 주관식은 공백만 입력, 빈칸은 모든 칸이 비었을 때다.

**이 로직을 컴포넌트 안에 두면 자동 검증이 0이다**(jsdom 부재). 순수 함수로 뽑으면 `node --test`로 검증할 수 있고, 이 프로젝트에서 프론트 로직을 자동 검증하는 유일한 방법이다.

- [ ] **Step 1: 실패하는 테스트를 먼저 쓴다**

`frontend/src/utils/answerState.test.js`:

```javascript
import { test } from "node:test";
import assert from "node:assert/strict";
import { hasNoAnswer } from "./answerState.js";

test("hasNoAnswer: choice types require at least one selection", () => {
  for (const type of ["MCQ_SINGLE", "MCQ_MULTI", "OX"]) {
    assert.strictEqual(hasNoAnswer({ type, selectedChoiceIds: [] }), true);
    assert.strictEqual(hasNoAnswer({ type, selectedChoiceIds: [7] }), false);
  }
});

test("hasNoAnswer: short answer ignores whitespace-only input", () => {
  assert.strictEqual(hasNoAnswer({ type: "SHORT_ANSWER", submittedText: "" }), true);
  assert.strictEqual(hasNoAnswer({ type: "SHORT_ANSWER", submittedText: "   " }), true);
  assert.strictEqual(hasNoAnswer({ type: "SHORT_ANSWER", submittedText: "답" }), false);
});

test("hasNoAnswer: fill-blank is empty only when every revealed blank is blank", () => {
  const blanksToAnswer = ["b1", "b2"];
  assert.strictEqual(hasNoAnswer({ type: "FILL_BLANK", blanksToAnswer, blankInputs: {} }), true);
  assert.strictEqual(
    hasNoAnswer({ type: "FILL_BLANK", blanksToAnswer, blankInputs: { b1: "  " } }),
    true
  );
  // 하나라도 채웠으면 제출할 수 있어야 한다 — 나머지는 오답으로 채점되면 된다
  assert.strictEqual(
    hasNoAnswer({ type: "FILL_BLANK", blanksToAnswer, blankInputs: { b1: "편성" } }),
    false
  );
});

test("hasNoAnswer: missing fields are treated as empty, not as a crash", () => {
  assert.strictEqual(hasNoAnswer({ type: "MCQ_SINGLE" }), true);
  assert.strictEqual(hasNoAnswer({ type: "SHORT_ANSWER" }), true);
  assert.strictEqual(hasNoAnswer({ type: "FILL_BLANK" }), true);
});

test("hasNoAnswer: an unknown type never blocks submission", () => {
  // 새 유형이 생겼을 때 제출을 막아 버리면 그 유형을 아예 풀 수 없게 된다
  assert.strictEqual(hasNoAnswer({ type: "SOMETHING_NEW" }), false);
});
```

마지막 테스트가 중요하다 — **모르는 유형에서 제출을 막으면 그 유형을 풀 수 없게 된다.** 안전한 기본값은 "막지 않는다"이다.

- [ ] **Step 2: 테스트가 실패하는지 확인한다**

Run: `cd frontend && node --test src/utils/answerState.test.js`
Expected: FAIL (모듈 없음)

- [ ] **Step 3: 구현한다**

`frontend/src/utils/answerState.js`. **import가 하나도 없어야 정상이다.**

```javascript
/**
 * 제출 버튼을 잠글지 판정하는 순수 함수(디자인 시스템 8.4.3 "답안 미선택 → disabled").
 *
 * 유형마다 "비었다"의 의미가 다르다: 객관식은 선택 0개, 주관식은 공백만 입력, 빈칸은
 * 노출된 칸이 모두 비었을 때다. 빈칸은 하나라도 채웠으면 제출할 수 있어야 한다 —
 * 나머지는 오답으로 채점되면 되고, 다 채워야 제출할 수 있게 하면 포기할 자유가 없다.
 *
 * 모르는 유형은 막지 않는다. 새 유형이 생겼을 때 제출을 잠가 버리면 그 유형을 아예 풀 수
 * 없게 되는데, 그것이 잘못 제출되는 것보다 나쁘다.
 */
const CHOICE_TYPES = ["MCQ_SINGLE", "MCQ_MULTI", "OX"];

export function hasNoAnswer({ type, selectedChoiceIds, submittedText, blankInputs, blanksToAnswer }) {
  if (CHOICE_TYPES.includes(type)) {
    return (selectedChoiceIds ?? []).length === 0;
  }
  if (type === "SHORT_ANSWER") {
    return !(submittedText ?? "").trim();
  }
  if (type === "FILL_BLANK") {
    const keys = blanksToAnswer ?? [];
    if (keys.length === 0) return true;
    return keys.every((key) => !((blankInputs ?? {})[key] ?? "").trim());
  }
  return false;
}
```

- [ ] **Step 4: 통과를 확인한다**

Run: `cd frontend && node --test src/utils/answerState.test.js` → PASS (5건)
Run: `cd frontend && npm test` → 249 + 5 = **254 통과**

- [ ] **Step 5: Commit**

```bash
git add frontend/src/utils/answerState.js frontend/src/utils/answerState.test.js
git commit -m "feat: add a pure helper for the empty-answer submit guard"
```

---

## Task 2: 풀이 카드의 수치·상태 정합

**Files:**
- Create: `frontend/src/components/solve/choiceLayout.js`
- Create: `frontend/src/components/ui/Collapsible.jsx`
- Modify: `frontend/src/components/solve/ProblemSolveCard.jsx`

**Interfaces:**
- Consumes: Task 1 `hasNoAnswer`
- Produces: `CHOICE_LIST_CLASS`·`CHOICE_ITEM_MIN_HEIGHT` (Task 4 skeleton이 **같은 값을 써야 한다**), `<Collapsible>` (Task 5가 재사용)
- `ProblemSolveCard`의 props(`problem`, `onSubmitted`)는 **바뀌지 않는다**

**배경:** 디자인 시스템이 지정한 수치를 지키지 않는다. 전부 터치·접근성과 직결된다.

| 항목 | 명세 | 현재 |
|---|---|---|
| 보기 최소 높이 | 56px (§8.4) | 46px |
| 보기 간 간격 | 10~12px (§8.4) | 8px |
| 주관식 입력 높이 | 44px (§8.4.2, G3) | 38px |
| 답안 미선택 시 제출 | disabled + 안내 (§8.4.3) | 항상 활성 |
| 모바일 제출 버튼 | 화면 폭 + **하단 고정**(G6) | 내용 폭, 흐름 안 |
| 빈칸 입력 상태 | 노출 수와 입력 상태 표시 (§8.4.2) | 없음 |
| 문제 유형 | 본문 위에 작게 (§8.4) | 없음 |
| 선택지 포커스 | 포커스 링 유지 | 없음 |
| 참조 지문 | 길면 접기/펼치기 (§8.4.2) | 항상 전체 |

> ⚠️ **동작이 바뀐다는 점을 알고 진행하라.** 지금은 아무것도 선택하지 않고 제출하면 **오답으로 기록된다**(브라우저로 확인됨). 이 Task 이후로는 제출 자체가 막혀 **그런 이력이 더 이상 쌓이지 않는다.** 명세가 요구한 방향이지만 이력 데이터의 성격이 바뀐다.

- [ ] **Step 1: 보기 레이아웃 수치를 한 곳에 정의한다**

`frontend/src/components/solve/choiceLayout.js`:

```javascript
/**
 * 보기 목록의 크기 규칙(디자인 시스템 8.4: 최소 높이 56px, 세로 간격 10~12px).
 *
 * ProblemSolveCard 와 ProblemSkeleton 이 이 값을 함께 쓴다 — 두 곳에 따로 적으면 한쪽만
 * 바뀌었을 때 로딩이 끝나는 순간 레이아웃이 튀는데, 그것이 skeleton 이 막으려던 현상이다.
 */
export const CHOICE_LIST_CLASS = "mt-5 space-y-3";
export const CHOICE_ITEM_MIN_HEIGHT = "min-h-[56px]";
```

- [ ] **Step 2: 접기/펼치기 컴포넌트를 만든다**

`frontend/src/components/ui/Collapsible.jsx`. 참조 지문(§8.4.2)과 이력의 긴 답안(§8.5)이 함께 쓴다.

```jsx
import { useState } from "react";
import { CaretDown, CaretUp } from "@phosphor-icons/react";

/**
 * 긴 텍스트를 접어 두고 필요할 때 펼친다(디자인 시스템 8.4.2 참조 지문, 8.5 풀이 이력 답안).
 * 짧은 텍스트에는 토글을 아예 그리지 않는다 — 접을 것이 없는데 버튼만 있으면 방해가 된다.
 */
export default function Collapsible({ text, collapsedLines = 3, threshold = 120, className = "" }) {
  const [open, setOpen] = useState(false);
  if (!text) return null;

  const needsToggle = text.length > threshold;
  if (!needsToggle) {
    return <p className={`whitespace-pre-wrap ${className}`}>{text}</p>;
  }

  return (
    <div>
      <p className={`whitespace-pre-wrap ${open ? "" : `line-clamp-${collapsedLines}`} ${className}`}>{text}</p>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="mt-1 inline-flex items-center gap-1 rounded-sm text-body-small font-medium text-action-secondary-text hover:underline focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-brand-aqua"
      >
        {open ? "접기" : "더 보기"}
        {open ? <CaretUp size={12} aria-hidden="true" /> : <CaretDown size={12} aria-hidden="true" />}
      </button>
    </div>
  );
}
```

⚠️ **`line-clamp-${collapsedLines}`처럼 클래스명을 문자열로 조립하면 Tailwind가 빌드 시 그 클래스를 못 찾아 스타일이 안 나온다.** `collapsedLines` 값별로 완성된 클래스를 매핑해 쓰거나 기본값 하나로 고정하라. **빌드 후 실제로 잘리는지 확인할 것.**

- [ ] **Step 3: 유형 배지를 본문 위에 넣는다**

목록 화면이 쓰는 `TYPE_LABELS`와 배지 마크업을 **그대로 복제**한다(목록과 상세의 표기가 달라지면 안 된다).

```jsx
const TYPE_LABELS = {
  MCQ_SINGLE: "객관식(단일)",
  MCQ_MULTI: "객관식(다중)",
  OX: "OX",
  SHORT_ANSWER: "주관식",
  FILL_BLANK: "빈칸 채우기",
};
```

`<Surface>` 안 최상단(이미지·참조 지문보다 위):

```jsx
        <span className="mb-3 inline-block rounded-full bg-surface-blue px-2.5 py-1 text-body-small font-medium text-info-text">
          {TYPE_LABELS[problem.type] ?? problem.type}
        </span>
```

**진행률·문제 번호는 넣지 않는다**(G4).

- [ ] **Step 4: 참조 지문을 접기 가능하게 한다**

기존 참조 지문 `<p>`를 `<Collapsible>`로 감싼다. 바깥의 `bg-surface-subtle` 컨테이너는 유지한다(§8.4.2가 `Surface Subtle`을 요구한다).

- [ ] **Step 5: 보기 수치와 포커스를 고친다**

`<ul>`의 클래스를 `CHOICE_LIST_CLASS`로 바꾼다.

선택지 `<label>`에 `CHOICE_ITEM_MIN_HEIGHT`를 더하고, 포커스 표시를 넣는다. **포커스를 받는 것은 `<label>`이 아니라 내부 radio/checkbox이므로 `focus-within`을 쓴다.**

```
focus-within:outline focus-within:outline-[3px] focus-within:outline-offset-2 focus-within:outline-brand-aqua
```

- [ ] **Step 6: 주관식 입력을 44px로 올린다**

`h-[38px]` → `h-[44px]` (G3). 나머지 클래스는 그대로.

- [ ] **Step 7: 빈칸 입력 상태를 표시한다**

FILL_BLANK 본문 아래:

```jsx
        {problem.type === "FILL_BLANK" && (
          <p className="mt-3 text-body-small text-ink-muted">
            빈칸 {problem.blanksToAnswer.length}개 중{" "}
            {problem.blanksToAnswer.filter((key) => (blankInputs[key] ?? "").trim()).length}개 입력
          </p>
        )}
```

- [ ] **Step 8: 제출 영역을 명세대로 만든다 (모바일 하단 고정 포함)**

Task 1의 순수 함수를 쓴다. **훅이 아니라 파생 변수**다.

```jsx
import { hasNoAnswer } from "@/utils/answerState.js";

  const nothingEntered = hasNoAnswer({
    type: problem.type,
    selectedChoiceIds,
    submittedText,
    blankInputs,
    blanksToAnswer: problem.blanksToAnswer,
  });
```

제출 영역을 아래로 바꾼다. **모바일에서만 하단 고정이고, 채점 후에는 영역 자체가 사라지므로 결과를 가리지 않는다**(G6 — 이 블록은 `!answered`일 때만 그려진다).

```jsx
        {!answered && (
          <div className="sticky bottom-0 mt-6 -mx-5 border-t border-line-default bg-surface-default px-5 py-3 md:static md:mx-0 md:border-0 md:bg-transparent md:px-0 md:py-0">
            <Button onClick={handleSubmit} loading={submitting} disabled={nothingEntered} size="lg" className="w-full sm:w-auto">
              제출
            </Button>
            {nothingEntered && (
              <p className="mt-2 text-body-small text-ink-muted">답안을 입력하면 제출할 수 있습니다.</p>
            )}
          </div>
        )}
```

`-mx-5`는 `Surface`의 `p-5` 패딩을 상쇄해 고정 바가 카드 폭을 꽉 채우게 한다. **`Surface`의 실제 패딩 값을 확인하고 맞춰라** — 다르면 좌우가 어긋난다. PC(`md:`)에서는 고정을 풀어 원래대로 흐름 안에 둔다.

⚠️ **`sticky`는 조상에 `overflow: hidden`이 있으면 동작하지 않는다.** `Surface`와 `SolveShell`을 확인하고, 막혀 있으면 구조를 조정하거나 다른 방법을 쓰되 **그 사실을 리포트에 적어라.**

- [ ] **Step 9: 확인**

Run: `cd frontend && npm test` → 254 통과(컴포넌트 변경이라 신규 테스트 없음)
Run: `cd frontend && npm run build` → 성공, 경고 없음

- [ ] **Step 10: Commit**

```bash
git add frontend/src/components/solve/choiceLayout.js frontend/src/components/ui/Collapsible.jsx frontend/src/components/solve/ProblemSolveCard.jsx
git commit -m "fix: align the solve card with design system sizing and states"
```

---

## Task 3: 목록 구조와 콘텐츠 폭

**Files:**
- Modify: `frontend/src/pages/solve/SolveShell.jsx`
- Modify: `frontend/src/pages/solve/SolveProblemListPage.jsx`

**배경(G7):** §8.4.1이 **명시적으로 금지한 형태**를 쓰고 있다.

> *"문제 항목은 하나의 Surface 안에서 row separator로 구분한다. **각 항목을 별도 카드로 만들지 않는다.**"*

콘텐츠 최대 폭도 명세 1120px 대비 1040px이다.

- [ ] **Step 1: 콘텐츠 최대 폭을 1120px로 맞춘다**

`SolveShell.jsx`의 `max-w-[1040px]` → `max-w-[1120px]`. 좌우 padding(`px-5 md:px-7` = 20/28px)은 명세의 28px과 맞으므로 그대로.

**이 Shell은 학습 홈·목록·상세·이력이 모두 쓴다** — 네 화면이 함께 넓어진다. 의도된 것이다.

- [ ] **Step 2: 목록을 단일 Surface + row separator로 바꾼다**

```jsx
        <Surface className="p-0">
          <ul>
            {problems.map((problem) => (
              <li key={problem.id} className="border-b border-line-default last:border-b-0">
                <Link
                  to={`/solve/${problem.id}`}
                  className="group flex items-center gap-3 p-4 transition-colors hover:bg-surface-subtle focus-visible:outline focus-visible:outline-[3px] focus-visible:-outline-offset-[3px] focus-visible:outline-brand-aqua"
                >
                  …
                </Link>
              </li>
            ))}
          </ul>
        </Surface>
```

카드가 아니게 됐으므로 `hover:shadow-raised` → `hover:bg-surface-subtle`.

⚠️ **포커스 링이 Surface 경계에서 잘리지 않게 안쪽으로 그려야 한다.** 위 `-outline-offset-[3px]`(음수 offset) 문법이 Tailwind 4에서 실제로 CSS를 만드는지 **빌드 결과로 확인하라.** 안 되면 `outline-offset-0`으로 두고 잘리는지 눈으로 본 뒤 대안을 택하고, 무엇을 썼는지 리포트에 적어라.

- [ ] **Step 3: 행에 태그를 표시한다**

§8.3이 행에 "제목·유형·태그"를 요구한다. 목록 API가 이미 `tags`를 내려주는데 화면이 쓰지 않는다.

본문 뒤, 화살표 앞:

```jsx
                  {problem.tags?.length > 0 && (
                    <span className="hidden shrink-0 gap-1 sm:flex">
                      {problem.tags.slice(0, 2).map((tag) => (
                        <span key={tag} className="rounded-xs bg-surface-subtle px-2 py-0.5 text-body-small text-ink-muted">
                          {tag}
                        </span>
                      ))}
                    </span>
                  )}
```

모바일에서는 폭이 좁아 감춘다. **"과목·단원·난이도"는 넣지 않는다**(G5).

- [ ] **Step 4: 결과 없음에 필터 초기화를 넣는다**

§8.4.1이 요구한다. `EmptyState`는 `action`을 받는다(확인됨).

⚠️ **`refresh()`는 인자를 받지 않고 state를 직접 읽는다.** `setKeyword("")` 직후 `refresh()`를 부르면 갱신 전 값으로 조회한다. `refresh(overrides)`를 받도록 고치되 **기존 호출부(검색 폼 제출·최초 로드)가 깨지지 않게 기본값을 둔다.**

```jsx
  async function refresh({ keyword: nextKeyword = keyword, tag: nextTag = tag } = {}) {
    …
    setProblems(await listSolveProblems(nextKeyword, nextTag));
```

```jsx
            action={
              <Button variant="secondary" size="sm" onClick={() => { setKeyword(""); setTag(""); refresh({ keyword: "", tag: "" }); }}>
                필터 초기화
              </Button>
            }
```

- [ ] **Step 5: 확인**

Run: `cd frontend && npm test` → 254 통과
Run: `cd frontend && npm run build` → 성공, 경고 없음

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/solve/SolveShell.jsx frontend/src/pages/solve/SolveProblemListPage.jsx
git commit -m "fix: use a single surface list and the specified content width"
```

---

## Task 4: 로딩 skeleton

**Files:**
- Create: `frontend/src/components/solve/ProblemSkeleton.jsx`
- Modify: `frontend/src/pages/solve/ProblemSolvePage.jsx`
- Modify: `frontend/src/pages/solve/RandomPlayPage.jsx`

**Interfaces:**
- Consumes: Task 2의 `CHOICE_LIST_CLASS`·`CHOICE_ITEM_MIN_HEIGHT` — **직접 수치를 적지 말고 반드시 import해서 쓴다**

**배경:** §8.4.3은 초기 로딩을 *"문제 본문·보기 위치를 유지하는 skeleton"*으로 요구한다. 현재는 "불러오는 중..." 텍스트 한 줄이라 로드되는 순간 레이아웃이 튄다.

- [ ] **Step 1: skeleton을 만든다**

```jsx
import Surface from "@/components/ui/Surface.jsx";
import { CHOICE_LIST_CLASS, CHOICE_ITEM_MIN_HEIGHT } from "@/components/solve/choiceLayout.js";

/**
 * 문제 로딩 중 자리를 지키는 skeleton(디자인 시스템 8.4.3). 실제 카드와 같은 위계로
 * 배치해 로드 완료 시 레이아웃이 튀지 않게 한다. 보기의 높이·간격은 ProblemSolveCard 와
 * 같은 상수를 import 해서 쓴다 — 수치를 여기 다시 적으면 한쪽만 바뀌었을 때 정확히
 * 이 컴포넌트가 막으려던 현상이 생긴다.
 */
export default function ProblemSkeleton() {
  return (
    <Surface className="p-5 md:p-6" aria-hidden="true">
      <div className="h-6 w-24 animate-pulse rounded-full bg-surface-subtle" />
      <div className="mt-4 space-y-2">
        <div className="h-5 w-full animate-pulse rounded-xs bg-surface-subtle" />
        <div className="h-5 w-3/4 animate-pulse rounded-xs bg-surface-subtle" />
      </div>
      <ul className={CHOICE_LIST_CLASS}>
        {[0, 1, 2].map((i) => (
          <li key={i} className={`${CHOICE_ITEM_MIN_HEIGHT} w-full animate-pulse rounded-md bg-surface-subtle`} />
        ))}
      </ul>
      <div className="mt-6 h-11 w-full animate-pulse rounded-sm bg-surface-subtle sm:w-24" />
    </Surface>
  );
}
```

- [ ] **Step 2: 두 화면에 연결한다**

`ProblemSolvePage.jsx`와 `RandomPlayPage.jsx`의 `<p>불러오는 중...</p>`를 `<ProblemSkeleton />`으로 바꾼다.

`RandomPlayPage`는 진행률(`{index+1} / {length}`)을 skeleton 위에 **그대로 유지한다** — 세션에서 오는 값이라 로딩과 무관하다.

**이력 화면의 "불러오는 중..."은 건드리지 마라.** 명세가 skeleton을 요구한 것은 풀이 화면(§8.4.3)이다.

- [ ] **Step 3: 확인**

Run: `cd frontend && npm test` → 254 통과
Run: `cd frontend && npm run build` → 성공, 경고 없음

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/solve/ProblemSkeleton.jsx frontend/src/pages/solve/ProblemSolvePage.jsx frontend/src/pages/solve/RandomPlayPage.jsx
git commit -m "feat: keep layout stable with a problem loading skeleton"
```

---

## Task 5: 이력의 긴 답안 접기

**Files:**
- Modify: `frontend/src/pages/solve/AttemptHistoryPage.jsx`

**Interfaces:**
- Consumes: Task 2의 `<Collapsible>`

**배경:** §8.5 — *"제출 답안은 상세 보기에서 확인하며, **긴 답안은 접기/펼치기를 제공한다**."*

현재는 PC 표에서 `line-clamp-1`로 잘리고 펼칠 수단이 없다. 주관식 긴 답안이 무엇이었는지 확인할 방법이 없다.

- [ ] **Step 1: 제출 답안에 Collapsible을 적용한다**

**PC 표와 모바일 카드 두 곳 모두**에 적용한다. 한쪽만 고치면 화면 폭에 따라 다르게 보인다.

표 셀 안에서는 접힌 줄 수를 1로 두어 행 높이가 흔들리지 않게 하고, 모바일 카드에서는 2~3줄이 자연스럽다. `Collapsible`이 짧은 텍스트에는 토글을 안 그리므로 대부분의 답안(객관식 ID 목록 등)은 지금과 같아 보인다.

- [ ] **Step 2: 확인**

Run: `cd frontend && npm test` → 254 통과
Run: `cd frontend && npm run build` → 성공, 경고 없음

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/solve/AttemptHistoryPage.jsx
git commit -m "feat: let long submitted answers expand in the attempt history"
```

---

## Task 6: 추천 문제 세트와 학습 루틴

**Files:**
- Create: `frontend/src/components/solve/RecommendedSetCard.jsx`
- Create: `frontend/src/components/solve/RoutineCard.jsx`
- Modify: `frontend/src/pages/solve/SolveHomePage.jsx`

**배경(G1):** §8.2가 요구한 학습 홈 5개 영역 중 진입 카드만 있다. 사용자가 *"일단 넣어두고 수요에 따라 삭제하든 하면 될 것 같다"*고 결정했다. **학습 현황·최근 활동은 넣지 않는다**(G2).

> ⚠️ **나중에 들어내기 쉬운 형태로 만든다.** 두 컴포넌트는 자기 완결적이어야 한다: 다른 화면이 import하지 않고, **새 API·새 상태·새 라우트를 만들지 않으며**, 홈에서 해당 JSX 블록만 지우면 흔적이 남지 않아야 한다.

- [ ] **Step 1: 추천 문제 세트 카드**

§8.2: *"추천 문제 세트는 icon/제목/설명/태그/주 행동 순서"*

**새 API를 만들지 않는다** — 기존 랜덤 설정 화면으로 보내는 진입점이다.

```jsx
import { Link } from "react-router-dom";
import { Sparkle, ArrowRight } from "@phosphor-icons/react";
import Surface from "@/components/ui/Surface.jsx";
import Button from "@/components/ui/Button.jsx";

/**
 * 학습 홈의 추천 문제 세트(디자인 시스템 8.2). 서버 추천 로직 없이 바로 시작할 수 있는
 * 조합을 제안하는 진입점이다 — 눌러도 기존 랜덤 설정 화면으로 갈 뿐 새 API 를 쓰지 않는다.
 * 수요가 없으면 SolveHomePage 에서 이 블록만 지우면 된다(다른 화면이 이 파일을 쓰지 않는다).
 */
export default function RecommendedSetCard() {
  return (
    <Surface className="p-5">
      <span className="inline-flex h-10 w-10 items-center justify-center rounded-md bg-surface-blue text-brand-blue">
        <Sparkle size={22} aria-hidden="true" />
      </span>
      <p className="mt-3 text-section-title font-semibold text-ink-strong">추천 문제 세트</p>
      <p className="mt-1 text-body-small text-ink-muted">
        문제 수와 부서를 골라 바로 시작할 수 있습니다. 기본은 10문제·전사 공통입니다.
      </p>
      <div className="mt-3 flex flex-wrap gap-1">
        <span className="rounded-xs bg-surface-subtle px-2 py-0.5 text-body-small text-ink-muted">10문제</span>
        <span className="rounded-xs bg-surface-subtle px-2 py-0.5 text-body-small text-ink-muted">전사 공통</span>
      </div>
      <Link to="/solve/random" className="mt-4 inline-block">
        <Button size="md">
          세트 시작하기
          <ArrowRight size={16} aria-hidden="true" />
        </Button>
      </Link>
    </Surface>
  );
}
```

**설명 문구가 실제 동작과 어긋나지 않게 했다** — 버튼을 누르면 바로 10문제가 시작되는 것이 아니라 설정 화면이 열리므로 "골라 바로 시작할 수 있습니다 / 기본은 10문제"로 적었다. 이 대응을 깨지 마라.

- [ ] **Step 2: 학습 루틴 카드**

§8.2의 `RoutinePanel`. **서버 상태가 없는 안내 카드**다 — 알림·스케줄을 만들지 않는다.

```jsx
import Surface from "@/components/ui/Surface.jsx";

/**
 * 학습 홈의 학습 루틴(디자인 시스템 8.2). 서버 상태·알림 없이 학습 방법을 안내하는
 * 정적 카드다. 수요가 없으면 SolveHomePage 에서 이 블록만 지우면 된다.
 */
const ROUTINES = [
  { title: "짧게 자주", body: "한 번에 몰아 풀기보다 10문제씩 자주 푸는 편이 오래 남습니다." },
  { title: "틀린 문제 다시", body: "결과 요약에서 틀린 문제를 확인하고 같은 유형을 한 번 더 풀어 보세요." },
  { title: "부서 밖 문제도", body: "다른 부서 문제도 그대로 풀 수 있습니다. 시야를 넓히는 데 도움이 됩니다." },
];

export default function RoutineCard() {
  return (
    <Surface className="p-5">
      <p className="text-section-title font-semibold text-ink-strong">학습 루틴</p>
      <ul className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-3">
        {ROUTINES.map((routine) => (
          <li key={routine.title} className="rounded-md bg-surface-subtle p-4">
            <p className="text-card-title font-bold text-ink-strong">{routine.title}</p>
            <p className="mt-1 text-body-small text-ink-muted">{routine.body}</p>
          </li>
        ))}
      </ul>
    </Surface>
  );
}
```

- [ ] **Step 3: 학습 홈에 배치한다**

기존 3갈래 카드(랜덤·골라서·이력)는 **그대로 둔다.** 그 아래에 순서대로 넣는다.

§8.2의 순서는 "이어서 학습하기 → 학습 현황 → 추천 문제 → 최근 활동 → 학습 루틴"인데 학습 현황·최근 활동이 없으므로 **있는 것만 그 상대 순서를 지킨다**: 진입 카드 → 추천 문제 → 학습 루틴.

```jsx
      <div className="mt-4 grid grid-cols-1 gap-4">
        <RecommendedSetCard />
        <RoutineCard />
      </div>
```

- [ ] **Step 4: 확인**

Run: `cd frontend && npm test` → 254 통과
Run: `cd frontend && npm run build` → 성공, 경고 없음

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/solve/RecommendedSetCard.jsx frontend/src/components/solve/RoutineCard.jsx frontend/src/pages/solve/SolveHomePage.jsx
git commit -m "feat: add recommended set and routine cards to the learning home"
```

---

## Task 7: 디자인 시스템 명세 정정

**Files:**
- Modify: `docs/superpowers/specs/2026-07-29-blue-bento-design-system.md`

**배경:** 검토에서 **명세 자체의 결함 3건**이 드러났다. 코드를 맞추는 것만으로는 해결되지 않는다.

- [ ] **Step 1: 입력 높이 충돌 해소 (G3)**

§7.5는 Input 기본 높이를 **38px**(모바일 40px)로 규정하는데 §8.4.2는 주관식 답안을 **44px**로 요구한다 — 같은 컴포넌트에 두 수치가 걸린다.

§7.5에 예외를 명시한다.

```
- 기본 높이 38px, 모바일 40px. 단 문제 풀이 화면의 답안 입력은 터치 정확도를 위해
  44px를 사용한다(8.4.2). 이 예외는 답안 입력에만 적용하고 검색·필터에는 적용하지 않는다.
```

- [ ] **Step 2: 단건 풀이의 진행률·12열 조항 정정 (G4)**

§8.4의 *"문제 번호·유형·진행률은 본문 위에 작게 배치한다"*와 §8.4.2의 12-column 분할은 **단건 풀이에 성립하지 않는다.** 목록에서 하나 고른 화면이라 "몇 번째"가 없고 4열에 넣을 정보가 유형·태그뿐이다.

진행률은 **랜덤 세트 진행 화면에서 실현됐다**(`1 / 5`). 그 사실을 명세에 반영한다: 단건 풀이는 유형을 본문 위에 두고 단일 컬럼을 쓰며, 문제 번호·진행률·좌우 분할은 **세트 풀이 화면**(`/solve/random/play`)의 규칙이다.

- [ ] **Step 3: 데이터 모델에 없는 항목 표시 (G5)**

§8.3과 §8.4.1이 목록 행에 **"과목·단원·난이도"**를 요구하는데 이 개념이 데이터 모델에 없다(문제는 유형·부서·태그만 가진다). 해당 문장에 "현재 데이터 모델에 없으며 도입 시 반영한다"는 단서를 단다.

- [ ] **Step 4: Commit**

```bash
git add docs/superpowers/specs/2026-07-29-blue-bento-design-system.md
git commit -m "docs: resolve design system conflicts found during conformance review"
```

---

## Task 8: Design QA (2해상도)

**Files:** 없음(검증). 결함 발견 시 해당 파일 수정.

**배경:** Plan 4의 Design Contract가 완료 기준으로 요구했으나 **수행 기록이 없던** 항목이다.

**환경:** `docs/qa/2026-08-12-plan4-solve-qa-manual.md` §0. 프론트는 반드시 **5173**(아니면 CORS로 로그인 실패), 백엔드 무변경이라 재기동 불필요.
계정: `emp001` / `QaPlan3!2026`

- [ ] **Step 1: 수치 실측 (1440×1024)**

`getComputedStyle`로 직접 잰다 — **눈대중으로 판단하지 마라.**

| 대상 | 기대 |
|---|---|
| 보기 `<label>` 높이 | **≥ 56px** |
| 보기 간 간격 | **10~12px** |
| 주관식 입력 높이 | **44px** |
| Shell 콘텐츠 폭 | **1120px** |
| 목록 항목 | 별도 카드가 **아니고** 하나의 Surface 안 행 |

- [ ] **Step 2: 상태별 확인**

| 상태 | 기대 |
|---|---|
| 초기 로딩 | skeleton이 뜨고 **로드 완료 시 레이아웃이 튀지 않는다**(보기 위치가 그대로) |
| 답안 미선택 | 제출 버튼 disabled + 안내 문구 |
| 답안 입력 후 | 버튼이 즉시 활성 |
| 제출 중 | 선택지 잠금 + spinner + 중복 클릭 불가 |
| 정답 / 오답 | Success / Danger Surface + 정답·해설 |
| 빈칸 입력 중 | "빈칸 N개 중 M개 입력"이 실제 입력에 따라 바뀐다 |
| 참조 지문(긴 것) | 접혀 있고 "더 보기"로 펼쳐진다 |
| 이력 긴 답안 | PC·모바일 **양쪽**에서 펼칠 수 있다 |
| 결과 없음 | "조건에 맞는 문제가 없습니다." + **필터 초기화가 실제로 목록을 되돌린다** |

**필터 초기화는 반드시 눌러서 결과가 돌아오는지 보라** — state 갱신 타이밍 때문에 조용히 예전 조건으로 조회할 수 있다.

- [ ] **Step 3: 시각적 일관성 판정 기준**

"일관성"을 주관적으로 두지 않는다. 아래를 **비교해서** 판정한다.

| 비교 대상 | 같아야 하는 것 |
|---|---|
| 목록의 유형 배지 ↔ 상세의 유형 배지 | 문구·색·모서리·크기 |
| 학습 홈 카드 ↔ 추천 세트 ↔ 학습 루틴 | Surface 패딩·제목 타이포·간격 |
| 목록 행 hover ↔ focus | 둘 다 표시되고 서로 구분된다 |
| 정답 Surface ↔ 오답 Surface | 구조 동일, 색만 다르다 |
| 네 화면(홈·목록·상세·이력)의 좌우 여백 | 동일(Shell이 결정) |

- [ ] **Step 4: 키보드 (1440×1024)**

Tab만으로 학습 홈 → 목록 → 상세 → 제출까지 도달한다. **모든 포커스 지점에 링이 보인다** — 특히 이번에 추가한 선택지 `focus-within`과 목록 행(Surface 경계에서 **잘리지 않는지** 확인).

목록 행에서 Enter로 진입되는지 확인한다. §8.4.1은 Space도 요구하나 `<a>` 기본 동작상 불가하다 — **확인 후 기록만 하고 고치지 않는다**(고치려면 role/keydown 처리가 필요해 범위를 넘는다).

- [ ] **Step 5: 모바일 (390×844)**

| 확인 | 기대 |
|---|---|
| 가로 스크롤 | 학습 홈·목록·상세·이력 **전부 없음** |
| **제출 영역** | **화면 하단에 고정되고 화면 폭을 쓴다** |
| 스크롤 중 제출 버튼 | 보기가 많은 문제에서도 계속 보인다 |
| 채점 후 | 고정 영역이 사라지고 결과가 가려지지 않는다 |
| 선택지 | 터치 크기 유지(≥56px) |
| 이력 | 카드로 전환, 긴 답안 펼치기 동작 |
| 추천 세트·학습 루틴 | 1열로 정상 배치 |

- [ ] **Step 6: 회귀**

| 확인 | 기대 |
|---|---|
| 5개 유형 풀이 | 전부 정상 채점 |
| 랜덤 세트 완주 | 결과 요약 정상 |
| 빈칸 마커 | 목록·이력·결과에서 `____` |
| 브라우저 콘솔 | 전 과정 **오류·경고 0건** |

- [ ] **Step 7: 결과 문서화와 커밋**

`docs/qa/`에 결과를 남긴다. **실측값은 숫자를 그대로** 적는다.

---

## 완료 기준

- [ ] 보기 ≥56px·간격 10~12px·주관식 44px — **실측 숫자로** 확인
- [ ] 목록이 단일 Surface + row separator, 콘텐츠 폭 1120px
- [ ] 상세 화면에 문제 유형 배지 (목록과 표기 동일)
- [ ] 답안 미선택 시 제출 disabled + 안내, 입력하면 즉시 활성
- [ ] **모바일에서 제출 영역이 하단 고정 + 화면 폭, 채점 후 해제**
- [ ] 빈칸 입력 상태 표시
- [ ] 선택지 포커스 링, 목록 행 포커스 링이 잘리지 않음
- [ ] 로딩 skeleton이 레이아웃을 지킨다(보기 위치가 튀지 않음)
- [ ] 목록 행에 태그, 결과 없음에 **동작하는** 필터 초기화
- [ ] 참조 지문·이력 긴 답안 접기/펼치기 (이력은 PC·모바일 양쪽)
- [ ] 학습 홈에 추천 세트·학습 루틴 (**블록만 지우면 제거되는 형태**)
- [ ] 디자인 시스템 명세의 결함 3건 정정
- [ ] 2해상도 Design QA 수행 기록
- [ ] 백엔드 **230 그대로**(무변경), 프론트엔드 249 → **254** 통과, 빌드 성공
- [ ] 브라우저 콘솔 오류 없음
- [ ] 날 Tailwind 유틸 잔재 **0건 유지**
