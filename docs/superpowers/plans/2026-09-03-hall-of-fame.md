# 문제 풀이 명예의 전당 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 맞힌 개수로 이번 달·전체 기간의 **개인 순위와 팀 순위**를 매겨 학습 홈에 보여 준다.

**Architecture:** DB 는 사람 한 명당·팀 한 곳당 한 행을 **정렬된 채로** 낸다. 순위를 매기고 동점을 줄로 접는 일은 DB 를 모르는 순수 함수가 한다 — 목록 순위와 내 순위가 **같은 함수**에서 나오므로 두 숫자가 어긋날 수 없다. 새 표도 마이그레이션도 없다.

**Tech Stack:** Next.js 15 (App Router), Drizzle ORM, Postgres, Vitest, Tailwind

**Spec:** `docs/superpowers/specs/2026-09-03-hall-of-fame-design.md`

## Global Constraints

- 응답 봉투는 `{ resultCode, resultMsg, data }` 다. 라우트는 `handleRoute` 로 감싸고 서비스가 `data` 를 그대로 반환한다.
- **맞힌 개수**로 줄 세운다. `attempts.is_correct = true` 인 행을 그대로 센다 — 같은 문제를 여러 번 맞히면 그만큼 센다.
- 대상은 **`users.status = 'ACTIVE'` 인 전 사용자**다. 관리자도 포함한다. 부서 상태는 보지 않는다.
- 정렬은 **맞힌 개수 내림차순 → 마지막 정답 시각 오름차순 → 사용자 번호 오름차순**이다. 세 번째 항이 없으면 화면에 보이는 대표 이름이 새로고침마다 바뀐다.
- 순위는 **`DENSE_RANK` 의미**다 — 동점은 같은 순위이고 다음 줄은 바로 다음 숫자다(1위가 5명이어도 다음은 2위).
- **팀 점수는 그 팀 활성 사용자가 맞힌 개수의 합계**다. 개인과 팀은 순위·동점·정렬 규칙이 모두 같다 — 세는 단위만 다르다.
- 이번 달 경계는 **서울 기준 1일 0시**이며 SQL 은 아래 한 가지 표현만 쓴다:
  `((date_trunc('month', now() AT TIME ZONE 'Asia/Seoul') AT TIME ZONE 'Asia/Seoul') AT TIME ZONE 'UTC')`
- **postgres.js 는 `COUNT`·`SUM` 을 문자열로 준다**(`lib/db/stats.ts:36` 주석). 집계값에는 반드시 `::int` 를 붙인다.
- 원시 SQL 결과는 **`executeRows<T>`**(`lib/db/raw.ts:5`)로 받는다. 직접 `as unknown as` 하지 않는다.
- 전체 검증은 `cd web && npx vitest run` 과 `cd web && npx tsc --noEmit` 이다.
- **`next build` 를 dev 서버와 동시에 돌리지 마라.** 같은 `.next` 를 공유해 화면이 "세션 확인 중..."에서 멈춘다.

## 이 계획의 설계서 대비 판단 두 가지

**① 순위를 SQL 창 함수가 아니라 순수 함수에서 매긴다.** 설계서는 "`DENSE_RANK` 로 매긴다"고 적었는데, 이 계획은 SQL 이 정렬만 하고 순위는 JS 가 붙인다. 결과는 같고, 이렇게 하면 **목록 순위와 내 순위가 같은 함수에서 나와** 두 숫자가 구조적으로 어긋날 수 없다. 설계서가 막으려던 결함이 바로 그것이다.

**② 접는 로직을 서비스 파일이 아니라 옆 파일에 둔다.** 설계서는 "순수 함수로 떼어 서비스에 둔다"고 적었다. 서비스는 DB 를 부르므로 같은 파일에 두면 순수 함수 테스트에도 DB 가 필요해진다. 파일을 나눠 DB 없이 테스트한다.

## 파일 구조

| 파일 | 책임 |
|---|---|
| `web/lib/db/hallOfFame.ts` (신규) | 기간별 사용자·팀 집계 질의. 정렬까지 한다 |
| `web/lib/solve/hallOfFameRanking.ts` (신규) | 순수 함수 — 순위 매기기·동점 접기·내 순위 찾기 |
| `web/lib/solve/hallOfFameService.ts` (신규) | 두 기간을 묶어 응답을 만든다 |
| `web/app/api/solve/hall-of-fame/route.ts` (신규) | 창구 |
| `web/apiClient/hallOfFame.js` (신규) | 클라이언트 |
| `web/components/solve/HallOfFameCard.jsx` (신규) | 카드·탭·금은동 메달·"외 N명" 펼침 |
| `web/screens/solve/SolveHomePage.jsx` | 카드 한 줄 추가 |

---

### Task 1: 기간별 집계 질의

**Files:**
- Create: `web/lib/db/hallOfFame.ts`
- Test: `web/lib/db/hallOfFame.test.ts`

**Interfaces:**
- Consumes: `executeRows<T>`(`web/lib/db/raw.ts`)
- Produces:
  - `type Period = "MONTH" | "ALL"`
  - `type HallOfFameRow = { userId: number; name: string; departmentName: string; correctCount: number; lastCorrectAt: string }`
  - `type TeamRow = { departmentId: number; departmentName: string; correctCount: number; lastCorrectAt: string }`
  - `findCorrectCountsByUser(db: DbConn, period: Period): Promise<HallOfFameRow[]>` — 정렬된 채로 돌아온다
  - `findCorrectCountsByTeam(db: DbConn, period: Period): Promise<TeamRow[]>` — 정렬된 채로 돌아온다

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`web/lib/db/hallOfFame.test.ts` 를 새로 만든다:

