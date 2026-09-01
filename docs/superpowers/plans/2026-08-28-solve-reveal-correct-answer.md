# 오답 시 정답 공개 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 문제 풀이 시 오답을 제출하면(채점 직후 화면과 "내 풀이 이력" 양쪽에서) 정답이 무엇이었는지 보여준다. 현재는 5개 유형 중 FILL_BLANK만 이렇게 동작하고 나머지 4개(MCQ_SINGLE·MCQ_MULTI·OX·SHORT_ANSWER)는 정답을 전혀 공개하지 않는다.

**Architecture:** 채점 순수 함수(`grading.ts`)가 이미 DB에서 다 읽어온 정답 데이터를 계산해 놓고도 응답에서 버리고 있던 필드(`correctAnswerSummary`)를 새로 만들어 응답 계층까지 그대로 흘려보낸다. "내 풀이 이력"은 문제당 정답이 여러 개일 수 있는 1:N 구조라 단순 조인이 안 되므로, 이력에 등장한 문제 ID를 모아 유형별로 한 번씩(IN절) 배치 조회해 정답을 붙인다(N+1 방지). 스키마 변경은 없다 — 이미 저장돼 있는 `problem_choices.is_correct`·`problem_answers.answer_text`·`problem_blanks.answer_text`를 노출만 한다.

**Tech Stack:** Next.js 15 App Router, Drizzle ORM + postgres.js, Vitest, React(JSX)

**Spec:** 이 저장소는 이 기능에 대한 별도 spec 문서가 없다(Bounded 규모 — brainstorming 세션에서 채팅으로 설계를 확정하고 사용자가 승인했다). 대신 아래 두 문서가 계약 역할을 한다:
- `docs/qa/2026-08-21-solve-parity-checklist.md` (G13·G14) — 이번 변경이 **의도적으로 벗어나는** 원본 파리티 계약
- `docs/qa/2026-08-21-solve-e2e-verification.md` §항목 17 — G14 실측 근거(현재 3키 응답)

## Global Constraints

- **정답지가 계약이다.** G14(`{correct, explanation, blankResults}` 정확히 3키)를 이번 작업이 의도적으로 깬다. Task 6에서 정답지 문서 자체를 "승인된 이탈"로 갱신하지 않으면 다음 사람이 파리티 위반으로 오인한다.
- **테스트는 한 러너(vitest)로 모은다.** 새 테스트는 기존 파일에 추가하거나(`grading.test.ts`, `attemptService.test.ts`) 신설 파일(`attemptHistoryService.test.ts`)에 둔다. 매 태스크 끝에 전체 스위트를 돌려 무회귀를 확인한다(고정 개수 대조 아님).
- **새 회귀 테스트는 뮤테이션으로 검증한다.** 테스트를 추가했으면, 방금 만든 필드/분기를 일부러 지워보고 그 테스트가 실제로 실패하는지 확인한 뒤 복원한다.
- **`@/`는 `web/` 루트를 가리킨다**(`web/tsconfig.json`의 `paths`).
- **UI 변경은 컴포넌트 렌더 테스트가 없다.** 이 저장소엔 순수 함수 테스트만 있고 React 렌더 테스트 인프라가 없다(기존 정답지 G8과 같은 이유). Task 3·5의 화면 변경은 로컬 브라우저 실측으로 검증한다 — 자동화 테스트로 커버됐다고 적지 마라.
- **커밋은 태스크 단위.** `docs/**`·`.claude/**`는 사용자 승인 없이 스테이징하지 않는다(Task 6의 문서 변경도 마찬가지 — 커밋 직전에 사용자에게 보여주고 승인받는다).
- **`problem_answers`에는 `displayOrder`가 없다** — id 오름차순으로 정렬한다(`lib/db/problemParts.ts`의 기존 관례와 동일).

---

### Task 1: 채점 순수 함수에 정답 요약 필드 추가

**Files:**
- Modify: `web/lib/solve/grading.ts:36-41` (`GradeResult` 인터페이스), `:71-79`(MCQ/OX 분기), `:82-89`(SHORT_ANSWER 분기), `:116-126`(FILL_BLANK 분기)
- Test: `web/lib/solve/grading.test.ts`

**Interfaces:**
- Consumes: 없음(이 파일이 최하위 레이어)
- Produces: `GradeResult.correctAnswerSummary: string | null` — Task 2가 그대로 소비한다.

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`web/lib/solve/grading.test.ts` 맨 아래에 추가:

```typescript
describe("correctAnswerSummary — 오답 시 정답 공개", () => {
  it("MCQ_SINGLE: 정답 보기 텍스트를 담는다", () => {
    const result = grade({
      type: "MCQ_SINGLE",
      choices: [
        { id: 1, choiceText: "서울", isCorrect: true },
        { id: 2, choiceText: "부산", isCorrect: false },
      ],
      selectedChoiceIds: [2],
    });
    expect(result.correctAnswerSummary).toBe("서울");
  });

  it("MCQ_MULTI: 정답이 여러 개면 콤마로 모두 나열한다", () => {
    const result = grade({
      type: "MCQ_MULTI",
      choices: [
        { id: 1, choiceText: "가", isCorrect: true },
        { id: 2, choiceText: "나", isCorrect: false },
        { id: 3, choiceText: "다", isCorrect: true },
      ],
      selectedChoiceIds: [2],
    });
    expect(result.correctAnswerSummary).toBe("가, 다");
  });

  it("OX: 정답이 O/X 라벨 텍스트로 나온다", () => {
    const result = grade({
      type: "OX",
      choices: [
        { id: 1, choiceText: "O", isCorrect: false },
        { id: 2, choiceText: "X", isCorrect: true },
      ],
      selectedChoiceIds: [1],
    });
    expect(result.correctAnswerSummary).toBe("X");
  });

  it("SHORT_ANSWER: 등록된 허용 정답을 모두 나열한다", () => {
    const result = grade({
      type: "SHORT_ANSWER",
      answers: ["서울", "Seoul"],
      submittedText: "부산",
    });
    expect(result.correctAnswerSummary).toBe("서울, Seoul");
  });

  it("FILL_BLANK: null 이다 — blankResults 가 이미 빈칸별 정답을 담는다", () => {
    const result = grade({
      type: "FILL_BLANK",
      blanks: [{ blankKey: "b1", answerText: "정답" }],
      blankRevealCount: 1,
      blankAnswers: [{ blankKey: "b1", submittedAnswer: "오답" }],
    });
    expect(result.correctAnswerSummary).toBeNull();
  });

  it("정답 제출이어도 correctAnswerSummary 는 채워진다 — 보여줄지는 화면이 판단한다", () => {
    const result = grade({
      type: "MCQ_SINGLE",
      choices: [{ id: 1, choiceText: "서울", isCorrect: true }],
      selectedChoiceIds: [1],
    });
    expect(result.correct).toBe(true);
    expect(result.correctAnswerSummary).toBe("서울");
  });
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인한다**

Run: `cd web && npx vitest run lib/solve/grading.test.ts`
Expected: FAIL — `correctAnswerSummary` 가 `undefined`라 `toBe`/`toBeNull` 단언이 깨진다.

- [ ] **Step 3: `GradeResult` 인터페이스에 필드를 추가한다**

`web/lib/solve/grading.ts:36-41`을 다음으로 교체:

```typescript
export interface GradeResult {
  correct: boolean;
  submittedAnswerSummary: string | null;
  selectedChoices: { id: number; choiceText: string }[]; // 문제 정의 순서
  blankResults: BlankResult[] | null;
  // 오답 시 화면에 보여줄 정답 요약. 정답이 여러 개(MCQ_MULTI·SHORT_ANSWER 허용 정답)면
  // ", " 로 모두 나열한다. FILL_BLANK 는 null — blankResults[i].correctAnswer 가
  // 빈칸별로 이미 담당한다(둘 다 채우면 같은 정보가 두 자리에 흩어진다).
  correctAnswerSummary: string | null;
}
```

- [ ] **Step 4: MCQ_SINGLE·MCQ_MULTI·OX 분기를 수정한다**

`web/lib/solve/grading.ts:71-79`을 다음으로 교체:

```typescript
      // G5·T3: 문제에 정의된 순서로 고정한다. 제출 배열은 순서가 의미 없고 남의 id 가 섞일 수 있다.
      const selectedChoices = input.choices
        .filter((c) => submittedIds.has(c.id))
        .map((c) => ({ id: c.id, choiceText: c.choiceText }));
      const correctAnswerSummary = input.choices
        .filter((c) => c.isCorrect)
        .map((c) => c.choiceText)
        .join(", ");
      return {
        correct,
        selectedChoices,
        blankResults: null,
        submittedAnswerSummary: selectedChoices.map((c) => c.choiceText ?? "").join(", "),
        correctAnswerSummary,
      };
```

- [ ] **Step 5: SHORT_ANSWER 분기를 수정한다**

`web/lib/solve/grading.ts:82-89`(현재 `case "SHORT_ANSWER":` 블록)을 다음으로 교체:

```typescript
    case "SHORT_ANSWER": {
      const submitted = normalizeAnswer(input.submittedText);
      return {
        correct: input.answers.some((a) => normalizeAnswer(a) === submitted),
        selectedChoices: [],
        blankResults: null,
        submittedAnswerSummary: input.submittedText, // T2-1: 원문 그대로
        correctAnswerSummary: input.answers.join(", "),
      };
    }
```

- [ ] **Step 6: FILL_BLANK 분기에 `correctAnswerSummary: null`을 추가한다**

`web/lib/solve/grading.ts:116-126`의 `return` 문에 `correctAnswerSummary: null,`을 추가한다(다른 필드는 그대로):

```typescript
      return {
        correct: blankResults.every((r) => r.correct),
        selectedChoices: [],
        blankResults,
        correctAnswerSummary: null,
        // T4: 답만 잇는다. 키는 화면에 안 나오는 내부 식별자다.
        submittedAnswerSummary: submitted
          .map((b) => (b.submittedAnswer == null || javaTrim(b.submittedAnswer) === "" ? "(미입력)" : b.submittedAnswer))
          .join(", "),
      };
