# 제작자 피드백 전달 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 사용자가 남긴 말을 우리 DB 에 저장한 뒤 제작자의 업무 보드로 전달한다.

**Architecture:** 브라우저는 비밀을 모른다. 화면 → `POST /api/feedback`(비밀이 사는 유일한 곳, 저장 후 전달) → 받는 쪽 인바운드. 저장이 먼저라 전달이 실패해도 말이 남고, 총괄 관리자가 다시 밀 수 있다.

**Tech Stack:** Next.js 15 App Router · Drizzle ORM · Postgres · Vitest · Tailwind v4

**Spec:** `docs/superpowers/specs/2026-09-04-feedback-relay-design.md`

## Global Constraints

- 외부 계약: `body` 는 앞뒤 공백 제거 후 1~2000자, **첫 줄이 카드 제목이 되고 60자에서 잘린다**. `from` 은 40자에서 잘린다.
- 사용자 입력 상한은 **1000자**(머리말 예산 확보). 조립 후 2000자를 서버가 다시 확인한다.
- 받는 쪽 응답: 201 성공 / 400 본문 오류 / 401 비밀 오류 / 429 시간당 100건 초과 / 500 상대 설정 누락.
- **한도는 서비스 전체가 공유한다.** 다시 보내기는 한 번에 최대 20건, 429 를 만나면 즉시 중단.
- 외부 호출은 **5초에서 끊는다**.
- 환경변수 이름은 `HARRY_INBOUND_URL` · `HARRY_INBOUND_SECRET`. **`NEXT_PUBLIC_` 을 절대 붙이지 않는다.**
- 받는 쪽 오류 문구를 사용자에게 그대로 보이지 않는다. 원문은 `console.error` 로만.
- 실패 목록 조건은 `status <> 'SENT'` 다(`FAILED` 만 보면 `PENDING` 으로 남은 것을 못 찾는다).
- 진입점 4개가 **모달 하나와 API 하나를 공유**한다.
- 이 저장소에는 서버 액션이 없다. `app/api/*/route.ts` + `apiClient/*.js` 관용구를 따른다.
- 테스트 DB 는 `probank_test` 다(`test/db.ts`). 앱의 `DATABASE_URL` 을 쓰지 않는다.

---

## File Structure

| 파일 | 책임 |
|---|---|
| `lib/db/schema.ts` (수정) | `feedbacks` 테이블 정의 |
| `lib/feedback/compose.ts` (생성) | 본문·보낸사람 조립. **순수 함수** |
| `lib/feedback/validate.ts` (생성) | 입력 검증. **순수 함수** |
| `lib/feedback/relay.ts` (생성) | 외부 호출. 비밀을 읽는 유일한 곳 |
| `lib/db/feedbacks.ts` (생성) | DAO |
| `lib/feedback/feedbackService.ts` (생성) | 저장 → 전달 → 결과 기록 |
| `app/api/feedback/route.ts` (생성) | 제출 |
| `app/api/admin/feedbacks/route.ts` (생성) | 실패 목록(총괄 전용) |
| `app/api/admin/feedbacks/retry/route.ts` (생성) | 다시 보내기(총괄 전용) |
| `apiClient/feedback.js` (생성) | 화면용 호출 |
| `components/feedback/FeedbackModal.jsx` (생성) | 공통 모달 |
| `components/solve/ProblemSolveCard.jsx` (수정) | 문제별 신고 버튼 |
| `screens/solve/SolveShell.jsx` (수정) | 바닥 링크 |
| `screens/solve/SolveHomePage.jsx` (수정) | 홈 카드 |
| `screens/admin/FeedbackPage.jsx` (생성) | 관리자 화면 |
| `app/(protected)/admin/feedback/page.tsx` (생성) | 관리자 라우트 |
| `utils/adminNav.js` (수정) | 사이드바 항목 |

---

## Task 1: `feedbacks` 테이블

**Files:**
- Modify: `lib/db/schema.ts` (파일 끝에 추가)
- Test: `lib/db/feedbacksSchema.test.ts`

**Interfaces:**
- Produces: `feedbacks` 테이블. 컬럼 `id, userId, problemId, sourcePath, body, status, failReason, taskId, attemptCount, lastTriedAt, createdAt`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`lib/db/feedbacksSchema.test.ts`:

```ts
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { migrateTestDb, testDb, truncateAll } from "../../test/db";
import { departments, feedbacks, problems, users } from "./schema";

const db = testDb();
let userId = 0;
let problemId = 0;

beforeAll(async () => { await migrateTestDb(); });
beforeEach(async () => {
  await truncateAll();
  const [dept] = await db.insert(departments)
    .values({ name: "가팀", code: "A", status: "ACTIVE" }).returning({ id: departments.id });
  const [u] = await db.insert(users).values({
    employeeNo: "u1", name: "직원", email: "u1@x.local", passwordHash: "h",
    departmentId: dept.id, role: "EMPLOYEE",
  }).returning({ id: users.id });
  userId = u.id;
  const [p] = await db.insert(problems).values({
    type: "SHORT_ANSWER", content: "본문", departmentId: dept.id, createdBy: userId,
  }).returning({ id: problems.id });
  problemId = p.id;
});

describe("feedbacks 테이블", () => {
  it("기본값은 PENDING 이고 시도 횟수는 0 이다", async () => {
    const [row] = await db.insert(feedbacks)
      .values({ userId, body: "의견입니다" }).returning();
    expect(row.status).toBe("PENDING");
    expect(row.attemptCount).toBe(0);
    expect(row.problemId).toBeNull();
    expect(row.taskId).toBeNull();
  });

  it("문제를 지우면 피드백은 남고 problem_id 만 비워진다", async () => {
    await db.insert(feedbacks).values({ userId, problemId, body: "이 문제가 이상합니다" });
    await db.delete(problems);
    const rows = await db.select().from(feedbacks);
    expect(rows).toHaveLength(1);
    expect(rows[0].problemId).toBeNull();
  });

  it("정해진 status 만 들어간다", async () => {
    await expect(
      db.insert(feedbacks).values({ userId, body: "x", status: "DONE" }),
    ).rejects.toThrow();
  });

  it("정해진 fail_reason 만 들어간다", async () => {
    await expect(
      db.insert(feedbacks).values({ userId, body: "x", status: "FAILED", failReason: "oops" }),
    ).rejects.toThrow();
  });
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `cd web && node node_modules/vitest/vitest.mjs run lib/db/feedbacksSchema.test.ts`
Expected: FAIL — `feedbacks` export 가 없다

- [ ] **Step 3: 스키마를 더한다**

`lib/db/schema.ts` 끝에 추가:

```ts
/**
 * 제작자에게 보낸 피드백. **먼저 저장하고 그다음 전달한다** — 받는 쪽이 죽어 있어도
 * 말이 남고 나중에 다시 밀 수 있다.
 *
 * 사용자 원문만 담고 조립본(태그·문제 정보가 붙은 것)은 담지 않는다. 다시 보낼 때
 * 그 시점 규칙으로 다시 조립하는 편이 낫고, 같은 사실을 두 벌 두면 한쪽만 고쳐진다.
 *
 * problem_id 는 ON DELETE SET NULL 이다. 문제가 지워졌다고 그 문제에 대한 의견까지
 * 지울 이유가 없다 — 오히려 왜 지웠는지 아는 단서다.
 */