```typescript
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { migrateTestDb, testDb, truncateAll } from "../../test/db";
import { attempts, departments, problems, users } from "./schema";
import { findCorrectCountsByTeam, findCorrectCountsByUser } from "./hallOfFame";

const db = testDb();
let planId = 0;
let salesId = 0;
let problemId = 0;
let otherProblemId = 0;

async function seedUser(employeeNo: string, name: string, over: Partial<typeof users.$inferInsert> = {}) {
  const [row] = await db.insert(users).values({
    employeeNo, name, email: `${employeeNo}@b.c`, passwordHash: "x",
    departmentId: planId, role: "EMPLOYEE", status: "ACTIVE", mustChangePassword: false, ...over,
  }).returning({ id: users.id });
  return row.id;
}

async function seedAttempt(userId: number, isCorrect: boolean, at: string, pid = problemId) {
  await db.insert(attempts).values({
    userId, problemId: pid, isCorrect, submittedAt: new Date(at),
  });
}

beforeAll(async () => { await migrateTestDb(); });
beforeEach(async () => {
  await truncateAll();
  [{ id: planId }] = await db.insert(departments)
    .values({ name: "기획팀", code: "PLAN", status: "ACTIVE" }).returning({ id: departments.id });
  [{ id: salesId }] = await db.insert(departments)
    .values({ name: "영업팀", code: "SALES", status: "ACTIVE" }).returning({ id: departments.id });
  const author = await seedUser("author", "출제자");
  [{ id: problemId }] = await db.insert(problems).values({
    type: "OX", content: "문제", departmentId: planId, status: "ACTIVE",
    createdBy: author, sourceNumber: 1,
  }).returning({ id: problems.id });
  [{ id: otherProblemId }] = await db.insert(problems).values({
    type: "OX", content: "다른 문제", departmentId: planId, status: "ACTIVE",
    createdBy: author, sourceNumber: 2,
  }).returning({ id: problems.id });
});

describe("findCorrectCountsByUser — ALL", () => {
  it("맞힌 것만 세고 오답은 빼놓는다", async () => {
    const me = await seedUser("emp1", "김하나");
    await seedAttempt(me, true, "2026-09-01T01:00:00Z");
    await seedAttempt(me, false, "2026-09-01T02:00:00Z");

    const rows = await findCorrectCountsByUser(db, "ALL");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ userId: me, name: "김하나", departmentName: "기획팀", correctCount: 1 });
  });

  it("같은 문제를 두 번 맞히면 2로 센다", async () => {
    const me = await seedUser("emp1", "김하나");
    await seedAttempt(me, true, "2026-09-01T01:00:00Z");
    await seedAttempt(me, true, "2026-09-01T02:00:00Z");

    expect((await findCorrectCountsByUser(db, "ALL"))[0].correctCount).toBe(2);
  });

  it("서로 다른 문제를 맞히면 합쳐 센다", async () => {
    const me = await seedUser("emp1", "김하나");
    await seedAttempt(me, true, "2026-09-01T01:00:00Z");
    await seedAttempt(me, true, "2026-09-01T02:00:00Z", otherProblemId);

    expect((await findCorrectCountsByUser(db, "ALL"))[0].correctCount).toBe(2);
  });

  it("비활성 계정은 빼놓는다", async () => {
    const gone = await seedUser("emp1", "퇴사자", { status: "INACTIVE" });
    await seedAttempt(gone, true, "2026-09-01T01:00:00Z");

    expect(await findCorrectCountsByUser(db, "ALL")).toEqual([]);
  });

  it("한 번도 안 맞힌 사람은 아예 나오지 않는다", async () => {
    const me = await seedUser("emp1", "김하나");
    await seedAttempt(me, false, "2026-09-01T01:00:00Z");

    expect(await findCorrectCountsByUser(db, "ALL")).toEqual([]);
  });

  it("맞힌 개수 내림차순, 같으면 마지막 정답이 이른 사람이 앞이다", async () => {
    const many = await seedUser("emp1", "많이");
    const early = await seedUser("emp2", "일찍");
    const late = await seedUser("emp3", "늦게");
    await seedAttempt(many, true, "2026-09-01T01:00:00Z");
    await seedAttempt(many, true, "2026-09-01T02:00:00Z");
    await seedAttempt(early, true, "2026-09-01T03:00:00Z");
    await seedAttempt(late, true, "2026-09-01T04:00:00Z");

    expect((await findCorrectCountsByUser(db, "ALL")).map((r) => r.name)).toEqual(["많이", "일찍", "늦게"]);
  });

  it("개수와 마지막 시각이 모두 같으면 사용자 번호가 작은 쪽이 앞이다", async () => {
    const first = await seedUser("emp1", "먼저");
    const second = await seedUser("emp2", "나중");
    await seedAttempt(first, true, "2026-09-01T01:00:00Z");
    await seedAttempt(second, true, "2026-09-01T01:00:00Z");

    expect((await findCorrectCountsByUser(db, "ALL")).map((r) => r.name)).toEqual(["먼저", "나중"]);
    expect(first).toBeLessThan(second);
  });

  it("다른 부서 사람도 함께 나온다 — 부서로 거르지 않는다", async () => {
    const mine = await seedUser("emp1", "기획");
    const yours = await seedUser("emp2", "영업", { departmentId: salesId });
    await seedAttempt(mine, true, "2026-09-01T01:00:00Z");
    await seedAttempt(yours, true, "2026-09-01T02:00:00Z");

    expect((await findCorrectCountsByUser(db, "ALL")).map((r) => r.departmentName)).toEqual(["기획팀", "영업팀"]);
  });
});

describe("findCorrectCountsByTeam", () => {
  it("팀원이 맞힌 것을 모두 더한다", async () => {
    const a = await seedUser("emp1", "가"); const b = await seedUser("emp2", "나");
    await seedAttempt(a, true, "2026-09-01T01:00:00Z");
    await seedAttempt(a, true, "2026-09-01T02:00:00Z");
    await seedAttempt(b, true, "2026-09-01T03:00:00Z");

    const rows = await findCorrectCountsByTeam(db, "ALL");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ departmentId: planId, departmentName: "기획팀", correctCount: 3 });
  });

  it("비활성 계정의 기록은 팀 합계에서도 빠진다", async () => {
    const live = await seedUser("emp1", "재직");
    const gone = await seedUser("emp2", "퇴사", { status: "INACTIVE" });
    await seedAttempt(live, true, "2026-09-01T01:00:00Z");
    await seedAttempt(gone, true, "2026-09-01T02:00:00Z");

    expect((await findCorrectCountsByTeam(db, "ALL"))[0].correctCount).toBe(1);
  });

  it("합계 내림차순, 같으면 마지막 정답이 이른 팀이 앞이다", async () => {
    const plan1 = await seedUser("emp1", "기획");
    const sales1 = await seedUser("emp2", "영업", { departmentId: salesId });
    await seedAttempt(plan1, true, "2026-09-01T03:00:00Z");
    await seedAttempt(sales1, true, "2026-09-01T01:00:00Z");

    expect((await findCorrectCountsByTeam(db, "ALL")).map((r) => r.departmentName))
      .toEqual(["영업팀", "기획팀"]);
  });

  it("맞힌 것이 없는 팀은 아예 나오지 않는다", async () => {
    const me = await seedUser("emp1", "가");
    await seedAttempt(me, false, "2026-09-01T01:00:00Z");
    expect(await findCorrectCountsByTeam(db, "ALL")).toEqual([]);
  });
});

describe("findCorrectCountsByUser — MONTH", () => {
  /**
   * 서울 기준 이번 달 1일 0시 = UTC 로 지난달 말일 15시.
   * 그 직전 1분과 직후 1분을 심어, 경계가 서울 기준인지 UTC 기준인지 갈라낸다.
   * UTC 기준으로 자르면 둘 다 이번 달로 들어와 이 테스트가 깨진다.
   */
  function monthBoundaryUtc(): Date {
    const now = new Date();
    const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
    return new Date(Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth(), 1) - 9 * 60 * 60 * 1000);
  }

  it("서울 기준 이달 1일 0시 이전 기록은 빠진다", async () => {
    const me = await seedUser("emp1", "김하나");
    const boundary = monthBoundaryUtc();
    await seedAttempt(me, true, new Date(boundary.getTime() - 60_000).toISOString());
    await seedAttempt(me, true, new Date(boundary.getTime() + 60_000).toISOString());

    expect((await findCorrectCountsByUser(db, "MONTH"))[0].correctCount).toBe(1);
    expect((await findCorrectCountsByUser(db, "ALL"))[0].correctCount).toBe(2);
  });

  it("이번 달에 맞힌 것이 없으면 빈 목록이다", async () => {
    const me = await seedUser("emp1", "김하나");
    const boundary = monthBoundaryUtc();
    await seedAttempt(me, true, new Date(boundary.getTime() - 60_000).toISOString());

    expect(await findCorrectCountsByUser(db, "MONTH")).toEqual([]);
  });
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인한다**

Run: `cd web && node node_modules/vitest/vitest.mjs run lib/db/hallOfFame.test.ts`
Expected: FAIL — `./hallOfFame` 모듈이 없다.

**vitest 실행은 `node node_modules/vitest/vitest.mjs run` 을 쓴다.** `npx vitest` 는 이 환경의 래퍼가 출력을 삼켜 실패 내용을 못 본다(2026-09-03 실측).

- [ ] **Step 3: 구현한다**

`web/lib/db/hallOfFame.ts` 를 새로 만든다:

```typescript
import { sql } from "drizzle-orm";
import type { DbConn } from "./client";
import { executeRows } from "./raw";