```

- [ ] **Step 7: 테스트가 통과하는지 확인한다**

Run: `cd web && npx vitest run lib/solve/grading.test.ts`
Expected: PASS, 6개 신규 테스트 포함 전부 통과.

- [ ] **Step 8: 뮤테이션 테스트로 실제 검증**

`web/lib/solve/grading.ts`의 `correctAnswerSummary` 계산 줄(MCQ 분기의 `.filter((c) => c.isCorrect)` 부분)을 일시적으로 `.filter((c) => false)`로 바꿔 저장 → `npx vitest run lib/solve/grading.test.ts` 재실행 → MCQ 관련 3개 테스트가 실패하는지 확인 → 원래대로 복원 → 다시 통과 확인.

- [ ] **Step 9: 전체 스위트 확인 + 커밋**

Run: `cd web && npx vitest run` (무회귀 확인, 격리된 단일 실행으로)

```bash
git add web/lib/solve/grading.ts web/lib/solve/grading.test.ts
git commit -m "[ADD] 채점 결과에 정답 요약 필드 추가 (grading.ts)"
```

---

### Task 2: 시도 제출 응답에 정답 요약 실어 보내기

**Files:**
- Modify: `web/lib/solve/attemptService.ts:12-17`(`AttemptResult` 인터페이스, 주석 포함), `:122`(반환문)
- Test: `web/lib/solve/attemptService.test.ts`

**Interfaces:**
- Consumes: `GradeResult.correctAnswerSummary`(Task 1)
- Produces: `AttemptResult.correctAnswerSummary: string | null` — Task 3(프론트)이 소비한다. API 응답 바디에 그대로 직렬화된다.

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`web/lib/solve/attemptService.test.ts`에 이미 있는 `seedMcq()`(MCQ_SINGLE 문제 하나에 정답 보기 "가"·오답 보기 "나"를 만들어 `{problemId, choiceId, wrongChoiceId}`를 돌려준다)와 `seedBlank()`(기본값 `blankKey:"a", answerText:"가", revealCount:1`인 FILL_BLANK 문제의 id를 돌려준다) 헬퍼를 그대로 쓴다. 파일 마지막 `describe` 블록 뒤에 새 `describe`를 추가:

```typescript
describe("submitAttempt — correctAnswerSummary (G14 확장, 승인된 이탈)", () => {
  it("오답 제출 시 응답에 정답 보기 텍스트가 실린다", async () => {
    const { problemId, wrongChoiceId } = await seedMcq();
    const result = await submitAttempt(db, problemId, { selectedChoiceIds: [wrongChoiceId] }, actor);
    expect(result.correct).toBe(false);
    expect(result.correctAnswerSummary).toBe("가");
  });

  it("정답 제출 시에도 correctAnswerSummary 는 채워져 있다 — 보여줄지는 화면이 판단한다", async () => {
    const { problemId, choiceId } = await seedMcq();
    const result = await submitAttempt(db, problemId, { selectedChoiceIds: [choiceId] }, actor);
    expect(result.correct).toBe(true);
    expect(result.correctAnswerSummary).toBe("가");
  });

  it("FILL_BLANK 는 correctAnswerSummary 가 null 이다 — blankResults 가 이미 정답을 담당한다", async () => {
    const problemId = await seedBlank();
    const result = await submitAttempt(
      db, problemId, { selectedChoiceIds: null, submittedText: null, blankAnswers: [{ blankKey: "a", submittedAnswer: "오답" }] }, actor,
    );
    expect(result.correctAnswerSummary).toBeNull();
    expect(result.blankResults?.[0].correctAnswer).toBe("가");
  });
});
```

**같은 파일에 이미 있는 "Step 2-1" 테스트도 같이 갱신해야 한다** — `AttemptResult`의 키가 "정확히 세 개"라고 하드코딩되어 있어(`attemptService.test.ts:216-220`), `correctAnswerSummary`를 4번째 키로 추가하면 이 테스트가 그대로는 깨진다. `web/lib/solve/attemptService.test.ts:216-220`을 다음으로 교체:

```typescript
  it("Step 2-1: AttemptResult 의 키 집합이 정확히 네 개다 — G14 확장 이후", async () => {
    const { problemId } = await seedMcq();
    const r = await submitAttempt(db, problemId, { selectedChoiceIds: [], submittedText: null, blankAnswers: null }, actor);
    expect(Object.keys(r).sort()).toEqual(["blankResults", "correct", "correctAnswerSummary", "explanation"]);
  });
```

- [ ] **Step 2: 두 테스트가 모두 실패하는지 확인한다**

Run: `cd web && npx vitest run lib/solve/attemptService.test.ts`
Expected: FAIL — 신규 테스트 3개는 `result.correctAnswerSummary`가 `undefined`라서, "Step 2-1" 키 집합 테스트는 실제 키가 3개인데 기대값이 4개라서 실패한다.

- [ ] **Step 3: `AttemptResult` 인터페이스와 주석을 갱신한다**

`web/lib/solve/attemptService.ts:12-17`을 다음으로 교체:

```typescript
/**
 * `AttemptResult.java` 미러였다. 응답 키는 원래 `correct`·`explanation`·`blankResults`
 * 3개뿐이었다(정답지 G14) — 그러나 이 4번째 키(`correctAnswerSummary`)는 **의도적으로
 * G14 를 벗어나는 이탈**이다: 오답 시 정답을 알려주는 기능은 원본 Spring 시스템에 없었다
 * (docs/qa/2026-08-21-solve-parity-checklist.md G14 를 "승인된 이탈"로 갱신했다).
 * 스프레드로 다른 필드를 더 싣지는 마라 — 이 네 개만 계약이다.
 */
export interface AttemptResult {
  correct: boolean;
  explanation: string | null;
  blankResults: BlankResult[] | null;
  correctAnswerSummary: string | null;
}
```

- [ ] **Step 4: 반환문에 필드를 추가한다**

`web/lib/solve/attemptService.ts:122`을 다음으로 교체:

```typescript
  return {
    correct: result.correct,
    explanation: problem.explanation,
    blankResults: result.blankResults,
    correctAnswerSummary: result.correctAnswerSummary,
  };
```

- [ ] **Step 5: 테스트가 통과하는지 확인한다**

Run: `cd web && npx vitest run lib/solve/attemptService.test.ts`
Expected: PASS.

- [ ] **Step 6: 뮤테이션 테스트**

Step 4의 `correctAnswerSummary: result.correctAnswerSummary,` 줄을 일시적으로 지우고 재실행 → 새 테스트 3개가 실패하는지 확인 → 복원 → 재확인.

- [ ] **Step 7: 전체 스위트 확인 + 커밋**

Run: `cd web && npx vitest run`

```bash
git add web/lib/solve/attemptService.ts web/lib/solve/attemptService.test.ts
git commit -m "[ADD] 시도 제출 응답에 정답 요약 포함 (attemptService.ts)"
```

---

### Task 3: 채점 결과 화면에 정답 표시

**Files:**
- Modify: `web/components/solve/ProblemSolveCard.jsx:183-205`

**Interfaces:**
- Consumes: `result.correctAnswerSummary`(Task 2, API 응답), `result.correct`, `result.blankResults`(기존)
- Produces: 없음(리프 컴포넌트)

- [ ] **Step 1: 렌더 분기를 추가한다**

`web/components/solve/ProblemSolveCard.jsx:190-203`(기존 `{result.blankResults && (...)}` 블록) 바로 뒤에 아래 블록을 추가한다:

```jsx
          {result.blankResults && (
            <ul className="mt-3 space-y-1 text-body-small">
              {result.blankResults.map((b) => (
                <li key={b.blankKey} className="text-ink-default">
                  <span className="font-medium text-ink-strong">{b.submittedAnswer || "(미입력)"}</span>{" "}
                  {b.correct ? (
                    <span className="text-success-text">정답</span>
                  ) : (
                    <span className="text-danger-text">오답 · 정답은 {b.correctAnswer}</span>
                  )}
                </li>
              ))}
            </ul>
          )}
          {!result.correct && !result.blankResults && result.correctAnswerSummary && (
            <p className="mt-3 text-body-small text-ink-default">
              <span className="font-medium text-ink-strong">정답: </span>
              {result.correctAnswerSummary}
            </p>
          )}