export const feedbacks = pgTable("feedbacks", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  userId: bigint("user_id", { mode: "number" }).notNull().references(() => users.id),
  problemId: bigint("problem_id", { mode: "number" }).references(() => problems.id, { onDelete: "set null" }),
  sourcePath: varchar("source_path", { length: 200 }),
  body: text("body").notNull(),
  status: varchar("status", { length: 20 }).notNull().default("PENDING"),
  failReason: varchar("fail_reason", { length: 20 }),
  taskId: varchar("task_id", { length: 100 }),
  attemptCount: integer("attempt_count").notNull().default(0),
  lastTriedAt: timestamp("last_tried_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => ({
  statusCheck: check("feedbacks_status_check", sql`${t.status} IN ('PENDING', 'SENT', 'FAILED')`),
  failReasonCheck: check("feedbacks_fail_reason_check",
    sql`${t.failReason} IS NULL OR ${t.failReason} IN ('config', 'invalid', 'busy', 'down')`),
  // 실패 목록은 status <> 'SENT' 로 잡는다. 그 조회가 이 인덱스를 쓴다.
  statusCreated: index("feedbacks_status_created_idx").on(t.status, t.createdAt),
}));
```

`index` 가 아직 import 되어 있지 않으면 drizzle-orm/pg-core import 목록에 더한다.

- [ ] **Step 4: 마이그레이션을 만든다**

Run: `cd web && node node_modules/drizzle-kit/bin.cjs generate`
생성된 `drizzle/0002_*.sql` 을 열어 **`ON DELETE set null` 과 두 CHECK 제약이 실제로 들어갔는지 눈으로 확인한다.** 없으면 멈추고 보고한다(임의로 SQL 을 손대지 않는다).

- [ ] **Step 5: 테스트를 통과시킨다**

Run: `cd web && node node_modules/vitest/vitest.mjs run lib/db/feedbacksSchema.test.ts`
Expected: PASS (4개)

- [ ] **Step 6: `truncateAll` 목록에 `feedbacks` 를 더한다**

`test/db.ts` 의 `TRUNCATE TABLE` 목록 맨 앞에 `feedbacks,` 를 넣는다.

지금도 우연히 비워지기는 한다 — `feedbacks.user_id → users.id` FK 가 있어
`TRUNCATE users ... CASCADE` 가 함께 지운다. 그러나 **그 FK 가 사라지는 날 조용히
안 지워지기 시작한다.** 목록은 의도를 적는 자리이므로 이름을 남긴다.

- [ ] **Step 7: 커밋**

```bash
git add web/lib/db/schema.ts web/lib/db/feedbacksSchema.test.ts web/drizzle web/test/db.ts
git commit -m "[ADD] 피드백 테이블"
```

---

## Task 2: 검증과 조립 (순수 함수)

**Files:**
- Create: `lib/feedback/validate.ts`, `lib/feedback/compose.ts`
- Test: `lib/feedback/validate.test.ts`, `lib/feedback/compose.test.ts`

**Interfaces:**
- Produces:
  - `FEEDBACK_MAX_INPUT = 1000`, `FEEDBACK_MAX_BODY = 2000`, `FROM_MAX = 40`
  - `validateFeedbackInput(input: { body: unknown; sourcePath?: unknown }): { body: string; sourcePath: string | null }` — 어기면 `BizError`
  - `composeFrom(name: string, employeeNo: string): string`
  - `composeBody(args: { body: string; sourcePath: string | null; problem: { id: number; type: string; sourceNumber: number | null; departmentName: string } | null }): string`

- [ ] **Step 1: 검증 테스트를 쓴다**

`lib/feedback/validate.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { validateFeedbackInput, FEEDBACK_MAX_INPUT } from "./validate";

