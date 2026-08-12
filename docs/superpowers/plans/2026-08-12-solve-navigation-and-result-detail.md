# 풀이 화면 돌아가기와 결과 상세 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 학습 화면에서 헤더 로고 말고 제대로 된 돌아가기 수단을 주고, 랜덤 세트 결과 요약에 어떤 문제를 틀렸는지 보여준다.

**Architecture:** 문제 본문의 `{{bN}}` 마커를 학습자에게 보여줄 형태(`____`)로 바꾸는 표시용 순수 함수를 만들어 목록·이력·결과 세 곳이 공유한다. 결과 상세에 필요한 문제 본문은 **추가 API 호출 없이** 세션에 함께 저장한다 — 설정 화면이 이미 `/api/problems/random` 응답으로 본문을 받고 있으면서 `id`만 쓰고 버리기 때문이다.

**Tech Stack:** React 19 / Vite / Tailwind 4 / react-router-dom 7 (프론트엔드 전용, **백엔드 무변경**)

**근거:** 사용자 직접 QA 피드백 2건 + 확정 결정
- **E1: 랜덤 진행 중 돌아가기는 "세트를 끝내고 결과 보기"다**(B안). 그냥 나가면 이미 제출한 기록이 결과 화면에 도달하지 못하고 사라진다 — 최종 리뷰가 잡았던 문제의 재발이다.
- **E2: 빈칸 마커는 표시용 함수를 만들어 세 곳에 적용한다.** 결과 화면만 처리하면 목록·이력에는 여전히 `{{b1}}`이 학습자에게 노출된다.
- **E3(권고 채택): 결과 상세용 본문은 세션에 함께 저장한다.** 별도 저장소 항목을 두면 두 값이 어긋날 여지가 생긴다.
- **범위 밖:** 결과 목록에서 문제별 "다시 풀기" 링크 — 요청에 없어 넣지 않는다.

## Global Constraints

- **현재 기준선: 백엔드 230 통과 / 프론트엔드 239 통과, 프로덕션 빌드 성공(경고 없음).** 하나도 깨뜨리지 않는다.
- **백엔드를 건드리지 않는다.** 이 계획은 프론트엔드 전용이다.
- **관리자 화면(`frontend/src/pages/admin/**`)을 건드리지 않는다.**
- **프론트엔드에 jsdom이 없다.** 컴포넌트 단위 테스트를 쓸 수 없다. 순수 로직은 alias 없는 `frontend/src/utils/*.js`에 두고 `.test.js`(`node --test`)로 검증한다. ⚠️ **`utils/*.js`에 `@/` alias를 쓰면 `node --test`가 로드하지 못한다** — import는 상대 경로. `.jsx`에서는 alias를 쓴다.
- **빈칸 마커 문자 집합은 `[A-Za-z0-9_-]`다.** 서버 `ProblemServiceImpl.BLANK_MARKER_PATTERN`, 지정 모드 `blankSegments.js`, 풀이 렌더 `blankContent.js` 세 곳이 이미 이 집합으로 일치한다. **새 함수도 같은 집합을 써야 한다** — 다르면 어떤 마커는 치환되고 어떤 마커는 남는다.
- **`summarize().total`은 푼 개수다**(세트 크기가 아니다). 테스트가 고정하고 있다.
- **`recordResult`·`endSessionEarly`는 인자를 변형하지 않고 새 객체를 반환한다.**
- 커밋 메시지는 영문 Conventional Commits.

---

## File Structure

### 신규

| 파일 | 책임 |
|---|---|
| `frontend/src/utils/problemPreview.js` | 목록·이력·결과에서 문제 본문을 학습자에게 보여줄 형태로 변환 (**alias 금지**) |
| `frontend/src/utils/problemPreview.test.js` | 위 테스트 |

### 수정