```

- [ ] **Step 2: 로컬 dev 서버로 5개 유형 전부 실측한다**

```bash
cd web && npx next dev -p 3200
```

브라우저(Playwriter/vibescraper)로 로그인 후 각 유형 문제를 일부러 오답 제출해 "정답: ..." 문구가 뜨는지 확인한다:
- MCQ_SINGLE, MCQ_MULTI(정답 2개 이상인 문제로), OX, SHORT_ANSWER — 오답 배경(빨강) 안에 "정답: ..." 표시 확인
- FILL_BLANK — 기존 블록만 뜨고 새 블록은 안 뜨는지(중복 표시 방지) 확인
- 정답을 맞혔을 때는 "정답: ..." 문구가 안 뜨는지 확인(`!result.correct` 조건)

Expected: 콘솔 오류·경고 0건, 스크린샷으로 5개 유형 전부 기록.

- [ ] **Step 3: 전체 스위트 + 빌드 확인 + 커밋**

```bash
cd web && npx vitest run
cd web && npx next build
```

```bash
git add web/components/solve/ProblemSolveCard.jsx
git commit -m "[ADD] 채점 결과 화면에 오답 시 정답 표시"
```

---

### Task 4: 풀이 이력 배치 정답 조회 서비스

**Files:**
- Modify: `web/lib/db/attempts.ts:26-46`(`AttemptHistoryRow` 타입, `findAttemptsByUserId`)
- Create: `web/lib/solve/attemptHistoryService.ts`
- Test: `web/lib/db/attempts.test.ts`(타입 필드 추가분), `web/app/api/attempts/me/route.test.ts`(H5 키 개수 갱신 — 이 라우트가 아직 `findAttemptsByUserId`를 직접 부르므로 이 태스크에서 8개로 늘어난다), `web/lib/solve/attemptHistoryService.test.ts`(신규)

**Interfaces:**
- Consumes: `web/lib/db/schema.ts`의 `problemChoices`·`problemAnswers`·`problemBlanks`(기존 export), `findAttemptsByUserId`(같은 태스크에서 확장)
- Produces: `findAttemptHistoryWithAnswers(db, userId): Promise<AttemptHistoryItem[]>` — Task 5의 API 라우트가 그대로 호출한다. `AttemptHistoryItem = AttemptHistoryRow & { correctAnswerSummary: string }`.

- [ ] **Step 1: `AttemptHistoryRow`에 `problemType`을 추가하고 실패하는 테스트를 쓴다**

`web/lib/db/attempts.test.ts`에 기존 `describe("attempts DAO", ...)` 안, 마지막 `it` 뒤에 추가:

```typescript
  it("이력 행에 problemType 이 실린다 — 정답 배치 조회가 유형별로 분기해야 한다", async () => {
    await insertAttempt(db, { userId, problemId, submittedAnswer: "X", isCorrect: false });
    const rows = await findAttemptsByUserId(db, userId);
    expect(rows[0].problemType).toBe("OX"); // beforeEach 의 seed() 기본값이 OX
  });
```

**같은 파일에 이미 있는 H5 테스트도 같이 갱신해야 한다** — `findAttemptsByUserId`의 응답 필드가 "정확히 7개"라고 하드코딩되어 있어(`attempts.test.ts:64-80`), `problemType`을 추가하면 이 테스트가 그대로는 깨진다. 손대지 않으면 이 태스크는 "새 테스트는 통과, 기존 테스트는 실패"로 끝난다. `web/lib/db/attempts.test.ts:64-80`(H5 테스트 전체)을 다음으로 교체:

```typescript
  it("H5: 응답 필드가 정확히 8개고, 값도 각 컬럼과 일치한다", async () => {
    // 리뷰(fix wave item B): 모양만 고정하고 값을 안 본 세 컬럼이 있었다 — select 맵에서
    // `attempts.problemId` → `attempts.userId`, `problems.sourceNumber` → `problems.departmentId`,
    // `attempts.submittedAt` → `problems.createdAt` 으로 바꿔치기해도 셋 다 스위트가 초록이었다.
    // sourceNumber 는 문제와 다른 값을 심어야 우연히 겹치지 않는다.
    const numberedId = await seed({ sourceNumber: 42 });
    const explicitSubmittedAt = new Date("2026-03-15T09:30:00Z");
    await db.insert(attempts).values({
      userId, problemId: numberedId, submittedAnswer: "x", isCorrect: false, submittedAt: explicitSubmittedAt,
    });
    const rows = await findAttemptsByUserId(db, userId);
    expect(Object.keys(rows[0]).sort()).toEqual(
      ["correct", "departmentName", "problemContent", "problemId", "problemType", "sourceNumber", "submittedAnswer", "submittedAt"]);
    expect(rows[0].problemId).toBe(numberedId);
    expect(rows[0].sourceNumber).toBe(42);
    expect(rows[0].submittedAt).toEqual(explicitSubmittedAt);
    // problemType 은 departmentName 과 같은 문자열 컬럼이라, 값 비교 없이 모양만 맞추면
    // 두 컬럼이 뒤바뀌어도 이 테스트가 통과한다 — 반드시 값까지 확인한다.
    expect(rows[0].problemType).toBe("OX");
  });
```

**`web/app/api/attempts/me/route.ts`도 아직 `findAttemptsByUserId`를 직접 호출한다**(Task 5에서 `findAttemptHistoryWithAnswers`로 바꾼다) — 그래서 이 응답의 키 개수를 하드코딩한 `web/app/api/attempts/me/route.test.ts:89-96`(H5)도 이 태스크에서 같이 깨진다. 다음으로 교체:

```typescript
  it("H5: 응답 필드 키 집합이 정확히 8개다 — problemType 추가 이후(Task 5 전)", async () => {
    await db.insert(attempts).values([{ userId: meId, problemId, submittedAnswer: "x", isCorrect: false }]);
    asMe();
    const { GET } = await import("./route");
    const body = await (await GET()).json();
    expect(Object.keys(body.data[0]).sort()).toEqual(
      ["correct", "departmentName", "problemContent", "problemId", "problemType", "sourceNumber", "submittedAnswer", "submittedAt"]);
  });