describe("validateFeedbackInput", () => {
  it("앞뒤 공백을 뗀다", () => {
    expect(validateFeedbackInput({ body: "  의견  " }).body).toBe("의견");
  });

  it("빈 글은 거절한다", () => {
    expect(() => validateFeedbackInput({ body: "   " })).toThrow("내용을 적어주세요.");
    expect(() => validateFeedbackInput({ body: "" })).toThrow("내용을 적어주세요.");
  });

  it("문자열이 아니면 거절한다", () => {
    expect(() => validateFeedbackInput({ body: 123 })).toThrow("내용을 적어주세요.");
  });

  it("상한을 넘으면 거절한다", () => {
    const long = "가".repeat(FEEDBACK_MAX_INPUT + 1);
    expect(() => validateFeedbackInput({ body: long })).toThrow(`${FEEDBACK_MAX_INPUT}자까지`);
  });

  it("상한과 같으면 통과한다 — 경계", () => {
    const exact = "가".repeat(FEEDBACK_MAX_INPUT);
    expect(validateFeedbackInput({ body: exact }).body).toHaveLength(FEEDBACK_MAX_INPUT);
  });

  /** 외부 URL 이 섞여 들어오면 보드에 남의 주소가 실린다. 우리 화면 경로만 받는다. */
  it("경로가 / 로 시작하지 않으면 버린다", () => {
    expect(validateFeedbackInput({ body: "x", sourcePath: "https://evil.example" }).sourcePath).toBeNull();
    expect(validateFeedbackInput({ body: "x", sourcePath: "solve" }).sourcePath).toBeNull();
    expect(validateFeedbackInput({ body: "x", sourcePath: 5 }).sourcePath).toBeNull();
  });

  it("경로는 200자에서 자른다", () => {
    const long = "/" + "a".repeat(300);
    expect(validateFeedbackInput({ body: "x", sourcePath: long }).sourcePath).toHaveLength(200);
  });
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `cd web && node node_modules/vitest/vitest.mjs run lib/feedback/validate.test.ts`
Expected: FAIL — 모듈 없음

- [ ] **Step 3: 검증을 구현한다**

`lib/feedback/validate.ts`:

```ts
import { BizError } from "../http/errors";
import { ErrorCode } from "../http/errorCode";

/** 계약 상한은 2000자지만, 우리가 붙이는 머리말이 예산을 먹으므로 입력은 1000자로 막는다. */
export const FEEDBACK_MAX_INPUT = 1000;
export const FEEDBACK_MAX_BODY = 2000;
export const FROM_MAX = 40;
const PATH_MAX = 200;

export function validateFeedbackInput(input: { body: unknown; sourcePath?: unknown }): {
  body: string;
  sourcePath: string | null;
} {
  const body = typeof input.body === "string" ? input.body.trim() : "";
  if (body === "") throw new BizError(ErrorCode.INPUT_VALUE_INVALID, "내용을 적어주세요.");
  if (body.length > FEEDBACK_MAX_INPUT) {
    throw new BizError(ErrorCode.INPUT_VALUE_INVALID, `${FEEDBACK_MAX_INPUT}자까지 쓸 수 있습니다.`);
  }
  // 우리 화면 경로만 받는다 — 외부 URL 이 섞이면 보드에 남의 주소가 실린다.
  const raw = typeof input.sourcePath === "string" ? input.sourcePath : "";
  const sourcePath = raw.startsWith("/") ? raw.slice(0, PATH_MAX) : null;
  return { body, sourcePath };
}
```

`BizError` 와 `ErrorCode` 의 실제 import 경로·시그니처는 `lib/solve/grading.ts` 상단을 그대로 따른다.

- [ ] **Step 4: 통과를 확인한다**

Run: `cd web && node node_modules/vitest/vitest.mjs run lib/feedback/validate.test.ts`
Expected: PASS (7개)

- [ ] **Step 5: 조립 테스트를 쓴다**

`lib/feedback/compose.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { composeBody, composeFrom, FEEDBACK_MAX_BODY, FROM_MAX } from "./compose";

const problem = { id: 260, type: "SHORT_ANSWER", sourceNumber: 26, departmentName: "자금팀" };

describe("composeFrom", () => {
  it("이름과 사번을 함께 낸다", () => {
    expect(composeFrom("기획팀직원", "plan_emp")).toBe("기획팀직원(plan_emp)");
  });

  /** 사번이 잘리면 되묻는 길이 끊긴다. 이름 쪽을 줄인다. */
  it("40자를 넘으면 사번을 살리고 이름을 자른다", () => {
    const out = composeFrom("가".repeat(60), "emp_00001");
    expect(out.length).toBeLessThanOrEqual(FROM_MAX);
    expect(out).toContain("(emp_00001)");
  });
});

describe("composeBody", () => {
  it("문제별 신고는 첫 줄에 [부서 N번] 과 사용자 첫 줄을 함께 둔다", () => {
    const out = composeBody({ body: "괄호 안에 답이 보입니다", sourcePath: "/solve/random/play", problem });
    const first = out.split("\n")[0];
    expect(first).toBe("[자금팀 26번] 괄호 안에 답이 보입니다");
    // 제목은 60자에서 잘린다 — 태그만 남고 뜻이 사라지면 보드에서 구분이 안 된다.
    expect(first.length).toBeLessThanOrEqual(60);
    expect(out).toContain("문제 260");
    expect(out).toContain("/solve/random/play");
  });

  it("문제가 없고 경로가 /admin 이면 [관리자] 다", () => {
    const out = composeBody({ body: "필터가 초기화됩니다", sourcePath: "/admin/stats", problem: null });
    expect(out.split("\n")[0]).toBe("[관리자] 필터가 초기화됩니다");
    expect(out).not.toContain("문제 ");
  });

  it("그 밖에는 [학습] 이다", () => {
    expect(composeBody({ body: "엔터가 안 됩니다", sourcePath: "/solve", problem: null })
      .split("\n")[0]).toBe("[학습] 엔터가 안 됩니다");
    expect(composeBody({ body: "엔터가 안 됩니다", sourcePath: null, problem: null })
      .split("\n")[0]).toBe("[학습] 엔터가 안 됩니다");
  });

  it("여러 줄이면 첫 줄만 제목에 쓰고 원문은 전부 남긴다", () => {
    const out = composeBody({ body: "첫 줄\n둘째 줄", sourcePath: null, problem: null });
    expect(out.split("\n")[0]).toBe("[학습] 첫 줄");
    expect(out).toContain("둘째 줄");
  });

  it("조립 후 2000자를 넘지 않는다 — 머리말이 아니라 원문 끝을 자른다", () => {
    const out = composeBody({ body: "가".repeat(1000), sourcePath: "/solve", problem });
    expect(out.length).toBeLessThanOrEqual(FEEDBACK_MAX_BODY);
    expect(out.split("\n")[0]).toContain("[자금팀 26번]");
    expect(out).toContain("문제 260");
  });

  it("번호 없는 문제도 태그를 만든다", () => {
    const out = composeBody({
      body: "이상합니다", sourcePath: null,
      problem: { ...problem, sourceNumber: null },
    });
    expect(out.split("\n")[0]).toBe("[자금팀 번호없음] 이상합니다");
  });

  /**
   * 첫 줄이 길면 제목이 60자에서 잘리는데, 태그까지 잘려 나가면 "[자금팀 26..." 이 되어
   * 보드에서 아무 뜻이 없어진다. 태그는 항상 온전해야 한다.
   */
  it("첫 줄이 길어도 태그는 잘리지 않는다", () => {
    const out = composeBody({ body: "가".repeat(200), sourcePath: null, problem });
    const first = out.split("\n")[0];
    expect(first.length).toBeLessThanOrEqual(60);
    expect(first.startsWith("[자금팀 26번] ")).toBe(true);
  });

  it("첫 줄 뒤에 빈 줄이 있어도 제목은 첫 줄이다", () => {
    const out = composeBody({ body: "제목입니다\n\n본문입니다", sourcePath: null, problem: null });
    expect(out.split("\n")[0]).toBe("[학습] 제목입니다");
    expect(out).toContain("본문입니다");
  });
});
```

- [ ] **Step 6: 실패를 확인한다**

Run: `cd web && node node_modules/vitest/vitest.mjs run lib/feedback/compose.test.ts`
Expected: FAIL — 모듈 없음

- [ ] **Step 7: 조립을 구현한다**

`lib/feedback/compose.ts`:

```ts
import { FEEDBACK_MAX_BODY, FROM_MAX } from "./validate";

export { FEEDBACK_MAX_BODY, FROM_MAX };

const TITLE_MAX = 60;

/**
 * 유형 라벨을 여기 직접 둔다. `utils/problemLabels.js` 를 쓰지 않는 이유가 둘이다.
 *
 * 첫째, `lib/**\/*.ts` 가 `utils/*.js` 를 import 하는 선례가 이 저장소에 없다(2026-09-04
 * 확인). `allowJs` 는 켜져 있지만 타입 없는 모듈이 strict 경계로 들어온다.
 *
 * 둘째, 이 글자는 남의 보드에 나간다. 화면 라벨을 바꾼다고 이미 보낸 카드의 표기 규칙까지
 * 따라 바뀌면 곤란하다 — 두 곳이 같은 값을 쓰되 서로를 끌고 다니지는 않게 한다.
 */
const TYPE_LABEL: Record<string, string> = {
  MCQ_SINGLE: "객관식(단일)",
  MCQ_MULTI: "객관식(복수)",
  OX: "OX",
  SHORT_ANSWER: "주관식",
  FILL_BLANK: "빈칸 채우기",
};

/**
 * 보낸 사람. 이름과 사번만 넣는다 — 이 값은 남의 업무 메모 첫 줄이 되고 여러 명이 본다.
 * 40자를 넘으면 사번을 그대로 두고 이름 쪽을 자른다. 사번이 잘리면 되묻는 길이 끊긴다.
 */
export function composeFrom(name: string, employeeNo: string): string {
  const tail = `(${employeeNo})`;
  const room = FROM_MAX - tail.length;
  return `${name.slice(0, Math.max(room, 0))}${tail}`.slice(0, FROM_MAX);
}

/**
 * 받는 쪽은 **첫 줄을 업무 제목으로 쓰고 60자에서 자른다.** 그 한 줄이 보드에서 이 카드를
 * 알아보는 유일한 단서라, 태그와 사용자 첫 줄을 함께 둔다. 태그만 두면 제목이 전부
 * "[자금팀 26번]" 으로 같아져 구분이 안 된다.
 *
 * 첫 줄이 제목과 메모에 두 번 나오는 것은 의도한 중복이다 — 받는 쪽이 본문 전체를 메모로
 * 남기므로, 원문을 온전히 보존하려면 이 편이 안전하다.
 */
export function composeBody(args: {
  body: string;
  sourcePath: string | null;
  problem: { id: number; type: string; sourceNumber: number | null; departmentName: string } | null;
}): string {
  const { body, sourcePath, problem } = args;
  const tag = problem
    ? `[${problem.departmentName} ${problem.sourceNumber === null ? "번호없음" : `${problem.sourceNumber}번`}]`
    : sourcePath?.startsWith("/admin")
      ? "[관리자]"
      : "[학습]";

  // 태그를 먼저 확보하고 남는 자리에 사용자 첫 줄을 넣는다. 통째로 잘라 버리면
  // "[자금팀 26..." 처럼 태그가 깨져 보드에서 아무 뜻이 없어진다.
  const firstLine = body.split("\n")[0].trim();
  const room = TITLE_MAX - tag.length - 1;
  const title = room > 0 ? `${tag} ${firstLine.slice(0, room)}` : tag.slice(0, TITLE_MAX);

  const context: string[] = [];
  if (problem) {
    const number = problem.sourceNumber === null ? "번호 없음" : `${problem.sourceNumber}번`;
    const label = TYPE_LABEL[problem.type] ?? problem.type;
    context.push(`문제 ${problem.id} · ${label} · ${problem.departmentName} ${number}`);
  }
  if (sourcePath) context.push(`화면: ${sourcePath}`);

  const head = [title, "", ...context, ...(context.length > 0 ? [""] : [])].join("\n");
  // 넘치면 원문 끝을 자른다. 머리말을 자르면 문제 참조가 사라져 카드가 쓸모없어진다.
  return `${head}${body}`.slice(0, FEEDBACK_MAX_BODY);
}
```

- [ ] **Step 8: 통과를 확인한다**

Run: `cd web && node node_modules/vitest/vitest.mjs run lib/feedback/compose.test.ts lib/feedback/validate.test.ts`
Expected: PASS (14개)

- [ ] **Step 9: 커밋**

```bash
git add web/lib/feedback
git commit -m "[ADD] 피드백 검증과 본문 조립"
```

---

## Task 3: 외부 전달 모듈

**Files:**
- Create: `lib/feedback/relay.ts`
- Test: `lib/feedback/relay.test.ts`

**Interfaces:**
- Consumes: 없음
- Produces: `sendFeedback(input: { body: string; from: string }): Promise<RelayResult>`
  - `RelayResult = { ok: true; taskId: string } | { ok: false; reason: "config" | "invalid" | "busy" | "down"; detail: string }`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`lib/feedback/relay.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { sendFeedback } from "./relay";

const OLD = { ...process.env };

beforeEach(() => {
  process.env.HARRY_INBOUND_URL = "https://harry.example/api/inbound/feedback";
  process.env.HARRY_INBOUND_SECRET = "s3cret";
});
afterEach(() => {
  process.env = { ...OLD };
  vi.restoreAllMocks();
});

function mockFetch(status: number, json: unknown) {
  return vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(JSON.stringify(json), { status, headers: { "content-type": "application/json" } }),
  );
}

describe("sendFeedback", () => {
  it("설정이 없으면 보내는 척하지 않는다", async () => {
    delete process.env.HARRY_INBOUND_SECRET;
    const spy = vi.spyOn(globalThis, "fetch");
    const r = await sendFeedback({ body: "x", from: "a(b)" });
    expect(r).toEqual({ ok: false, reason: "config", detail: expect.any(String) });
    expect(spy).not.toHaveBeenCalled();
  });

  it("201 이면 taskId 를 낸다", async () => {
    mockFetch(201, { ok: true, taskId: "T-1" });
    await expect(sendFeedback({ body: "x", from: "a(b)" })).resolves.toEqual({ ok: true, taskId: "T-1" });
  });

  it("Bearer 비밀과 body·from 을 그대로 싣는다", async () => {
    const spy = mockFetch(201, { taskId: "T-2" });
    await sendFeedback({ body: "본문", from: "직원(u1)" });
    const [url, init] = spy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://harry.example/api/inbound/feedback");
    expect((init.headers as Record<string, string>).authorization).toBe("Bearer s3cret");
    expect(JSON.parse(String(init.body))).toEqual({ body: "본문", from: "직원(u1)" });
  });

  it("400·429·그 밖을 서로 다른 이유로 가른다", async () => {
    mockFetch(400, { error: "bad" });
    expect((await sendFeedback({ body: "x", from: "a" })as { reason: string }).reason).toBe("invalid");
    vi.restoreAllMocks();
    mockFetch(429, { error: "limit" });
    expect((await sendFeedback({ body: "x", from: "a" })as { reason: string }).reason).toBe("busy");
    vi.restoreAllMocks();
    mockFetch(401, { error: "nope" });
    expect((await sendFeedback({ body: "x", from: "a" })as { reason: string }).reason).toBe("down");
  });

  it("네트워크가 죽으면 down 이다", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("ECONNREFUSED"));
    expect((await sendFeedback({ body: "x", from: "a" })as { reason: string }).reason).toBe("down");
  });

  /** 기본 fetch 는 무한정 기다린다 — 남의 장애를 내 장애로 옮기지 않는다. */
  it("AbortSignal 을 함께 보낸다", async () => {
    const spy = mockFetch(201, { taskId: "T-3" });
    await sendFeedback({ body: "x", from: "a" });
    expect((spy.mock.calls[0][1] as RequestInit).signal).toBeDefined();
  });
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `cd web && node node_modules/vitest/vitest.mjs run lib/feedback/relay.test.ts`
Expected: FAIL — 모듈 없음

- [ ] **Step 3: 구현한다**

먼저 `server-only` 를 넣는다: `cd web && pnpm add server-only`

`lib/feedback/relay.ts`:

```ts
import "server-only";

/**
 * 비밀을 읽는 유일한 곳. `server-only` 는 클라이언트 컴포넌트가 실수로 이 파일을 import
 * 하면 **빌드를 깨뜨려** 알려 준다 — 사람의 주의력에 기대지 않는다.
 *
 * 5초에서 끊는다. 기본 fetch 는 무한정 기다리는데, 받는 쪽이 느리면 우리 요청 하나가
 * 통째로 물린다.
 */
const TIMEOUT_MS = 5000;

export type RelayResult =
  | { ok: true; taskId: string }
  | { ok: false; reason: "config" | "invalid" | "busy" | "down"; detail: string };

export async function sendFeedback(input: { body: string; from: string }): Promise<RelayResult> {
  const url = process.env.HARRY_INBOUND_URL;
  const secret = process.env.HARRY_INBOUND_SECRET;
  // 설정이 없으면 보내는 척하지 않는다 — 조용히 성공으로 두면 말이 사라진 것을 아무도 모른다.
  if (!url || !secret) return { ok: false, reason: "config", detail: "URL/SECRET 없음" };

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${secret}` },
      body: JSON.stringify({ body: input.body, from: input.from }),
      signal: ctrl.signal,
      cache: "no-store",
    });
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (res.status === 201) return { ok: true, taskId: String(data.taskId ?? "") };
    if (res.status === 400) return { ok: false, reason: "invalid", detail: String(data.error ?? "") };
    if (res.status === 429) return { ok: false, reason: "busy", detail: String(data.error ?? "") };
    return { ok: false, reason: "down", detail: `${res.status} ${data.error ?? ""}` };
  } catch (e) {
    // 시간초과 · DNS · 네트워크 — 부르는 쪽에서는 전부 "지금 안 된다" 하나다.
    return { ok: false, reason: "down", detail: e instanceof Error ? e.message : "" };
  } finally {
    clearTimeout(timer);
  }
}
```

- [ ] **Step 4: 통과를 확인한다**

Run: `cd web && node node_modules/vitest/vitest.mjs run lib/feedback/relay.test.ts`
Expected: PASS (6개)

- [ ] **Step 5: `.env.example` 을 만든다**

`web/.gitignore:6-9` 가 *"단, `.env.example` 을 두게 되면 그건 커밋한다 — 실제 값이 아니라
채워야 할 항목 목록이라"* 고 적어 두었는데 **파일이 실제로 없다**(2026-09-04 확인).
환경변수가 둘 늘어나는 지금이 만들 시점이다. 없으면 다음 사람이 이 값이 필요한 줄 모르고 배포한다.

`web/.env.example` — **값은 비워 둔다.**

```
DATABASE_URL=
SESSION_JWT_SECRET=