| 파일 | 변경 |
|---|---|
| `frontend/src/utils/solveSession.js` | 세션에 문제 본문 메타 저장 |
| `frontend/src/utils/solveSession.test.js` | 확장된 형태의 테스트 |
| `frontend/src/pages/solve/SolveProblemListPage.jsx` | 돌아가기 + 본문 미리보기 |
| `frontend/src/pages/solve/AttemptHistoryPage.jsx` | 본문 미리보기(PC 표 + 모바일 카드 2곳) |
| `frontend/src/pages/solve/RandomSetupPage.jsx` | 돌아가기 + 세션에 본문 저장 |
| `frontend/src/pages/solve/RandomPlayPage.jsx` | 돌아가기(세트 끝내고 결과로) |
| `frontend/src/pages/solve/RandomResultPage.jsx` | 문제별 정오 목록 |

---

## Task 1: 문제 본문 표시용 함수와 목록·이력 적용

**Files:**
- Create: `frontend/src/utils/problemPreview.js`
- Create: `frontend/src/utils/problemPreview.test.js`
- Modify: `frontend/src/pages/solve/SolveProblemListPage.jsx`
- Modify: `frontend/src/pages/solve/AttemptHistoryPage.jsx`

**Interfaces:**
- Produces: `previewContent(content)` → 마커를 `____`로 바꾼 문자열

**배경:** 빈칸 문제의 본문이 목록·이력 화면에 저장된 그대로 나온다.

```
예산의 3요소는 {{b1}}, {{b2}}, {{b3}} 이다.
```

학습자에게 내부 코드가 그대로 보인다. 풀이 화면은 `blankContent.js`가 마커를 입력칸으로 바꿔 주지만, **본문을 텍스트로만 보여주는 화면에는 그런 장치가 없다.**

- [ ] **Step 1: 실패하는 테스트를 먼저 쓴다**

`frontend/src/utils/problemPreview.test.js`:

```javascript
import { test } from "node:test";
import assert from "node:assert/strict";
import { previewContent } from "./problemPreview.js";

test("previewContent: replaces blank markers with an underscore run", () => {
  assert.strictEqual(
    previewContent("예산의 3요소는 {{b1}}, {{b2}}, {{b3}} 이다."),
    "예산의 3요소는 ____, ____, ____ 이다."
  );
});

test("previewContent: handles legacy blank_N style keys", () => {
  assert.strictEqual(
    previewContent("수도는 {{blank_1}}이다"),
    "수도는 ____이다"
  );
});

test("previewContent: leaves content without markers untouched", () => {
  assert.strictEqual(previewContent("HTTP 404는 무엇인가?"), "HTTP 404는 무엇인가?");
});

test("previewContent: does not touch marker lookalikes", () => {
  // 서버·지정 모드와 같은 문자 집합만 마커로 본다. 한 겹 중괄호·내부 공백·빈 키는 마커가 아니다.
  assert.strictEqual(previewContent("{b1} {{ b1 }} {{}}"), "{b1} {{ b1 }} {{}}");
});

test("previewContent: tolerates null and empty input", () => {
  assert.strictEqual(previewContent(null), "");
  assert.strictEqual(previewContent(undefined), "");
  assert.strictEqual(previewContent(""), "");
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인한다**

Run: `cd frontend && node --test src/utils/problemPreview.test.js`
Expected: FAIL (모듈 없음)

- [ ] **Step 3: 함수를 구현한다**

`frontend/src/utils/problemPreview.js`:

```javascript
/**
 * 문제 본문을 "읽기 전용으로 보여주는" 화면(목록·이력·결과 요약)에서 쓸 표시용 변환.
 *
 * 저장된 본문에는 빈칸 자리가 {{b1}} 같은 마커로 들어 있다. 풀이 화면은 blankContent.js 가
 * 이 마커를 입력칸으로 바꿔 주지만, 본문을 텍스트로만 보여주는 화면에는 그런 장치가 없어
 * 내부 코드가 학습자에게 그대로 노출된다. 이 함수가 그 자리를 빈칸 모양으로 바꾼다.
 *
 * 문자 집합은 서버 ProblemServiceImpl.BLANK_MARKER_PATTERN, 지정 모드 blankSegments.js,
 * 풀이 렌더 blankContent.js 와 같아야 한다 — 다르면 어떤 마커는 치환되고 어떤 마커는 남는다.
 */