```

- [ ] **Step 2: 세 테스트가 모두 실패하는지 확인한다**

Run: `cd web && npx vitest run lib/db/attempts.test.ts app/api/attempts/me/route.test.ts`
Expected: FAIL — 신규 DAO 테스트는 `rows[0].problemType`이 `undefined`라서, 두 H5 테스트(DAO·라우트)는 실제 키가 7개인데 기대값이 8개라서 실패한다.

- [ ] **Step 3: `AttemptHistoryRow`와 `findAttemptsByUserId`를 수정한다**

`web/lib/db/attempts.ts:26-46`을 다음으로 교체:

```typescript
export type AttemptHistoryRow = {
  problemId: number; problemContent: string; submittedAnswer: string | null;
  correct: boolean; submittedAt: Date; departmentName: string; sourceNumber: number | null;
  problemType: string;
};

// AttemptMapper.xml:10 미러. Java 는 `a.is_correct AS correct` 별칭이 필수였다 —
// 빼면 mapUnderscoreToCamelCase 가 isCorrect 로 만들어 DTO 에 안 붙고 항상 false 가 됐다.
// 여기서는 select 의 키 이름이 곧 별칭이므로 `correct:` 로 적는 것이 그 미러다(정답지 H4).
export async function findAttemptsByUserId(db: DbConn, userId: number): Promise<AttemptHistoryRow[]> {
  return db.select({
    problemId: attempts.problemId, problemContent: problems.content,
    submittedAnswer: attempts.submittedAnswer, correct: attempts.isCorrect,
    submittedAt: attempts.submittedAt, departmentName: departments.name,
    sourceNumber: problems.sourceNumber, problemType: problems.type,
  })
    .from(attempts)
    .innerJoin(problems, eq(problems.id, attempts.problemId))
    .innerJoin(departments, eq(departments.id, problems.departmentId))
    .where(eq(attempts.userId, userId))
    .orderBy(desc(attempts.submittedAt));
}
```

- [ ] **Step 4: 테스트가 통과하는지 확인한다**

Run: `cd web && npx vitest run lib/db/attempts.test.ts app/api/attempts/me/route.test.ts`
Expected: PASS (DAO 테스트와 라우트 H5 테스트 둘 다).

- [ ] **Step 5: 신설 서비스 파일의 실패하는 테스트를 먼저 쓴다**

`web/lib/solve/attemptHistoryService.test.ts` 새로 작성(기존 `web/lib/db/attempts.test.ts`의 `beforeEach`/`seed` 패턴을 그대로 따른다 — 부서·유저 두 명 시드까지는 동일하고, 문제 시드를 유형별로 여러 개 만든다):

```typescript
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { migrateTestDb, testDb, truncateAll } from "../../test/db";
import { departments, problems, users, problemChoices, problemAnswers, problemBlanks } from "../db/schema";
import { insertAttempt } from "../db/attempts";
import { findAttemptHistoryWithAnswers } from "./attemptHistoryService";

const db = testDb();
let deptId = 0;
let userId = 0;

beforeAll(async () => { await migrateTestDb(); });
beforeEach(async () => {
  await truncateAll();
  [{ id: deptId }] = await db.insert(departments)
    .values({ name: "가팀", code: "A", status: "ACTIVE" }).returning({ id: departments.id });
  [{ id: userId }] = await db.insert(users).values({
    employeeNo: "admin", name: "관리자", email: "a@b.c", passwordHash: "x",
    departmentId: deptId, role: "SUPER_ADMIN", status: "ACTIVE", mustChangePassword: false,
  }).returning({ id: users.id });
});

async function seedProblem(type: string, over: Partial<typeof problems.$inferInsert> = {}) {
  const [row] = await db.insert(problems).values({
    type, content: "본문", departmentId: deptId, status: "ACTIVE",
    createdBy: userId, sourceNumber: null, ...over,
  }).returning({ id: problems.id });
  return row.id;
}