export type Period = "MONTH" | "ALL";

export type HallOfFameRow = {
  userId: number;
  name: string;
  departmentName: string;
  correctCount: number;
  /** 동점 순서를 가르는 값. 화면에 나가지 않는다. */
  lastCorrectAt: string;
};

/**
 * 서울 기준 이번 달 1일 0시를, 시간대 없는 UTC 값으로 옮긴 것.
 *
 * attempts.submitted_at 은 시간대 없는 컬럼이고 값은 UTC 로 들어간다. 변환 없이 비교하면
 * **매달 1일 오전 9시간 동안 지난달 기록이 섞여 들어온다.** 2026-09-03 실측으로 이 식은
 * 서버 TimeZone 이 Etc/UTC 일 때 '2026-08-31 15:00:00' 을 냈다 — 서울 9월 1일 0시다.
 */
const MONTH_START = sql`((date_trunc('month', now() AT TIME ZONE 'Asia/Seoul')
  AT TIME ZONE 'Asia/Seoul') AT TIME ZONE 'UTC')`;

/**
 * 사람 한 명당 한 행. **정렬까지 여기서 끝낸다** — 순위를 매기는 순수 함수는 이 순서를
 * 그대로 믿는다(lib/solve/hallOfFameRanking.ts).
 *
 * 정렬은 맞힌 개수 내림차순 → 마지막 정답이 이른 순 → 사용자 번호 순이다. 마지막 항이
 * 없으면 개수와 시각이 모두 같은 두 사람의 순서가 실행마다 달라져, 화면에 보이는 대표
 * 이름이 새로고침마다 바뀐다.
 *
 * 집계값에 ::int 를 붙이는 이유는 postgres.js 가 COUNT 를 문자열로 주기 때문이다
 * (lib/db/stats.ts:36 의 같은 주석).
 */
export async function findCorrectCountsByUser(db: DbConn, period: Period): Promise<HallOfFameRow[]> {
  const periodFilter = period === "MONTH" ? sql`AND a.submitted_at >= ${MONTH_START}` : sql``;
  return executeRows<HallOfFameRow>(db, sql`
    SELECT u.id::int AS "userId", u.name, d.name AS "departmentName",
           count(*)::int AS "correctCount",
           max(a.submitted_at)::text AS "lastCorrectAt"
    FROM attempts a
    JOIN users u ON u.id = a.user_id
    JOIN departments d ON d.id = u.department_id
    WHERE a.is_correct = true AND u.status = 'ACTIVE' ${periodFilter}
    GROUP BY u.id, u.name, d.name
    ORDER BY count(*) DESC, max(a.submitted_at) ASC, u.id ASC
  `);
}

export type TeamRow = {
  departmentId: number;
  departmentName: string;
  correctCount: number;
  lastCorrectAt: string;
};

/**
 * 팀 한 곳당 한 행. 사람 것을 부서로 묶어 더한 것뿐이라 규칙이 위와 같다 —
 * 활성 사용자만 세고, 정렬도 합계 내림차순 → 마지막 정답이 이른 순 → 부서 번호 순이다.
 *
 * 부서 상태는 보지 않는다. 부서가 비활성이 되었다고 그 팀이 쌓은 기록이 사라지면 안 된다.
 */
export async function findCorrectCountsByTeam(db: DbConn, period: Period): Promise<TeamRow[]> {
  const periodFilter = period === "MONTH" ? sql`AND a.submitted_at >= ${MONTH_START}` : sql``;
  return executeRows<TeamRow>(db, sql`
    SELECT d.id::int AS "departmentId", d.name AS "departmentName",
           count(*)::int AS "correctCount",
           max(a.submitted_at)::text AS "lastCorrectAt"
    FROM attempts a
    JOIN users u ON u.id = a.user_id
    JOIN departments d ON d.id = u.department_id
    WHERE a.is_correct = true AND u.status = 'ACTIVE' ${periodFilter}
    GROUP BY d.id, d.name
    ORDER BY count(*) DESC, max(a.submitted_at) ASC, d.id ASC
  `);
}
```

- [ ] **Step 4: 테스트가 통과하는지 확인한다**

Run: `cd web && node node_modules/vitest/vitest.mjs run lib/db/hallOfFame.test.ts`
Expected: PASS (13개)

- [ ] **Step 5: 변이 테스트 세 가지**

각각 하나씩 되돌려 가며 확인한다.

첫째. `ORDER BY` 에서 `, u.id ASC` 를 지운다 → "개수와 마지막 시각이 모두 같으면 사용자 번호가 작은 쪽이 앞이다" 가 깨져야 한다.

둘째. `MONTH_START` 에서 마지막 `AT TIME ZONE 'UTC'` 를 지운다 → 월 경계 테스트가 깨져야 한다.

셋째. `WHERE` 에서 `u.status = 'ACTIVE'` 를 지운다 → "비활성 계정은 빼놓는다" 가 깨져야 한다.

세 변이가 모두 해당 테스트를 깨뜨렸으면 원상복구하고 다시 PASS 를 확인한다.

- [ ] **Step 6: 전체 스위트 + 타입 검사 + 커밋**

```bash
cd web && node node_modules/vitest/vitest.mjs run
cd web && npx tsc --noEmit
```

```bash
git add web/lib/db/hallOfFame.ts web/lib/db/hallOfFame.test.ts
git commit -m "[ADD] 명예의 전당 기간별 집계 질의"
```

---

### Task 2: 순위 매기기 순수 함수

**Files:**
- Create: `web/lib/solve/hallOfFameRanking.ts`
- Test: `web/lib/solve/hallOfFameRanking.test.ts`

**Interfaces:**
- Consumes: `HallOfFameRow`·`TeamRow`(Task 1)
- Produces:
  - `MAX_OTHERS = 10`, `TOP_ROWS = 3`
  - `type Person = { userId: number; name: string; departmentName: string }`
  - `type Team = { departmentId: number; departmentName: string }`
  - `type RankRow<T> = { rank: number; correctCount: number; leader: T; others: T[]; otherCount: number }`
  - `type MyRank = { rank: number; correctCount: number }`
  - `buildTopRows(rows: HallOfFameRow[]): RankRow<Person>[]`
  - `buildTopTeamRows(rows: TeamRow[]): RankRow<Team>[]`
  - `findMyRank(rows: HallOfFameRow[], userId: number): MyRank | null`
  - `findMyTeamRank(rows: TeamRow[], departmentId: number): MyRank | null`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`web/lib/solve/hallOfFameRanking.test.ts` 를 새로 만든다:

```typescript
import { describe, it, expect } from "vitest";
import type { HallOfFameRow, TeamRow } from "../db/hallOfFame";
import {
  buildTopRows, buildTopTeamRows, findMyRank, findMyTeamRank, MAX_OTHERS,
} from "./hallOfFameRanking";