const BLANK_MARKER_PATTERN = /\{\{[A-Za-z0-9_-]+\}\}/g;

const BLANK_PLACEHOLDER = "____";

export function previewContent(content) {
  if (!content) return "";
  return content.replace(BLANK_MARKER_PATTERN, BLANK_PLACEHOLDER);
}
```

- [ ] **Step 4: 테스트 통과를 확인한다**

Run: `cd frontend && node --test src/utils/problemPreview.test.js`
Expected: PASS (5건)

- [ ] **Step 5: 목록 화면에 적용한다**

`SolveProblemListPage.jsx`에서 본문을 그리는 곳(`{problem.content}`)을 `{previewContent(problem.content)}`로 바꾼다. import를 추가한다.

```javascript
import { previewContent } from "@/utils/problemPreview.js";
```

- [ ] **Step 6: 이력 화면에 적용한다**

`AttemptHistoryPage.jsx`는 본문을 **두 곳**에서 그린다 — PC 표(`DataTable` 안)와 모바일 카드. **둘 다** `{item.problemContent}` → `{previewContent(item.problemContent)}`로 바꾼다. 한쪽만 고치면 화면 폭에 따라 다르게 보인다.

- [ ] **Step 7: 전체 확인**

Run: `cd frontend && npm test`
Expected: 239 + 5 = 244 통과.

Run: `cd frontend && npm run build`
Expected: 성공, 경고 없음.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/utils/problemPreview.js frontend/src/utils/problemPreview.test.js frontend/src/pages/solve/SolveProblemListPage.jsx frontend/src/pages/solve/AttemptHistoryPage.jsx
git commit -m "fix: show blank markers as underscores in read-only problem views"
```

---

## Task 2: 돌아가기 수단

**Files:**
- Modify: `frontend/src/pages/solve/SolveProblemListPage.jsx`
- Modify: `frontend/src/pages/solve/RandomSetupPage.jsx`
- Modify: `frontend/src/pages/solve/RandomPlayPage.jsx`

**Interfaces:**
- Consumes: 기존 `endSessionEarly`(`solveSession.js`)

**배경:** 학습 화면 일곱 중 **세 곳에 돌아가는 수단이 없다.** 헤더의 "문제 은행 Hub" 로고를 누르는 것 말고는 방법이 없는데, 그건 돌아가기 버튼으로 읽히지 않는다.

| 화면 | 현재 | 이 Task |
|---|---|---|
| 골라서 풀기 목록 | "내 풀이 이력" 링크뿐 | 학습 홈으로 |
| 랜덤 설정 | 없음 | 학습 홈으로 |
| 랜덤 진행 | 없음 | **세트 끝내고 결과 보기** |

**랜덤 진행 화면이 다른 이유(E1):** 진행 중에 그냥 나가면 이미 제출한 기록이 결과 화면에 도달하지 못하고 사라진다. 이건 최종 리뷰가 "막다른 길"로 잡았던 문제와 같은 손실이다. 그래서 **로드 실패 화면에 이미 있는 "결과 보기"와 같은 장치**(`endSessionEarly`)를 쓴다.

**참고할 기존 마크업:** `ProblemSolvePage.jsx`와 `AttemptHistoryPage.jsx`가 이미 같은 형태의 돌아가기 링크를 쓴다(`ArrowLeft` 아이콘 + 텍스트, `mb-4 inline-flex items-center gap-1 …`). **그 클래스를 그대로 복제**한다 — 새로 디자인하지 마라.

- [ ] **Step 1: 목록 화면에 학습 홈 링크를 넣는다**

`SolveProblemListPage.jsx`의 제목 영역 위에, `AttemptHistoryPage.jsx:57`과 **같은 형태**로 넣는다.

```jsx
      <Link to="/solve" className="mb-4 inline-flex items-center gap-1 rounded-sm text-body-small font-medium text-ink-default hover:text-ink-strong focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-brand-aqua">
        <ArrowLeft size={16} aria-hidden="true" />
        학습 홈
      </Link>
```