describe("findAttemptHistoryWithAnswers", () => {
  it("MCQ_SINGLE: 정답 보기 텍스트를 배치로 붙인다", async () => {
    const problemId = await seedProblem("MCQ_SINGLE");
    await db.insert(problemChoices).values([
      { problemId, choiceText: "서울", isCorrect: true, displayOrder: 1 },
      { problemId, choiceText: "부산", isCorrect: false, displayOrder: 2 },
    ]);
    await insertAttempt(db, { userId, problemId, submittedAnswer: "부산", isCorrect: false });

    const rows = await findAttemptHistoryWithAnswers(db, userId);
    expect(rows).toHaveLength(1);
    expect(rows[0].correctAnswerSummary).toBe("서울");
  });

  it("SHORT_ANSWER: 허용 정답을 모두 나열한다", async () => {
    const problemId = await seedProblem("SHORT_ANSWER");
    await db.insert(problemAnswers).values([
      { problemId, answerText: "서울" },
      { problemId, answerText: "Seoul" },
    ]);
    await insertAttempt(db, { userId, problemId, submittedAnswer: "부산", isCorrect: false });

    const rows = await findAttemptHistoryWithAnswers(db, userId);
    expect(rows[0].correctAnswerSummary).toBe("서울, Seoul");
  });

  it("FILL_BLANK: 빈칸 정답을 모두 나열한다(빈칸별 매칭이 아니라 전체 목록)", async () => {
    const problemId = await seedProblem("FILL_BLANK", { blankRevealCount: 2 });
    await db.insert(problemBlanks).values([
      { problemId, blankKey: "b1", answerText: "가", displayOrder: 1 },
      { problemId, blankKey: "b2", answerText: "나", displayOrder: 2 },
    ]);
    await insertAttempt(db, { userId, problemId, submittedAnswer: "다, 라", isCorrect: false });

    const rows = await findAttemptHistoryWithAnswers(db, userId);
    expect(rows[0].correctAnswerSummary).toBe("가, 나");
  });

  it("문제가 여러 개(유형 섞임)여도 각자 맞는 정답이 붙는다 — 배치 매핑이 안 섞인다", async () => {
    const mcqId = await seedProblem("OX");
    await db.insert(problemChoices).values([
      { problemId: mcqId, choiceText: "O", isCorrect: false, displayOrder: 1 },
      { problemId: mcqId, choiceText: "X", isCorrect: true, displayOrder: 2 },
    ]);
    const shortId = await seedProblem("SHORT_ANSWER");
    await db.insert(problemAnswers).values({ problemId: shortId, answerText: "정답" });
    await insertAttempt(db, { userId, problemId: mcqId, submittedAnswer: "O", isCorrect: false });
    await insertAttempt(db, { userId, problemId: shortId, submittedAnswer: "오답", isCorrect: false });

    const rows = await findAttemptHistoryWithAnswers(db, userId);
    const byProblem = new Map(rows.map((r) => [r.problemId, r.correctAnswerSummary]));
    expect(byProblem.get(mcqId)).toBe("X");
    expect(byProblem.get(shortId)).toBe("정답");
  });

  it("이력이 없으면 빈 배열을 즉시 돌려준다(배치 쿼리를 안 날린다)", async () => {
    expect(await findAttemptHistoryWithAnswers(db, userId)).toEqual([]);
  });
});
```

- [ ] **Step 6: 테스트가 실패하는지 확인한다**

Run: `cd web && npx vitest run lib/solve/attemptHistoryService.test.ts`
Expected: FAIL — 모듈 `./attemptHistoryService`가 없어서 import 에러.

- [ ] **Step 7: 서비스 파일을 구현한다**

`web/lib/solve/attemptHistoryService.ts` 신규 작성:

```typescript
import { and, eq, inArray } from "drizzle-orm";
import type { DbConn } from "../db/client";
import { findAttemptsByUserId, type AttemptHistoryRow } from "../db/attempts";
import { problemAnswers, problemBlanks, problemChoices } from "../db/schema";

export type AttemptHistoryItem = AttemptHistoryRow & { correctAnswerSummary: string };

const CHOICE_TYPES = new Set(["MCQ_SINGLE", "MCQ_MULTI", "OX"]);

/** problemId 별로 text 를 모아 ", " 로 이어붙인 맵을 만든다. */
function groupJoin(rows: { problemId: number; text: string }[]): Map<number, string> {
  const buckets = new Map<number, string[]>();
  for (const r of rows) {
    if (!buckets.has(r.problemId)) buckets.set(r.problemId, []);
    buckets.get(r.problemId)!.push(r.text);
  }
  return new Map([...buckets.entries()].map(([id, texts]) => [id, texts.join(", ")]));
}

type ProblemText = { problemId: number; text: string };

// 세 헬퍼 모두 problemIds 가 비면 쿼리 없이 빈 배열을 돌려준다 — lib/db/tags.ts 의
// findOrCreateTagsByNames 와 같은 관례다(빈 IN 절도 SQL 상 유효하지만, 굳이 요청을 보내지 않는다).
async function fetchCorrectChoiceTexts(db: DbConn, problemIds: number[]): Promise<ProblemText[]> {
  if (problemIds.length === 0) return [];
  return db.select({ problemId: problemChoices.problemId, text: problemChoices.choiceText })
    .from(problemChoices)
    .where(and(inArray(problemChoices.problemId, problemIds), eq(problemChoices.isCorrect, true)));
}

async function fetchAnswerTexts(db: DbConn, problemIds: number[]): Promise<ProblemText[]> {
  if (problemIds.length === 0) return [];
  // problem_answers 에는 displayOrder 가 없다 — id(삽입 순) 오름차순으로 대신한다
  // (lib/db/problemParts.ts::findAnswersByProblemId 와 같은 관례).
  return db.select({ problemId: problemAnswers.problemId, text: problemAnswers.answerText })
    .from(problemAnswers)
    .where(inArray(problemAnswers.problemId, problemIds))
    .orderBy(problemAnswers.id);
}

async function fetchBlankAnswerTexts(db: DbConn, problemIds: number[]): Promise<ProblemText[]> {
  if (problemIds.length === 0) return [];
  return db.select({ problemId: problemBlanks.problemId, text: problemBlanks.answerText })
    .from(problemBlanks)
    .where(inArray(problemBlanks.problemId, problemIds))
    .orderBy(problemBlanks.displayOrder);
}

/**
 * "내 풀이 이력"에 나오는 문제들의 정답을 배치로 붙인다.
 *
 * 문제당 정답이 여러 개일 수 있어(MCQ_MULTI 의 정답 보기 여러 개, SHORT_ANSWER 의 허용
 * 정답 여러 개, FILL_BLANK 의 빈칸 여러 개) findAttemptsByUserId 의 조인에 그대로
 * 끼워 넣으면 attempts 행이 정답 개수만큼 뻥튀기된다. 대신 이력에 등장한 문제 id 를
 * 유형별로 모아 problem_id IN (...) 로 한 번씩만(최대 3번) 조회해 메모리에서 매핑한다
 * — 이력 행 개수와 무관하게 쿼리 수가 고정된다(N+1 방지).
 *
 * FILL_BLANK 는 실시간 채점(ProblemSolveCard.jsx)의 blank별 정답/오답 매칭과 다르게,
 * 여기서는 해당 문제의 빈칸 정답 전체를 한 줄로 나열한다 — 과거 문제를 복습하는
 * 화면이라 어느 제출값이 어느 빈칸에 대응했는지까지 재현할 필요는 없다는 판단이다.
 */