# 제작자 피드백 전달. 받는 쪽 INBOUND_SECRET 과 같은 값이어야 한다.
# NEXT_PUBLIC_ 을 절대 붙이지 않는다 — 붙는 순간 번들에 실려 나간다.
HARRY_INBOUND_URL=
HARRY_INBOUND_SECRET=
```

기존 `.env` 에 무엇이 들어 있는지 보고 빠진 항목 이름을 함께 채운다(**값은 옮기지 않는다**).

- [ ] **Step 6: 커밋**

```bash
git add web/lib/feedback/relay.ts web/lib/feedback/relay.test.ts web/package.json web/pnpm-lock.yaml web/.env.example
git commit -m "[ADD] 피드백 외부 전달 모듈"
```

---

## Task 4: DAO 와 서비스

**Files:**
- Create: `lib/db/feedbacks.ts`, `lib/feedback/feedbackService.ts`
- Test: `lib/feedback/feedbackService.test.ts`

**Interfaces:**
- Consumes: `validateFeedbackInput`, `composeBody`, `composeFrom`, `sendFeedback`
- Produces:
  - `insertFeedback(db, row): Promise<{ id: number }>`
  - `markSent(db, id, taskId): Promise<void>`
  - `markFailed(db, id, reason): Promise<void>`
  - `findUnsent(db, limit): Promise<FeedbackRow[]>`
  - `submitFeedback(db, actor, input): Promise<{ ok: boolean; message: string }>`
  - `retryUnsent(db, limit): Promise<{ tried: number; sent: number; stoppedByLimit: boolean }>`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`lib/feedback/feedbackService.test.ts` — `lib/db/attempts.test.ts` 의 셋업 관용구를 따른다(`migrateTestDb` / `truncateAll` / `testDb`). 전달 모듈은 가짜로 둔다:

```ts
import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import { migrateTestDb, testDb, truncateAll } from "../../test/db";
import { departments, feedbacks, problems, users } from "../db/schema";

const relay = vi.hoisted(() => ({ send: vi.fn() }));
vi.mock("./relay", () => ({ sendFeedback: relay.send }));

const { submitFeedback, retryUnsent } = await import("./feedbackService");

const db = testDb();
let actor = { userId: 0, employeeNo: "u1", name: "직원", role: "EMPLOYEE" as const, departmentId: 0, mustChangePassword: false };
let problemId = 0;

beforeAll(async () => { await migrateTestDb(); });
beforeEach(async () => {
  await truncateAll();
  relay.send.mockReset();
  const [d] = await db.insert(departments).values({ name: "자금팀", code: "FIN", status: "ACTIVE" }).returning();
  const [u] = await db.insert(users).values({
    employeeNo: "u1", name: "직원", email: "u1@x.local", passwordHash: "h",
    departmentId: d.id, role: "EMPLOYEE",
  }).returning();
  actor = { ...actor, userId: u.id, departmentId: d.id };
  const [p] = await db.insert(problems).values({
    type: "SHORT_ANSWER", content: "본문", departmentId: d.id, createdBy: u.id, sourceNumber: 26,
  }).returning();
  problemId = p.id;
});

describe("submitFeedback", () => {
  it("성공하면 SENT 와 taskId 를 남긴다", async () => {
    relay.send.mockResolvedValue({ ok: true, taskId: "T-9" });
    const r = await submitFeedback(db, actor, { body: "의견입니다", sourcePath: "/solve" });
    expect(r.ok).toBe(true);
    const [row] = await db.select().from(feedbacks);
    expect(row.status).toBe("SENT");
    expect(row.taskId).toBe("T-9");
    expect(row.attemptCount).toBe(1);
  });

  /** 저장이 먼저다. 전달이 실패해도 말이 남아야 다시 밀 수 있다. */
  it("전달이 실패해도 원문이 남는다", async () => {
    relay.send.mockResolvedValue({ ok: false, reason: "down", detail: "timeout" });
    const r = await submitFeedback(db, actor, { body: "사라지면 안 되는 말", sourcePath: null });
    expect(r.ok).toBe(false);
    const [row] = await db.select().from(feedbacks);
    expect(row.status).toBe("FAILED");
    expect(row.failReason).toBe("down");
    expect(row.body).toBe("사라지면 안 되는 말");
  });

  it("429 는 다른 문구를 낸다", async () => {
    relay.send.mockResolvedValue({ ok: false, reason: "busy", detail: "" });
    const r = await submitFeedback(db, actor, { body: "x", sourcePath: null });
    expect(r.message).toContain("몰려");
  });

  it("받는 쪽 detail 을 사용자 문구에 싣지 않는다", async () => {
    relay.send.mockResolvedValue({ ok: false, reason: "config", detail: "INBOUND_SECRET 없음" });
    const r = await submitFeedback(db, actor, { body: "x", sourcePath: null });
    expect(r.message).not.toContain("INBOUND_SECRET");
  });

  it("문제 정보는 서버가 DB 에서 찾아 붙인다", async () => {
    relay.send.mockResolvedValue({ ok: true, taskId: "T" });
    await submitFeedback(db, actor, { body: "이상합니다", sourcePath: "/solve", problemId });
    const sent = relay.send.mock.calls[0][0] as { body: string; from: string };
    expect(sent.body).toContain("[자금팀 26번]");
    expect(sent.from).toBe("직원(u1)");
  });

  it("없는 problemId 는 일반 의견으로 처리한다 — 말을 버리지 않는다", async () => {
    relay.send.mockResolvedValue({ ok: true, taskId: "T" });
    const r = await submitFeedback(db, actor, { body: "의견", sourcePath: "/solve", problemId: 999999 });
    expect(r.ok).toBe(true);
    const [row] = await db.select().from(feedbacks);
    expect(row.problemId).toBeNull();
  });

  it("빈 글은 저장도 전달도 하지 않는다", async () => {
    await expect(submitFeedback(db, actor, { body: "   ", sourcePath: null })).rejects.toThrow();
    expect(await db.select().from(feedbacks)).toHaveLength(0);
    expect(relay.send).not.toHaveBeenCalled();
  });
});