`ArrowLeft`를 `@phosphor-icons/react` import에 추가한다(이 파일은 이미 `MagnifyingGlass`·`ArrowRight`를 쓴다).

- [ ] **Step 2: 랜덤 설정 화면에 학습 홈 링크를 넣는다**

`RandomSetupPage.jsx`에 Step 1과 **동일한 마크업**을 넣는다. `Link`와 `ArrowLeft` import가 필요하다.

- [ ] **Step 3: 랜덤 진행 화면에 세트 종료 버튼을 넣는다**

`RandomPlayPage.jsx`에는 이미 로드 실패 화면용 `handleViewResults`가 있다(`endSessionEarly` → sessionStorage 갱신 → 결과로 이동). **정상 진행 화면에서도 같은 동작을 쓴다** — 새 함수를 만들지 말고 그것을 재사용하라.

진행률(`{session.index + 1} / {session.problemIds.length}`)이 있는 `<section>`에 나란히 둔다. 진행률은 왼쪽, 종료는 오른쪽이다.

```jsx
      <section className="mb-6 flex items-center justify-between gap-3">
        <p className="text-body-small font-medium text-ink-muted">
          {session.index + 1} / {session.problemIds.length}
        </p>
        {/* 진행 중 이탈은 이미 제출한 기록을 잃는 길이 되면 안 된다. 지금까지 푼 만큼으로
            세트를 끝내고 결과 요약을 보여준다(로드 실패 화면의 "결과 보기"와 같은 장치). */}
        <Button variant="secondary" size="sm" onClick={handleViewResults}>
          그만하고 결과 보기
        </Button>
      </section>
```

**문구가 중요하다.** "돌아가기"라고만 쓰면 기록이 어떻게 되는지 알 수 없다. "그만하고 결과 보기"는 세트가 끝나고 결과를 본다는 것을 알려 준다.

**아직 한 문제도 풀지 않았을 때**(`session.index === 0`)를 확인하라. `endSessionEarly`가 `problemIds`를 0개로 잘라 `summarize()`가 `{total: 0, correctCount: 0}`이 되고 결과 화면은 "0문제 중 0개 정답"을 보여준다 — 어색하지만 깨지지는 않는다. **이 경우 버튼을 감추거나 학습 홈으로 보내는 것이 나은지 판단하고, 선택한 쪽을 리포트에 적어라.**

- [ ] **Step 4: 전체 확인**

Run: `cd frontend && npm test`
Expected: 244 통과(화면 변경이라 신규 테스트 없음 — jsdom 부재).

Run: `cd frontend && npm run build`
Expected: 성공, 경고 없음.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/solve/SolveProblemListPage.jsx frontend/src/pages/solve/RandomSetupPage.jsx frontend/src/pages/solve/RandomPlayPage.jsx
git commit -m "feat: add explicit back navigation to the solve screens"
```

---

## Task 3: 세션에 문제 본문을 함께 저장

**Files:**
- Modify: `frontend/src/utils/solveSession.js`
- Modify: `frontend/src/utils/solveSession.test.js`
- Modify: `frontend/src/pages/solve/RandomSetupPage.jsx`

**Interfaces:**
- Produces:
  - `createSession(problems)` — 인자가 **ID 배열이 아니라 문제 객체 배열**(`{id, type, content}`)로 바뀐다
  - 세션 형태에 `problems: [{id, type, content}]` 추가. `problemIds`는 그대로 유지한다
  - `problemById(session, id)` → `{id, type, content} | undefined`
- Consumes: 없음

**배경(E3):** 결과 요약에 "어떤 문제를 틀렸는지" 보여주려면 문제 본문이 필요한데, 지금 세션에는 `{problemId, correct}`만 있다.

**추가 API 호출은 필요 없다.** 설정 화면이 이미 `/api/problems/random`에서 `{id, type, content, tags}`를 받아 놓고 `id`만 뽑아 쓰고 버린다. 그걸 세션에 함께 넣으면 된다.

> ⚠️ `solveSession.js`는 이 프로젝트에서 **자동 테스트가 닿는 유일한 프론트 로직**이다(13건). 형태를 바꾸므로 테스트도 함께 손봐야 한다. `problemIds`를 없애지 말 것 — `currentProblemId`·`isFinished`·`endSessionEarly`가 전부 그것을 기준으로 동작하고, 그 계약을 바꾸면 세 화면이 함께 흔들린다.

- [ ] **Step 1: 실패하는 테스트를 먼저 쓴다**

`solveSession.test.js`에 추가한다. 기존 테스트에서 `createSession([11, 22, 33])`처럼 ID 배열을 넘기던 곳은 **객체 배열로 바꿔야 한다** — 그 수정도 이 Step에 포함된다.

```javascript
const P = (id) => ({ id, type: "OX", content: `문제 ${id}` });