export async function findAttemptHistoryWithAnswers(db: DbConn, userId: number): Promise<AttemptHistoryItem[]> {
  const rows = await findAttemptsByUserId(db, userId);
  if (rows.length === 0) return [];

  const choiceProblemIds = rows.filter((r) => CHOICE_TYPES.has(r.problemType)).map((r) => r.problemId);
  const answerProblemIds = rows.filter((r) => r.problemType === "SHORT_ANSWER").map((r) => r.problemId);
  const blankProblemIds = rows.filter((r) => r.problemType === "FILL_BLANK").map((r) => r.problemId);

  const [choiceRows, answerRows, blankRows] = await Promise.all([
    fetchCorrectChoiceTexts(db, choiceProblemIds),
    fetchAnswerTexts(db, answerProblemIds),
    fetchBlankAnswerTexts(db, blankProblemIds),
  ]);

  const summaryByProblemId = new Map([
    ...groupJoin(choiceRows),
    ...groupJoin(answerRows),
    ...groupJoin(blankRows),
  ]);

  return rows.map((row) => ({ ...row, correctAnswerSummary: summaryByProblemId.get(row.problemId) ?? "" }));
}
```

- [ ] **Step 8: 테스트가 통과하는지 확인한다**

Run: `cd web && npx vitest run lib/solve/attemptHistoryService.test.ts`
Expected: PASS, 5개 테스트 전부.

- [ ] **Step 9: 뮤테이션 테스트**

`CHOICE_TYPES.has(r.problemType)` 조건을 일시적으로 `false`로 바꿔 저장 → 재실행 → MCQ/OX 관련 테스트가 실패하는지 확인 → 복원 → 재확인.

- [ ] **Step 10: 전체 스위트 확인 + 커밋**

```bash
cd web && npx vitest run
git add web/lib/db/attempts.ts web/lib/db/attempts.test.ts web/app/api/attempts/me/route.test.ts web/lib/solve/attemptHistoryService.ts web/lib/solve/attemptHistoryService.test.ts
git commit -m "[ADD] 풀이 이력에 배치로 정답 요약을 붙이는 서비스 추가"
```

---

### Task 5: 풀이 이력 API·화면에 정답 노출

**Files:**
- Modify: `web/app/api/attempts/me/route.ts`(전체 교체), `web/app/api/attempts/me/route.test.ts`(H5 키 개수 갱신 — 9개로), `web/screens/solve/AttemptHistoryPage.jsx:98-101`(PC 테이블 셀), `:113-121`(모바일 카드)

**Interfaces:**
- Consumes: `findAttemptHistoryWithAnswers`(Task 4)
- Produces: 없음(화면 종단)

- [ ] **Step 1: 실패하는 테스트를 쓴다**

이 라우트가 `findAttemptsByUserId` 대신 `findAttemptHistoryWithAnswers`를 쓰게 되면 응답에 `correctAnswerSummary`가 9번째 키로 추가된다. Task 4에서 8개로 갱신해 둔 `web/app/api/attempts/me/route.test.ts:89-96`(H5)을 다음으로 교체:

```typescript
  it("H5: 응답 필드 키 집합이 정확히 9개다 — correctAnswerSummary 추가 이후", async () => {
    await db.insert(attempts).values([{ userId: meId, problemId, submittedAnswer: "x", isCorrect: false }]);
    asMe();
    const { GET } = await import("./route");
    const body = await (await GET()).json();
    expect(Object.keys(body.data[0]).sort()).toEqual(
      ["correct", "correctAnswerSummary", "departmentName", "problemContent", "problemId", "problemType", "sourceNumber", "submittedAnswer", "submittedAt"]);
    // OX 문제(beforeEach 의 seedProblem 기본값)의 정답 보기는 심지 않았으므로 빈 문자열이다 —
    // attemptHistoryService.test.ts 가 이미 실제 값 매핑을 자세히 검증하므로, 여기서는
    // "라우트가 필드를 실어 나른다"는 배선만 확인한다.
    expect(body.data[0].correctAnswerSummary).toBe("");
  });
```

- [ ] **Step 2: 테스트가 실패하는지 확인한다**

Run: `cd web && npx vitest run app/api/attempts/me/route.test.ts`
Expected: FAIL — 실제 키가 8개인데 기대값이 9개다.

- [ ] **Step 3: API 라우트가 새 서비스를 쓰도록 바꾼다**

`web/app/api/attempts/me/route.ts` 전체를 다음으로 교체:

```typescript
import { getDb } from "@/lib/db/client";
import { handleRoute } from "@/lib/http/errors";
import { requireActor } from "@/lib/auth/currentUser";
import { findAttemptHistoryWithAnswers } from "@/lib/solve/attemptHistoryService";

export const runtime = "nodejs";

export async function GET(): Promise<Response> {
  return handleRoute(async () => {
    // AttemptController 에는 @RequireRole 이 없다 — 역할을 넘기지 않으면 인증만 검사한다(정답지 E1).
    const actor = await requireActor();
    // H1: 본인 것만 — actor.userId 로 스코프를 건다.
    return findAttemptHistoryWithAnswers(getDb(), actor.userId);
  });
}
```

- [ ] **Step 4: 테스트가 통과하는지 확인한다**

Run: `cd web && npx vitest run app/api/attempts/me/route.test.ts`
Expected: PASS, 기존 H1·H4·H7·H8·E1·세션 테스트까지 전부 포함해서.

- [ ] **Step 5: PC 테이블 셀에 오답 시 정답을 추가한다**

`web/screens/solve/AttemptHistoryPage.jsx:101`(현재 `<TableCell><ResultText correct={item.correct} /></TableCell>`)을 다음으로 교체:

```jsx
                  <TableCell>
                    <ResultText correct={item.correct} />
                    {!item.correct && item.correctAnswerSummary && (
                      <p className="mt-1 text-body-small text-ink-muted">정답: {item.correctAnswerSummary}</p>
                    )}
                  </TableCell>
```

- [ ] **Step 6: 모바일 카드에도 추가한다**

`web/screens/solve/AttemptHistoryPage.jsx:114-117`(현재 `<div className="mt-2 flex items-center gap-2">...</div>` 블록)을 다음으로 교체:

```jsx
                  <div className="mt-2 flex items-center gap-2">
                    <SourceBadge item={item} />
                    <ResultText correct={item.correct} />
                  </div>
                  {!item.correct && item.correctAnswerSummary && (
                    <p className="mt-1 text-body-small text-ink-muted">정답: {item.correctAnswerSummary}</p>
                  )}
