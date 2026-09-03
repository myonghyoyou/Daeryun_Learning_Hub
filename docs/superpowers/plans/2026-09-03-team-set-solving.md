# 골라서 풀기 팀 단위 풀이 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** "골라서 풀기"를 문제 하나를 고르는 화면에서 한 팀의 문제를 처음부터 끝까지 푸는 흐름으로 바꾼다.

**Architecture:** 한 팀을 한 번 훑는 단위를 "바퀴"라 부르고 `solve_runs` 테이블 한 행으로 남긴다. 바퀴에는 시작 시점에 확정한 문제 id 목록과 지금 위치, 그리고 결과가 함께 들어간다. 순수 로직(`lib/solve/teamRun.ts`) → DB 접근(`lib/db/solveRuns.ts`, `lib/db/solveTeams.ts`) → 서비스(`lib/solve/teamRunService.ts`) → 라우트 → 화면 순으로 쌓는다.

**Tech Stack:** Next.js 15 (App Router), Drizzle ORM, Postgres, Vitest, Tailwind

**Spec:** `docs/superpowers/specs/2026-09-02-team-set-solving-design.md`

## Global Constraints

- 응답 봉투는 `{ resultCode, resultMsg, data }` 다. 라우트는 `handleRoute` 로 감싸고 서비스가 `data` 를 그대로 반환한다.
- 문제 줄 세우기 규칙은 **`source_number` 오름차순, NULL 은 맨 뒤, 같으면 `id` 오름차순** 이다. 이 문서에서 이 규칙이 나오는 곳은 SQL `ORDER BY p.source_number ASC NULLS LAST, p.id ASC` 한 가지 표현뿐이다.
- "틀린 문제"는 **문제마다 가장 마지막에 낸 답이 오답인 것**이다. 같은 시각이면 `attempts.id` 가 큰 쪽을 나중으로 본다.
- `mode` 값은 `'ALL'` 과 `'WRONG'` 두 가지, `status` 값은 `'IN_PROGRESS'` 와 `'FINISHED'` 두 가지다.
- `results` 항목의 `correct` 는 `true` · `false` · `null` 세 가지이고 **`null` 은 건너뛴 문제**다. 정답 수·답한 수 어디에도 세지 않는다.
- 직원은 **전 부서** 문제를 본다. 부서로 접근을 제한하지 않는다(`lib/db/solveProblems.ts` 의 S9 주석).
- 테스트 DB 는 `TEST_DATABASE_URL` 이며 이름이 `_test` 로 끝나야 한다. `test/db.ts` 의 `migrateTestDb()` · `truncateAll()` 을 쓴다.
- 전체 검증은 `cd web && npx vitest run` 과 `cd web && npx tsc --noEmit` 이다.
- **`next build` 를 dev 서버와 동시에 돌리지 마라.** 같은 `.next` 를 공유해 화면이 "세션 확인 중..."에서 멈춘다(2026-09-01 실측).

## 이 계획의 설계서 대비 변경 한 가지

설계서 "코드 구조"는 `lib/solve/teamRun.ts` 에 **줄 세우기 비교자**를 두라고 적었다. 이 계획은 그러지 않는다 — 줄 세우기를 SQL `ORDER BY` 로만 하고 DB 테스트로 고정한다.

이유: 비교자와 `ORDER BY` 를 둘 다 두면 같은 규칙의 구현이 둘이 되고, 한쪽만 고치는 사고가 난다. 규칙을 지키는 테스트는 DB 테스트(Task 3)로 충분하다. `teamRun.ts` 에는 SQL 로 표현할 수 없는 것(위치 계산·완료 판정·결과 집계)만 남긴다.

## 파일 구조

| 파일 | 책임 |
|---|---|
| `web/lib/db/schema.ts` | `solveRuns` 테이블 정의 추가 |
| `web/drizzle/0001_*.sql` | 생성되는 마이그레이션 |
| `web/test/db.ts` | `truncateAll` 에 `solve_runs` 추가 |
| `web/lib/solve/teamRun.ts` | 순수 함수 — 위치 전진 가능 여부, 완료 판정, 결과 집계 |
| `web/lib/db/solveTeams.ts` | 팀 목록·팀 문제 id·틀린 문제 id·문제 요약 조회 |
| `web/lib/db/solveRuns.ts` | `solve_runs` 읽기·쓰기 |
| `web/lib/solve/teamRunService.ts` | 팀 목록 조립, 바퀴 시작·전진·종료·조회 |
| `web/app/api/solve/teams/route.ts` | `GET /api/solve/teams` |
| `web/app/api/solve/teams/[departmentId]/runs/route.ts` | `POST` 바퀴 시작 |
| `web/app/api/solve/runs/[runId]/route.ts` | `GET` 바퀴 조회 |
| `web/app/api/solve/runs/[runId]/advance/route.ts` | `POST` 한 문제 전진 |
| `web/app/api/solve/runs/[runId]/finish/route.ts` | `POST` 바퀴 종료 |
| `web/apiClient/teamRuns.js` | 위 다섯 창구의 클라이언트 |
| `web/screens/solve/SolveTeamListPage.jsx` | 팀 목록 |
| `web/screens/solve/TeamRunChoicePage.jsx` | 선택 화면 |
| `web/screens/solve/TeamRunPlayPage.jsx` | 진행 화면 |
| `web/screens/solve/TeamRunResultPage.jsx` | 결과 화면 |
| `web/app/(protected)/solve/problems/**` | 위 네 화면의 라우트 |

---

### Task 1: solve_runs 테이블

**Files:**
- Modify: `web/lib/db/schema.ts`
- Modify: `web/test/db.ts` (`truncateAll`)
- Create: `web/drizzle/0001_*.sql` (drizzle-kit 이 생성)
- Test: `web/lib/db/solveRunsSchema.test.ts`

**Interfaces:**
- Consumes: 없음
- Produces: `solveRuns` 테이블. 컬럼은 `id`·`userId`·`departmentId`·`mode`·`problemIds`·`cursor`·`results`·`status`·`createdAt`·`updatedAt`

- [ ] **Step 1: 스키마에 테이블을 추가한다**

`web/lib/db/schema.ts` 최상단 import 에서 `uniqueIndex` 를 추가한다. 지금은 다음과 같다:

```typescript
import {
  pgTable, bigserial, varchar, text, integer, boolean, timestamp, bigint, jsonb,
  index, primaryKey, unique, check,
```

`unique,` 뒤에 `uniqueIndex,` 를 넣어 다음처럼 만든다:

```typescript
import {
  pgTable, bigserial, varchar, text, integer, boolean, timestamp, bigint, jsonb,
  index, primaryKey, unique, uniqueIndex, check,
```

그리고 파일 맨 끝(`auditLogs` 정의 뒤)에 다음을 붙인다:

```typescript
/**
 * 한 팀을 한 번 훑는 단위("바퀴"). 골라서 풀기가 팀 단위로 바뀌면서 생겼다.
 *
 * problem_ids 를 시작 시점에 박아 두는 이유가 있다. 그러지 않으면 푸는 도중 관리자가
 * 문제를 추가하거나 보관 처리했을 때 총 개수와 순서가 발밑에서 바뀐다 — 화면의
 * "12 / 30" 이 갑자기 "12 / 31" 이 된다.
 *
 * results 를 여기 쌓는 이유도 있다. 채점 결과는 attempts 에도 남지만 거기에는 어느
 * 바퀴에서 낸 답인지가 없어, 다른 탭에서 같은 문제를 병행해 풀면 시각만으로 갈라낼 수
 * 없다. attempts 를 건드리지 않고 정확한 요약을 내기 위해 따로 쌓는다.
 */
export const solveRuns = pgTable("solve_runs", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  userId: bigint("user_id", { mode: "number" }).notNull().references(() => users.id),
  departmentId: bigint("department_id", { mode: "number" }).notNull().references(() => departments.id),
  mode: varchar("mode", { length: 10 }).notNull(),
  problemIds: jsonb("problem_ids").$type<number[]>().notNull(),
  cursor: integer("cursor").notNull().default(0),
  results: jsonb("results").$type<{ problemId: number; correct: boolean | null }[]>()
    .notNull().default(sql`'[]'::jsonb`),
  status: varchar("status", { length: 20 }).notNull().default("IN_PROGRESS"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (t) => ({
  modeCheck: check("solve_runs_mode_check", sql`${t.mode} IN ('ALL', 'WRONG')`),
  statusCheck: check("solve_runs_status_check", sql`${t.status} IN ('IN_PROGRESS', 'FINISHED')`),
  // 한 사람이 한 팀에 대해 진행 중인 바퀴는 최대 하나. 두 탭에서 동시에 시작해도
  // 바퀴가 둘로 갈라지지 않게 DB 가 막는다 — 애플리케이션 검사만으로는 경합을 못 막는다.
  oneActive: uniqueIndex("solve_runs_one_active").on(t.userId, t.departmentId)
    .where(sql`${t.status} = 'IN_PROGRESS'`),
}));
```

- [ ] **Step 2: 마이그레이션을 만든다**

```bash
cd web && npx drizzle-kit generate
```

`web/drizzle/` 에 `0001_*.sql` 이 생기고 `web/drizzle/meta/_journal.json` 에 항목이 하나 늘어난다. 생성된 SQL 을 열어 다음 세 가지가 들어 있는지 눈으로 확인한다: `CREATE TABLE "solve_runs"`, 두 개의 `CHECK`, `CREATE UNIQUE INDEX "solve_runs_one_active" ... WHERE "status" = 'IN_PROGRESS'`.

**이미 만들어진 마이그레이션 파일은 절대 수정하지 마라.** 내용이 틀렸으면 스키마를 고치고 그 파일을 지운 뒤 다시 generate 한다(아직 어디에도 적용하기 전이므로 안전하다).

- [ ] **Step 3: truncateAll 에 테이블을 추가한다**

`web/test/db.ts` 의 `truncateAll` 은 지금 이렇다:

```typescript
  await db.execute(sql`TRUNCATE TABLE
    audit_logs, problem_tags, tags, excel_upload_logs, attempt_choices,
    attempt_blank_answers, attempts, problem_blanks, problem_answers,
    problem_choices, problems, users, departments RESTART IDENTITY CASCADE`);
```

`audit_logs,` 앞에 `solve_runs,` 를 넣어 다음처럼 바꾼다:

```typescript
  await db.execute(sql`TRUNCATE TABLE
    solve_runs, audit_logs, problem_tags, tags, excel_upload_logs, attempt_choices,
    attempt_blank_answers, attempts, problem_blanks, problem_answers,
    problem_choices, problems, users, departments RESTART IDENTITY CASCADE`);
```

같은 파일 위쪽 주석의 "13개 테이블"을 "14개 테이블"로 고친다.

- [ ] **Step 4: 실패하는 테스트를 쓴다**

`web/lib/db/solveRunsSchema.test.ts` 를 새로 만든다:

```typescript
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { migrateTestDb, testDb, truncateAll } from "../../test/db";
import { departments, solveRuns, users } from "./schema";

const db = testDb();
let deptId = 0;
let userId = 0;

beforeAll(async () => { await migrateTestDb(); });
beforeEach(async () => {
  await truncateAll();
  [{ id: deptId }] = await db.insert(departments)
    .values({ name: "기획팀", code: "PLAN", status: "ACTIVE" }).returning({ id: departments.id });
  [{ id: userId }] = await db.insert(users).values({
    employeeNo: "emp", name: "직원", email: "e@b.c", passwordHash: "x",
    departmentId: deptId, role: "EMPLOYEE", status: "ACTIVE", mustChangePassword: false,
  }).returning({ id: users.id });
});

describe("solve_runs", () => {
  it("기본값은 cursor 0 · results 빈 배열 · 진행 중이다", async () => {
    const [row] = await db.insert(solveRuns)
      .values({ userId, departmentId: deptId, mode: "ALL", problemIds: [1, 2, 3] })
      .returning();
    expect(row.cursor).toBe(0);
    expect(row.results).toEqual([]);
    expect(row.status).toBe("IN_PROGRESS");
    expect(row.problemIds).toEqual([1, 2, 3]);
  });

  it("한 사람이 한 팀에 진행 중인 바퀴를 둘 만들 수 없다", async () => {
    await db.insert(solveRuns).values({ userId, departmentId: deptId, mode: "ALL", problemIds: [1] });
    await expect(
      db.insert(solveRuns).values({ userId, departmentId: deptId, mode: "WRONG", problemIds: [2] }),
    ).rejects.toThrow();
  });

  it("끝난 바퀴는 여러 개 있어도 된다 — 부분 인덱스라 진행 중인 것만 막는다", async () => {
    await db.insert(solveRuns)
      .values({ userId, departmentId: deptId, mode: "ALL", problemIds: [1], status: "FINISHED" });
    await db.insert(solveRuns)
      .values({ userId, departmentId: deptId, mode: "WRONG", problemIds: [2], status: "FINISHED" });
    await db.insert(solveRuns).values({ userId, departmentId: deptId, mode: "ALL", problemIds: [3] });
    const rows = await db.select().from(solveRuns);
    expect(rows).toHaveLength(3);
  });

  it("mode 와 status 는 정해진 값만 받는다", async () => {
    await expect(
      db.insert(solveRuns).values({ userId, departmentId: deptId, mode: "SOMETHING", problemIds: [1] }),
    ).rejects.toThrow();
  });
});
```

- [ ] **Step 5: 테스트가 실패하는지 확인한다**

Run: `cd web && npx vitest run lib/db/solveRunsSchema.test.ts`
Expected: FAIL — 테스트 DB 에 아직 테이블이 없다(마이그레이션이 적용되기 전).

`migrateTestDb()` 가 `beforeAll` 에서 새 마이그레이션을 적용하므로, Step 2 를 마쳤다면 이 단계에서 바로 통과할 수도 있다. 그 경우 Step 4 의 테스트가 실제로 무언가를 지키는지 Step 6 의 변이로 확인한다.

- [ ] **Step 6: 변이로 테스트가 실제로 지키는지 확인한다**