test("createSession: keeps both the id order and the problem metadata", () => {
  const session = createSession([P(11), P(22)]);
  assert.deepStrictEqual(session.problemIds, [11, 22]);
  assert.deepStrictEqual(session.problems, [
    { id: 11, type: "OX", content: "문제 11" },
    { id: 22, type: "OX", content: "문제 22" },
  ]);
});

test("problemById: finds the stored metadata", () => {
  const session = createSession([P(11), P(22)]);
  assert.deepStrictEqual(problemById(session, 22), { id: 22, type: "OX", content: "문제 22" });
  assert.strictEqual(problemById(session, 999), undefined);
});

test("parseSession: rejects a session whose problems field is not an array", () => {
  const raw = JSON.stringify({ problemIds: [1], index: 0, results: [], problems: "x" });
  assert.strictEqual(parseSession(raw), null);
});

test("endSessionEarly: keeps the problem metadata intact", () => {
  let session = createSession([P(11), P(22), P(33)]);
  session = recordResult(session, true);
  const ended = endSessionEarly(session);
  assert.strictEqual(ended.problemIds.length, 1);
  // 잘린 문제의 메타까지 지우면 결과 화면이 이미 푼 문제를 못 찾는다
  assert.deepStrictEqual(ended.problems, session.problems);
});
```

마지막 테스트가 중요하다 — `endSessionEarly`가 `problemIds`만 자르고 `problems`는 **그대로 둬야** 결과 화면이 이미 푼 문제의 본문을 찾을 수 있다.

- [ ] **Step 2: 테스트가 실패하는지 확인한다**

Run: `cd frontend && node --test src/utils/solveSession.test.js`
Expected: FAIL

- [ ] **Step 3: 세션 함수를 확장한다**

```javascript
export function createSession(problems) {
  const list = problems.map((p) => ({ id: p.id, type: p.type, content: p.content }));
  return {
    problemIds: list.map((p) => p.id),
    problems: list,
    index: 0,
    results: [],
  };
}

export function problemById(session, id) {
  return session.problems?.find((p) => p.id === id);
}
```

`recordResult`와 `endSessionEarly`가 반환하는 객체에 **`problems`를 그대로 실어 보내야 한다** — 빠뜨리면 다음 저장에서 메타가 사라진다.

`parseSession`에 검증을 한 줄 더한다.

```javascript
  if (!Array.isArray(parsed.problems)) return null;
```

- [ ] **Step 4: 테스트 통과를 확인한다**

Run: `cd frontend && node --test src/utils/solveSession.test.js`
Expected: PASS (기존 + 신규 전부)

- [ ] **Step 5: 설정 화면이 객체를 넘기게 한다**

`RandomSetupPage.jsx`의 `createSession(problems.map((p) => p.id))`를 `createSession(problems)`로 바꾼다.

- [ ] **Step 6: 전체 확인**

Run: `cd frontend && npm test`
Expected: 244 + 신규 통과.

Run: `cd frontend && npm run build`
Expected: 성공, 경고 없음.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/utils/solveSession.js frontend/src/utils/solveSession.test.js frontend/src/pages/solve/RandomSetupPage.jsx
git commit -m "feat: carry problem metadata in the random set session"
```