```

- [ ] **Step 7: 로컬 dev 서버로 실측한다**

dev 서버가 이미 떠 있지 않으면 `cd web && npx next dev -p 3200`. Task 3에서 오답 제출한 기록이 있는 계정으로 "내 풀이 이력"에 진입해:
- PC 테이블: "결과" 셀에 정답/오답 아래로 "정답: ..." 문구가 오답 행에만 뜨는지
- 모바일(390px): 카드에도 같은 문구가 뜨는지
- 정답이었던 행에는 문구가 안 뜨는지
- 콘솔 오류·경고 0건

- [ ] **Step 8: 전체 스위트 + 빌드 확인 + 커밋**

```bash
cd web && npx vitest run
cd web && npx next build
```

```bash
git add web/app/api/attempts/me/route.ts web/app/api/attempts/me/route.test.ts web/screens/solve/AttemptHistoryPage.jsx
git commit -m "[ADD] 풀이 이력 화면에 오답 시 정답 표시"
```

---

### Task 6: 정답지·컷오버 문서 갱신 (사용자 승인 후 커밋)

**Files:**
- Modify: `docs/qa/2026-08-21-solve-parity-checklist.md`(G14 행)
- Modify: `docs/qa/2026-08-24-stats-e2e-verification.md`(§3 컷오버 통합 목록, C섹션)

**Interfaces:**
- Consumes: Task 1~5에서 실제로 반영된 동작(문서는 실측을 따라간다, 그 반대가 아니다)
- Produces: 없음(문서 종단)

- [ ] **Step 1: 정답지 G14 행을 "승인된 이탈"로 갱신한다**

`docs/qa/2026-08-21-solve-parity-checklist.md`의 G14 행(현재 `| G14 | 응답 | {correct, explanation, blankResults}. FILL_BLANK 가 아니면 blankResults 는 null | AttemptResult.java, SolveServiceImpl.java:201 |`)을 찾아 아래로 교체:

```markdown
| G14 | 응답 | ~~{correct, explanation, blankResults}~~ → **2026-08-28 부로 4키로 확장**: `{correct, explanation, blankResults, correctAnswerSummary}`. **승인된 이탈** — 오답 시 정답을 공개하는 기능은 원본 Spring 시스템에 없었다. FILL_BLANK 는 `correctAnswerSummary`가 null(빈칸별 정답은 `blankResults[i].correctAnswer`가 이미 담당), 나머지 4개 유형은 정답 텍스트를 `, `로 나열한다. 근거: `docs/superpowers/plans/2026-08-28-solve-reveal-correct-answer.md` | `AttemptResult.java`, `SolveServiceImpl.java:201`(원본), `web/lib/solve/attemptService.ts:12-17`(현재) |
```

- [ ] **Step 2: 컷오버 통합 목록 C섹션에 항목을 추가한다**

`docs/qa/2026-08-24-stats-e2e-verification.md`의 §3 "C. 승인된 이탈" 표 마지막 행(C21) 뒤에 새 행을 추가한다:

```markdown
| C22 | **오답 시 정답 공개(전 유형)** — 원본엔 FILL_BLANK 만 있던 기능을 5개 유형 전부로 확장 | 신규(2026-08-28) | 원본 Spring 은 FILL_BLANK 만 정답을 공개했다(정답지 G14, 원래 계약). 사용자 요청으로 나머지 4개 유형(MCQ_SINGLE·MCQ_MULTI·OX·SHORT_ANSWER)도 채점 직후 화면과 풀이 이력 양쪽에서 정답을 보여주도록 의도적으로 확장했다. 근거: `docs/superpowers/plans/2026-08-28-solve-reveal-correct-answer.md` |
```

표 헤더 자체는 `| # | 항목 | 출처 |` 3컬럼으로 선언돼 있지만(`docs/qa/2026-08-24-stats-e2e-verification.md:199`), 가장 최근에 추가된 C18~C21 네 행은 헤더를 갱신하지 않은 채 4번째 "설명" 셀을 그대로 덧붙여 왔다(기존 문서의 사전 존재하는 불일치이며 이번 작업이 만드는 문제가 아니다). C22도 그 최신 관행을 그대로 따른다 — 헤더는 손대지 않고 위 4셀 행만 C21 다음 줄에 추가한다.

- [ ] **Step 3: 최종 전체 검증**

```bash
cd web && npx vitest run
cd web && npx next build
```

Expected: 둘 다 성공. 테스트 수는 대략 Task 1(+6)·Task 2(+3, 기존 "Step 2-1" 1개는 자리 유지)·Task 4(DAO +1, 서비스 신규 +5, 기존 H5 두 개는 자리 유지)·Task 5(기존 H5 자리 유지)만큼 이전보다 늘어 있어야 한다 — 정확한 숫자 대조 대신 무회귀(전부 초록)로 판단한다.

- [ ] **Step 4: 커밋 (사용자 승인 후)**

`docs/**` 변경이므로 커밋 전에 diff를 사용자에게 보여주고 명시적 승인을 받는다.

```bash
git add docs/qa/2026-08-21-solve-parity-checklist.md docs/qa/2026-08-24-stats-e2e-verification.md
git commit -m "[DOCS] 오답 시 정답 공개 기능을 정답지·컷오버 목록에 반영"
```

---

## 이 계획이 다루지 않는 것 (일부러 뺀 것)

- **관리자 화면(문제 관리)**: 관리자는 이미 문제 등록/수정 화면에서 정답을 직접 볼 수 있어 영향 없음.
- **정답 재열람 제한**: 컷오버 목록 D6(상세를 반복 호출하면 제출 없이 정답을 모을 수 있다)와는 다른 이슈다 — 이번 기능은 "제출 이후"에만 정답을 보여주므로 그 이탈을 더 악화시키지 않는다. 손대지 않는다.
- **부분 점수 표시(MCQ_MULTI 몇 개 맞았는지 등)**: 채점 자체는 all-or-nothing(정답지 G12와 동일 원칙)이고 이번 요청 범위 밖이다.