테스트 DB 의 부분 인덱스를 잠시 전체 인덱스로 바꿔, 인덱스의 `WHERE` 절이 실제로 무언가를 지키는지 본다. `web/_tmp_index_mutation.ts` 를 임시로 만든다:

```typescript
import postgres from "postgres";

const url = process.env.TEST_DATABASE_URL ?? "postgres://probank:probank_dev@localhost:5434/probank_test";
const restore = process.argv.includes("--restore");

const sql = postgres(url, { prepare: false });
await sql`DROP INDEX IF EXISTS solve_runs_one_active`;
if (restore) {
  await sql`CREATE UNIQUE INDEX solve_runs_one_active ON solve_runs (user_id, department_id) WHERE status = 'IN_PROGRESS'`;
} else {
  await sql`CREATE UNIQUE INDEX solve_runs_one_active ON solve_runs (user_id, department_id)`;
}
await sql.end();
console.log(restore ? "복구함" : "변이 적용함");
```

변이를 넣고 돌린다:

```bash
cd web && npx tsx _tmp_index_mutation.ts
cd web && npx vitest run lib/db/solveRunsSchema.test.ts
```

Expected: FAIL — "끝난 바퀴는 여러 개 있어도 된다" 가 깨진다.

되돌리고 다시 돌린다:

```bash
cd web && npx tsx _tmp_index_mutation.ts --restore
cd web && npx vitest run lib/db/solveRunsSchema.test.ts
```

Expected: PASS. 확인했으면 임시 파일을 지운다:

```bash
cd web && rm _tmp_index_mutation.ts
```

`web/lib/db/schema.ts` 는 이 절차에서 건드리지 않는다 — 스키마를 고치면 마이그레이션과 어긋난다.

- [ ] **Step 7: 개발 DB 에 적용하고 전체 스위트를 돌린다**

```bash
cd web && npx drizzle-kit migrate
cd web && npx vitest run
cd web && npx tsc --noEmit
```

- [ ] **Step 8: 커밋**

```bash
git add web/lib/db/schema.ts web/drizzle web/test/db.ts web/lib/db/solveRunsSchema.test.ts
git commit -m "[ADD] 팀 단위 풀이 진행을 담는 solve_runs 테이블"
```

---

### Task 2: 바퀴 순수 로직

**Files:**
- Create: `web/lib/solve/teamRun.ts`
- Test: `web/lib/solve/teamRun.test.ts`

**Interfaces:**
- Consumes: 없음
- Produces:
  - `type RunResult = { problemId: number; correct: boolean | null }`
  - `isRunFinished(cursor: number, total: number): boolean`
  - `nextCursor(cursor: number, total: number): number`
  - `canAdvance(fromCursor: number, cursor: number): boolean`
  - `summarizeResults(results: RunResult[]): { answeredCount: number; correctCount: number; wrongProblemIds: number[] }`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`web/lib/solve/teamRun.test.ts` 를 새로 만든다:

```typescript
import { describe, it, expect } from "vitest";
import { canAdvance, isRunFinished, nextCursor, summarizeResults } from "./teamRun";

describe("isRunFinished", () => {
  it("위치가 총 개수에 닿으면 끝이다", () => {
    expect(isRunFinished(3, 3)).toBe(true);
    expect(isRunFinished(2, 3)).toBe(false);
  });

  it("총 개수가 0이면 시작하자마자 끝이다", () => {
    expect(isRunFinished(0, 0)).toBe(true);
  });
});

describe("nextCursor", () => {
  it("한 칸 전진한다", () => {
    expect(nextCursor(0, 3)).toBe(1);
  });

  it("총 개수를 넘지 않는다", () => {
    expect(nextCursor(3, 3)).toBe(3);
  });
});

describe("canAdvance", () => {
  it("보낸 위치가 지금 위치와 같을 때만 전진한다", () => {
    expect(canAdvance(2, 2)).toBe(true);
  });

  it("새로고침 뒤 옛 위치를 보내면 전진하지 않는다 — 두 칸 건너뛰기 방지", () => {
    expect(canAdvance(1, 2)).toBe(false);
    expect(canAdvance(3, 2)).toBe(false);
  });
});

describe("summarizeResults", () => {
  it("맞은 개수와 답한 개수를 센다", () => {
    const s = summarizeResults([
      { problemId: 1, correct: true },
      { problemId: 2, correct: false },
      { problemId: 3, correct: true },
    ]);
    expect(s.answeredCount).toBe(3);
    expect(s.correctCount).toBe(2);
    expect(s.wrongProblemIds).toEqual([2]);
  });

  it("건너뛴 문제(correct 가 null)는 어느 쪽으로도 세지 않는다", () => {
    const s = summarizeResults([
      { problemId: 1, correct: true },
      { problemId: 2, correct: null },
      { problemId: 3, correct: false },
    ]);
    expect(s.answeredCount).toBe(2);
    expect(s.correctCount).toBe(1);
    expect(s.wrongProblemIds).toEqual([3]);
  });

  it("빈 목록은 0 이다", () => {
    expect(summarizeResults([])).toEqual({ answeredCount: 0, correctCount: 0, wrongProblemIds: [] });
  });
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인한다**

Run: `cd web && npx vitest run lib/solve/teamRun.test.ts`
Expected: FAIL — `./teamRun` 모듈이 없다.

- [ ] **Step 3: 구현한다**

`web/lib/solve/teamRun.ts` 를 새로 만든다:

```typescript
/**
 * 한 팀을 훑는 "바퀴"의 진행 계산. DB 도 화면도 모르는 순수 함수만 둔다.
 *
 * 문제 줄 세우기는 여기 없다 — SQL 의 ORDER BY 한 곳에만 둔다(lib/db/solveTeams.ts).
 * 같은 규칙을 두 곳에 두면 한쪽만 고치는 사고가 난다.
 */

/** 바퀴에서 한 문제를 지나간 기록. correct 가 null 이면 건너뛴 문제다. */
export type RunResult = { problemId: number; correct: boolean | null };

export function isRunFinished(cursor: number, total: number): boolean {
  return cursor >= total;
}

export function nextCursor(cursor: number, total: number): number {
  return Math.min(cursor + 1, total);
}

/**
 * 화면이 보낸 위치가 지금 위치와 같을 때만 전진한다.
 *
 * 새로고침 뒤 "다음 문제"를 두 번 누르면 두 칸을 건너뛰어 한 문제가 통째로 사라진다.
 * 클라이언트가 자기가 보던 위치를 함께 보내게 하고 여기서 대조해 그것을 막는다.
 */
export function canAdvance(fromCursor: number, cursor: number): boolean {
  return fromCursor === cursor;
}

export function summarizeResults(results: RunResult[]): {
  answeredCount: number;
  correctCount: number;
  wrongProblemIds: number[];
} {
  const answered = results.filter((r) => r.correct !== null);
  return {
    answeredCount: answered.length,
    correctCount: answered.filter((r) => r.correct === true).length,
    wrongProblemIds: answered.filter((r) => r.correct === false).map((r) => r.problemId),
  };
}
```

- [ ] **Step 4: 테스트가 통과하는지 확인한다**

Run: `cd web && npx vitest run lib/solve/teamRun.test.ts`
Expected: PASS (10개)

- [ ] **Step 5: 변이 테스트**

`summarizeResults` 의 `const answered = results.filter((r) => r.correct !== null);` 를 `const answered = results;` 로 잠시 바꾼다.

Run: `cd web && npx vitest run lib/solve/teamRun.test.ts`
Expected: FAIL — "건너뛴 문제(correct 가 null)는 어느 쪽으로도 세지 않는다" 가 깨진다.

되돌리고 다시 PASS 를 확인한다.

- [ ] **Step 6: 커밋**

```bash
git add web/lib/solve/teamRun.ts web/lib/solve/teamRun.test.ts
git commit -m "[ADD] 바퀴 진행 계산 순수 함수"
```

---

### Task 3: 팀·문제 조회

**Files:**
- Create: `web/lib/db/solveTeams.ts`
- Test: `web/lib/db/solveTeams.test.ts`

**Interfaces:**
- Consumes: 없음
- Produces:
  - `type TeamCountRow = { departmentId: number; departmentName: string; totalCount: number }`
  - `findTeamCounts(db: DbConn): Promise<TeamCountRow[]>`
  - `findTeamProblemIds(db: DbConn, departmentId: number): Promise<number[]>`
  - `findWrongProblemIds(db: DbConn, userId: number, departmentId: number): Promise<number[]>`
  - `countWrongByDepartment(db: DbConn, userId: number): Promise<Map<number, number>>`
  - `findSolveRowsByIds(db: DbConn, ids: number[]): Promise<SolveListRow[]>` — `SolveListRow` 는 `lib/db/solveProblems.ts` 가 이미 내보내는 타입이다

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`web/lib/db/solveTeams.test.ts` 를 새로 만든다:

```typescript
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { migrateTestDb, testDb, truncateAll } from "../../test/db";
import { attempts, departments, problems, users } from "./schema";
import {
  countWrongByDepartment, findSolveRowsByIds, findTeamCounts,
  findTeamProblemIds, findWrongProblemIds,
} from "./solveTeams";

const db = testDb();
let planId = 0;
let salesId = 0;
let userId = 0;

beforeAll(async () => { await migrateTestDb(); });
beforeEach(async () => {
  await truncateAll();
  [{ id: planId }] = await db.insert(departments)
    .values({ name: "기획팀", code: "PLAN", status: "ACTIVE" }).returning({ id: departments.id });
  [{ id: salesId }] = await db.insert(departments)
    .values({ name: "영업팀", code: "SALES", status: "ACTIVE" }).returning({ id: departments.id });
  [{ id: userId }] = await db.insert(users).values({
    employeeNo: "emp", name: "직원", email: "e@b.c", passwordHash: "x",
    departmentId: planId, role: "EMPLOYEE", status: "ACTIVE", mustChangePassword: false,
  }).returning({ id: users.id });
});

async function seedProblem(over: Partial<typeof problems.$inferInsert> = {}) {
  const [row] = await db.insert(problems).values({
    type: "OX", content: "본문", departmentId: planId, status: "ACTIVE",
    createdBy: userId, sourceNumber: null, ...over,
  }).returning({ id: problems.id });
  return row.id;
}

async function seedAttempt(problemId: number, isCorrect: boolean, submittedAt: Date) {
  await db.insert(attempts).values({ userId, problemId, isCorrect, submittedAt });
}

describe("findTeamCounts", () => {
  it("부서마다 정상 문제 수를 센다 — 보관된 문제는 빼고", async () => {
    await seedProblem({ sourceNumber: 1 });
    await seedProblem({ sourceNumber: 2, status: "ARCHIVED" });
    await seedProblem({ departmentId: salesId, sourceNumber: 1 });

    const rows = await findTeamCounts(db);
    const plan = rows.find((r) => r.departmentId === planId);
    const sales = rows.find((r) => r.departmentId === salesId);
    expect(plan?.totalCount).toBe(1);
    expect(plan?.departmentName).toBe("기획팀");
    expect(sales?.totalCount).toBe(1);
  });

  it("문제가 하나도 없는 부서도 0 으로 나온다", async () => {
    const rows = await findTeamCounts(db);
    expect(rows.map((r) => r.totalCount)).toEqual([0, 0]);
  });
});

describe("findTeamProblemIds", () => {
  it("문제집 번호 오름차순이고, 번호가 없으면 맨 뒤다", async () => {
    const noNumber = await seedProblem({ sourceNumber: null });
    const three = await seedProblem({ sourceNumber: 3 });
    const one = await seedProblem({ sourceNumber: 1 });

    expect(await findTeamProblemIds(db, planId)).toEqual([one, three, noNumber]);
  });

  it("번호가 같으면 id 오름차순으로 가른다", async () => {
    const first = await seedProblem({ sourceNumber: 5 });
    const second = await seedProblem({ sourceNumber: 5 });
    expect(await findTeamProblemIds(db, planId)).toEqual([first, second]);
  });

  it("보관된 문제와 다른 부서 문제는 빼놓는다", async () => {
    const mine = await seedProblem({ sourceNumber: 1 });
    await seedProblem({ sourceNumber: 2, status: "ARCHIVED" });
    await seedProblem({ sourceNumber: 3, departmentId: salesId });
    expect(await findTeamProblemIds(db, planId)).toEqual([mine]);
  });
});

describe("findWrongProblemIds", () => {
  it("문제마다 가장 마지막 답만 본다 — 틀렸다가 맞히면 빠진다", async () => {
    const fixed = await seedProblem({ sourceNumber: 1 });
    const stillWrong = await seedProblem({ sourceNumber: 2 });
    await seedAttempt(fixed, false, new Date("2026-01-01T00:00:00Z"));
    await seedAttempt(fixed, true, new Date("2026-01-02T00:00:00Z"));
    await seedAttempt(stillWrong, true, new Date("2026-01-01T00:00:00Z"));
    await seedAttempt(stillWrong, false, new Date("2026-01-02T00:00:00Z"));

    expect(await findWrongProblemIds(db, userId, planId)).toEqual([stillWrong]);
  });

  it("같은 시각이면 나중에 들어간 답을 마지막으로 본다", async () => {
    const p = await seedProblem({ sourceNumber: 1 });
    const at = new Date("2026-01-01T00:00:00Z");
    await seedAttempt(p, true, at);
    await seedAttempt(p, false, at);
    expect(await findWrongProblemIds(db, userId, planId)).toEqual([p]);
  });

  it("한 번도 안 푼 문제는 틀린 문제가 아니다", async () => {
    await seedProblem({ sourceNumber: 1 });
    expect(await findWrongProblemIds(db, userId, planId)).toEqual([]);
  });

  it("남이 틀린 것은 세지 않는다", async () => {
    const p = await seedProblem({ sourceNumber: 1 });
    const [other] = await db.insert(users).values({
      employeeNo: "emp2", name: "다른직원", email: "e2@b.c", passwordHash: "x",
      departmentId: planId, role: "EMPLOYEE", status: "ACTIVE", mustChangePassword: false,
    }).returning({ id: users.id });
    await db.insert(attempts)
      .values({ userId: other.id, problemId: p, isCorrect: false, submittedAt: new Date() });
    expect(await findWrongProblemIds(db, userId, planId)).toEqual([]);
  });

  it("번호 순으로 줄 세운다", async () => {
    const three = await seedProblem({ sourceNumber: 3 });
    const one = await seedProblem({ sourceNumber: 1 });
    await seedAttempt(three, false, new Date("2026-01-01T00:00:00Z"));
    await seedAttempt(one, false, new Date("2026-01-01T00:00:00Z"));
    expect(await findWrongProblemIds(db, userId, planId)).toEqual([one, three]);
  });
});