---

## Task 4: 결과 요약에 문제별 정오 목록

**Files:**
- Modify: `frontend/src/pages/solve/RandomResultPage.jsx`

**Interfaces:**
- Consumes: Task 1 `previewContent`, Task 3 `problemById`

**배경:** 지금 결과 화면은 "5문제 중 3개 정답"만 보여준다. **어떤 문제를 틀렸는지 알 수 없어** 복습으로 이어지지 않는다.

`session.results`는 `[{problemId, correct}]`이고, Task 3이 넣은 `session.problems`에서 본문을 찾을 수 있다.

- [ ] **Step 1: 문제별 목록을 그린다**

기존 집계(`{total}문제 중 {correctCount}개 정답`)는 **그대로 두고** 그 아래에 목록을 추가한다.

각 항목은 **순번 · 본문 미리보기 · 정오 표시**로 구성한다. 본문은 반드시 `previewContent`를 거쳐야 한다(빈칸 문제의 마커가 그대로 나오면 안 된다).

```jsx
        <ul className="mt-6 space-y-2 text-left">
          {session.results.map((r, index) => {
            const problem = problemById(session, r.problemId);
            return (
              <li
                key={index}
                className="flex items-start gap-3 rounded-md border border-line-default p-3"
              >
                <span className="shrink-0 text-body-small font-medium text-ink-muted">{index + 1}</span>
                <span className="line-clamp-2 flex-1 text-body-small text-ink-strong">
                  {previewContent(problem?.content) || "(불러올 수 없는 문제)"}
                </span>
                <span
                  className={`shrink-0 text-body-small font-semibold ${
                    r.correct ? "text-success-text" : "text-danger-text"
                  }`}
                >
                  {r.correct ? "정답" : "오답"}
                </span>
              </li>
            );
          })}
        </ul>
```

`problem`이 없을 수 있다(개발자 도구로 세션을 고친 경우). **`problem?.content`로 방어**하고 대체 문구를 둔다 — 여기서 터지면 ErrorBoundary가 없어 흰 화면이 된다.

`Surface`의 `max-w-md`가 목록에는 좁을 수 있다. 폭을 넓히되 집계는 계속 가운데 정렬로 두어라(집계는 `text-center`, 목록은 `text-left`).

- [ ] **Step 2: import를 추가한다**

```javascript
import { previewContent } from "@/utils/problemPreview.js";
```
`problemById`는 기존 `solveSession.js` import 목록에 더한다.

- [ ] **Step 3: 전체 확인**

Run: `cd frontend && npm test`
Expected: Task 3까지의 수와 동일(화면 변경이라 신규 테스트 없음).