// 입력은 DB 가 이미 정렬해 준 순서다(개수 내림차순 → 마지막 정답 이른 순 → id 순).
function row(userId: number, name: string, correctCount: number): HallOfFameRow {
  return { userId, name, departmentName: "기획팀", correctCount, lastCorrectAt: "2026-09-01 00:00:00" };
}

describe("buildTopRows", () => {
  it("동점은 한 줄로 접고 대표는 맨 앞 사람이다", () => {
    const out = buildTopRows([row(1, "가", 5), row(2, "나", 5), row(3, "다", 3)]);
    expect(out).toHaveLength(2);
    expect(out[0].rank).toBe(1);
    expect(out[0].leader.name).toBe("가");
    expect(out[0].others.map((p) => p.name)).toEqual(["나"]);
    expect(out[0].otherCount).toBe(1);
  });

  it("동점 다음 줄은 바로 다음 숫자다 — 6위로 건너뛰지 않는다", () => {
    const out = buildTopRows([
      row(1, "가", 5), row(2, "나", 5), row(3, "다", 5),
      row(4, "라", 3),
    ]);
    expect(out.map((r) => r.rank)).toEqual([1, 2]);
    expect(out[1].leader.name).toBe("라");
  });

  it("줄은 최대 세 개다", () => {
    const out = buildTopRows([row(1, "가", 5), row(2, "나", 4), row(3, "다", 3), row(4, "라", 2)]);
    expect(out.map((r) => r.rank)).toEqual([1, 2, 3]);
  });

  it("동점 무리를 쪼개지 않는다 — 세 번째 줄에 다섯 명이면 다섯 명 다 담는다", () => {
    const out = buildTopRows([
      row(1, "가", 9), row(2, "나", 8),
      row(3, "다", 7), row(4, "라", 7), row(5, "마", 7), row(6, "바", 7), row(7, "사", 7),
    ]);
    expect(out[2].otherCount).toBe(4);
    expect(out[2].others.map((p) => p.name)).toEqual(["라", "마", "바", "사"]);
  });

  it("동점자가 많으면 목록은 10명까지만 담되 인원수는 실제 수를 적는다", () => {
    const rows = Array.from({ length: 30 }, (_, i) => row(i + 1, `사람${i + 1}`, 5));
    const out = buildTopRows(rows);
    expect(out[0].leader.name).toBe("사람1");
    expect(out[0].others).toHaveLength(MAX_OTHERS);
    expect(out[0].otherCount).toBe(29);
  });

  it("혼자면 others 는 비고 인원수는 0이다", () => {
    const out = buildTopRows([row(1, "가", 5)]);
    expect(out[0].others).toEqual([]);
    expect(out[0].otherCount).toBe(0);
  });

  it("아무도 없으면 빈 배열이다", () => {
    expect(buildTopRows([])).toEqual([]);
  });
});

describe("buildTopTeamRows · findMyTeamRank", () => {
  function team(departmentId: number, departmentName: string, correctCount: number): TeamRow {
    return { departmentId, departmentName, correctCount, lastCorrectAt: "2026-09-01 00:00:00" };
  }

  it("사람과 같은 규칙으로 접힌다 — 동점은 한 줄, 대표는 맨 앞", () => {
    const out = buildTopTeamRows([team(1, "기획팀", 40), team(2, "영업팀", 40), team(3, "회계팀", 12)]);
    expect(out).toHaveLength(2);
    expect(out[0].rank).toBe(1);
    expect(out[0].leader.departmentName).toBe("기획팀");
    expect(out[0].others.map((t) => t.departmentName)).toEqual(["영업팀"]);
    expect(out[0].otherCount).toBe(1);
    expect(out[1].rank).toBe(2);
  });

  it("우리 팀 순위가 목록의 순위와 같은 값이다", () => {
    const rows = [team(1, "기획팀", 40), team(2, "영업팀", 40), team(3, "회계팀", 12)];
    expect(findMyTeamRank(rows, 2)).toEqual({ rank: 1, correctCount: 40 });
    expect(buildTopTeamRows(rows)[0].rank).toBe(1);
  });

  it("점수가 없는 팀은 목록에 없어 null 이다", () => {
    expect(findMyTeamRank([team(1, "기획팀", 40)], 99)).toBeNull();
  });
});