describe("countWrongByDepartment", () => {
  it("부서별 틀린 문제 수를 센다", async () => {
    const a = await seedProblem({ sourceNumber: 1 });
    const b = await seedProblem({ sourceNumber: 2 });
    const c = await seedProblem({ sourceNumber: 1, departmentId: salesId });
    await seedAttempt(a, false, new Date("2026-01-01T00:00:00Z"));
    await seedAttempt(b, false, new Date("2026-01-01T00:00:00Z"));
    await seedAttempt(c, false, new Date("2026-01-01T00:00:00Z"));

    const counts = await countWrongByDepartment(db, userId);
    expect(counts.get(planId)).toBe(2);
    expect(counts.get(salesId)).toBe(1);
  });

  it("틀린 것이 없으면 그 부서는 아예 들어 있지 않다", async () => {
    const a = await seedProblem({ sourceNumber: 1 });
    await seedAttempt(a, true, new Date("2026-01-01T00:00:00Z"));
    const counts = await countWrongByDepartment(db, userId);
    expect(counts.get(planId)).toBeUndefined();
  });
});

describe("findSolveRowsByIds", () => {
  it("넘긴 id 순서 그대로 돌려준다", async () => {
    const one = await seedProblem({ sourceNumber: 1, content: "첫째" });
    const two = await seedProblem({ sourceNumber: 2, content: "둘째" });
    const rows = await findSolveRowsByIds(db, [two, one]);
    expect(rows.map((r) => r.content)).toEqual(["둘째", "첫째"]);
    expect(rows[0].departmentName).toBe("기획팀");
  });

  it("빈 목록이면 빈 배열이다 — SQL 을 쏘지 않는다", async () => {
    expect(await findSolveRowsByIds(db, [])).toEqual([]);
  });
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인한다**

Run: `cd web && npx vitest run lib/db/solveTeams.test.ts`
Expected: FAIL — `./solveTeams` 모듈이 없다.

- [ ] **Step 3: 구현한다**

`web/lib/db/solveTeams.ts` 를 새로 만든다:

```typescript
import { inArray, sql } from "drizzle-orm";
import type { DbConn } from "./client";
import { departments, problems, problemTags, tags } from "./schema";
import type { SolveListRow } from "./solveProblems";

/**
 * 팀 단위 풀이가 쓰는 조회. 문제 줄 세우기 규칙이 사는 유일한 곳이다.
 *
 *   ORDER BY p.source_number ASC NULLS LAST, p.id ASC
 *
 * 종이 문제집 번호 순이되, 번호가 비어 있으면 맨 뒤로 보내고 번호가 겹치면 id 로 가른다.
 * 세 조각이 다 있어야 순서가 한 가지로 정해진다 — 이어 풀기가 성립하려면 매번 같은
 * 줄이 나와야 한다.
 */

export type TeamCountRow = { departmentId: number; departmentName: string; totalCount: number };

export async function findTeamCounts(db: DbConn): Promise<TeamCountRow[]> {
  const rows = await db.execute(sql`
    SELECT d.id::int AS "departmentId", d.name AS "departmentName",
           count(p.id) FILTER (WHERE p.status = 'ACTIVE')::int AS "totalCount"
    FROM departments d
    LEFT JOIN problems p ON p.department_id = d.id
    WHERE d.status = 'ACTIVE'
    GROUP BY d.id, d.name
    ORDER BY d.id
  `);
  return rows as unknown as TeamCountRow[];
}

export async function findTeamProblemIds(db: DbConn, departmentId: number): Promise<number[]> {
  const rows = await db.execute(sql`
    SELECT p.id::int AS id
    FROM problems p
    WHERE p.department_id = ${departmentId} AND p.status = 'ACTIVE'
    ORDER BY p.source_number ASC NULLS LAST, p.id ASC
  `);
  return (rows as unknown as { id: number }[]).map((r) => r.id);
}

/**
 * 문제마다 **가장 마지막에 낸 답**을 골라, 그것이 오답인 문제만 모은다.
 *
 * LATERAL 로 문제 하나당 한 줄만 가져온다. 같은 시각에 제출된 답이 둘이면 id 가 큰 쪽을
 * 나중 것으로 본다 — submitted_at 만으로 정렬하면 순서가 흔들려 답이 오락가락한다.
 */
export async function findWrongProblemIds(
  db: DbConn, userId: number, departmentId: number,
): Promise<number[]> {
  const rows = await db.execute(sql`
    SELECT p.id::int AS id
    FROM problems p
    JOIN LATERAL (
      SELECT a.is_correct
      FROM attempts a
      WHERE a.user_id = ${userId} AND a.problem_id = p.id
      ORDER BY a.submitted_at DESC, a.id DESC
      LIMIT 1
    ) last ON TRUE
    WHERE p.department_id = ${departmentId} AND p.status = 'ACTIVE' AND last.is_correct = false
    ORDER BY p.source_number ASC NULLS LAST, p.id ASC
  `);
  return (rows as unknown as { id: number }[]).map((r) => r.id);
}

/** 팀 목록의 "틀린 문제 N개" 표시용. 부서마다 한 번에 센다(부서 수만큼 질의하지 않는다). */
export async function countWrongByDepartment(
  db: DbConn, userId: number,
): Promise<Map<number, number>> {
  const rows = await db.execute(sql`
    SELECT p.department_id::int AS "departmentId", count(*)::int AS "wrongCount"
    FROM problems p
    JOIN LATERAL (
      SELECT a.is_correct
      FROM attempts a
      WHERE a.user_id = ${userId} AND a.problem_id = p.id
      ORDER BY a.submitted_at DESC, a.id DESC
      LIMIT 1
    ) last ON TRUE
    WHERE p.status = 'ACTIVE' AND last.is_correct = false
    GROUP BY p.department_id
  `);
  const out = new Map<number, number>();
  for (const r of rows as unknown as { departmentId: number; wrongCount: number }[]) {
    out.set(r.departmentId, r.wrongCount);
  }
  return out;
}

const TAG_AGG = sql<string[]>`COALESCE(array_agg(DISTINCT ${tags.name}) FILTER (WHERE ${tags.name} IS NOT NULL), '{}')`;

/**
 * 바퀴에 담긴 문제들의 요약을 **넘긴 id 순서 그대로** 돌려준다.
 *
 * SQL 의 IN 은 순서를 지키지 않으므로 받아서 다시 줄 세운다. 바퀴의 순서는 시작 시점에
 * 확정된 problem_ids 가 진실이고, 이 함수는 그 줄을 흐트러뜨리면 안 된다.
 */
export async function findSolveRowsByIds(db: DbConn, ids: number[]): Promise<SolveListRow[]> {
  if (ids.length === 0) return [];
  const rows = await db
    .select({
      id: problems.id, type: problems.type, content: problems.content,
      departmentName: departments.name, sourceNumber: problems.sourceNumber, tags: TAG_AGG,
    })
    .from(problems)
    .innerJoin(departments, sql`${departments.id} = ${problems.departmentId}`)
    .leftJoin(problemTags, sql`${problemTags.problemId} = ${problems.id}`)
    .leftJoin(tags, sql`${tags.id} = ${problemTags.tagId}`)
    .where(inArray(problems.id, ids))
    .groupBy(problems.id, departments.name);

  const byId = new Map(rows.map((r) => [r.id, r]));
  return ids.map((id) => byId.get(id)).filter((r): r is SolveListRow => r !== undefined);
}
```

- [ ] **Step 4: 테스트가 통과하는지 확인한다**

Run: `cd web && npx vitest run lib/db/solveTeams.test.ts`
Expected: PASS (12개)

- [ ] **Step 5: 변이 테스트 두 가지**

첫째. `findTeamProblemIds` 의 `ORDER BY p.source_number ASC NULLS LAST, p.id ASC` 에서 `NULLS LAST` 를 지운다.
Run: `cd web && npx vitest run lib/db/solveTeams.test.ts`
Expected: FAIL — "번호가 없으면 맨 뒤다" 가 깨진다. 되돌린다.

둘째. `findWrongProblemIds` 의 `ORDER BY a.submitted_at DESC, a.id DESC` 에서 `, a.id DESC` 를 지운다.
Run: 같은 명령
Expected: FAIL — "같은 시각이면 나중에 들어간 답을 마지막으로 본다" 가 깨진다. 되돌린다.

두 변이가 모두 실패를 냈으면 다시 PASS 를 확인한다.

- [ ] **Step 6: 전체 스위트 + 타입 검사 + 커밋**

```bash
cd web && npx vitest run
cd web && npx tsc --noEmit
```

```bash
git add web/lib/db/solveTeams.ts web/lib/db/solveTeams.test.ts
git commit -m "[ADD] 팀별 문제와 틀린 문제 조회"
```

---

### Task 4: 바퀴 저장소

**Files:**
- Create: `web/lib/db/solveRuns.ts`
- Test: `web/lib/db/solveRuns.test.ts`

**Interfaces:**
- Consumes: `RunResult`(Task 2, `lib/solve/teamRun.ts`)
- Produces:
  - `type SolveRunRow = { id: number; userId: number; departmentId: number; mode: "ALL" | "WRONG"; problemIds: number[]; cursor: number; results: RunResult[]; status: "IN_PROGRESS" | "FINISHED" }`
  - `insertRun(db, input: { userId: number; departmentId: number; mode: "ALL" | "WRONG"; problemIds: number[] }): Promise<SolveRunRow>`
  - `findRunById(db, runId: number): Promise<SolveRunRow | null>`
  - `findActiveRun(db, userId: number, departmentId: number): Promise<SolveRunRow | null>`
  - `findLatestFinishedRun(db, userId: number, departmentId: number): Promise<SolveRunRow | null>`
  - `findFinishedDepartmentIds(db, userId: number): Promise<Set<number>>`
  - `updateRunProgress(db, runId: number, patch: { cursor: number; results: RunResult[]; status: "IN_PROGRESS" | "FINISHED" }): Promise<void>`
  - `markRunFinished(db, runId: number): Promise<void>`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`web/lib/db/solveRuns.test.ts` 를 새로 만든다:

```typescript
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { migrateTestDb, testDb, truncateAll } from "../../test/db";
import { departments, users } from "./schema";
import {
  findActiveRun, findFinishedDepartmentIds, findLatestFinishedRun, findRunById,
  insertRun, markRunFinished, updateRunProgress,
} from "./solveRuns";

const db = testDb();
let planId = 0;
let salesId = 0;
let userId = 0;

beforeAll(async () => { await migrateTestDb(); });
beforeEach(async () => {
  await truncateAll();
  [{ id: planId }] = await db.insert(departments)
    .values({ name: "기획팀", code: "PLAN", status: "ACTIVE" }).returning({ id: departments.id });
  [{ id: salesId }] = await db.insert(departments)
    .values({ name: "영업팀", code: "SALES", status: "ACTIVE" }).returning({ id: departments.id });
  [{ id: userId }] = await db.insert(users).values({
    employeeNo: "emp", name: "직원", email: "e@b.c", passwordHash: "x",
    departmentId: planId, role: "EMPLOYEE", status: "ACTIVE", mustChangePassword: false,
  }).returning({ id: users.id });
});

describe("insertRun · findRunById", () => {
  it("만든 바퀴를 다시 읽어 온다", async () => {
    const made = await insertRun(db, { userId, departmentId: planId, mode: "ALL", problemIds: [7, 8] });
    const found = await findRunById(db, made.id);
    expect(found?.problemIds).toEqual([7, 8]);
    expect(found?.mode).toBe("ALL");
    expect(found?.cursor).toBe(0);
    expect(found?.results).toEqual([]);
    expect(found?.status).toBe("IN_PROGRESS");
  });

  it("없는 id 는 null 이다", async () => {
    expect(await findRunById(db, 999999)).toBeNull();
  });
});

describe("findActiveRun", () => {
  it("그 팀의 진행 중인 바퀴를 준다", async () => {
    const made = await insertRun(db, { userId, departmentId: planId, mode: "ALL", problemIds: [1] });
    expect((await findActiveRun(db, userId, planId))?.id).toBe(made.id);
  });

  it("다른 팀의 바퀴는 주지 않는다", async () => {
    await insertRun(db, { userId, departmentId: planId, mode: "ALL", problemIds: [1] });
    expect(await findActiveRun(db, userId, salesId)).toBeNull();
  });

  it("끝난 바퀴는 주지 않는다", async () => {
    const made = await insertRun(db, { userId, departmentId: planId, mode: "ALL", problemIds: [1] });
    await markRunFinished(db, made.id);
    expect(await findActiveRun(db, userId, planId)).toBeNull();
  });
});

describe("findLatestFinishedRun", () => {
  it("끝난 바퀴 중 가장 나중 것을 준다", async () => {
    const first = await insertRun(db, { userId, departmentId: planId, mode: "ALL", problemIds: [1] });
    await markRunFinished(db, first.id);
    const second = await insertRun(db, { userId, departmentId: planId, mode: "WRONG", problemIds: [2] });
    await markRunFinished(db, second.id);
    expect((await findLatestFinishedRun(db, userId, planId))?.id).toBe(second.id);
  });

  it("끝난 바퀴가 없으면 null 이다", async () => {
    await insertRun(db, { userId, departmentId: planId, mode: "ALL", problemIds: [1] });
    expect(await findLatestFinishedRun(db, userId, planId)).toBeNull();
  });
});

describe("findFinishedDepartmentIds", () => {
  it("끝난 바퀴가 있는 부서 id 를 모은다", async () => {
    const a = await insertRun(db, { userId, departmentId: planId, mode: "ALL", problemIds: [1] });
    await markRunFinished(db, a.id);
    await insertRun(db, { userId, departmentId: salesId, mode: "ALL", problemIds: [2] });

    const ids = await findFinishedDepartmentIds(db, userId);
    expect(ids.has(planId)).toBe(true);
    expect(ids.has(salesId)).toBe(false);
  });
});

describe("updateRunProgress", () => {
  it("위치와 결과와 상태를 함께 쓴다", async () => {
    const made = await insertRun(db, { userId, departmentId: planId, mode: "ALL", problemIds: [1, 2] });
    await updateRunProgress(db, made.id, {
      cursor: 1, results: [{ problemId: 1, correct: true }], status: "IN_PROGRESS",
    });
    const found = await findRunById(db, made.id);
    expect(found?.cursor).toBe(1);
    expect(found?.results).toEqual([{ problemId: 1, correct: true }]);
    expect(found?.status).toBe("IN_PROGRESS");
  });

  it("건너뛴 결과(null)도 그대로 저장된다", async () => {
    const made = await insertRun(db, { userId, departmentId: planId, mode: "ALL", problemIds: [1] });
    await updateRunProgress(db, made.id, {
      cursor: 1, results: [{ problemId: 1, correct: null }], status: "FINISHED",
    });
    expect((await findRunById(db, made.id))?.results).toEqual([{ problemId: 1, correct: null }]);
  });

  it("끝으로 표시하면 같은 팀에 새 바퀴를 만들 수 있다", async () => {
    const made = await insertRun(db, { userId, departmentId: planId, mode: "ALL", problemIds: [1] });
    await markRunFinished(db, made.id);
    const next = await insertRun(db, { userId, departmentId: planId, mode: "WRONG", problemIds: [2] });
    expect(next.id).not.toBe(made.id);
  });
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인한다**

Run: `cd web && npx vitest run lib/db/solveRuns.test.ts`
Expected: FAIL — `./solveRuns` 모듈이 없다.

- [ ] **Step 3: 구현한다**

`web/lib/db/solveRuns.ts` 를 새로 만든다:

```typescript
import { and, desc, eq, sql } from "drizzle-orm";
import type { DbConn } from "./client";
import { solveRuns } from "./schema";
import type { RunResult } from "../solve/teamRun";

export type RunMode = "ALL" | "WRONG";
export type RunStatus = "IN_PROGRESS" | "FINISHED";

export type SolveRunRow = {
  id: number;
  userId: number;
  departmentId: number;
  mode: RunMode;
  problemIds: number[];
  cursor: number;
  results: RunResult[];
  status: RunStatus;
};

// drizzle 의 jsonb 는 $type 으로 모양을 알려도 DB 에서 온 값의 실제 검증은 하지 않는다.
// 이 한 곳에서만 좁혀 두면 나머지 코드는 SolveRunRow 만 보면 된다.
function toRow(r: typeof solveRuns.$inferSelect): SolveRunRow {
  return {
    id: r.id,
    userId: r.userId,
    departmentId: r.departmentId,
    mode: r.mode as RunMode,
    problemIds: r.problemIds,
    cursor: r.cursor,
    results: r.results,
    status: r.status as RunStatus,
  };
}

export async function insertRun(
  db: DbConn,
  input: { userId: number; departmentId: number; mode: RunMode; problemIds: number[] },
): Promise<SolveRunRow> {
  const [row] = await db.insert(solveRuns).values({
    userId: input.userId,
    departmentId: input.departmentId,
    mode: input.mode,
    problemIds: input.problemIds,
  }).returning();
  return toRow(row);
}

export async function findRunById(db: DbConn, runId: number): Promise<SolveRunRow | null> {
  const [row] = await db.select().from(solveRuns).where(eq(solveRuns.id, runId)).limit(1);
  return row ? toRow(row) : null;
}

export async function findActiveRun(
  db: DbConn, userId: number, departmentId: number,
): Promise<SolveRunRow | null> {
  const [row] = await db.select().from(solveRuns)
    .where(and(
      eq(solveRuns.userId, userId),
      eq(solveRuns.departmentId, departmentId),
      eq(solveRuns.status, "IN_PROGRESS"),
    ))
    .limit(1);
  return row ? toRow(row) : null;
}

export async function findLatestFinishedRun(
  db: DbConn, userId: number, departmentId: number,
): Promise<SolveRunRow | null> {
  const [row] = await db.select().from(solveRuns)
    .where(and(
      eq(solveRuns.userId, userId),
      eq(solveRuns.departmentId, departmentId),
      eq(solveRuns.status, "FINISHED"),
    ))
    .orderBy(desc(solveRuns.id))
    .limit(1);
  return row ? toRow(row) : null;
}

/** 팀 목록이 "아직 안 풂"과 "틀린 문제 N개"를 가르는 데 쓴다. 부서 수만큼 질의하지 않는다. */
export async function findFinishedDepartmentIds(db: DbConn, userId: number): Promise<Set<number>> {
  const rows = await db.selectDistinct({ departmentId: solveRuns.departmentId })
    .from(solveRuns)
    .where(and(eq(solveRuns.userId, userId), eq(solveRuns.status, "FINISHED")));
  return new Set(rows.map((r) => r.departmentId));
}

export async function updateRunProgress(
  db: DbConn,
  runId: number,
  patch: { cursor: number; results: RunResult[]; status: RunStatus },
): Promise<void> {
  await db.update(solveRuns)
    .set({ cursor: patch.cursor, results: patch.results, status: patch.status, updatedAt: sql`now()` })
    .where(eq(solveRuns.id, runId));
}

export async function markRunFinished(db: DbConn, runId: number): Promise<void> {
  await db.update(solveRuns)
    .set({ status: "FINISHED", updatedAt: sql`now()` })
    .where(eq(solveRuns.id, runId));
}
```

- [ ] **Step 4: 테스트가 통과하는지 확인한다**

Run: `cd web && npx vitest run lib/db/solveRuns.test.ts`
Expected: PASS (11개)

- [ ] **Step 5: 변이 테스트**

`findActiveRun` 의 `eq(solveRuns.status, "IN_PROGRESS"),` 줄을 잠시 지운다.

Run: `cd web && npx vitest run lib/db/solveRuns.test.ts`
Expected: FAIL — "끝난 바퀴는 주지 않는다" 가 깨진다. 되돌리고 다시 PASS 를 확인한다.

- [ ] **Step 6: 전체 스위트 + 타입 검사 + 커밋**

```bash
cd web && npx vitest run
cd web && npx tsc --noEmit
```

```bash
git add web/lib/db/solveRuns.ts web/lib/db/solveRuns.test.ts
git commit -m "[ADD] 바퀴 저장소"
```

---

### Task 5: 바퀴 서비스

**Files:**
- Create: `web/lib/solve/teamRunService.ts`
- Test: `web/lib/solve/teamRunService.test.ts`

**Interfaces:**
- Consumes:
  - `isRunFinished`·`nextCursor`·`canAdvance`·`summarizeResults`·`RunResult`(Task 2)
  - `findTeamCounts`·`findTeamProblemIds`·`findWrongProblemIds`·`countWrongByDepartment`·`findSolveRowsByIds`(Task 3)
  - `insertRun`·`findRunById`·`findActiveRun`·`findLatestFinishedRun`·`findFinishedDepartmentIds`·`updateRunProgress`·`markRunFinished`·`SolveRunRow`·`RunMode`(Task 4)
  - `AuthUser`(`lib/auth/types.ts`) — 필드는 `userId`·`role`·`departmentId` 등
  - `BizError`(`lib/http/errors`), `ErrorCode`(`lib/http/errorCode`)
- Produces:
  - `type TeamListItem = { departmentId: number; departmentName: string; totalCount: number; activeRun: { runId: number; mode: RunMode; cursor: number; total: number } | null; hasFinishedRun: boolean; wrongCount: number }`
  - `type RunView = { runId: number; departmentId: number; departmentName: string; mode: RunMode; cursor: number; total: number; status: RunStatus; problemIds: number[]; problems: SolveListRow[]; results: RunResult[]; answeredCount: number; correctCount: number }`
  - **`problemIds` 가 순서의 진실이고 `problems` 는 조회용 곁들이다.** 화면은 `problemIds[cursor]` 로 지금 문제를 정해야 한다 — `problems[cursor]` 를 쓰면 안 된다. 문제가 지워지면 `problems` 가 짧아져 위치가 한 칸씩 밀린다.
  - `listTeams(db, actor): Promise<TeamListItem[]>`
  - `startRun(db, actor, departmentId: number, mode: RunMode): Promise<RunView>`
  - `advanceRun(db, actor, runId: number, fromCursor: number, correct: boolean | null): Promise<{ cursor: number; status: RunStatus; total: number }>`
  - `finishRun(db, actor, runId: number): Promise<{ runId: number; status: RunStatus }>`
  - `getRunView(db, actor, runId: number): Promise<RunView>`
  - `NO_PROBLEMS_MESSAGE`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`web/lib/solve/teamRunService.test.ts` 를 새로 만든다:

```typescript
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { eq } from "drizzle-orm";
import { migrateTestDb, testDb, truncateAll } from "../../test/db";
import { attempts, departments, problems, users } from "../db/schema";
import type { AuthUser } from "../auth/types";
import {
  advanceRun, finishRun, getRunView, listTeams, startRun, NO_PROBLEMS_MESSAGE,
} from "./teamRunService";

const db = testDb();
let planId = 0;
let salesId = 0;
let actor: AuthUser;
let other: AuthUser;

beforeAll(async () => { await migrateTestDb(); });
beforeEach(async () => {
  await truncateAll();
  [{ id: planId }] = await db.insert(departments)
    .values({ name: "기획팀", code: "PLAN", status: "ACTIVE" }).returning({ id: departments.id });
  [{ id: salesId }] = await db.insert(departments)
    .values({ name: "영업팀", code: "SALES", status: "ACTIVE" }).returning({ id: departments.id });
  const [me] = await db.insert(users).values({
    employeeNo: "emp", name: "직원", email: "e@b.c", passwordHash: "x",
    departmentId: planId, role: "EMPLOYEE", status: "ACTIVE", mustChangePassword: false,
  }).returning({ id: users.id });
  const [you] = await db.insert(users).values({
    employeeNo: "emp2", name: "다른직원", email: "e2@b.c", passwordHash: "x",
    departmentId: planId, role: "EMPLOYEE", status: "ACTIVE", mustChangePassword: false,
  }).returning({ id: users.id });
  actor = { userId: me.id, employeeNo: "emp", name: "직원", role: "EMPLOYEE", departmentId: planId, mustChangePassword: false };
  other = { userId: you.id, employeeNo: "emp2", name: "다른직원", role: "EMPLOYEE", departmentId: planId, mustChangePassword: false };
});

async function seedProblem(sourceNumber: number, over: Partial<typeof problems.$inferInsert> = {}) {
  const [row] = await db.insert(problems).values({
    type: "OX", content: `${sourceNumber}번 문제`, departmentId: planId, status: "ACTIVE",
    createdBy: actor.userId, sourceNumber, ...over,
  }).returning({ id: problems.id });
  return row.id;
}

describe("listTeams", () => {
  it("바퀴가 없으면 activeRun 은 null 이고 끝난 바퀴도 없다", async () => {
    await seedProblem(1);
    const teams = await listTeams(db, actor);
    const plan = teams.find((t) => t.departmentId === planId);
    expect(plan?.totalCount).toBe(1);
    expect(plan?.activeRun).toBeNull();
    expect(plan?.hasFinishedRun).toBe(false);
    expect(plan?.wrongCount).toBe(0);
  });

  it("진행 중인 바퀴를 위치와 총 개수로 알려준다", async () => {
    await seedProblem(1);
    await seedProblem(2);
    const run = await startRun(db, actor, planId, "ALL");
    await advanceRun(db, actor, run.runId, 0, true);

    const plan = (await listTeams(db, actor)).find((t) => t.departmentId === planId);
    expect(plan?.activeRun).toEqual({ runId: run.runId, mode: "ALL", cursor: 1, total: 2 });
  });

  it("끝낸 뒤에는 hasFinishedRun 이 참이고 틀린 문제 수가 나온다", async () => {
    const a = await seedProblem(1);
    await seedProblem(2);
    const run = await startRun(db, actor, planId, "ALL");
    await advanceRun(db, actor, run.runId, 0, false);
    await advanceRun(db, actor, run.runId, 1, true);
    await db.insert(attempts)
      .values({ userId: actor.userId, problemId: a, isCorrect: false, submittedAt: new Date() });

    const plan = (await listTeams(db, actor)).find((t) => t.departmentId === planId);
    expect(plan?.activeRun).toBeNull();
    expect(plan?.hasFinishedRun).toBe(true);
    expect(plan?.wrongCount).toBe(1);
  });
});

describe("startRun", () => {
  it("전체 모드는 팀 문제를 번호 순으로 담는다", async () => {
    const two = await seedProblem(2);
    const one = await seedProblem(1);
    const run = await startRun(db, actor, planId, "ALL");
    expect(run.total).toBe(2);
    expect(run.problemIds).toEqual([one, two]);
    expect(run.problems.map((p) => p.id)).toEqual([one, two]);
    expect(run.cursor).toBe(0);
    expect(run.status).toBe("IN_PROGRESS");
  });

  it("problemIds 는 문제 행이 사라져도 그대로다 — 화면이 위치를 여기서 정한다", async () => {
    const one = await seedProblem(1);
    const two = await seedProblem(2);
    const run = await startRun(db, actor, planId, "ALL");
    // 문제 하나를 지운다(실무에서는 드물지만, 지워지면 problems 만 짧아진다).
    await db.delete(problems).where(eq(problems.id, one));

    const view = await getRunView(db, actor, run.runId);
    expect(view.problemIds).toEqual([one, two]);
    expect(view.problems.map((p) => p.id)).toEqual([two]);
    expect(view.total).toBe(2);
  });

  it("틀린 것만 모드는 마지막 답이 오답인 문제만 담는다", async () => {
    const wrong = await seedProblem(1);
    const right = await seedProblem(2);
    await db.insert(attempts).values([
      { userId: actor.userId, problemId: wrong, isCorrect: false, submittedAt: new Date("2026-01-01T00:00:00Z") },
      { userId: actor.userId, problemId: right, isCorrect: true, submittedAt: new Date("2026-01-01T00:00:00Z") },
    ]);
    const run = await startRun(db, actor, planId, "WRONG");
    expect(run.problems.map((p) => p.id)).toEqual([wrong]);
    expect(run.mode).toBe("WRONG");
  });

  it("진행 중인 바퀴가 있으면 새로 만들지 않고 그것을 돌려준다", async () => {
    await seedProblem(1);
    await seedProblem(2);
    const first = await startRun(db, actor, planId, "ALL");
    await advanceRun(db, actor, first.runId, 0, true);

    const again = await startRun(db, actor, planId, "WRONG");
    expect(again.runId).toBe(first.runId);
    expect(again.mode).toBe("ALL");
    expect(again.cursor).toBe(1);
  });

  it("담을 문제가 없으면 거절한다", async () => {
    await expect(startRun(db, actor, planId, "ALL")).rejects.toThrow(NO_PROBLEMS_MESSAGE);
  });

  it("틀린 문제가 없으면 복습 바퀴를 만들지 않는다", async () => {
    await seedProblem(1);
    await expect(startRun(db, actor, planId, "WRONG")).rejects.toThrow(NO_PROBLEMS_MESSAGE);
  });
});

describe("advanceRun", () => {
  it("한 칸 전진하며 결과를 쌓는다", async () => {
    const one = await seedProblem(1);
    await seedProblem(2);
    const run = await startRun(db, actor, planId, "ALL");

    const after = await advanceRun(db, actor, run.runId, 0, true);
    expect(after).toEqual({ cursor: 1, status: "IN_PROGRESS", total: 2 });
    expect((await getRunView(db, actor, run.runId)).results).toEqual([{ problemId: one, correct: true }]);
  });

  it("마지막 문제를 지나면 끝난다", async () => {
    await seedProblem(1);
    const run = await startRun(db, actor, planId, "ALL");
    const after = await advanceRun(db, actor, run.runId, 0, true);
    expect(after.status).toBe("FINISHED");
  });

  it("보낸 위치가 어긋나면 아무것도 하지 않는다 — 두 칸 건너뛰기 방지", async () => {
    await seedProblem(1);
    await seedProblem(2);
    const run = await startRun(db, actor, planId, "ALL");
    await advanceRun(db, actor, run.runId, 0, true);

    const again = await advanceRun(db, actor, run.runId, 0, true);
    expect(again.cursor).toBe(1);
    expect((await getRunView(db, actor, run.runId)).results).toHaveLength(1);
  });

  it("건너뛴 문제는 정답에도 오답에도 세지 않는다", async () => {
    await seedProblem(1);
    await seedProblem(2);
    const run = await startRun(db, actor, planId, "ALL");
    await advanceRun(db, actor, run.runId, 0, null);
    await advanceRun(db, actor, run.runId, 1, true);

    const view = await getRunView(db, actor, run.runId);
    expect(view.answeredCount).toBe(1);
    expect(view.correctCount).toBe(1);
  });

  it("남의 바퀴는 전진시킬 수 없다", async () => {
    await seedProblem(1);
    const run = await startRun(db, actor, planId, "ALL");
    await expect(advanceRun(db, other, run.runId, 0, true)).rejects.toThrow();
  });
});

describe("finishRun", () => {
  it("중간에 그만두면 끝난 바퀴가 되고 같은 팀을 다시 시작할 수 있다", async () => {
    await seedProblem(1);
    await seedProblem(2);
    const run = await startRun(db, actor, planId, "ALL");
    await finishRun(db, actor, run.runId);

    const next = await startRun(db, actor, planId, "ALL");
    expect(next.runId).not.toBe(run.runId);
    expect(next.cursor).toBe(0);
  });

  it("남의 바퀴는 끝낼 수 없다", async () => {
    await seedProblem(1);
    const run = await startRun(db, actor, planId, "ALL");
    await expect(finishRun(db, other, run.runId)).rejects.toThrow();
  });
});

describe("복습 고리", () => {
  it("복습에서 맞힌 문제는 다음 복습 대상에서 빠진다", async () => {
    const a = await seedProblem(1);
    const b = await seedProblem(2);
    await db.insert(attempts).values([
      { userId: actor.userId, problemId: a, isCorrect: false, submittedAt: new Date("2026-01-01T00:00:00Z") },
      { userId: actor.userId, problemId: b, isCorrect: false, submittedAt: new Date("2026-01-01T00:00:00Z") },
    ]);

    const first = await startRun(db, actor, planId, "WRONG");
    expect(first.problems.map((p) => p.id)).toEqual([a, b]);
    await finishRun(db, actor, first.runId);

    // a 를 맞혔다고 기록한다(실제로는 제출 창구가 남긴다).
    await db.insert(attempts)
      .values({ userId: actor.userId, problemId: a, isCorrect: true, submittedAt: new Date("2026-01-02T00:00:00Z") });

    const second = await startRun(db, actor, planId, "WRONG");
    expect(second.problems.map((p) => p.id)).toEqual([b]);
  });
});

describe("getRunView", () => {
  it("남의 바퀴는 볼 수 없다", async () => {
    await seedProblem(1);
    const run = await startRun(db, actor, planId, "ALL");
    await expect(getRunView(db, other, run.runId)).rejects.toThrow();
  });

  it("없는 바퀴는 거절한다", async () => {
    await expect(getRunView(db, actor, 999999)).rejects.toThrow();
  });
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인한다**

Run: `cd web && npx vitest run lib/solve/teamRunService.test.ts`
Expected: FAIL — `./teamRunService` 모듈이 없다.

- [ ] **Step 3: 구현한다**

`web/lib/solve/teamRunService.ts` 를 새로 만든다:

```typescript
import type { DbConn } from "../db/client";
import type { SolveListRow } from "../db/solveProblems";
import {
  countWrongByDepartment, findSolveRowsByIds, findTeamCounts,
  findTeamProblemIds, findWrongProblemIds,
} from "../db/solveTeams";
import {
  findActiveRun, findFinishedDepartmentIds, findRunById, insertRun,
  markRunFinished, updateRunProgress,
  type RunMode, type RunStatus, type SolveRunRow,
} from "../db/solveRuns";
import { canAdvance, isRunFinished, nextCursor, summarizeResults, type RunResult } from "./teamRun";
import type { AuthUser } from "../auth/types";
import { BizError } from "../http/errors";
import { ErrorCode } from "../http/errorCode";

/** 바퀴에 담을 문제가 하나도 없을 때. 전체 모드와 복습 모드가 같은 문구를 쓴다. */
export const NO_PROBLEMS_MESSAGE = "풀 문제가 없습니다.";

export type TeamListItem = {
  departmentId: number;
  departmentName: string;
  totalCount: number;
  activeRun: { runId: number; mode: RunMode; cursor: number; total: number } | null;
  hasFinishedRun: boolean;
  wrongCount: number;
};

export type RunView = {
  runId: number;
  departmentId: number;
  departmentName: string;
  mode: RunMode;
  cursor: number;
  total: number;
  status: RunStatus;
  /**
   * 순서의 진실. 화면은 problemIds[cursor] 로 지금 문제를 정한다.
   *
   * problems 로 위치를 정하면 안 된다 — 문제 행이 지워지면 problems 만 짧아져 위치가
   * 한 칸씩 밀리고, 그때부터 다른 문제가 나온다.
   */
  problemIds: number[];
  problems: SolveListRow[];
  results: RunResult[];
  answeredCount: number;
  correctCount: number;
};

/**
 * 팀 목록. 부서 수만큼 질의하지 않는다 — 개수·틀린 수·끝난 부서를 각각 한 번에 읽어
 * 메모리에서 맞춘다. 진행 중인 바퀴만 부서별로 따로 읽는데, 한 사람에게 진행 중인
 * 바퀴는 팀당 하나뿐이라 양이 작다.
 */
export async function listTeams(db: DbConn, actor: AuthUser): Promise<TeamListItem[]> {
  const counts = await findTeamCounts(db);
  const wrongByDept = await countWrongByDepartment(db, actor.userId);
  const finishedDeptIds = await findFinishedDepartmentIds(db, actor.userId);

  const items: TeamListItem[] = [];
  for (const c of counts) {
    const active = await findActiveRun(db, actor.userId, c.departmentId);
    items.push({
      departmentId: c.departmentId,
      departmentName: c.departmentName,
      totalCount: c.totalCount,
      activeRun: active
        ? { runId: active.id, mode: active.mode, cursor: active.cursor, total: active.problemIds.length }
        : null,
      hasFinishedRun: finishedDeptIds.has(c.departmentId),
      wrongCount: wrongByDept.get(c.departmentId) ?? 0,
    });
  }
  return items;
}

/**
 * 바퀴를 시작한다.
 *
 * 진행 중인 바퀴가 있으면 **모드와 무관하게 그것을 그대로 돌려준다.** 두 탭에서 동시에
 * 눌러도 유니크 인덱스 충돌이 사용자에게 오류로 보이지 않게 하려는 것이고, 진행 중인
 * 진도를 새 바퀴로 덮어쓰지 않으려는 것이기도 하다.
 */
export async function startRun(
  db: DbConn, actor: AuthUser, departmentId: number, mode: RunMode,
): Promise<RunView> {
  const active = await findActiveRun(db, actor.userId, departmentId);
  if (active) return toRunView(db, active);

  const problemIds = mode === "WRONG"
    ? await findWrongProblemIds(db, actor.userId, departmentId)
    : await findTeamProblemIds(db, departmentId);

  if (problemIds.length === 0) {
    throw new BizError(ErrorCode.INPUT_VALUE_INVALID, NO_PROBLEMS_MESSAGE);
  }

  const created = await insertRun(db, { userId: actor.userId, departmentId, mode, problemIds });
  return toRunView(db, created);
}

export async function advanceRun(
  db: DbConn, actor: AuthUser, runId: number, fromCursor: number, correct: boolean | null,
): Promise<{ cursor: number; status: RunStatus; total: number }> {
  const run = await requireOwnRun(db, actor, runId);
  const total = run.problemIds.length;

  // 이미 끝난 바퀴이거나 보낸 위치가 어긋나면 아무것도 하지 않고 지금 상태를 돌려준다.
  if (run.status === "FINISHED" || !canAdvance(fromCursor, run.cursor)) {
    return { cursor: run.cursor, status: run.status, total };
  }

  const problemId = run.problemIds[run.cursor];
  const results = [...run.results, { problemId, correct }];
  const cursor = nextCursor(run.cursor, total);
  const status: RunStatus = isRunFinished(cursor, total) ? "FINISHED" : "IN_PROGRESS";

  await updateRunProgress(db, runId, { cursor, results, status });
  return { cursor, status, total };
}

/**
 * 바퀴를 지금까지 푼 만큼만 남기고 끝낸다. 진행 화면의 "여기서 그만두고 결과 보기" 가 쓴다.
 *
 * 이 창구가 없으면 중간에 나간 바퀴가 영원히 진행 중으로 남아, 유니크 인덱스 때문에
 * 그 팀을 다시 시작할 수 없다.
 */
export async function finishRun(
  db: DbConn, actor: AuthUser, runId: number,
): Promise<{ runId: number; status: RunStatus }> {
  await requireOwnRun(db, actor, runId);
  await markRunFinished(db, runId);
  return { runId, status: "FINISHED" };
}

export async function getRunView(db: DbConn, actor: AuthUser, runId: number): Promise<RunView> {
  return toRunView(db, await requireOwnRun(db, actor, runId));
}

async function requireOwnRun(db: DbConn, actor: AuthUser, runId: number): Promise<SolveRunRow> {
  const run = await findRunById(db, runId);
  // 없는 바퀴와 남의 바퀴를 같은 문구로 거절한다 — id 를 훑어 남의 바퀴 존재를 알아내는
  // 길을 열지 않는다.
  if (!run || run.userId !== actor.userId) {
    throw new BizError(ErrorCode.ACCESS_AUTH_DENIED, ErrorCode.ACCESS_AUTH_DENIED.message);
  }
  return run;
}

async function toRunView(db: DbConn, run: SolveRunRow): Promise<RunView> {
  const problems = await findSolveRowsByIds(db, run.problemIds);
  const summary = summarizeResults(run.results);
  return {
    runId: run.id,
    departmentId: run.departmentId,
    // 바퀴의 문제는 모두 같은 부서라 첫 행의 부서명이 곧 팀 이름이다.
    departmentName: problems[0]?.departmentName ?? "",
    mode: run.mode,
    cursor: run.cursor,
    total: run.problemIds.length,
    status: run.status,
    problemIds: run.problemIds,
    problems,
    results: run.results,
    answeredCount: summary.answeredCount,
    correctCount: summary.correctCount,
  };
}
```

- [ ] **Step 4: 테스트가 통과하는지 확인한다**

Run: `cd web && npx vitest run lib/solve/teamRunService.test.ts`
Expected: PASS (16개)

- [ ] **Step 5: 변이 테스트 두 가지**

첫째. `advanceRun` 의 `if (run.status === "FINISHED" || !canAdvance(fromCursor, run.cursor)) {` 를 `if (run.status === "FINISHED") {` 로 바꾼다.
Run: `cd web && npx vitest run lib/solve/teamRunService.test.ts`
Expected: FAIL — "보낸 위치가 어긋나면 아무것도 하지 않는다" 가 깨진다. 되돌린다.

둘째. `startRun` 의 `if (active) return toRunView(db, active);` 를 지운다.
Run: 같은 명령
Expected: FAIL — "진행 중인 바퀴가 있으면 새로 만들지 않고 그것을 돌려준다" 가 깨진다(유니크 인덱스 위반으로 던진다). 되돌리고 다시 PASS 를 확인한다.

- [ ] **Step 6: 전체 스위트 + 타입 검사 + 커밋**

```bash
cd web && npx vitest run
cd web && npx tsc --noEmit
```

```bash
git add web/lib/solve/teamRunService.ts web/lib/solve/teamRunService.test.ts
git commit -m "[ADD] 팀 바퀴 시작·전진·종료 서비스"
```

---

### Task 6: API 라우트

**Files:**
- Create: `web/app/api/solve/teams/route.ts`
- Create: `web/app/api/solve/teams/[departmentId]/runs/route.ts`
- Create: `web/app/api/solve/runs/[runId]/route.ts`
- Create: `web/app/api/solve/runs/[runId]/advance/route.ts`
- Create: `web/app/api/solve/runs/[runId]/finish/route.ts`
- Create: `web/lib/solve/teamRunRequestBody.ts`
- Test: `web/lib/solve/teamRunRequestBody.test.ts`

**Interfaces:**
- Consumes: `listTeams`·`startRun`·`advanceRun`·`finishRun`·`getRunView`·`RunMode`(Task 5)
- Produces:
  - `toStartRunBody(raw: Record<string, unknown>): { mode: RunMode }`
  - `toAdvanceBody(raw: Record<string, unknown>): { fromCursor: number; correct: boolean | null }`

- [ ] **Step 1: 본문 파서의 실패하는 테스트를 쓴다**

`web/lib/solve/teamRunRequestBody.test.ts` 를 새로 만든다:

```typescript
import { describe, it, expect } from "vitest";
import { toAdvanceBody, toStartRunBody } from "./teamRunRequestBody";

describe("toStartRunBody", () => {
  it("ALL 과 WRONG 만 받는다", () => {
    expect(toStartRunBody({ mode: "ALL" })).toEqual({ mode: "ALL" });
    expect(toStartRunBody({ mode: "WRONG" })).toEqual({ mode: "WRONG" });
  });

  it("모르는 모드는 거절한다", () => {
    expect(() => toStartRunBody({ mode: "SOMETHING" })).toThrow();
    expect(() => toStartRunBody({})).toThrow();
  });
});

describe("toAdvanceBody", () => {
  it("위치와 정답 여부를 읽는다", () => {
    expect(toAdvanceBody({ fromCursor: 2, correct: true })).toEqual({ fromCursor: 2, correct: true });
    expect(toAdvanceBody({ fromCursor: 0, correct: false })).toEqual({ fromCursor: 0, correct: false });
  });

  it("건너뛴 문제는 correct 가 null 이다", () => {
    expect(toAdvanceBody({ fromCursor: 1, correct: null })).toEqual({ fromCursor: 1, correct: null });
  });

  it("correct 를 안 보내면 건너뛴 것으로 본다", () => {
    expect(toAdvanceBody({ fromCursor: 1 })).toEqual({ fromCursor: 1, correct: null });
  });

  it("위치가 정수가 아니면 거절한다", () => {
    expect(() => toAdvanceBody({ fromCursor: "둘", correct: true })).toThrow();
    expect(() => toAdvanceBody({ fromCursor: 1.5, correct: true })).toThrow();
    expect(() => toAdvanceBody({ correct: true })).toThrow();
  });

  it("정답 여부가 참거짓이 아니면 거절한다", () => {
    expect(() => toAdvanceBody({ fromCursor: 0, correct: "yes" })).toThrow();
  });
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인한다**

Run: `cd web && npx vitest run lib/solve/teamRunRequestBody.test.ts`
Expected: FAIL — `./teamRunRequestBody` 모듈이 없다.

- [ ] **Step 3: 본문 파서를 구현한다**

`web/lib/solve/teamRunRequestBody.ts` 를 새로 만든다:

```typescript
import { MessageNotReadableError } from "../http/errors";
import type { RunMode } from "../db/solveRuns";

/**
 * 팀 바퀴 창구의 JSON 본문 파서.
 *
 * 값이 이상하면 MessageNotReadableError 를 던진다 — 다른 라우트들과 같은 규칙이라
 * handleRoute 가 같은 모양의 응답으로 바꾼다(lib/solve/attemptRequestBody.ts 참고).
 */

const MODES: RunMode[] = ["ALL", "WRONG"];

export function toStartRunBody(raw: Record<string, unknown>): { mode: RunMode } {
  const mode = raw.mode;
  if (typeof mode !== "string" || !MODES.includes(mode as RunMode)) {
    throw new MessageNotReadableError("mode 는 ALL 또는 WRONG 이어야 합니다");
  }
  return { mode: mode as RunMode };
}

export function toAdvanceBody(
  raw: Record<string, unknown>,
): { fromCursor: number; correct: boolean | null } {
  const fromCursor = raw.fromCursor;
  if (typeof fromCursor !== "number" || !Number.isInteger(fromCursor) || fromCursor < 0) {
    throw new MessageNotReadableError("fromCursor 는 0 이상의 정수여야 합니다");
  }
  // 없거나 null 이면 건너뛴 문제로 본다. 참거짓이 아닌 값은 오타이므로 거절한다.
  const correct = raw.correct;
  if (correct === undefined || correct === null) return { fromCursor, correct: null };
  if (typeof correct !== "boolean") {
    throw new MessageNotReadableError("correct 는 참거짓 또는 null 이어야 합니다");
  }
  return { fromCursor, correct };
}
```

- [ ] **Step 4: 테스트가 통과하는지 확인한다**

Run: `cd web && npx vitest run lib/solve/teamRunRequestBody.test.ts`
Expected: PASS (8개)

- [ ] **Step 5: 라우트 다섯 개를 만든다**

`web/app/api/solve/teams/route.ts`:

```typescript
import { getDb } from "@/lib/db/client";
import { handleRoute } from "@/lib/http/errors";
import { requireActor } from "@/lib/auth/currentUser";
import { listTeams } from "@/lib/solve/teamRunService";

export const runtime = "nodejs";

// 역할 제한이 없다 — 로그인만 하면 전 부서 팀 목록을 본다(직원은 전 부서 문제를 본다).
export async function GET(): Promise<Response> {
  return handleRoute(async () => {
    const actor = await requireActor();
    return listTeams(getDb(), actor);
  });
}
```

`web/app/api/solve/teams/[departmentId]/runs/route.ts`:

```typescript
import { getDb } from "@/lib/db/client";
import { handleRoute } from "@/lib/http/errors";
import { readJsonStrict } from "@/lib/http/body";
import { parseNumericParam } from "@/lib/http/params";
import { requireActor } from "@/lib/auth/currentUser";
import { toStartRunBody } from "@/lib/solve/teamRunRequestBody";
import { startRun } from "@/lib/solve/teamRunService";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  context: { params: Promise<{ departmentId: string }> },
): Promise<Response> {
  return handleRoute(async () => {
    const actor = await requireActor();
    const { departmentId } = await context.params;
    // 경로변수 파싱 → 본문 읽기 → 서비스 순서다. 다른 라우트와 같은 순서를 지킨다.
    const parsed = parseNumericParam(departmentId, "departmentId")!;
    const body = toStartRunBody(await readJsonStrict(request));
    return startRun(getDb(), actor, parsed, body.mode);
  });
}
```

`web/app/api/solve/runs/[runId]/route.ts`:

```typescript
import { getDb } from "@/lib/db/client";
import { handleRoute } from "@/lib/http/errors";
import { parseNumericParam } from "@/lib/http/params";
import { requireActor } from "@/lib/auth/currentUser";
import { getRunView } from "@/lib/solve/teamRunService";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  context: { params: Promise<{ runId: string }> },
): Promise<Response> {
  return handleRoute(async () => {
    const actor = await requireActor();
    const { runId } = await context.params;
    return getRunView(getDb(), actor, parseNumericParam(runId, "runId")!);
  });
}
```

`web/app/api/solve/runs/[runId]/advance/route.ts`:

```typescript
import { getDb } from "@/lib/db/client";
import { handleRoute } from "@/lib/http/errors";
import { readJsonStrict } from "@/lib/http/body";
import { parseNumericParam } from "@/lib/http/params";
import { requireActor } from "@/lib/auth/currentUser";
import { toAdvanceBody } from "@/lib/solve/teamRunRequestBody";
import { advanceRun } from "@/lib/solve/teamRunService";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  context: { params: Promise<{ runId: string }> },
): Promise<Response> {
  return handleRoute(async () => {
    const actor = await requireActor();
    const { runId } = await context.params;
    const parsed = parseNumericParam(runId, "runId")!;
    const body = toAdvanceBody(await readJsonStrict(request));
    return advanceRun(getDb(), actor, parsed, body.fromCursor, body.correct);
  });
}
```

`web/app/api/solve/runs/[runId]/finish/route.ts`:

```typescript
import { getDb } from "@/lib/db/client";
import { handleRoute } from "@/lib/http/errors";
import { parseNumericParam } from "@/lib/http/params";
import { requireActor } from "@/lib/auth/currentUser";
import { finishRun } from "@/lib/solve/teamRunService";

export const runtime = "nodejs";

// 본문이 없다 — 끝내는 데 더 필요한 값이 없다.
export async function POST(
  _request: Request,
  context: { params: Promise<{ runId: string }> },
): Promise<Response> {
  return handleRoute(async () => {
    const actor = await requireActor();
    const { runId } = await context.params;
    return finishRun(getDb(), actor, parseNumericParam(runId, "runId")!);
  });
}
```

- [ ] **Step 6: 전체 스위트 + 타입 검사 + 커밋**

```bash
cd web && npx vitest run
cd web && npx tsc --noEmit
```

```bash
git add web/app/api/solve web/lib/solve/teamRunRequestBody.ts web/lib/solve/teamRunRequestBody.test.ts
git commit -m "[ADD] 팀 바퀴 API 라우트"
```

---

### Task 7: API 클라이언트와 팀 목록 화면

**Files:**
- Create: `web/apiClient/teamRuns.js`
- Create: `web/screens/solve/SolveTeamListPage.jsx`
- Modify: `web/app/(protected)/solve/problems/page.tsx`
- Create: `web/utils/teamRunLabel.js`
- Test: `web/utils/teamRunLabel.test.js`

**Interfaces:**
- Consumes: Task 6 의 다섯 창구
- Produces:
  - `listTeams()`·`startTeamRun(departmentId, mode)`·`getRun(runId)`·`advanceRun(runId, fromCursor, correct)`·`finishRun(runId)` — `apiClient/teamRuns.js`
  - `teamStateLabel(team): { text: string; kind: "progress" | "wrong" | "none" }` — `utils/teamRunLabel.js`

- [ ] **Step 1: 표시 문구의 실패하는 테스트를 쓴다**

`web/utils/teamRunLabel.test.js` 를 새로 만든다:

```javascript
import { describe, it, expect } from "vitest";
import { teamStateLabel } from "./teamRunLabel.js";

describe("teamStateLabel", () => {
  it("진행 중이면 위치와 총 개수를 적는다", () => {
    const team = { activeRun: { cursor: 12, total: 30 }, hasFinishedRun: false, wrongCount: 0 };
    expect(teamStateLabel(team)).toEqual({ text: "12 / 30 진행 중", kind: "progress" });
  });

  it("끝난 바퀴가 있으면 지금 틀린 문제 수를 적는다", () => {
    const team = { activeRun: null, hasFinishedRun: true, wrongCount: 8 };
    expect(teamStateLabel(team)).toEqual({ text: "틀린 문제 8개", kind: "wrong" });
  });

  it("끝냈고 틀린 것이 없으면 0개로 적는다", () => {
    const team = { activeRun: null, hasFinishedRun: true, wrongCount: 0 };
    expect(teamStateLabel(team)).toEqual({ text: "틀린 문제 0개", kind: "wrong" });
  });

  it("바퀴가 없으면 아직 안 풂이다", () => {
    const team = { activeRun: null, hasFinishedRun: false, wrongCount: 0 };
    expect(teamStateLabel(team)).toEqual({ text: "아직 안 풂", kind: "none" });
  });

  it("진행 중이 끝난 바퀴보다 앞선다", () => {
    const team = { activeRun: { cursor: 3, total: 10 }, hasFinishedRun: true, wrongCount: 5 };
    expect(teamStateLabel(team).kind).toBe("progress");
  });
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인한다**

Run: `cd web && npx vitest run utils/teamRunLabel.test.js`
Expected: FAIL — `./teamRunLabel.js` 가 없다.

- [ ] **Step 3: 구현한다**

`web/utils/teamRunLabel.js` 를 새로 만든다:

```javascript
/**
 * 팀 목록 한 줄의 상태 문구.
 *
 * 끝난 바퀴에 "다 풀었음"이나 마지막 성적을 적지 않는 이유가 있다. 중간에 그만둔 바퀴도
 * 끝난 바퀴라 "다 풀었음"은 사실과 다를 수 있고, 마지막 성적을 적으면 복습 바퀴가
 * 마지막일 때 분모가 팀 전체와 달라져(8문제짜리 복습이면 "5 / 8") 무슨 숫자인지 알 수
 * 없다. 지금 틀린 문제 수는 어느 바퀴를 마지막에 돌았든 뜻이 같고, 복습 버튼을 눌렀을
 * 때 나올 개수와 정확히 일치한다.
 */
export function teamStateLabel(team) {
  if (team.activeRun) {
    return { text: `${team.activeRun.cursor} / ${team.activeRun.total} 진행 중`, kind: "progress" };
  }
  if (team.hasFinishedRun) {
    return { text: `틀린 문제 ${team.wrongCount}개`, kind: "wrong" };
  }
  return { text: "아직 안 풂", kind: "none" };
}
```

- [ ] **Step 4: 테스트가 통과하는지 확인한다**

Run: `cd web && npx vitest run utils/teamRunLabel.test.js`
Expected: PASS (5개)

- [ ] **Step 5: API 클라이언트를 만든다**

`web/apiClient/teamRuns.js` 를 새로 만든다:

```javascript
import { apiGet, apiPost } from "@/apiClient/client.js";

export function listTeams() {
  return apiGet("/api/solve/teams");
}

export function startTeamRun(departmentId, mode) {
  return apiPost(`/api/solve/teams/${departmentId}/runs`, { mode });
}

export function getRun(runId) {
  return apiGet(`/api/solve/runs/${runId}`);
}

export function advanceRun(runId, fromCursor, correct) {
  return apiPost(`/api/solve/runs/${runId}/advance`, { fromCursor, correct });
}

export function finishRun(runId) {
  return apiPost(`/api/solve/runs/${runId}/finish`, {});
}
```

- [ ] **Step 6: 팀 목록 화면을 만든다**

`web/screens/solve/SolveTeamListPage.jsx` 를 새로 만든다:

```jsx
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "react-toastify";
import { ArrowLeft, ArrowRight } from "@phosphor-icons/react";
import Surface from "@/components/ui/Surface.jsx";
import Button from "@/components/ui/Button.jsx";
import EmptyState from "@/components/ui/EmptyState.jsx";
import { listTeams, startTeamRun } from "@/apiClient/teamRuns.js";
import { resolveErrorMessage } from "@/apiClient/client.js";
import { teamStateLabel } from "@/utils/teamRunLabel.js";

/**
 * 골라서 풀기의 착지 지점. 팀을 고르면 그 팀 문제를 처음부터 끝까지 푼다.
 *
 * 누를 때 세 갈래로 갈린다. 진행 중인 바퀴가 있으면 그 바퀴로, 끝난 바퀴가 있으면
 * 선택 화면으로, 아무것도 없으면 전체 바퀴를 새로 만들어 바로 진행 화면으로 보낸다.
 */
export default function SolveTeamListPage() {
  const router = useRouter();
  const [teams, setTeams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [startingId, setStartingId] = useState(null);

  async function refresh() {
    setLoading(true);
    setError(false);
    try {
      setTeams(await listTeams());
    } catch (err) {
      setError(true);
      toast.error(resolveErrorMessage(err, "팀 목록을 불러오지 못했습니다."));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  async function handleClick(team) {
    if (team.totalCount === 0) return;
    if (team.activeRun) {
      router.push(`/solve/problems/${team.departmentId}/play`);
      return;
    }
    if (team.hasFinishedRun) {
      router.push(`/solve/problems/${team.departmentId}`);
      return;
    }
    setStartingId(team.departmentId);
    try {
      await startTeamRun(team.departmentId, "ALL");
      router.push(`/solve/problems/${team.departmentId}/play`);
    } catch (err) {
      toast.error(resolveErrorMessage(err, "시작하지 못했습니다."));
    } finally {
      setStartingId(null);
    }
  }

  return (
    <>
      <Link href="/solve" className="mb-4 inline-flex items-center gap-1 rounded-sm text-body-small font-medium text-ink-default hover:text-ink-strong focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-brand-aqua">
        <ArrowLeft size={16} aria-hidden="true" />
        학습 홈
      </Link>

      <section className="mb-5 flex items-center justify-between gap-3">
        <h1 className="text-page-title font-bold tracking-title text-ink-strong">골라서 풀기</h1>
        <Link href="/solve/history" className="rounded-sm text-body-small font-semibold text-action-secondary-text hover:underline focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-brand-aqua">
          내 풀이 이력
        </Link>
      </section>
      <p className="mb-5 text-body text-ink-default">팀을 고르면 그 팀 문제를 처음부터 끝까지 풉니다.</p>

      {loading ? (
        <p className="px-1 py-10 text-center text-body text-ink-muted">불러오는 중...</p>
      ) : error ? (
        <Surface className="p-0">
          <EmptyState
            title="팀 목록을 불러오지 못했습니다."
            description="잠시 후 다시 시도해 주세요."
            action={<Button variant="secondary" size="sm" onClick={refresh}>다시 시도</Button>}
          />
        </Surface>
      ) : (
        <Surface className="overflow-hidden p-0">
          <ul>
            {teams.map((team) => {
              const label = teamStateLabel(team);
              const empty = team.totalCount === 0;
              return (
                <li key={team.departmentId} className="border-b border-line-default last:border-b-0">
                  <button
                    type="button"
                    disabled={empty || startingId === team.departmentId}
                    onClick={() => handleClick(team)}
                    className="group flex w-full items-center gap-3 p-4 text-left transition-colors hover:bg-surface-subtle focus-visible:outline focus-visible:outline-[3px] focus-visible:-outline-offset-[3px] focus-visible:outline-brand-aqua disabled:cursor-default disabled:opacity-60 disabled:hover:bg-transparent"
                  >
                    <span className="flex-1 text-body font-semibold text-ink-strong">{team.departmentName}</span>
                    <span className="shrink-0 text-body-small text-ink-muted">{team.totalCount}문제</span>
                    <span
                      className={`shrink-0 rounded-full px-2.5 py-1 text-body-small font-medium ${
                        label.kind === "progress" ? "bg-surface-blue text-info-text"
                          : label.kind === "wrong" ? "bg-surface-subtle text-ink-default"
                          : "bg-surface-subtle text-ink-muted"
                      }`}
                    >
                      {empty ? "문제 없음" : label.text}
                    </span>
                    {!empty && (
                      <ArrowRight size={16} aria-hidden="true" className="shrink-0 text-ink-subtle transition-transform group-hover:translate-x-0.5 group-hover:text-brand-blue" />
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </Surface>
      )}
    </>
  );
}
```

- [ ] **Step 7: 라우트가 새 화면을 그리게 한다**

`web/app/(protected)/solve/problems/page.tsx` 를 연다. 지금은 `SolveProblemListPage` 를 그린다. 그 파일 전체를 다음으로 바꾼다(파일에 있던 `"use client"` 나 메타데이터 같은 다른 줄이 있으면 그대로 두고 import 와 반환 컴포넌트만 바꾼다):

```typescript
import SolveTeamListPage from "@/screens/solve/SolveTeamListPage.jsx";

export default function Page() {
  return <SolveTeamListPage />;
}
```

`web/screens/solve/SolveHomePage.jsx` 에서 "골라서 풀기" 카드의 설명 문구를 바꾼다. 지금은 이렇다:

```jsx
          <p className="mt-1 text-body-small text-ink-muted">검색·태그로 원하는 문제를 찾아 풉니다.</p>
```

다음으로 바꾼다:

```jsx
          <p className="mt-1 text-body-small text-ink-muted">팀을 골라 그 팀 문제를 처음부터 끝까지 풉니다.</p>
```

- [ ] **Step 8: 전체 스위트 + 타입 검사 + 커밋**

```bash
cd web && npx vitest run
cd web && npx tsc --noEmit
```

```bash
git add web/apiClient/teamRuns.js web/utils/teamRunLabel.js web/utils/teamRunLabel.test.js web/screens/solve/SolveTeamListPage.jsx "web/app/(protected)/solve/problems/page.tsx" web/screens/solve/SolveHomePage.jsx
git commit -m "[ADD] 팀 목록 화면"
```

---

### Task 8: 선택·진행·결과 화면

**Files:**
- Create: `web/screens/solve/TeamRunChoicePage.jsx`
- Create: `web/screens/solve/TeamRunPlayPage.jsx`
- Create: `web/screens/solve/TeamRunResultPage.jsx`
- Create: `web/app/(protected)/solve/problems/[departmentId]/page.tsx`
- Create: `web/app/(protected)/solve/problems/[departmentId]/play/page.tsx`
- Create: `web/app/(protected)/solve/problems/[departmentId]/result/page.tsx`

**Interfaces:**
- Consumes: `listTeams`·`startTeamRun`·`getRun`·`advanceRun`·`finishRun`(Task 7), `ProblemSolveCard`(`components/solve/ProblemSolveCard.jsx`), `getSolveProblem`(`apiClient/solve.js`)
- Produces: 없음(화면 종단)

- [ ] **Step 1: 선택 화면을 만든다**

`web/screens/solve/TeamRunChoicePage.jsx` 를 새로 만든다:

```jsx
import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { toast } from "react-toastify";
import { ArrowLeft } from "@phosphor-icons/react";
import Surface from "@/components/ui/Surface.jsx";
import Button from "@/components/ui/Button.jsx";
import { listTeams, startTeamRun } from "@/apiClient/teamRuns.js";
import { resolveErrorMessage } from "@/apiClient/client.js";

/**
 * 한 번 끝낸 팀을 다시 누를 때 나오는 화면. 처음부터 다시 풀지, 틀린 문제만 다시 풀지 고른다.
 *
 * 진행 중인 바퀴가 있는데 이 주소로 직접 들어오면 진행 화면으로 돌려보낸다 — 두 바퀴가
 * 동시에 열리지 않게 한다.
 */
export default function TeamRunChoicePage() {
  const params = useParams();
  const departmentId = Number(params.departmentId);
  const router = useRouter();
  const [team, setTeam] = useState(null);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    listTeams()
      .then((teams) => {
        if (cancelled) return;
        const found = teams.find((t) => t.departmentId === departmentId) ?? null;
        if (found?.activeRun) {
          router.replace(`/solve/problems/${departmentId}/play`);
          return;
        }
        setTeam(found);
        setLoading(false);
      })
      .catch((error) => {
        if (cancelled) return;
        toast.error(resolveErrorMessage(error, "팀 정보를 불러오지 못했습니다."));
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [departmentId, router]);

  async function start(mode) {
    setStarting(true);
    try {
      await startTeamRun(departmentId, mode);
      router.push(`/solve/problems/${departmentId}/play`);
    } catch (error) {
      toast.error(resolveErrorMessage(error, "시작하지 못했습니다."));
    } finally {
      setStarting(false);
    }
  }

  if (loading) {
    return <p className="px-1 py-10 text-center text-body text-ink-muted">불러오는 중...</p>;
  }

  return (
    <div className="mx-auto w-full max-w-md">
      <Link href="/solve/problems" className="mb-4 inline-flex items-center gap-1 rounded-sm text-body-small font-medium text-ink-default hover:text-ink-strong focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-brand-aqua">
        <ArrowLeft size={16} aria-hidden="true" />
        팀 목록
      </Link>

      <section className="mb-6">
        <h1 className="text-page-title font-bold tracking-title text-ink-strong">{team?.departmentName ?? ""}</h1>
        <p className="mt-1 text-body text-ink-default">
          이미 한 번 푼 팀입니다. 어떻게 풀지 골라 주세요.
        </p>
      </section>

      <Surface className="p-5">
        <div className="flex flex-col gap-3">
          <Button type="button" size="md" loading={starting} onClick={() => start("ALL")}>
            처음부터 다시 풀기 ({team?.totalCount ?? 0}문제)
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="md"
            loading={starting}
            disabled={!team || team.wrongCount === 0}
            onClick={() => start("WRONG")}
          >
            {team && team.wrongCount > 0
              ? `이전에 틀린 문제 다시 풀어보기 (${team.wrongCount}문제)`
              : "틀린 문제가 없습니다"}
          </Button>
        </div>
      </Surface>
    </div>
  );
}
```

- [ ] **Step 2: 진행 화면을 만든다**

`web/screens/solve/TeamRunPlayPage.jsx` 를 새로 만든다:

```jsx
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { toast } from "react-toastify";
import Surface from "@/components/ui/Surface.jsx";
import Button from "@/components/ui/Button.jsx";
import ProblemSolveCard from "@/components/solve/ProblemSolveCard.jsx";
import ProblemSkeleton from "@/components/solve/ProblemSkeleton.jsx";
import { getSolveProblem } from "@/apiClient/solve.js";
import { advanceRun, finishRun, listTeams, getRun } from "@/apiClient/teamRuns.js";
import { resolveErrorMessage } from "@/apiClient/client.js";

/**
 * 팀 바퀴 진행 화면. 랜덤 풀기와 같은 카드를 쓰되 진행 상태는 브라우저가 아니라 서버에 있다.
 *
 * 위치를 서버가 들고 있으므로 새로고침해도 같은 문제가 나온다. "다음 문제"를 누를 때
 * 자기가 보던 위치(fromCursor)를 함께 보내, 두 번 눌러도 두 칸 건너뛰지 않게 한다.
 */
export default function TeamRunPlayPage() {
  const params = useParams();
  const departmentId = Number(params.departmentId);
  const router = useRouter();

  const [run, setRun] = useState(null);
  const [problem, setProblem] = useState(null);
  const [loadError, setLoadError] = useState(false);
  const [submittedResult, setSubmittedResult] = useState(null);
  const [advancing, setAdvancing] = useState(false);
  const [retryCount, setRetryCount] = useState(0);

  // 진행 중인 바퀴를 찾아 온다. 없으면 팀 목록으로 돌려보낸다.
  useEffect(() => {
    let cancelled = false;
    listTeams()
      .then(async (teams) => {
        if (cancelled) return;
        const team = teams.find((t) => t.departmentId === departmentId);
        if (!team?.activeRun) {
          router.replace("/solve/problems");
          return;
        }
        setRun(await getRun(team.activeRun.runId));
      })
      .catch((error) => {
        if (!cancelled) toast.error(resolveErrorMessage(error, "진행 상태를 불러오지 못했습니다."));
      });
    return () => {
      cancelled = true;
    };
  }, [departmentId, router]);

  // problemIds 로 정한다 — problems 로 정하면 문제 행이 지워졌을 때 위치가 한 칸 밀린다.
  const currentId = run && run.cursor < run.total ? run.problemIds[run.cursor] : null;

  useEffect(() => {
    if (!run) return;
    if (run.status === "FINISHED" || run.cursor >= run.total) {
      router.replace(`/solve/problems/${departmentId}/result?run=${run.runId}`);
    }
  }, [run, departmentId, router]);

  useEffect(() => {
    if (currentId === null) return;
    let cancelled = false;
    setProblem(null);
    setLoadError(false);
    setSubmittedResult(null);
    getSolveProblem(currentId)
      .then((data) => {
        if (!cancelled) setProblem(data);
      })
      .catch((error) => {
        if (!cancelled) {
          setLoadError(true);
          toast.error(resolveErrorMessage(error, "문제를 불러오지 못했습니다."));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [currentId, retryCount]);

  async function goNext(correct) {
    if (!run || advancing) return;
    setAdvancing(true);
    try {
      const after = await advanceRun(run.runId, run.cursor, correct);
      setRun(await getRun(run.runId));
      if (after.status === "FINISHED") {
        router.replace(`/solve/problems/${departmentId}/result?run=${run.runId}`);
      }
    } catch (error) {
      toast.error(resolveErrorMessage(error, "다음 문제로 넘어가지 못했습니다."));
    } finally {
      setAdvancing(false);
    }
  }

  async function quit() {
    if (!run) return;
    try {
      await finishRun(run.runId);
      router.replace(`/solve/problems/${departmentId}/result?run=${run.runId}`);
    } catch (error) {
      toast.error(resolveErrorMessage(error, "그만두지 못했습니다."));
    }
  }

  if (!run) {
    return <ProblemSkeleton />;
  }

  return (
    <>
      <div className="mb-4 flex items-center justify-between gap-3">
        <p className="text-body font-semibold text-ink-strong">
          {run.departmentName} · {run.cursor + 1} / {run.total}
          {run.mode === "WRONG" && <span className="ml-2 text-body-small font-medium text-ink-muted">복습</span>}
        </p>
        <Button variant="secondary" size="sm" onClick={quit}>
          그만두고 결과 보기
        </Button>
      </div>

      {loadError ? (
        <Surface className="p-5">
          <p className="text-body text-ink-default">문제를 불러오지 못했습니다.</p>
          <div className="mt-3 flex gap-2">
            <Button variant="secondary" size="sm" onClick={() => setRetryCount((c) => c + 1)}>
              다시 시도
            </Button>
            {/*
              보관 처리된 문제일 수 있다. 건너뛸 때는 correct 를 null 로 보내
              맞은 것으로도 틀린 것으로도 세지 않게 한다.
            */}
            <Button variant="secondary" size="sm" loading={advancing} onClick={() => goNext(null)}>
              이 문제 건너뛰기
            </Button>
          </div>
        </Surface>
      ) : !problem ? (
        <ProblemSkeleton />
      ) : (
        <ProblemSolveCard problem={problem} onSubmitted={setSubmittedResult} />
      )}

      {submittedResult && (
        <div className="mt-4">
          <Button size="lg" loading={advancing} onClick={() => goNext(submittedResult.correct)}>
            {run.cursor + 1 >= run.total ? "결과 보기" : "다음 문제"}
          </Button>
        </div>
      )}
    </>
  );
}
```

- [ ] **Step 3: 결과 화면을 만든다**

`web/screens/solve/TeamRunResultPage.jsx` 를 새로 만든다:

```jsx
import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { toast } from "react-toastify";
import Surface from "@/components/ui/Surface.jsx";
import Button from "@/components/ui/Button.jsx";
import { getRun, listTeams, startTeamRun } from "@/apiClient/teamRuns.js";
import { resolveErrorMessage } from "@/apiClient/client.js";
import { previewContent } from "@/utils/problemPreview.js";

/**
 * 바퀴 결과. 전체 바퀴든 복습 바퀴든 같은 화면, 같은 버튼 두 개다.
 *
 * "이전에 틀린 문제"는 방금 낸 답까지 반영해 매번 다시 계산되므로, 복습을 돌수록 대상이
 * 줄어 결국 0개가 되고 그때 복습 버튼이 비활성화된다.
 */
export default function TeamRunResultPage() {
  const params = useParams();
  const departmentId = Number(params.departmentId);
  const searchParams = useSearchParams();
  const runIdParam = searchParams.get("run");
  const router = useRouter();

  const [run, setRun] = useState(null);
  const [team, setTeam] = useState(null);
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const teams = await listTeams();
        if (cancelled) return;
        const found = teams.find((t) => t.departmentId === departmentId) ?? null;
        setTeam(found);
        // run 이 주소에 없으면 그 팀의 마지막 바퀴를 보여 준다.
        const runId = runIdParam ? Number(runIdParam) : found?.activeRun?.runId ?? null;
        if (runId === null) {
          router.replace("/solve/problems");
          return;
        }
        setRun(await getRun(runId));
      } catch (error) {
        if (!cancelled) toast.error(resolveErrorMessage(error, "결과를 불러오지 못했습니다."));
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [departmentId, runIdParam, router]);

  async function start(mode) {
    setStarting(true);
    try {
      await startTeamRun(departmentId, mode);
      router.push(`/solve/problems/${departmentId}/play`);
    } catch (error) {
      toast.error(resolveErrorMessage(error, "시작하지 못했습니다."));
    } finally {
      setStarting(false);
    }
  }

  if (!run) {
    return <p className="px-1 py-10 text-center text-body text-ink-muted">불러오는 중...</p>;
  }

  const wrongIds = run.results.filter((r) => r.correct === false).map((r) => r.problemId);
  const wrongProblems = wrongIds
    .map((id) => run.problems.find((p) => p.id === id))
    .filter((p) => p !== undefined);

  return (
    <div className="mx-auto w-full max-w-2xl">
      <section className="mb-6">
        <h1 className="text-page-title font-bold tracking-title text-ink-strong">
          {run.departmentName} 결과
        </h1>
        <p className="mt-1 text-body text-ink-default">
          {run.answeredCount}문제 중 {run.correctCount}문제를 맞혔습니다.
        </p>
      </section>

      {wrongProblems.length > 0 && (
        <Surface className="mb-4 p-5">
          <p className="mb-3 text-section-title font-semibold text-ink-strong">틀린 문제</p>
          <ul className="space-y-2">
            {wrongProblems.map((p) => (
              <li key={p.id} className="text-body text-ink-default">
                <span className="mr-2 text-body-small text-ink-muted">
                  {p.sourceNumber === null ? "번호 없음" : `${p.sourceNumber}번`}
                </span>
                {previewContent(p.content)}
              </li>
            ))}
          </ul>
        </Surface>
      )}

      <Surface className="p-5">
        <div className="flex flex-col gap-3">
          <Button type="button" size="md" loading={starting} onClick={() => start("ALL")}>
            처음부터 다시 풀기 ({team?.totalCount ?? 0}문제)
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="md"
            loading={starting}
            disabled={!team || team.wrongCount === 0}
            onClick={() => start("WRONG")}
          >
            {team && team.wrongCount > 0
              ? `이전에 틀린 문제 다시 풀어보기 (${team.wrongCount}문제)`
              : "틀린 문제가 없습니다"}
          </Button>
          <Link
            href="/solve/problems"
            className="rounded-sm text-center text-body-small font-semibold text-action-secondary-text hover:underline focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-brand-aqua"
          >
            팀 목록으로
          </Link>
        </div>
      </Surface>
    </div>
  );
}
```

- [ ] **Step 4: 세 라우트를 만든다**

`web/app/(protected)/solve/problems/[departmentId]/page.tsx`:

```typescript
import TeamRunChoicePage from "@/screens/solve/TeamRunChoicePage.jsx";

export default function Page() {
  return <TeamRunChoicePage />;
}
```

`web/app/(protected)/solve/problems/[departmentId]/play/page.tsx`:

```typescript
import TeamRunPlayPage from "@/screens/solve/TeamRunPlayPage.jsx";

export default function Page() {
  return <TeamRunPlayPage />;
}
```

`web/app/(protected)/solve/problems/[departmentId]/result/page.tsx`:

```typescript
import { Suspense } from "react";
import TeamRunResultPage from "@/screens/solve/TeamRunResultPage.jsx";

// useSearchParams 를 쓰는 화면은 Suspense 로 감싸야 next build 가 통과한다.
export default function Page() {
  return (
    <Suspense fallback={<p className="px-1 py-10 text-center text-body text-ink-muted">불러오는 중...</p>}>
      <TeamRunResultPage />
    </Suspense>
  );
}
```

- [ ] **Step 5: 화면이 클라이언트 컴포넌트인지 확인한다**

세 화면 파일(`TeamRunChoicePage.jsx`·`TeamRunPlayPage.jsx`·`TeamRunResultPage.jsx`)과 `SolveTeamListPage.jsx` 는 `useState` 를 쓴다. 같은 폴더의 기존 화면들(`RandomPlayPage.jsx` 등)이 `"use client"` 를 파일 첫 줄에 두는지 확인하고, 두고 있으면 네 파일에도 똑같이 첫 줄에 넣는다. 기존 화면이 두지 않는다면(상위 레이아웃이 이미 클라이언트 경계를 만든 경우) 넣지 않는다 — **기존 파일과 같게 맞추는 것이 기준이다.**

- [ ] **Step 6: 전체 스위트 + 타입 검사 + 커밋**

```bash
cd web && npx vitest run
cd web && npx tsc --noEmit
```

```bash
git add web/screens/solve "web/app/(protected)/solve/problems"
git commit -m "[ADD] 팀 바퀴 선택·진행·결과 화면"
```

---

### Task 9: 옛 화면 정리와 실측

**Files:**
- Delete: `web/screens/solve/SolveProblemListPage.jsx`
- Delete: `web/screens/solve/ProblemSolvePage.jsx`
- Delete: `web/app/(protected)/solve/[id]/page.tsx`

**Interfaces:**
- Consumes: 없음
- Produces: 없음(종단)

- [ ] **Step 1: 지울 파일이 아무 데서도 안 쓰이는지 확인한다**

```bash
cd web && grep -rn "SolveProblemListPage\|ProblemSolvePage\|listSolveProblems" screens/ components/ app/ apiClient/ | grep -v node_modules
```

기대: `apiClient/solve.js` 의 `listSolveProblems` 정의 한 줄만 남는다. 화면에서 이 셋을 import 하는 곳이 있으면 **지우지 말고 멈춰서 보고한다** — Task 7·8 이 덜 끝났다는 뜻이다.

- [ ] **Step 2: 세 파일을 지운다**

```bash
cd web && rm screens/solve/SolveProblemListPage.jsx screens/solve/ProblemSolvePage.jsx "app/(protected)/solve/[id]/page.tsx"
```

`web/app/(protected)/solve/[id]/` 폴더가 비면 폴더도 지운다.

**API 와 그 뒤의 쿼리·테스트는 지우지 마라.** `apiClient/solve.js` 의 `listSolveProblems`, `app/api/problems/route.ts`, `lib/db/solveProblems.ts` 의 `findActiveSolveProblems` 와 그 테스트는 그대로 둔다. 그 쿼리에는 옛 Spring 동작을 그대로 옮겼다는 기록(파리티 테스트 S5-1·S7·S9)이 붙어 있어, 지우면 이관 근거가 함께 사라진다.

- [ ] **Step 3: 전체 스위트 + 타입 검사**

```bash
cd web && npx vitest run
cd web && npx tsc --noEmit
```

- [ ] **Step 4: 빌드로 확인한다**

dev 서버가 떠 있으면 먼저 내린다(같은 `.next` 를 공유하면 화면이 "세션 확인 중..."에서 멈춘다).

```bash
cd web && rm -rf .next && npx next build
```

기대: Errors 0, Warnings 0.

- [ ] **Step 5: 브라우저로 실측한다**

```bash
cd web && rm -rf .next && npx next dev -p 3300
```

`sadmin` / `Test1234!` 또는 `plan_emp` / `Test1234!` 로 로그인해 다음을 확인한다. **관리자 화면을 볼 때는 브라우저 폭을 640px 이상으로 둔다** — 좁으면 관리자 영역이 학습 홈으로 튕긴다.

- 학습 홈 → "골라서 풀기" → 팀 목록이 나오고, 팀마다 문제 수와 상태가 보인다
- 아직 안 푼 팀을 누르면 1번 문제부터 시작하고, 위에 `1 / N` 이 보인다
- 문제를 몇 개 풀고 나갔다가 다시 그 팀을 누르면 **멈췄던 문제**가 나온다
- 진행 화면에서 새로고침해도 같은 문제가 나온다
- 끝까지 풀면 결과가 나오고 버튼 두 개가 보인다
- "이전에 틀린 문제 다시 풀어보기"를 눌러 틀렸던 문제만 나오는지 본다
- 그 복습을 다 맞히면 팀 목록의 `틀린 문제 N개` 가 줄고, 0이 되면 복습 버튼이 비활성화된다
- 문제가 0개인 팀은 "문제 없음"으로 눌리지 않는다
- 옛 주소 `/solve/1` 로 직접 들어가면 404 가 난다
- 콘솔 오류 0건

- [ ] **Step 6: 커밋**

```bash
git add -A web/screens/solve "web/app/(protected)/solve"
git commit -m "[DEL] 문제 목록과 단건 풀이 화면"
```

---

## 운영 반영 시 주의

이 계획은 **로컬에만** 적용한다. 운영에 올릴 때는 순서가 있다.

1. **운영 DB 에 마이그레이션을 먼저 적용한다.** `solve_runs` 테이블이 없는 상태로 새 코드가 배포되면 팀 목록이 전부 실패한다.
2. 그다음 코드를 배포한다.

운영 DB 는 Supabase 이고 로컬 마이그레이션 명령(`drizzle-kit migrate`)은 `DATABASE_URL`(로컬)을 본다. 운영 적용 방법은 이 계획의 범위 밖이며, 별도로 정한다.

## 이 계획이 다루지 않는 것

- 랜덤으로 풀기 — 그대로 둔다
- 내 풀이 이력 — 그대로 둔다
- 관리자 화면과 통계 — 바퀴를 반영하지 않는다
- 팀 안에서 다시 검색·태그로 좁히기 — 없앤 기능이다
- 운영 DB 마이그레이션 적용 경로