Run: `cd frontend && npm run build`
Expected: 성공, 경고 없음.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/solve/RandomResultPage.jsx
git commit -m "feat: list each problem outcome in the random set result"
```

> 커밋 메시지에 한자가 섞이지 않게 할 것: `feat: list each problem outcome in the random set result`

---

## Task 5: 브라우저 검증

**Files:** 없음(검증). 결함 발견 시 해당 파일 수정.

**배경:** **이 계획의 화면 작업은 자동 검증이 0이다.** jsdom이 없어 다섯 화면의 변경분을 테스트가 한 줄도 실행하지 않는다. 자동 검증이 닿는 것은 `problemPreview.js`와 `solveSession.js`뿐이다.

**환경:** `docs/qa/2026-08-12-plan4-solve-qa-manual.md` §0을 따른다. 프론트가 **5173**이어야 하고(아니면 CORS로 로그인 실패), 이 계획은 백엔드 무변경이라 **백엔드 재기동은 불필요**하다.

계정: `emp001` / `QaPlan3!2026`

- [ ] **Step 1: 돌아가기 수단**

| 화면 | 확인 |
|---|---|
| 골라서 풀기 목록 | "학습 홈" 링크가 보이고 눌러서 `/solve`로 간다 |
| 랜덤 설정 | 동일 |
| 랜덤 진행 | "그만하고 결과 보기" 버튼이 보인다 |
| 문제 풀이(단건) | 기존 "문제 목록" 링크가 **그대로** 있다 |
| 내 풀이 이력 | 기존 "학습 홈" 링크가 **그대로** 있다 |

- [ ] **Step 2: 세트 중도 종료가 기록을 지키는가**

5문제 세트를 시작해 **2문제만 풀고** "그만하고 결과 보기"를 누른다.

| 확인 | 기대 |
|---|---|
| 결과 화면 집계 | **2문제 중 N개 정답**(5문제가 아니다 — `summarize().total`은 푼 개수다) |
| 문제별 목록 | 푼 2문제만 나온다 |
| sessionStorage | 결과 화면을 그린 뒤 지워진다 |

한 문제도 풀지 않고 눌렀을 때의 동작도 확인하고 기록한다(Task 2 Step 3에서 고른 처리).

- [ ] **Step 3: 결과 상세**

| 확인 | 기대 |
|---|---|
| 문제별 정오 | 실제 채점 결과와 일치 |
| **빈칸 문제 본문** | `{{b1}}`이 아니라 `____`로 보인다 |
| 순번 | 푼 순서대로 |
| 긴 본문 | 두 줄로 잘리고 레이아웃이 깨지지 않는다 |

- [ ] **Step 4: 마커 표시가 세 곳 모두 적용됐는가**

| 화면 | 확인 |
|---|---|
| 골라서 풀기 목록 | 빈칸 문제가 `____`로 보인다 |
| 내 풀이 이력 (PC 폭) | 동일 |
| 내 풀이 이력 (모바일 폭 390px) | 동일 — **표와 카드 두 렌더를 모두 봐야 한다** |
| 랜덤 결과 | 동일 |

**풀이 화면에서는 여전히 입력칸이어야 한다** — `previewContent`가 풀이 렌더를 침범하지 않았는지 확인한다.

- [ ] **Step 5: 회귀**

| 확인 | 기대 |
|---|---|
| 랜덤 세트 정상 완주 | 끝까지 풀면 결과 화면, 집계 정확 |
| 진행 중 새로고침 | 같은 위치에서 이어짐(세션 형태가 바뀌었다) |
| 세션 없이 `/solve/random/play` 직접 접근 | 설정 화면으로 |
| **개발자 도구로 `problems` 필드 삭제 후 새로고침** | 설정 화면으로(흰 화면·오류 아님) |
| 단건 풀이(`/solve/:id`) | 기존과 동일하게 동작 |
| 브라우저 콘솔 | 전 과정 오류·경고 **0건** |

- [ ] **Step 6: 전체 테스트와 빌드**

```
cd frontend && npm test
cd frontend && npm run build
cd backend && ./gradlew test    # 230 — 백엔드 무변경이므로 그대로여야 한다
```

- [ ] **Step 7: 결과를 문서로 남기고 커밋**

`docs/qa/`에 검증 결과를 남긴다. 결함은 QA 매뉴얼 §8.2 양식으로 기록한다.

---

## 완료 기준

- [ ] 목록·랜덤 설정·랜덤 진행 세 화면에 돌아가기 수단이 있다
- [ ] 랜덤 진행 중 나가면 **세트가 끝나고 결과 요약이 뜬다** — 이미 푼 기록이 사라지지 않는다 (E1)
- [ ] 결과 요약이 문제별 정오를 보여준다
- [ ] 빈칸 마커가 목록·이력·결과 **세 곳 모두**에서 `____`로 보인다 (E2)
- [ ] 풀이 화면의 빈칸은 여전히 입력칸이다
- [ ] 세션 형태가 바뀌었어도 진행 중 새로고침이 견딘다
- [ ] 조작된 세션이 흰 화면을 만들지 않는다
- [ ] 백엔드 **230 그대로**(무변경), 프론트엔드 239 → 244+ 전부 통과, 빌드 성공
- [ ] 브라우저 콘솔에 오류 없음