describe("retryUnsent", () => {
  /** PENDING 으로 남은 것도 잡아야 한다 — FAILED 만 보면 영영 못 찾는다. */
  it("SENT 가 아닌 것을 모두 잡는다", async () => {
    await db.insert(feedbacks).values([
      { userId: actor.userId, body: "실패한 것", status: "FAILED", failReason: "down" },
      { userId: actor.userId, body: "멈춘 것", status: "PENDING" },
      { userId: actor.userId, body: "보낸 것", status: "SENT", taskId: "T" },
    ]);
    relay.send.mockResolvedValue({ ok: true, taskId: "T-new" });
    const r = await retryUnsent(db, 20);
    expect(r.tried).toBe(2);
    expect(r.sent).toBe(2);
  });

  /** 한도는 서비스 전체가 공유한다. 한꺼번에 밀면 그 시간대의 정상 제출이 막힌다. */
  it("429 를 만나면 즉시 멈춘다", async () => {
    await db.insert(feedbacks).values([
      { userId: actor.userId, body: "1", status: "FAILED", failReason: "down" },
      { userId: actor.userId, body: "2", status: "FAILED", failReason: "down" },
      { userId: actor.userId, body: "3", status: "FAILED", failReason: "down" },
    ]);
    relay.send
      .mockResolvedValueOnce({ ok: true, taskId: "T1" })
      .mockResolvedValueOnce({ ok: false, reason: "busy", detail: "" });
    const r = await retryUnsent(db, 20);
    expect(r.tried).toBe(2);
    expect(r.sent).toBe(1);
    expect(r.stoppedByLimit).toBe(true);
    expect(relay.send).toHaveBeenCalledTimes(2);
  });

  it("한 번에 limit 건까지만 시도한다", async () => {
    await db.insert(feedbacks).values(
      Array.from({ length: 5 }, (_, i) => ({ userId: actor.userId, body: `${i}`, status: "FAILED" as const, failReason: "down" as const })),
    );
    relay.send.mockResolvedValue({ ok: true, taskId: "T" });
    const r = await retryUnsent(db, 2);
    expect(r.tried).toBe(2);
  });
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `cd web && node node_modules/vitest/vitest.mjs run lib/feedback/feedbackService.test.ts`
Expected: FAIL — 모듈 없음

- [ ] **Step 3: DAO 를 만든다**

`lib/db/feedbacks.ts`:

```ts
import { and, asc, eq, ne, sql } from "drizzle-orm";
import type { DbConn } from "./client";
import { feedbacks } from "./schema";

export type FeedbackRow = typeof feedbacks.$inferSelect;

export async function insertFeedback(
  db: DbConn,
  row: { userId: number; problemId: number | null; sourcePath: string | null; body: string },
): Promise<{ id: number }> {
  const [created] = await db.insert(feedbacks).values(row).returning({ id: feedbacks.id });
  return created;
}

export async function markSent(db: DbConn, id: number, taskId: string): Promise<void> {
  await db.update(feedbacks)
    .set({ status: "SENT", taskId, failReason: null, lastTriedAt: new Date(),
           attemptCount: sql`${feedbacks.attemptCount} + 1` })
    .where(eq(feedbacks.id, id));
}

export async function markFailed(
  db: DbConn, id: number, reason: "config" | "invalid" | "busy" | "down",
): Promise<void> {
  await db.update(feedbacks)
    .set({ status: "FAILED", failReason: reason, lastTriedAt: new Date(),
           attemptCount: sql`${feedbacks.attemptCount} + 1` })
    .where(eq(feedbacks.id, id));
}

/**
 * 아직 못 보낸 것. **`FAILED` 가 아니라 `<> 'SENT'` 로 잡는다** — 저장 뒤 전달 중에 서버가
 * 죽으면 그 행은 `PENDING` 으로 남고, `FAILED` 만 보면 영영 못 찾는다.
 */
export async function findUnsent(db: DbConn, limit: number): Promise<FeedbackRow[]> {
  return db.select().from(feedbacks)
    .where(ne(feedbacks.status, "SENT"))
    .orderBy(asc(feedbacks.createdAt), asc(feedbacks.id))
    .limit(limit);
}
```

- [ ] **Step 4: 서비스를 만든다**

`lib/feedback/feedbackService.ts`:

```ts
import { eq } from "drizzle-orm";
import type { DbConn } from "../db/client";
import type { AuthUser } from "../auth/types";
import { departments, problems } from "../db/schema";
import { findUnsent, insertFeedback, markFailed, markSent } from "../db/feedbacks";
import { validateFeedbackInput } from "./validate";
import { composeBody, composeFrom } from "./compose";
import { sendFeedback } from "./relay";

const FAIL_MESSAGE = "지금은 보낼 수 없습니다. 잠시 뒤 다시 시도해 주세요.";
const BUSY_MESSAGE = "지금 접수가 몰려 있습니다. 잠시 뒤 다시 보내 주세요.";

/** 화면이 보낸 문자열을 믿지 않는다 — 부서·번호·유형은 서버가 DB 에서 찾는다. */
async function findProblemContext(db: DbConn, problemId: number | undefined) {
  if (!problemId) return null;
  const [row] = await db.select({
    id: problems.id, type: problems.type, sourceNumber: problems.sourceNumber,
    departmentName: departments.name,
  }).from(problems)
    .innerJoin(departments, eq(departments.id, problems.departmentId))
    .where(eq(problems.id, problemId));
  // 없는 id 면 일반 의견으로 처리한다. 본문은 멀쩡한데 참조 하나 때문에 말을 버리지 않는다.
  return row ?? null;
}

export async function submitFeedback(
  db: DbConn,
  actor: AuthUser,
  input: { body: unknown; sourcePath?: unknown; problemId?: number },
): Promise<{ ok: boolean; message: string }> {
  const { body, sourcePath } = validateFeedbackInput(input);
  const problem = await findProblemContext(db, input.problemId);

  // 저장이 먼저다. 저장 없이 보내면 실패했을 때 아무 데도 남지 않는다.
  const { id } = await insertFeedback(db, {
    userId: actor.userId, problemId: problem?.id ?? null, sourcePath, body,
  });

  const result = await sendFeedback({
    body: composeBody({ body, sourcePath, problem }),
    from: composeFrom(actor.name, actor.employeeNo),
  });

  if (result.ok) {
    await markSent(db, id, result.taskId);
    return { ok: true, message: "보냈습니다. 고맙습니다." };
  }
  await markFailed(db, id, result.reason);
  // 원문은 로그로만. 받는 쪽 문구를 그대로 보이면 내부 사정이 새고, 읽어도 할 수 있는 게 없다.
  console.error("[feedback] 전달 실패", result.reason, result.detail);
  return { ok: false, message: result.reason === "busy" ? BUSY_MESSAGE : FAIL_MESSAGE };
}

/**
 * 다시 보내기. **429 를 만나면 즉시 멈춘다** — 한도가 서비스 전체 공유라, 실패한 것을
 * 한꺼번에 밀면 그 시간대의 정상 제출이 막힌다.
 */
export async function retryUnsent(
  db: DbConn, limit: number,
): Promise<{ tried: number; sent: number; stoppedByLimit: boolean }> {
  const rows = await findUnsent(db, limit);
  let tried = 0;
  let sent = 0;
  for (const row of rows) {
    const problem = await findProblemContext(db, row.problemId ?? undefined);
    // 보낸 사람은 그때 그 사람이다. 다시 보내는 관리자의 이름을 실으면 안 된다.
    const [user] = await db.select({ name: users.name, employeeNo: users.employeeNo })
      .from(users).where(eq(users.id, row.userId));
    tried += 1;
    const result = await sendFeedback({
      body: composeBody({ body: row.body, sourcePath: row.sourcePath, problem }),
      from: composeFrom(user.name, user.employeeNo),
    });
    if (result.ok) {
      await markSent(db, row.id, result.taskId);
      sent += 1;
      continue;
    }
    await markFailed(db, row.id, result.reason);
    if (result.reason === "busy") return { tried, sent, stoppedByLimit: true };
  }
  return { tried, sent, stoppedByLimit: false };
}
```

`usersTable`/`usersName`/`usersEmployeeNo` 는 실제로는 `users` 를 import 해 `users.name`·`users.employeeNo` 로 쓴다. 위 코드에서 그렇게 고쳐 쓴다:

```ts
import { departments, problems, users } from "../db/schema";
...
const [user] = await db.select({ name: users.name, employeeNo: users.employeeNo })
  .from(users).where(eq(users.id, row.userId));
```

- [ ] **Step 5: 통과를 확인한다**

Run: `cd web && node node_modules/vitest/vitest.mjs run lib/feedback/feedbackService.test.ts`
Expected: PASS (10개)

- [ ] **Step 6: 커밋**

```bash
git add web/lib/db/feedbacks.ts web/lib/feedback/feedbackService.ts web/lib/feedback/feedbackService.test.ts
git commit -m "[ADD] 피드백 저장과 전달 서비스"
```

---

## Task 5: 라우트 세 개

**Files:**
- Create: `app/api/feedback/route.ts`, `app/api/admin/feedbacks/route.ts`, `app/api/admin/feedbacks/retry/route.ts`
- Test: `app/api/feedback/route.test.ts`, `app/api/admin/feedbacks/route.test.ts`

**Interfaces:**
- Consumes: `submitFeedback`, `retryUnsent`, `findUnsent`
- Produces: `POST /api/feedback` · `GET /api/admin/feedbacks` · `POST /api/admin/feedbacks/retry`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`app/api/admin/feedbacks/route.test.ts` — `app/api/admin/stats/problems/route.test.ts` 의 mock 관용구(`vi.hoisted` + `getDb` 대체 + `getAuthUser` 대체)를 그대로 따른다.

**라우트는 예외를 던지지 않는다.** `handleRoute` 가 `BizError` 를 잡아 상태 코드와 봉투로
바꾼다(`lib/http/errors.ts` 의 `handleRoute`·`bizStatus`). 그러므로 `rejects` 로 검사하면 안
되고, **`res.status` 와 `resultCode` 로 검사한다** — 기존 라우트 테스트가 그렇게 한다
(`app/api/admin/stats/problems/route.test.ts:42-43`).

성공 봉투는 `{ resultCode: 200, resultMsg, data }` 이고, `ACCESS_AUTH_DENIED` 는 403/990,
`EMPTY_SESSION` 은 401/980, `INPUT_VALUE_INVALID` 는 400/1000 이다.

```ts
describe("GET /api/admin/feedbacks", () => {
  it("부서 관리자는 볼 수 없다 — 피드백은 부서를 가로지르는 데이터다", async () => {
    state.currentUser = await seedActor("DEPT_ADMIN", deptA);
    const res = await GET();
    expect(res.status).toBe(403);
    expect((await res.json()).resultCode).toBe(990);
  });

  it("총괄 관리자는 SENT 가 아닌 것만 받는다", async () => {
    state.currentUser = await seedActor("SUPER_ADMIN", deptA);
    const userId = (state.currentUser as AuthUser).userId;
    await db.insert(feedbacks).values([
      { userId, body: "실패", status: "FAILED", failReason: "down" },
      { userId, body: "멈춤", status: "PENDING" },
      { userId, body: "보냄", status: "SENT", taskId: "T" },
    ]);
    const res = await GET();
    const payload = await res.json();
    expect(payload.data.map((r: { body: string }) => r.body).sort()).toEqual(["멈춤", "실패"]);
  });
});
```

`app/api/feedback/route.test.ts`:

```ts
const service = vi.hoisted(() => ({ submit: vi.fn() }));
vi.mock("../../../lib/feedback/feedbackService", () => ({ submitFeedback: service.submit }));

function postRequest(body: unknown): Request {
  return new Request("http://localhost/api/feedback", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
  });
}

describe("POST /api/feedback", () => {
  it("로그인만 요구하고 역할은 보지 않는다", async () => {
    state.currentUser = await seedActor("EMPLOYEE", deptA);
    service.submit.mockResolvedValue({ ok: true, message: "보냈습니다. 고맙습니다." });
    const res = await POST(postRequest({ body: "의견" }));
    expect(res.status).toBe(200);
    expect((await res.json()).data.ok).toBe(true);
  });

  it("로그인하지 않으면 401/980 이다", async () => {
    state.currentUser = null;
    const res = await POST(postRequest({ body: "의견" }));
    expect(res.status).toBe(401);
    expect((await res.json()).resultCode).toBe(980);
  });

  it("빈 글은 400/1000 이고 문구가 그대로 나간다", async () => {
    state.currentUser = await seedActor("EMPLOYEE", deptA);
    service.submit.mockRejectedValue(
      new BizError(ErrorCode.INPUT_VALUE_INVALID, "내용을 적어주세요."),
    );
    const res = await POST(postRequest({ body: "   " }));
    expect(res.status).toBe(400);
    const payload = await res.json();
    expect(payload.resultCode).toBe(1000);
    expect(payload.resultMsg).toBe("내용을 적어주세요.");
  });

  it("problemId 와 sourcePath 를 서비스로 넘긴다", async () => {
    state.currentUser = await seedActor("EMPLOYEE", deptA);
    service.submit.mockResolvedValue({ ok: true, message: "" });
    await POST(postRequest({ body: "의견", problemId: 12, sourcePath: "/solve/random/play" }));
    expect(service.submit.mock.calls[0][2]).toMatchObject({
      body: "의견", problemId: 12, sourcePath: "/solve/random/play",
    });
  });

  /** 숫자가 아닌 problemId 가 그대로 흘러가면 DB 조회에서 터진다. */
  it("problemId 가 숫자가 아니면 넘기지 않는다", async () => {
    state.currentUser = await seedActor("EMPLOYEE", deptA);
    service.submit.mockResolvedValue({ ok: true, message: "" });
    await POST(postRequest({ body: "의견", problemId: "12" }));
    expect(service.submit.mock.calls[0][2].problemId).toBeUndefined();
  });

  it("본문이 JSON 이 아니어도 서비스까지 도달한다 — 빈 객체로 읽는다", async () => {
    state.currentUser = await seedActor("EMPLOYEE", deptA);
    service.submit.mockResolvedValue({ ok: false, message: "x" });
    const bad = new Request("http://localhost/api/feedback", { method: "POST", body: "not-json" });
    const res = await POST(bad);
    expect(res.status).toBe(200);
    expect(service.submit.mock.calls[0][2].body).toBeUndefined();
  });
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `cd web && node node_modules/vitest/vitest.mjs run app/api/feedback app/api/admin/feedbacks`
Expected: FAIL — 라우트 없음

- [ ] **Step 3: 라우트를 만든다**

`app/api/feedback/route.ts`:

```ts
import { getDb } from "@/lib/db/client";
import { handleRoute } from "@/lib/http/errors";
import { requireActor } from "@/lib/auth/currentUser";
import { submitFeedback } from "@/lib/feedback/feedbackService";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  return handleRoute(async () => {
    // 역할을 넘기지 않는다 — 로그인한 누구나 보낼 수 있다.
    const actor = await requireActor();
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    return submitFeedback(getDb(), actor, {
      body: body.body,
      sourcePath: body.sourcePath,
      problemId: typeof body.problemId === "number" ? body.problemId : undefined,
    });
  });
}
```

`app/api/admin/feedbacks/route.ts` 는 `requireActor("SUPER_ADMIN")` 후 `findUnsentSummary(getDb(), 100)` 을 낸다.

**본문을 응답에 싣지 않는다.** 다시 보내기에 필요한 것은 건수와 상태뿐인데, 본문을 내려보내면
총괄 관리자의 브라우저에 전 직원의 의견 원문이 담긴다. 화면에서 안 그리는 것으로는 부족하다 —
개발자 도구로 응답을 열면 그대로 보인다.

그래서 `lib/db/feedbacks.ts` 에 요약 전용 조회를 따로 둔다(`findUnsent` 는 다시 보내기가
쓰므로 본문을 그대로 낸다 — 조립에 필요하다).

```ts
export type FeedbackSummary = Pick<FeedbackRow, "id" | "status" | "failReason" | "attemptCount" | "createdAt">;

/** 목록용. body 를 싣지 않는다 — 화면이 안 그려도 응답에 있으면 새는 것이다. */
export async function findUnsentSummary(db: DbConn, limit: number): Promise<FeedbackSummary[]> {
  return db.select({
    id: feedbacks.id, status: feedbacks.status, failReason: feedbacks.failReason,
    attemptCount: feedbacks.attemptCount, createdAt: feedbacks.createdAt,
  }).from(feedbacks)
    .where(ne(feedbacks.status, "SENT"))
    .orderBy(asc(feedbacks.createdAt), asc(feedbacks.id))
    .limit(limit);
}
```

이 라우트 테스트에 **응답에 `body` 키가 없다**는 단언을 함께 둔다.

```ts
it("본문은 응답에 실리지 않는다", async () => {
  state.currentUser = await seedActor("SUPER_ADMIN", deptA);
  await db.insert(feedbacks).values({ userId: (state.currentUser as AuthUser).userId, body: "비밀스러운 의견", status: "FAILED", failReason: "down" });
  const payload = await (await GET()).json();
  expect(payload.data[0]).not.toHaveProperty("body");
  expect(JSON.stringify(payload)).not.toContain("비밀스러운 의견");
});
```

`app/api/admin/feedbacks/retry/route.ts` 는 `requireActor("SUPER_ADMIN")` 후 `retryUnsent(getDb(), 20)` 을 낸다.

- [ ] **Step 4: 통과를 확인한다**

Run: `cd web && node node_modules/vitest/vitest.mjs run app/api/feedback app/api/admin/feedbacks`
Expected: PASS

- [ ] **Step 5: 커밋**

```bash
git add web/app/api/feedback web/app/api/admin/feedbacks
git commit -m "[ADD] 피드백 라우트"
```

---

## Task 6: 공통 모달과 진입점 세 개(학습)

**Files:**
- Create: `apiClient/feedback.js`, `components/feedback/FeedbackModal.jsx`
- Modify: `components/solve/ProblemSolveCard.jsx`, `screens/solve/SolveShell.jsx`, `screens/solve/SolveHomePage.jsx`

**Interfaces:**
- Consumes: `POST /api/feedback`
- Produces: `<FeedbackModal open onClose problemId sourcePath />`, `sendFeedback(payload)`

- [ ] **Step 1: apiClient 를 만든다**

`apiClient/feedback.js`:

```js
import { apiPost } from "@/apiClient/client.js";

export function sendFeedback({ body, problemId, sourcePath }) {
  return apiPost("/api/feedback", { body, problemId, sourcePath });
}
```

- [ ] **Step 2: 모달을 만든다**

`components/feedback/FeedbackModal.jsx` — 이미 있는 `components/ui/Modal.jsx` 를 감싼다.

```jsx
"use client";
import { useState } from "react";
import { usePathname } from "next/navigation";
import Modal from "@/components/ui/Modal.jsx";
import Button from "@/components/ui/Button.jsx";
import { toast } from "react-toastify";
import { sendFeedback } from "@/apiClient/feedback.js";
import { resolveErrorMessage } from "@/apiClient/client.js";

const MAX = 1000;

/**
 * 진입점 넷이 공유하는 단 하나의 폼. 화면마다 폼을 따로 만들면 한쪽만 고쳐진다.
 *
 * value/onChange 로 글자를 직접 들고 있는다. React 19 의 form action 을 쓰면 액션이 끝날 때
 * 폼이 자동으로 비워지는데 **성공·실패를 가리지 않는다** — 실패했는데 지우면 방금 쓴 글이 사라진다.
 *
 * 보내는 동안 dismissible={false} 로 잠근다. 받는 쪽에 중복 판정이 없어 두 번 눌린 만큼
 * 카드가 생긴다.
 */
export default function FeedbackModal({ open, onClose, problemId = null }) {
  const pathname = usePathname();
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState("");

  /**
   * 성공하면 글을 비우고 모달을 닫은 뒤 토스트로 알린다 — 문제를 풀던 흐름으로 바로 돌아간다.
   * 실패하면 **닫지 않고 글도 그대로 둔다.** 방금 쓴 글이 사라지는 것이 이 기능에서
   * 가장 나쁜 일이다.
   */
  async function handleSubmit() {
    setSending(true);
    try {
      const r = await sendFeedback({ body: text, problemId, sourcePath: pathname });
      if (r.ok) {
        setText("");
        setMessage("");
        onClose();
        toast.success(r.message);
        return;
      }
      setMessage(r.message);
    } catch (error) {
      setMessage(resolveErrorMessage(error, "지금은 보낼 수 없습니다."));
    } finally {
      setSending(false);
    }
  }

  return (
    <Modal open={open} title={problemId ? "이 문제 신고" : "의견 보내기"} onClose={onClose} dismissible={!sending}>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        maxLength={MAX}
        disabled={sending}
        rows={6}
        aria-label="피드백 내용"
        placeholder={problemId ? "이 문제의 어디가 이상한지 적어 주세요" : "불편한 점이나 바라는 점을 적어 주세요"}
        className="w-full rounded-sm border border-line-default bg-surface-default p-3 text-body text-ink-strong placeholder:text-ink-subtle focus-visible:outline focus-visible:outline-[3px] focus-visible:-outline-offset-[3px] focus-visible:outline-brand-aqua disabled:opacity-60"
      />
      <p className="mt-1 text-right text-body-small text-ink-muted">{text.length} / {MAX}</p>
      {message && <p aria-live="polite" className="mt-2 text-body-small text-ink-default">{message}</p>}
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose} disabled={sending}>닫기</Button>
        <Button onClick={handleSubmit} loading={sending} disabled={text.trim() === ""}>보내기</Button>
      </div>
    </Modal>
  );
}
```

- [ ] **Step 3: 문제 카드에 신고 버튼을 단다**

`components/solve/ProblemSolveCard.jsx` 의 머리 줄(유형 칩 · `SourceBadge` 가 있는 `div`)에 `justify-between` 을 주고 오른쪽에 버튼을 둔다. 상태는 카드가 들고 있는다.

```jsx
const [reportOpen, setReportOpen] = useState(false);
...
<button type="button" onClick={() => setReportOpen(true)}
  className="ml-auto shrink-0 rounded-sm px-2 py-1 text-body-small text-ink-muted hover:text-ink-strong focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-brand-aqua">
  <Flag size={16} aria-hidden="true" className="inline" /> 신고