describe("findMyRank", () => {
  it("목록과 같은 순위 값을 준다", () => {
    const rows = [row(1, "가", 5), row(2, "나", 5), row(3, "다", 3)];
    expect(findMyRank(rows, 2)).toEqual({ rank: 1, correctCount: 5 });
    expect(buildTopRows(rows)[0].rank).toBe(1);
  });

  it("상위 세 줄 밖에 있어도 순위를 준다", () => {
    const rows = [row(1, "가", 9), row(2, "나", 8), row(3, "다", 7), row(4, "라", 6), row(5, "마", 5)];
    expect(findMyRank(rows, 5)).toEqual({ rank: 5, correctCount: 5 });
  });

  it("맞힌 것이 없어 목록에 없으면 null 이다", () => {
    expect(findMyRank([row(1, "가", 5)], 99)).toBeNull();
  });

  it("아무도 없으면 null 이다", () => {
    expect(findMyRank([], 1)).toBeNull();
  });
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인한다**

Run: `cd web && node node_modules/vitest/vitest.mjs run lib/solve/hallOfFameRanking.test.ts`
Expected: FAIL — `./hallOfFameRanking` 모듈이 없다.

- [ ] **Step 3: 구현한다**

`web/lib/solve/hallOfFameRanking.ts` 를 새로 만든다:

```typescript
import type { HallOfFameRow, TeamRow } from "../db/hallOfFame";

/** 펼침 목록에 담는 최대 인원(팀도 같다). 나머지는 "외 N명 더"로 접는다. */
export const MAX_OTHERS = 10;

/** 화면에 보여 줄 줄 수. 사람 수가 아니라 순위 수다. */
export const TOP_ROWS = 3;

export type Person = { userId: number; name: string; departmentName: string };
export type Team = { departmentId: number; departmentName: string };

export type RankRow<T> = {
  rank: number;
  correctCount: number;
  leader: T;
  /** 대표 외 동점자. 최대 MAX_OTHERS 개. */
  others: T[];
  /** 대표 외 전체 개수. MAX_OTHERS 를 넘어도 실제 수를 담는다. */
  otherCount: number;
};

export type MyRank = { rank: number; correctCount: number };

type Scored = { correctCount: number };
type Group<T> = { rank: number; correctCount: number; members: T[] };

function toPerson(r: HallOfFameRow): Person {
  return { userId: r.userId, name: r.name, departmentName: r.departmentName };
}

function toTeam(r: TeamRow): Team {
  return { departmentId: r.departmentId, departmentName: r.departmentName };
}

/**
 * 정렬된 행을 맞힌 개수가 같은 무리로 묶고 순위를 붙인다.
 *
 * 순위는 무리의 차례다 — 1위가 5명이어도 다음 무리는 2위다(DENSE_RANK 와 같은 뜻).
 * 목록과 내 순위가 **이 함수 하나에서** 나오므로 두 숫자가 어긋날 수 없다. 각자 계산하면
 * 한쪽이 공동 순위, 다른 쪽이 총 순서가 되어 같은 사람이 3위와 1위로 동시에 보인다.
 *
 * 입력이 개수 내림차순으로 정렬돼 있다는 전제다(lib/db/hallOfFame.ts 의 ORDER BY).
 */
function toGroups<T extends Scored>(rows: T[]): Group<T>[] {
  const groups: Group<T>[] = [];
  for (const r of rows) {
    const last = groups[groups.length - 1];
    if (last && last.correctCount === r.correctCount) {
      last.members.push(r);
    } else {
      groups.push({ rank: groups.length + 1, correctCount: r.correctCount, members: [r] });
    }
  }
  return groups;
}

/**
 * 무리를 줄로 접는 공통 부분. 사람이든 팀이든 접는 규칙이 같아야 하므로 한 곳에 둔다.
 * 다른 것은 무엇을 화면에 실어 보내느냐(toEntity)뿐이다.
 */
function buildRows<T extends Scored, E>(rows: T[], toEntity: (r: T) => E): RankRow<E>[] {
  return toGroups(rows).slice(0, TOP_ROWS).map((g) => {
    const [leader, ...rest] = g.members;
    return {
      rank: g.rank,
      correctCount: g.correctCount,
      leader: toEntity(leader),
      others: rest.slice(0, MAX_OTHERS).map(toEntity),
      otherCount: rest.length,
    };
  });
}

function findRankBy<T extends Scored>(rows: T[], match: (r: T) => boolean): MyRank | null {
  for (const g of toGroups(rows)) {
    if (g.members.some(match)) return { rank: g.rank, correctCount: g.correctCount };
  }
  return null;
}

export function buildTopRows(rows: HallOfFameRow[]): RankRow<Person>[] {
  return buildRows(rows, toPerson);
}

export function buildTopTeamRows(rows: TeamRow[]): RankRow<Team>[] {
  return buildRows(rows, toTeam);
}

export function findMyRank(rows: HallOfFameRow[], userId: number): MyRank | null {
  return findRankBy(rows, (r) => r.userId === userId);
}

export function findMyTeamRank(rows: TeamRow[], departmentId: number): MyRank | null {
  return findRankBy(rows, (r) => r.departmentId === departmentId);
}
```

- [ ] **Step 4: 테스트가 통과하는지 확인한다**

Run: `cd web && node node_modules/vitest/vitest.mjs run lib/solve/hallOfFameRanking.test.ts`
Expected: PASS (14개)

- [ ] **Step 5: 변이 테스트 두 가지**

첫째. `toGroups` 의 `rank: groups.length + 1` 을 `rank: rows.indexOf(r) + 1` 로 바꾼다(총 순서로 만든다) → "동점 다음 줄은 바로 다음 숫자다" 가 깨져야 한다. 되돌린다.

둘째. `buildTopRows` 의 `others: rest.slice(0, MAX_OTHERS)` 에서 `.slice(0, MAX_OTHERS)` 를 지운다 → "동점자가 많으면 목록은 10명까지만" 이 깨져야 한다. 되돌린다.

셋째. `buildTopTeamRows` 가 `buildRows(rows, toTeam)` 대신 `buildRows(rows, toPerson as never)` 를 쓰게 바꾼다 → 팀 이름이 사라져 "사람과 같은 규칙으로 접힌다" 가 깨져야 한다. 되돌린다.

되돌린 뒤 다시 PASS 를 확인한다.

- [ ] **Step 6: 커밋**

```bash
git add web/lib/solve/hallOfFameRanking.ts web/lib/solve/hallOfFameRanking.test.ts
git commit -m "[ADD] 명예의 전당 순위 매기기 순수 함수"
```

---

### Task 3: 서비스

**Files:**
- Create: `web/lib/solve/hallOfFameService.ts`
- Test: `web/lib/solve/hallOfFameService.test.ts`

**Interfaces:**
- Consumes: `findCorrectCountsByUser`·`findCorrectCountsByTeam`(Task 1), `buildTopRows`·`buildTopTeamRows`·`findMyRank`·`findMyTeamRank`·`RankRow`·`Person`·`Team`·`MyRank`(Task 2), `AuthUser`(`lib/auth/types.ts` — 필드는 `userId`·`role`·`departmentId` 등)
- Produces:
  - `type PeriodBoard = { people: { top: RankRow<Person>[]; me: MyRank | null }; teams: { top: RankRow<Team>[]; mine: MyRank | null } }`
  - `type HallOfFame = { month: PeriodBoard; allTime: PeriodBoard }`
  - `getHallOfFame(db: DbConn, actor: AuthUser): Promise<HallOfFame>`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`web/lib/solve/hallOfFameService.test.ts` 를 새로 만든다:

```typescript
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { eq } from "drizzle-orm";
import { migrateTestDb, testDb, truncateAll } from "../../test/db";
import { attempts, departments, problems, users } from "../db/schema";
import type { AuthUser } from "../auth/types";
import { getHallOfFame } from "./hallOfFameService";

const db = testDb();
let planId = 0;
let problemId = 0;
let actor: AuthUser;

async function seedUser(employeeNo: string, name: string) {
  const [row] = await db.insert(users).values({
    employeeNo, name, email: `${employeeNo}@b.c`, passwordHash: "x",
    departmentId: planId, role: "EMPLOYEE", status: "ACTIVE", mustChangePassword: false,
  }).returning({ id: users.id });
  return row.id;
}

async function seedAttempt(userId: number, isCorrect: boolean, at: string) {
  await db.insert(attempts).values({ userId, problemId, isCorrect, submittedAt: new Date(at) });
}

/** 서울 기준 이번 달 1일 0시를 UTC 로 옮긴 시각. */
function monthBoundaryUtc(): Date {
  const kst = new Date(Date.now() + 9 * 60 * 60 * 1000);
  return new Date(Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth(), 1) - 9 * 60 * 60 * 1000);
}

beforeAll(async () => { await migrateTestDb(); });
beforeEach(async () => {
  await truncateAll();
  [{ id: planId }] = await db.insert(departments)
    .values({ name: "기획팀", code: "PLAN", status: "ACTIVE" }).returning({ id: departments.id });
  const author = await seedUser("author", "출제자");
  [{ id: problemId }] = await db.insert(problems).values({
    type: "OX", content: "문제", departmentId: planId, status: "ACTIVE",
    createdBy: author, sourceNumber: 1,
  }).returning({ id: problems.id });
  const me = await seedUser("emp1", "김하나");
  actor = {
    userId: me, employeeNo: "emp1", name: "김하나", role: "EMPLOYEE",
    departmentId: planId, mustChangePassword: false,
  };
});

describe("getHallOfFame", () => {
  it("아무도 맞히지 않았으면 개인도 팀도 비어 있다", async () => {
    const out = await getHallOfFame(db, actor);
    expect(out.month.people).toEqual({ top: [], me: null });
    expect(out.month.teams).toEqual({ top: [], mine: null });
    expect(out.allTime.people).toEqual({ top: [], me: null });
  });

  it("내 순위가 목록의 순위와 같은 값이다", async () => {
    const rival = await seedUser("emp2", "이둘");
    const now = new Date().toISOString();
    await seedAttempt(rival, true, now);
    await seedAttempt(actor.userId, true, now);

    const out = await getHallOfFame(db, actor);
    // 둘 다 1개라 공동 1위다.
    expect(out.allTime.people.top).toHaveLength(1);
    expect(out.allTime.people.top[0].rank).toBe(1);
    expect(out.allTime.people.me?.rank).toBe(1);
  });

  it("이번 달과 전체 기간이 서로 다른 숫자를 낸다", async () => {
    const boundary = monthBoundaryUtc();
    await seedAttempt(actor.userId, true, new Date(boundary.getTime() - 60_000).toISOString());
    await seedAttempt(actor.userId, true, new Date(boundary.getTime() + 60_000).toISOString());

    const out = await getHallOfFame(db, actor);
    expect(out.month.people.me?.correctCount).toBe(1);
    expect(out.allTime.people.me?.correctCount).toBe(2);
  });

  it("내가 맞힌 것이 없으면 me 는 null 이고 남의 순위는 그대로 나온다", async () => {
    const rival = await seedUser("emp2", "이둘");
    await seedAttempt(rival, true, new Date().toISOString());

    const out = await getHallOfFame(db, actor);
    expect(out.allTime.people.top[0].leader.name).toBe("이둘");
    expect(out.allTime.people.me).toBeNull();
  });

  it("내가 0개여도 같은 팀원이 맞혔으면 우리 팀 점수는 나온다", async () => {
    const teammate = await seedUser("emp2", "이둘");
    await seedAttempt(teammate, true, new Date().toISOString());

    const out = await getHallOfFame(db, actor);
    expect(out.allTime.people.me).toBeNull();
    expect(out.allTime.teams.mine).toEqual({ rank: 1, correctCount: 1 });
  });

  it("우리 팀 순위가 팀 목록의 순위와 같은 값이다", async () => {
    const [sales] = await db.insert(departments)
      .values({ name: "영업팀", code: "SALES", status: "ACTIVE" }).returning({ id: departments.id });
    const rival = await seedUser("emp3", "영업사람");
    await db.update(users).set({ departmentId: sales.id }).where(eq(users.id, rival));
    const now = new Date().toISOString();
    await seedAttempt(actor.userId, true, now);
    await seedAttempt(rival, true, now);

    const out = await getHallOfFame(db, actor);
    // 두 팀 모두 1개라 공동 1위다.
    expect(out.allTime.teams.top).toHaveLength(1);
    expect(out.allTime.teams.top[0].rank).toBe(1);
    expect(out.allTime.teams.mine?.rank).toBe(1);
  });
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인한다**

Run: `cd web && node node_modules/vitest/vitest.mjs run lib/solve/hallOfFameService.test.ts`
Expected: FAIL — `./hallOfFameService` 모듈이 없다.

- [ ] **Step 3: 구현한다**

`web/lib/solve/hallOfFameService.ts` 를 새로 만든다:

```typescript
import type { DbConn } from "../db/client";
import { findCorrectCountsByTeam, findCorrectCountsByUser, type Period } from "../db/hallOfFame";
import {
  buildTopRows, buildTopTeamRows, findMyRank, findMyTeamRank,
  type MyRank, type Person, type RankRow, type Team,
} from "./hallOfFameRanking";
import type { AuthUser } from "../auth/types";

export type PeriodBoard = {
  people: { top: RankRow<Person>[]; me: MyRank | null };
  teams: { top: RankRow<Team>[]; mine: MyRank | null };
};
export type HallOfFame = { month: PeriodBoard; allTime: PeriodBoard };

/**
 * 한 기간의 개인·팀 순위표.
 *
 * 목록과 내 순위는 **같은 행 묶음**에서 뽑는다. 각각 따로 질의하면 그 사이에 누가 문제를
 * 맞혔을 때 두 숫자가 어긋난다.
 *
 * 내 순위와 우리 팀 순위는 따로 계산한다 — 내가 하나도 못 맞혀도 팀원이 맞혔으면 팀은
 * 점수가 있다.
 */
async function buildPeriod(db: DbConn, actor: AuthUser, period: Period): Promise<PeriodBoard> {
  const peopleRows = await findCorrectCountsByUser(db, period);
  const teamRows = await findCorrectCountsByTeam(db, period);
  return {
    people: { top: buildTopRows(peopleRows), me: findMyRank(peopleRows, actor.userId) },
    teams: { top: buildTopTeamRows(teamRows), mine: findMyTeamRank(teamRows, actor.departmentId) },
  };
}

export async function getHallOfFame(db: DbConn, actor: AuthUser): Promise<HallOfFame> {
  return {
    month: await buildPeriod(db, actor, "MONTH"),
    allTime: await buildPeriod(db, actor, "ALL"),
  };
}
```

- [ ] **Step 4: 테스트가 통과하는지 확인한다**

Run: `cd web && node node_modules/vitest/vitest.mjs run lib/solve/hallOfFameService.test.ts`
Expected: PASS (6개)

- [ ] **Step 5: 전체 스위트 + 타입 검사 + 커밋**

```bash
cd web && node node_modules/vitest/vitest.mjs run
cd web && npx tsc --noEmit
```

```bash
git add web/lib/solve/hallOfFameService.ts web/lib/solve/hallOfFameService.test.ts
git commit -m "[ADD] 명예의 전당 서비스"
```

---

### Task 4: 창구와 클라이언트

**Files:**
- Create: `web/app/api/solve/hall-of-fame/route.ts`
- Create: `web/apiClient/hallOfFame.js`

**Interfaces:**
- Consumes: `getHallOfFame`(Task 3)
- Produces: `fetchHallOfFame()` — `apiClient/hallOfFame.js`

- [ ] **Step 1: 라우트를 만든다**

`web/app/api/solve/hall-of-fame/route.ts`:

```typescript
import { getDb } from "@/lib/db/client";
import { handleRoute } from "@/lib/http/errors";
import { requireActor } from "@/lib/auth/currentUser";
import { getHallOfFame } from "@/lib/solve/hallOfFameService";

export const runtime = "nodejs";

// 역할 제한이 없다 — 로그인만 하면 본다. 순위에는 관리자도 함께 들어간다.
export async function GET(): Promise<Response> {
  return handleRoute(async () => {
    const actor = await requireActor();
    return getHallOfFame(getDb(), actor);
  });
}
```

- [ ] **Step 2: 클라이언트를 만든다**

`web/apiClient/hallOfFame.js`:

```javascript
import { apiGet } from "@/apiClient/client.js";

export function fetchHallOfFame() {
  return apiGet("/api/solve/hall-of-fame");
}
```

- [ ] **Step 3: 전체 스위트 + 타입 검사 + 커밋**

```bash
cd web && node node_modules/vitest/vitest.mjs run
cd web && npx tsc --noEmit
```

```bash
git add web/app/api/solve/hall-of-fame web/apiClient/hallOfFame.js
git commit -m "[ADD] 명예의 전당 창구"
```

---

### Task 5: 화면

**Files:**
- Create: `web/components/solve/HallOfFameCard.jsx`
- Modify: `web/screens/solve/SolveHomePage.jsx`

**Interfaces:**
- Consumes: `fetchHallOfFame()`(Task 4), `Surface`(`components/ui/Surface.jsx`), `resolveErrorMessage`(`apiClient/client.js`)
- Produces: 없음(화면 종단)

- [ ] **Step 1: 카드를 만든다**

`web/components/solve/HallOfFameCard.jsx` 를 새로 만든다:

```jsx
import { useEffect, useId, useState } from "react";
import { Trophy } from "@phosphor-icons/react";
import Surface from "@/components/ui/Surface.jsx";
import { fetchHallOfFame } from "@/apiClient/hallOfFame.js";
import { resolveErrorMessage } from "@/apiClient/client.js";

const TABS = [
  { key: "month", label: "이번 달" },
  { key: "allTime", label: "전체 기간" },
];

/**
 * 동점자 목록을 여는 작은 펼침.
 *
 * components/ui 에 툴팁이 없어 여기서만 쓰는 것으로 둔다(2026-09-03 확인). 마우스를
 * 올리거나 키보드 포커스가 닿으면 열리고, 누르면 고정된다 — **휴대폰에는 마우스 올리기가
 * 없어서** 누르기를 함께 받아야 한다. Esc 로 닫는다.
 */
function OtherNames({ others, otherCount, render }) {
  const [open, setOpen] = useState(false);
  const [pinned, setPinned] = useState(false);
  const panelId = useId();
  const hiddenCount = otherCount - others.length;

  useEffect(() => {
    if (!pinned) return undefined;
    function onKeyDown(event) {
      if (event.key === "Escape") {
        setPinned(false);
        setOpen(false);
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [pinned]);

  const visible = open || pinned;

  return (
    <span className="relative inline-block">
      <button
        type="button"
        aria-expanded={visible}
        aria-controls={panelId}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onClick={() => setPinned((v) => !v)}
        className="ml-1 rounded-sm text-body-small font-medium text-action-secondary-text underline decoration-dotted underline-offset-2 focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-brand-aqua"
      >
        외 {otherCount}명
      </button>
      {visible && (
        <span
          id={panelId}
          role="tooltip"
          className="absolute left-0 top-full z-10 mt-1 block w-max max-w-[240px] rounded-md border border-line-default bg-surface-default p-3 shadow-raised"
        >
          <span className="block space-y-1">
            {others.map((item, i) => (
              <span key={i} className="block text-body-small text-ink-default">
                {render(item)}
              </span>
            ))}
            {hiddenCount > 0 && (
              <span className="block text-body-small text-ink-muted">외 {hiddenCount}명 더</span>
            )}
          </span>
        </span>
      )}
    </span>
  );
}

/** 순위 원반. 1·2·3 이 곧 금·은·동이다. 색만으로는 구분이 어려우므로 숫자를 함께 새긴다. */
function Medal({ rank }) {
  const tone = {
    1: "border-[#DEC489] bg-[#F7EBCB] text-[#8A6416]",
    2: "border-[#C9D4DE] bg-[#EAEFF4] text-[#5A6875]",
    3: "border-[#D9B594] bg-[#F3E1D3] text-[#8A5731]",
  }[rank];
  const ribbon = { 1: "bg-[#D9B96F]", 2: "bg-[#B9C6D2]", 3: "bg-[#CFA381]" }[rank];
  return (
    <span className="relative inline-block h-6 w-6 shrink-0">
      {/*
        리본 두 가닥은 원반보다 **먼저** 그린다. 둘 다 자리를 잡은 요소라 나중에 오는
        원반이 위에 덮여, 겹치는 아래쪽은 가려지고 위로 5px 만 드러난다.
        z-index 로 뒤에 깔면 안 된다 — Surface 가 쌓임 맥락을 만들지 않아 음수 z-index 가
        카드의 흰 배경 뒤까지 내려가 리본이 통째로 사라진다(2026-09-03 실측).
      */}
      <span aria-hidden="true" className={`absolute -top-[5px] left-1 h-[14px] w-[5px] rotate-[20deg] rounded-[1px] ${ribbon}`} />
      <span aria-hidden="true" className={`absolute -top-[5px] right-1 h-[14px] w-[5px] -rotate-[20deg] rounded-[1px] ${ribbon}`} />
      <span
        aria-hidden="true"
        className={`relative grid h-full w-full place-items-center rounded-full border text-body-small font-bold tabular-nums ${tone}`}
      >
        {rank}
      </span>
      <span className="sr-only">{rank}위</span>
    </span>
  );
}

function RankList({ rows, renderName }) {
  return (
    <ol className="space-y-1">
      {rows.map((row) => (
        <li key={row.rank} className="flex items-center gap-2.5 py-1">
          <Medal rank={row.rank} />
          <span className="flex-1 text-body text-ink-strong">
            {renderName(row.leader)}
            {row.otherCount > 0 && (
              <OtherNames others={row.others} otherCount={row.otherCount} render={renderName} />
            )}
          </span>
          <span className="shrink-0 text-body-small font-medium tabular-nums text-ink-default">
            {row.correctCount}개
          </span>
        </li>
      ))}
    </ol>
  );
}

function Board({ board }) {
  if (board.people.top.length === 0) {
    return (
      <p className="px-1 py-6 text-center text-body-small text-ink-muted">
        아직 아무도 문제를 맞히지 않았습니다.
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-5">
      <div>
        <p className="mb-2 text-label font-bold uppercase tracking-wide text-ink-muted">개인</p>
        <RankList rows={board.people.top} renderName={(p) => `${p.departmentName} ${p.name}`} />
        <p className="mt-3 border-t border-line-default pt-3 text-body-small text-ink-muted">
          {board.people.me
            ? `내 순위 ${board.people.me.rank}위 · ${board.people.me.correctCount}개`
            : "아직 맞힌 문제가 없습니다."}
        </p>
      </div>

      <div>
        <p className="mb-2 text-label font-bold uppercase tracking-wide text-ink-muted">팀</p>
        <RankList rows={board.teams.top} renderName={(t) => t.departmentName} />
        <p className="mt-3 border-t border-line-default pt-3 text-body-small text-ink-muted">
          {board.teams.mine
            ? `우리 팀 ${board.teams.mine.rank}위 · ${board.teams.mine.correctCount}개`
            : "우리 팀은 아직 맞힌 문제가 없습니다."}
        </p>
      </div>
    </div>
  );
}

/**
 * 학습 홈의 명예의 전당. 맞힌 개수로 줄을 세운다.
 *
 * 순위 숫자는 "몇 번째 점수대"라는 뜻이다 — 1위가 여러 명이어도 다음 줄은 2위다. 그래서
 * 내 순위에도 맞힌 개수를 함께 적는다. "3위"만 있으면 위에 두 사람만 있다고 오해한다.
 */
export default function HallOfFameCard() {
  const [data, setData] = useState(null);
  const [tab, setTab] = useState("month");
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    fetchHallOfFame()
      .then((res) => {
        if (!cancelled) setData(res);
      })
      .catch((err) => {
        if (!cancelled) setError(resolveErrorMessage(err, "명예의 전당을 불러오지 못했습니다."));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <Surface className="p-5">
      <div className="flex items-center gap-2">
        <span className="inline-flex h-10 w-10 items-center justify-center rounded-md bg-surface-blue text-brand-blue">
          <Trophy size={22} aria-hidden="true" />
        </span>
        <p className="text-section-title font-semibold text-ink-strong">명예의 전당</p>
      </div>

      <div className="mt-3 flex gap-1" role="tablist" aria-label="집계 기간">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={tab === t.key}
            onClick={() => setTab(t.key)}
            className={`rounded-sm px-3 py-1 text-body-small font-medium focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-brand-aqua ${
              tab === t.key ? "bg-surface-blue text-info-text" : "text-ink-muted hover:text-ink-strong"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="mt-4">
        {error ? (
          <p className="px-1 py-6 text-center text-body-small text-ink-muted">{error}</p>
        ) : !data ? (
          <p className="px-1 py-6 text-center text-body-small text-ink-muted">불러오는 중...</p>
        ) : (
          <Board board={data[tab]} />
        )}
      </div>
    </Surface>
  );
}
```

- [ ] **Step 2: 학습 홈에 붙인다**

`web/screens/solve/SolveHomePage.jsx` 의 import 에 한 줄을 더한다:

```jsx
import HallOfFameCard from "@/components/solve/HallOfFameCard.jsx";
```

그리고 카드 세 개를 감싼 `</div>` 뒤, `</>` 앞에 다음을 넣는다:

```jsx
      <div className="mt-4">
        <HallOfFameCard />
      </div>
```

- [ ] **Step 3: 구문·타입 검사와 전체 스위트**

```bash
cd web && ./node_modules/.bin/esbuild components/solve/HallOfFameCard.jsx --loader:.jsx=jsx --outfile=/dev/null
cd web && node node_modules/vitest/vitest.mjs run
cd web && npx tsc --noEmit
```

`esbuild` 는 반드시 `web` 디렉터리에서 실행한다 — 상위에서 부르면 실행 파일을 못 찾아 실패한다(2026-09-03 실측).

- [ ] **Step 4: 빌드**

dev 서버가 떠 있으면 먼저 내린다.

```bash
cd web && rm -rf .next && npx next build
```

기대: Errors 0, Warnings 0.

- [ ] **Step 5: 브라우저로 실측한다**

```bash
cd web && rm -rf .next && npx next dev -p 3300
```

`plan_emp` / `Test1234!` 로 로그인해 학습 홈에서 확인한다.

- 카드 세 개 아래 "명예의 전당"이 보인다
- 탭이 **이번 달**·**전체 기간** 둘이고 기본은 이번 달이다
- 아무도 맞히지 않은 기간에는 "아직 아무도 문제를 맞히지 않았습니다"가 나온다
- **개인 묶음과 팀 묶음이 위아래로 보이고**, 각 줄 앞에 금·은·동 원반과 리본이 그려진다
- 리본이 원반 위로 5px 만 드러나고 잘리지 않는다
- 문제를 몇 개 풀고 돌아오면 내 이름과 우리 팀이 뜬다
- 다른 계정(`it_emp` 등)으로도 풀어 동점을 만든 뒤, "외 N명"에 **마우스를 올리면** 이름이 뜨고 **누르면** 고정되고 **Esc** 로 닫힌다
- 내 순위 줄과 우리 팀 줄에 순위와 개수가 함께 적힌다
- 다른 팀 계정(`sales_emp` 등)으로도 풀어 팀 순위가 두 줄 이상이 되는지 본다
- 콘솔 오류 0건

- [ ] **Step 6: 커밋**

```bash
git add web/components/solve/HallOfFameCard.jsx web/screens/solve/SolveHomePage.jsx
git commit -m "[ADD] 학습 홈 명예의 전당 카드"
```

---

## 운영 반영 시 주의

**마이그레이션이 없다.** 새 표를 만들지 않으므로 코드만 배포하면 된다.

배포 직후 명단은 비어 있거나 한 명뿐일 수 있다 — 2026-09-03 운영 실측으로 `attempts` 14건, 푼 사람 1명이다. 빈 상태가 예외가 아니라 기본이므로, 화면이 비었다고 고장으로 보지 마라.

## 이 계획이 다루지 않는 것

- 팀 안에서의 내 순위(전사 순위와 우리 팀 순위만 보여 준다)
- 연속 학습일·배지·보상
- 관리자용 전체 순위표
- 지난달 순위 보관
- `attempts` 인덱스 — 지금 14건이라 필요 없다. 수십만 건을 넘으면 `submitted_at` 인덱스를 더한다