</button>
...
<FeedbackModal open={reportOpen} onClose={() => setReportOpen(false)} problemId={problem.id} />
```

**채점 전후 모두 열려야 한다** — `answered` 로 막지 않는다. 틀리고 나서야 문제가 이상한 것을 아는 경우가 많다.

- [ ] **Step 4: 셸 바닥 링크와 홈 카드를 단다**

`SolveShell.jsx` 의 `<main>` 아래에 조용한 한 줄을 둔다(헤더에는 넣지 않는다 — 모바일 헤더는 실측 검증을 마친 배치다):

```jsx
<footer className="mx-auto w-full max-w-[1120px] px-5 pb-8 md:px-7">
  <button type="button" onClick={() => setFeedbackOpen(true)}
    className="text-body-small text-ink-muted underline-offset-2 hover:text-ink-strong hover:underline">
    불편한 점이나 바라는 점 보내기
  </button>
</footer>
<FeedbackModal open={feedbackOpen} onClose={() => setFeedbackOpen(false)} />
```

`SolveHomePage.jsx` 의 명예의 전당 아래에 한 줄짜리 얇은 카드를 같은 방식으로 둔다.

- [ ] **Step 5: 화면으로 확인한다**

개발 서버를 띄우고(`cd web && pnpm dev`, 3100 포트) 세 자리에서 모달이 열리는지, 보내는 동안 닫히지 않는지, **실패했을 때 쓴 글이 남는지**를 확인한다.

`HARRY_INBOUND_SECRET` 을 한 글자 바꿔 401 을, URL 을 죽은 주소로 바꿔 시간초과를 일부러 만든다. **이것이 이 연동에서 가장 중요한 확인이다.**

- [ ] **Step 6: 커밋**

```bash
git add web/apiClient/feedback.js web/components/feedback web/components/solve/ProblemSolveCard.jsx web/screens/solve/SolveShell.jsx web/screens/solve/SolveHomePage.jsx
git commit -m "[ADD] 학습 화면 피드백 진입점"
```

---

## Task 7: 관리자 화면

**Files:**
- Create: `screens/admin/FeedbackPage.jsx`, `app/(protected)/admin/feedback/page.tsx`
- Modify: `utils/adminNav.js`
- Test: `utils/adminNav.test.js` (기존 파일에 추가)

**Interfaces:**
- Consumes: `FeedbackModal`, `GET /api/admin/feedbacks`, `POST /api/admin/feedbacks/retry`

- [ ] **Step 1: 메뉴 테스트를 더한다**

`utils/adminNav.test.js` 에 추가:

```js
it("피드백은 두 관리자 역할 모두에게 보인다", () => {
  for (const role of ["SUPER_ADMIN", "DEPT_ADMIN"]) {
    const paths = buildNavGroups(role).flatMap((g) => g.items.map((i) => i.to));
    expect(paths).toContain("/admin/feedback");
  }
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `cd web && node node_modules/vitest/vitest.mjs run utils/adminNav.test.js`
Expected: FAIL

- [ ] **Step 3: 메뉴를 더한다**

`utils/adminNav.js` 의 공통 `items.push(...)` 블록에 더한다. `/admin/feedback` 은 다른 항목의 접두사가 아니므로 `end` 가 필요 없다.

```js
{ to: "/admin/feedback", label: "피드백", icon: ChatText },
```

`ChatText` 를 `@phosphor-icons/react` import 목록에 더한다.

- [ ] **Step 4: 통과를 확인한다**

Run: `cd web && node node_modules/vitest/vitest.mjs run utils/adminNav.test.js`
Expected: PASS

- [ ] **Step 5: 화면을 만든다**

`app/(protected)/admin/feedback/page.tsx` 는 이 저장소 관용구대로 **첫 줄에 `"use client";`** 를 두고 화면 컴포넌트를 그린다.

`screens/admin/FeedbackPage.jsx`:

```jsx
"use client";
import { useCallback, useEffect, useState } from "react";
import Surface from "@/components/ui/Surface.jsx";
import Button from "@/components/ui/Button.jsx";
import FeedbackModal from "@/components/feedback/FeedbackModal.jsx";
import { useSessionStatus } from "@/hooks/useSessionStatus.js";
import { listUnsentFeedbacks, retryFeedbacks } from "@/apiClient/feedback.js";
import { resolveErrorMessage } from "@/apiClient/client.js";

export default function FeedbackPage() {
  const { session } = useSessionStatus();
  const isSuper = session?.role === "SUPER_ADMIN";
  const [open, setOpen] = useState(false);
  const [unsent, setUnsent] = useState([]);
  const [retrying, setRetrying] = useState(false);
  const [note, setNote] = useState("");

  // 총괄 관리자만 부른다 — 부서 관리자가 부르면 서버가 막지만, 막힐 요청을 보내지 않는다.
  const refresh = useCallback(async () => {
    if (!isSuper) return;
    try {
      setUnsent(await listUnsentFeedbacks());
    } catch (error) {
      setNote(resolveErrorMessage(error, "목록을 불러오지 못했습니다."));
    }
  }, [isSuper]);

  useEffect(() => { refresh(); }, [refresh]);

  async function handleRetry() {
    setRetrying(true);
    try {
      const r = await retryFeedbacks();
      setNote(
        r.stoppedByLimit
          ? `${r.sent}건을 보냈고 한도에 걸려 멈췄습니다. 잠시 뒤 다시 눌러 주세요.`
          : `${r.tried}건 중 ${r.sent}건을 보냈습니다.`,
      );
      await refresh();
    } catch (error) {
      setNote(resolveErrorMessage(error, "다시 보내지 못했습니다."));
    } finally {
      setRetrying(false);
    }
  }

  return (
    <>
      <section className="mb-5">
        <h1 className="text-page-title font-bold tracking-title text-ink-strong">피드백</h1>
        <p className="mt-1 text-body text-ink-default">제작자에게 바라는 점이나 불편한 점을 보냅니다.</p>
      </section>

      <Surface className="p-5">
        <Button onClick={() => setOpen(true)}>의견 보내기</Button>
      </Surface>

      {isSuper && (
        <Surface className="mt-4 p-5">
          <div className="flex items-center justify-between gap-3">
            <p className="text-body text-ink-strong">
              전달 실패 <span className="font-bold">{unsent.length}</span>건
            </p>
            <Button variant="secondary" onClick={handleRetry} loading={retrying} disabled={unsent.length === 0}>
              다시 보내기
            </Button>
          </div>
          {note && <p aria-live="polite" className="mt-2 text-body-small text-ink-default">{note}</p>}
          {/*
            본문은 보이지 않는다. 다시 보내기에 필요한 것은 건수와 상태뿐인데, 본문을 띄우면
            총괄 관리자가 전 직원의 의견 원문을 읽게 된다. 원문을 볼 자리는 제작자의 보드다.
          */}
          {unsent.length > 0 && (
            <ul className="mt-3 space-y-2">
              {unsent.map((f) => (
                <li key={f.id} className="flex items-baseline gap-3 rounded-md border border-line-default p-3 text-body-small">
                  <span className="text-ink-strong">{f.status}{f.failReason ? ` · ${f.failReason}` : ""}</span>
                  <span className="ml-auto text-ink-muted">시도 {f.attemptCount}회</span>
                </li>
              ))}
            </ul>
          )}
        </Surface>
      )}

      <FeedbackModal open={open} onClose={() => setOpen(false)} />
    </>
  );
}
```

`apiClient/feedback.js` 에 두 함수를 더한다:

```js
export function listUnsentFeedbacks() {
  return apiGet("/api/admin/feedbacks");
}

export function retryFeedbacks() {
  return apiPost("/api/admin/feedbacks/retry", {});
}
```

`apiGet` 을 import 목록에 더한다.

- [ ] **Step 6: 화면으로 확인한다**

총괄 관리자(`sadmin` / `Test1234!`)와 부서 관리자로 각각 들어가 **부서 관리자에게 실패 목록이 안 보이는지**를 확인한다.

- [ ] **Step 7: 커밋**

```bash
git add web/utils/adminNav.js web/utils/adminNav.test.js web/screens/admin/FeedbackPage.jsx "web/app/(protected)/admin/feedback"
git commit -m "[ADD] 관리자 피드백 화면"
```

---

## Task 8: 마무리 검증

- [ ] **Step 1: 전체 테스트**

Run: `cd web && node node_modules/vitest/vitest.mjs run`
Expected: 전부 통과

- [ ] **Step 2: 타입 검사**

Run: `cd web && npx tsc --noEmit`
Expected: 오류 없음

- [ ] **Step 3: 비밀이 번들에 없는지 확인한다**

Run: `cd web && pnpm build && grep -rn "HARRY_INBOUND_SECRET" .next/static/ | head`
Expected: **0건.** 나오면 클라이언트 컴포넌트가 비밀 모듈을 import 한 것이므로 멈추고 원인을 찾는다.

- [ ] **Step 4: 운영 마이그레이션과 배포**

`pnpm migrate:prod` 로 `feedbacks` 테이블을 운영에 만든 뒤 배포한다. **배포 전에 우리 Vercel 에 `HARRY_INBOUND_URL`·`HARRY_INBOUND_SECRET` 를 넣고 재배포한다** — Vercel 환경변수는 배포 단위로 묶여, 넣기만 하고 재배포를 안 하면 이미 떠 있는 배포는 예전 값을 쓴다.

- [ ] **Step 5: 운영에서 한 건 보낸다**

보드에 카드가 뜨는지 확인하고, 확인용이니 보고 지운다.
메모 첫 줄에 `{이름} 님이 보낸 피드백 · {날짜}` 가 있으면 제대로 붙은 것이다.

- [ ] **Step 6: `task_id` 길이가 실제로 맞는지 확인한다**

첫 성공 뒤 저장된 값을 본다.

```sql
SELECT id, length(task_id) AS len, task_id FROM feedbacks WHERE status = 'SENT' ORDER BY id DESC LIMIT 5;
```

`task_id` 를 `varchar(100)` 으로 잡은 것은 **추정이다** — 아티팩트에는 `{ ok: true, taskId }`
라고만 적혀 있고 형식·길이가 없다. 100자에 가까우면 컬럼을 늘린다. 넘치면 저장이 실패해
`SENT` 로 못 바뀌고 같은 말을 다시 보내게 된다.

---

## 시작 전에 답이 필요한 것

아래 둘은 코드로 확인할 수 없어 사람에게 물어야 한다. **답을 못 얻어도 구현은 진행할 수 있고,
Task 8 에서 실측으로 대신 확인한다.**

- **받는 쪽이 주는 `taskId` 의 실제 모양.** `curl` 로 201 을 받아 보았으므로 그때 값이 있다.
  UUID(36자)면 `varchar(100)` 이 넉넉하고, 긴 복합 키라면 Task 1 에서 미리 늘린다.
- **운영 활성 계정 수.** 시간당 100건이 서비스 전체 공유라, 아래 값이 수백이면 공지 직후
  429 가 현실적인 위험이다. 받는 쪽에서 한 줄로 올릴 수 있다고 아티팩트가 적어 두었다.

  ```sql
  SELECT count(*) FROM users WHERE status = 'ACTIVE';
  ```
