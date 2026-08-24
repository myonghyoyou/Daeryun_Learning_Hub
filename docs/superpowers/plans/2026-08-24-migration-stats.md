# 서브플랜 6 (통계·대시보드) 이관 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Spring 의 통계·대시보드 3개 엔드포인트를 Next.js 로 이관하고, 서브플랜 5가 빠뜨린 `GET /api/departments` 를 채우고, 서브플랜 3이 "5·6 전에 정하라"고 남긴 타임스탬프 컨벤션을 확정한다. **이 서브플랜이 끝나면 Spring 표면 31개가 전부 이관된다.**

**Architecture:** 앞의 세 서브플랜과 같은 3층 — route(`app/api/**`, `requireActor(...)` + `handleRoute`) → service(`lib/stats/*`) → DAO(`lib/db/*`, 전부 `DbConn` 첫 인자). 집계 SQL 은 Drizzle 로 표현이 안 되는 부분이 있어 `lib/db/raw.ts` 의 `executeRows` 로 원시 SQL 을 쓴다.

**Tech Stack:** Next.js 15 (App Router, `runtime = "nodejs"`), Drizzle + postgres.js, Vitest.

## Global Constraints

정답지: `docs/qa/2026-08-24-stats-parity-checklist.md` (65행). 아래는 그 위에 얹히는 프로젝트 규칙이다.

- **한글 메시지는 글자 단위로 일치.** 여러 규칙이 동시에 깨졌을 때 **어느 메시지가 먼저 나오는지도 계약**이다.
- **파리티 문자열 단언에 `toThrow("문자열")` 을 쓰지 마라** — Vitest 에서 부분 문자열 매칭이다.
- **응답의 키 집합을 고정하라.** 내용 단언(거부목록)은 이 이관에서 세 번 뚫렸다.
- **TS 의 `!` 는 런타임 가드가 아니다.** Java 가 그 자리에서 죽는다면 포트도 명시적으로 던져라.
- **픽스처가 퇴화형이 아닌지 확인하라.** `truncateAll()` 이 `RESTART IDENTITY` 를 돌리므로 서로 다른 테이블의 id 가 나란히 1, 2 를 받는다 — 두 필드를 맞바꿔도 값이 같아진다.
- 모든 DAO 는 첫 인자가 `DbConn`. 라우트만 `getDb()` 를 넘긴다.
- **테스트는 `.env` 를 로드하지 않는다.** `truncateAll()` 은 인자를 받지 않는다.
- 모든 `pnpm` 명령 앞에 `export NODE_EXTRA_CA_CERTS="C:/Users/dda2220017/.certs/corp-root-ca.pem"`.
- 착수 시점 스위트: **610 통과 / 53 파일**.
- `backend/**` 는 읽기만 한다.

> **이 서브플랜의 성격이 다르다.** 4·5는 "요청 → 저장/조회"였지만 여기는 **집계**다. 틀려도 예외가 안 나고 화면에 그럴듯한 숫자가 뜬다. 판별자가 **경계값**(0건·null·동률)과 **범위**(활성만이냐 보관 포함이냐)에 몰려 있으므로 테스트도 거기에 배치한다.

## 승인된 이탈

| # | 항목 | Spring | 이 포트 | 근거 |
|---|---|---|---|---|
| **㉠** | 정렬이 SQL·Java 두 곳(L9·L10) | SQL 이 정렬하고 Java 비교자가 같은 규칙을 재적용(no-op) | **SQL 만 남긴다** | Java 비교자는 "의도를 테스트로 고정"하는 역할인데, 포트는 그 의도를 **DAO 단위 테스트로 직접** 고정할 수 있다. 두 곳을 유지하면 원저자가 경고한 "한쪽만 고쳐 어긋남" 위험만 남는다. **대신 DAO 테스트가 정렬 규칙 셋(오름차순·NULLS LAST·id 타이브레이커)을 각각 고정해야 한다** — 안 하면 이탈이 아니라 그냥 커버리지 손실이다 |
| **㉡** | `listAllProblemStats` 가 전 문제를 메모리로(B3~B10) | 페이징 없이 전체 조회 후 Java 에서 합산·필터 | **그대로 이식** | 집계를 SQL 로 옮기면 `needsReview` 의 4중 조건이 SQL 과 Java 로 흩어져 B8 이 경고한 "두 지표가 어긋나는" 위험이 생긴다. 722문항 규모에서 감당 가능. 성능은 컷오버 후 실측 |

---

## 이 계획서가 서브플랜 5의 누락을 함께 닫는다

착수 전 전체 검토에서 **Spring 31개 vs 포트 28개**가 나왔다. 셋은 이 서브플랜이 만들고, 나머지 하나가 **누락**이다.

설계 스펙의 컨트롤러 배정표는 `DepartmentOptionController` 를 **서브플랜 5**에 배정했는데, 서브플랜 5의 정답지가 `SolveController`·`AttemptController` 를 읽어 범위를 잡으면서 배정표를 보지 않았다. 87행 어디에도 없다.

**실제 영향:** `frontend/src/pages/solve/RandomSetupPage.jsx:34` 가 `GET /api/departments` 를 호출한다. 라우트가 없으니 직원의 **랜덤 풀이 부서 선택 드롭다운이 실패**한다("부서 목록을 불러오지 못했습니다."). 랜덤 세트 자체는 동작하는데 부서를 고를 방법이 없다.

Task 2 가 이걸 채운다.

---

## File Structure

| 파일 | 책임 | Task |
|---|---|---|
| `web/lib/db/departments.ts` | **수정.** `findActiveDepartments` 추가 | 2 |
| `web/app/api/departments/route.ts` | **신규.** 로그인 사용자용 활성 부서 선택지 | 2 |
| `web/lib/db/stats.ts` | **신규.** 집계 SQL 5개(목록·총건수·전체·활성수·단건) | 3 |
| `web/lib/stats/statsService.ts` | **신규.** 스코프·클램프·정답률 계산·상세 조립 | 4 |
| `web/app/api/admin/stats/problems/route.ts` | **신규.** `GET` 목록 | 4 |
| `web/app/api/admin/stats/problems/[id]/route.ts` | **신규.** `GET` 상세 | 4 |
| `web/lib/stats/dashboardService.ts` | **신규.** 요약 집계 + `needsReview` | 5 |
| `web/app/api/admin/dashboard/route.ts` | **신규.** `GET` 요약 | 5 |
| `docs/qa/2026-08-24-stats-e2e-verification.md` | **신규.** E2E 실측 + **이관 전체 컷오버 통합 목록** | 6 |

> **경로 주의.** `/api/admin/stats/**` 와 `/api/admin/dashboard` 는 **역할 게이트가 있다**(`{SUPER_ADMIN, DEPT_ADMIN}`). 서브플랜 5의 `/api/problems/**` 는 정반대로 역할 제한이 없었다 — 그 관용구를 복사해 오면 EMPLOYEE 에게 통계가 열린다.

---

## 실행 구간 (3구간)

| 구간 | Task | 끝났을 때 동작하는 것 | 상태 |
|---|---|---|---|
| **N1 기반** | 0 + 1 + 2 | 타임스탬프 컨벤션 확정 + 집계 DAO + `GET /api/departments`. **서브플랜 5의 누락이 닫힌다** | ☐ |
| **N2 통계** | 3 + 4 | 통계 목록·상세 2개 | ☐ |
| **N3 대시보드·검증** | 5 + 6 | 대시보드 1개 + E2E + 컷오버 통합 목록. **Spring 표면 31개 전부 이관 완료** | ☐ |

**구간을 마칠 때마다** `cd web && pnpm test && pnpm build` 가 통과해야 머지한다. ☐ 를 ☑ 로 바꾸고 그 변경도 함께 커밋한다.

---

## Task 0: 타임스탬프 직렬화 컨벤션 확정

**Files:**
- Modify: `docs/qa/2026-08-16-dept-users-parity-checklist.md` (이탈 ⑦ 을 "확정"으로)
- Create: `web/lib/http/timestamp.test.ts` (컨벤션을 테스트로 고정)

**왜 지금인가.** 서브플랜 3의 이탈 ⑦ 이 이렇게 적혀 있다:

> API 타임스탬프 UTC 직렬화 … **Plan 5·6에서 타임스탬프가 대량 노출되기 전에 컨벤션으로 고정해 둔다** | 컷오버 전 확정 필요

고정되지 않았고, 서브플랜 5가 같은 것을 "새 발견"으로 다시 찾았다(그 E2E 문서 F1·C3). 이 서브플랜은 `lastAttemptAt` 을 **목록 행마다**, `submittedAt` 을 **오답 표본마다** 내보낸다 — 타임스탬프를 대량 노출하는 **세 번째** 서브플랜이다. 더 미루면 네 번째가 된다.

- [ ] **Step 1: 현재 동작을 확정 사실로 적는다**

이미 실측된 것(서브플랜 5 E2E 문서):
- Java `LocalDateTime` → `"2026-08-21T17:30:05.907937"` (존 정보 없음)
- 포트 → `"2026-08-21T17:30:05.907Z"` (UTC, `Z` 접미사)
- **민감한 것은 Node 프로세스 TZ 가 아니라 DB 세션 TZ 다.** Drizzle 은 `value + "+0000"` 으로 **항상 UTC 파싱**한다(`drizzle-orm/pg-core/columns/timestamp.js`). 현재 `current_setting('TimeZone')` = `Etc/UTC`

- [ ] **Step 2: 컨벤션을 테스트로 고정한다**

```typescript
// web/lib/http/timestamp.test.ts
import { describe, it, expect } from "vitest";
import { parseUtcTimestamp } from "../db/raw";

describe("타임스탬프 컨벤션 (서브플랜 3 이탈 ⑦ 확정)", () => {
  it("timestamp(무 tz) 텍스트를 UTC 로 읽는다 — DB 세션 TZ 에 의존하지 않는다", () => {
    // Drizzle 이 `value + "+0000"` 으로 파싱하는 것과 같은 규칙이다.
    expect(parseUtcTimestamp("2026-08-21 17:30:05.907")!.toISOString())
      .toBe("2026-08-21T17:30:05.907Z");
  });

  it("JSON 직렬화는 Z 접미사를 단다 — Java LocalDateTime 과 다르다(이탈 ⑦)", () => {
    // Java: "2026-08-21T17:30:05.907937" (존 없음)
    // 포트: "2026-08-21T17:30:05.907Z"
    // 프론트가 `new Date(v).toLocaleString()` 으로 현지화하므로 화면 표시는 같다.
    expect(JSON.stringify({ at: parseUtcTimestamp("2026-08-21 17:30:05.907") }))
      .toBe('{"at":"2026-08-21T17:30:05.907Z"}');
  });

  it("null 은 null 이다", () => expect(parseUtcTimestamp(null)).toBeNull());
});
```

- [ ] **Step 3: 이탈 ⑦ 을 "확정"으로 고쳐 쓴다**

`docs/qa/2026-08-16-dept-users-parity-checklist.md` 의 이탈 ⑦ 에서 **"컷오버 전 확정 필요"를 지우고** 확정 사실로 바꾼다:
- 컨벤션: **UTC + `Z` 접미사**. 표시 현지화는 프론트 책임
- 근거: Drizzle 이 항상 `+0000` 으로 파싱하므로 포트 내부는 일관된다
- **컷오버에서 확인할 것은 서버 TZ 가 아니라 `current_setting('TimeZone')`** 이다

- [ ] **Step 4: Commit**

```bash
cd web && export NODE_EXTRA_CA_CERTS="C:/Users/dda2220017/.certs/corp-root-ca.pem" && pnpm test
git add web/lib/http/timestamp.test.ts docs/qa/2026-08-16-dept-users-parity-checklist.md
git commit -m "docs: settle the timestamp serialization convention before stats exposes more"
```

---

## Task 1: 집계 DAO

**Files:**
- Create: `web/lib/db/stats.ts`, `web/lib/db/stats.test.ts`

**Interfaces:**
- Consumes: `DbConn`, `executeRows`·`parseUtcTimestamp`(`lib/db/raw`), 스키마의 `problems`·`departments`·`attempts`
- Produces:
  ```ts
  export type ProblemStatRow = {
    problemId: number; content: string; type: string; status: string;
    departmentId: number; departmentName: string;
    totalAttempts: number; correctAttempts: number; lastAttemptAt: Date | null;
  };
  export async function findProblemStats(
    db: DbConn, f: { departmentId?: number | null; status?: string | null; limit: number; offset: number }): Promise<ProblemStatRow[]>;
  export async function countProblemStats(
    db: DbConn, f: { departmentId?: number | null; status?: string | null }): Promise<number>;
  export async function findAllProblemStats(db: DbConn, departmentId?: number | null): Promise<ProblemStatRow[]>;
  export async function countActiveProblems(db: DbConn, departmentId?: number | null): Promise<number>;
  export async function findProblemStat(db: DbConn, problemId: number): Promise<ProblemStatRow | null>;
  export async function countAnalyzedAttempts(db: DbConn, problemId: number): Promise<number>;
  export async function findChoiceDistribution(
    db: DbConn, problemId: number): Promise<{ choiceId: number; selectedCount: number }[]>;
  export async function findRecentWrong(
    db: DbConn, problemId: number, limit: number): Promise<{ submittedAnswer: string | null; submittedAt: Date }[]>;
  ```

- [ ] **Step 1: 정렬 규칙 세 가지의 실패 테스트를 쓴다 — 이탈 ㉠ 이 여기 걸려 있다**

정답지 L6·L7·L8. **이탈 ㉠ 으로 Java 재정렬을 뺐으므로, 이 셋이 여기서 안 고정되면 아무 데서도 안 고정된다.**

```typescript
// web/lib/db/stats.test.ts
const db = testDb();
let deptId = 0, userId = 0;

beforeAll(async () => { await migrateTestDb(); });
beforeEach(async () => {
  await truncateAll();
  [{ id: deptId }] = await db.insert(departments)
    .values({ name: "가팀", code: "A", status: "ACTIVE" }).returning({ id: departments.id });
  // problems.created_by 는 NOT NULL + users FK 다.
  [{ id: userId }] = await db.insert(users).values({
    employeeNo: "admin", name: "관리자", email: "a@b.c", passwordHash: "x",
    departmentId: deptId, role: "SUPER_ADMIN", status: "ACTIVE", mustChangePassword: false,
  }).returning({ id: users.id });
});

/** 문제 하나를 만들고 정답/오답 시도를 원하는 만큼 붙인다. */
async function seedWithAttempts(over: Partial<typeof problems.$inferInsert>, correct: number, wrong: number) {
  const [p] = await db.insert(problems).values({
    type: "OX", content: "본문", departmentId: deptId, status: "ACTIVE", createdBy: userId, ...over,
  }).returning({ id: problems.id });
  const rows = [
    ...Array.from({ length: correct }, () => ({ userId, problemId: p.id, submittedAnswer: "가", isCorrect: true })),
    ...Array.from({ length: wrong }, () => ({ userId, problemId: p.id, submittedAnswer: "나", isCorrect: false })),
  ];
  if (rows.length) await db.insert(attempts).values(rows);
  return p.id;
}

describe("findProblemStats — 정렬 (이탈 ㉠: SQL 만 정렬한다)", () => {
  it("L6: 정답률 오름차순", async () => {
    const high = await seedWithAttempts({ content: "80%" }, 4, 1);   // 0.8
    const low  = await seedWithAttempts({ content: "20%" }, 1, 4);   // 0.2
    const mid  = await seedWithAttempts({ content: "50%" }, 1, 1);   // 0.5
    const rows = await findProblemStats(db, { limit: 100, offset: 0 });
    expect(rows.map((r) => r.problemId)).toEqual([low, mid, high]);
  });

  it("L7: 미응시(시도 0건)는 맨 뒤 — 0% 가 아니다", async () => {
    const none = await seedWithAttempts({ content: "미응시" }, 0, 0);
    const zero = await seedWithAttempts({ content: "전부오답" }, 0, 3);   // 0.0
    const rows = await findProblemStats(db, { limit: 100, offset: 0 });
    // 0.0 이 맨 앞, null 이 맨 뒤. 이 둘을 못 가르면 "미응시"와 "전부 틀림"이 섞인다.
    expect(rows.map((r) => r.problemId)).toEqual([zero, none]);
    expect(rows[0].totalAttempts).toBe(3);
    expect(rows[1].totalAttempts).toBe(0);
  });

  it("L8: 동률은 problemId 오름차순", async () => {
    const a = await seedWithAttempts({ content: "a" }, 1, 1);
    const b = await seedWithAttempts({ content: "b" }, 2, 2);   // 같은 0.5
    const rows = await findProblemStats(db, { limit: 100, offset: 0 });
    expect(rows.map((r) => r.problemId)).toEqual([a, b].sort((x, y) => x - y));
  });

  it("L8: 타이브레이커가 페이징 경계에서 중복·누락을 막는다", async () => {
    // 전부 같은 정답률로 만들어 타이브레이커만이 순서를 결정하게 한다.
    for (let i = 0; i < 6; i++) await seedWithAttempts({ content: `q${i}` }, 1, 1);
    const p1 = await findProblemStats(db, { limit: 3, offset: 0 });
    const p2 = await findProblemStats(db, { limit: 3, offset: 3 });
    const ids = [...p1, ...p2].map((r) => r.problemId);
    expect(new Set(ids).size).toBe(6);   // 중복 없음
  });
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `cd web && export NODE_EXTRA_CA_CERTS="C:/Users/dda2220017/.certs/corp-root-ca.pem" && npx vitest run lib/db/stats.test.ts`
Expected: FAIL — `Cannot find module './stats'`

- [ ] **Step 3: 집계 DAO 를 구현한다**

`StatsMapper.xml` 을 그대로 미러한다. **정렬식은 Drizzle 로 표현하기 어려우므로 원시 SQL 을 쓴다.**

```typescript
// web/lib/db/stats.ts (발췌)
import { sql, type SQL } from "drizzle-orm";
import type { DbConn } from "./client";
import { executeRows, parseUtcTimestamp } from "./raw";

export type ProblemStatRow = {
  problemId: number; content: string; type: string; status: string;
  departmentId: number; departmentName: string;
  totalAttempts: number; correctAttempts: number; lastAttemptAt: Date | null;
};

// StatsMapper.xml:15-20 statsColumns 미러.
const STAT_COLUMNS = sql`
  p.id AS problem_id, p.content, p.type, p.status, p.department_id, d.name AS department_name,
  COUNT(a.id) AS total_attempts,
  COALESCE(SUM(CASE WHEN a.is_correct THEN 1 ELSE 0 END), 0) AS correct_attempts,
  MAX(a.submitted_at) AS last_attempt_at`;

/**
 * StatsMapper.xml:32-36 accuracyOrder 미러.
 *
 * **승인된 이탈 ㉠ — Java 는 이 정렬을 서비스에서 한 번 더 한다(no-op). 포트는 여기만 한다.**
 * 그래서 이 정렬식이 이 서브플랜에서 **유일한** 정렬 근거다. `NULLIF` 가 시도 0건을 NULL 로
 * 만들고 `NULLS LAST` 가 그것을 맨 뒤로 보낸다(= 미응시, 0% 가 아니다). 마지막 `p.id` 는
 * 동률 타이브레이커다 — 없으면 페이징 경계에서 중복·누락이 생긴다.
 */
const ACCURACY_ORDER = sql`
  ORDER BY (COALESCE(SUM(CASE WHEN a.is_correct THEN 1 ELSE 0 END), 0)::numeric
            / NULLIF(COUNT(a.id), 0)) ASC NULLS LAST,
           p.id`;

type RawStatRow = Omit<ProblemStatRow, "lastAttemptAt" | "totalAttempts" | "correctAttempts"> & {
  total_attempts: string; correct_attempts: string; last_attempt_at: string | null;
  problem_id: number; department_id: number; department_name: string;
};

// postgres.js 는 COUNT/SUM 을 문자열로 준다(bigint/numeric) — Number 로 바꿔야 한다.
function toStatRow(r: RawStatRow): ProblemStatRow {
  return {
    problemId: Number(r.problem_id), content: r.content, type: r.type, status: r.status,
    departmentId: Number(r.department_id), departmentName: r.department_name,
    totalAttempts: Number(r.total_attempts), correctAttempts: Number(r.correct_attempts),
    lastAttemptAt: parseUtcTimestamp(r.last_attempt_at),
  };
}

function statsWhere(f: { departmentId?: number | null; status?: string | null }): SQL {
  const parts: SQL[] = [];
  if (f.departmentId != null) parts.push(sql`p.department_id = ${f.departmentId}`);
  // 빈 문자열은 필터가 아니다 — MyBatis `<if test="status != '' ">` 미러(정답지 L5).
  if (f.status != null && f.status !== "") parts.push(sql`p.status = ${f.status}`);
  return parts.length === 0 ? sql`` : sql`WHERE ${sql.join(parts, sql` AND `)}`;
}

export async function findProblemStats(
  db: DbConn,
  f: { departmentId?: number | null; status?: string | null; limit: number; offset: number },
): Promise<ProblemStatRow[]> {
  const rows = await executeRows<RawStatRow>(db, sql`
    SELECT ${STAT_COLUMNS}
    FROM problems p
    JOIN departments d ON d.id = p.department_id
    LEFT JOIN attempts a ON a.problem_id = p.id
    ${statsWhere(f)}
    GROUP BY p.id, d.name
    ${ACCURACY_ORDER}
    LIMIT ${f.limit} OFFSET ${f.offset}`);
  return rows.map(toStatRow);
}

// StatsMapper.xml:49-55 — **attempts 조인을 넣지 않는다.** 필터가 p.* 만 보므로 불필요하고,
// 넣은 채 count(*) 를 쓰면 시도 수만큼 부풀어 총건수가 틀린다(정답지 L11).
export async function countProblemStats(
  db: DbConn, f: { departmentId?: number | null; status?: string | null },
): Promise<number> {
  const [row] = await executeRows<{ count: string }>(db, sql`
    SELECT count(*) AS count FROM problems p ${statsWhere(f)}`);
  return Number(row.count);
}
```

> **`countAnalyzedAttempts` 를 조심하라(정답지 D13).** `attempt_choices` 를 `problem_choices` 에
> **`c.problem_id = a.problem_id` 로 조인**해 현재 보기와 맞는 것만 센다. 이 조인 조건을 빼면
> `excludedAttempts` 가 항상 0 이 되어 D12 가 설명하는 "분포 합계 ≠ 시도 수"가 다시 버그처럼 보인다.

- [ ] **Step 4: 통과 확인 + 나머지 DAO 테스트**

정답지 L5·L11·D13·D15 를 각각 고정한다:

```typescript
it("L11: totalCount 는 시도 수에 부풀지 않는다", async () => {
  await seedWithAttempts({ content: "시도 5건" }, 3, 2);
  expect(await countProblemStats(db, {})).toBe(1);   // 5 가 아니다
});

it("L5: status 빈 문자열은 필터가 아니다", async () => {
  await seedWithAttempts({ content: "활성" }, 0, 0);
  await seedWithAttempts({ content: "보관", status: "ARCHIVED" }, 0, 0);
  expect((await findProblemStats(db, { status: "", limit: 100, offset: 0 })).length).toBe(2);
  expect((await findProblemStats(db, { status: "ACTIVE", limit: 100, offset: 0 })).length).toBe(1);
});

it("L4: status 필터를 안 주면 보관 문제도 나온다", async () => {
  await seedWithAttempts({ content: "보관", status: "ARCHIVED" }, 1, 1);
  expect((await findProblemStats(db, { limit: 100, offset: 0 })).length).toBe(1);
});

it("D13: excludedAttempts 의 근거 — 다른 문제의 choiceId 는 안 센다", async () => {
  // 문제 A 의 시도가 문제 B 의 choiceId 를 갖고 있으면 분석 대상이 아니다.
  // 조인 조건 `c.problem_id = a.problem_id` 를 빼면 이 테스트가 빨개진다.
});

it("D15: 오답만, submitted_at DESC, id DESC, limit", async () => {
  // submittedAt 을 **명시적으로** 넣는다 — defaultNow() 에 맡기면 같은 값을 받아
  // 타이브레이커 없이 순서가 흔들린다(서브플랜 5에서 같은 함정이 있었다).
});
```

- [ ] **Step 5: 변이 테스트**

| 변이 | 빨개져야 하는 테스트 |
|---|---|
| `ASC` → `DESC` | L6 |
| `NULLS LAST` 제거 | L7 |
| `, p.id` 제거 | L8 (동률·페이징) |
| `NULLIF(COUNT(a.id), 0)` → `COUNT(a.id)` | L7 (0 나눗셈 → 결과가 달라진다) |
| `countProblemStats` 에 `LEFT JOIN attempts` 추가 | L11 |
| `statsWhere` 의 `status !== ""` 제거 | L5 |
| `countAnalyzedAttempts` 의 `c.problem_id = a.problem_id` 제거 | D13 |

- [ ] **Step 6: 전체 스위트 + Commit**

```bash
cd web && pnpm test
git add web/lib/db/stats.ts web/lib/db/stats.test.ts
git commit -m "feat: add aggregate statistics data access"
```

---

## Task 2: `GET /api/departments` — 서브플랜 5의 누락을 채운다

**Files:**
- Modify: `web/lib/db/departments.ts` (`findActiveDepartments` 추가)
- Create: `web/app/api/departments/route.ts`, `.../route.test.ts`
- Modify: `docs/qa/2026-08-21-solve-parity-checklist.md` (누락 기록 + 행 추가)

**Interfaces:**
- Produces: `export async function findActiveDepartments(db: DbConn): Promise<{ id: number; name: string; code: string }[]>`

**근거 (실측):**
- `DepartmentMapper.xml:24-26` — `SELECT id, name, code, status, created_at FROM departments WHERE status = 'ACTIVE' ORDER BY name`
- `DepartmentOptionServiceImpl` 이 그것을 `DepartmentOption(id, name, code)` **3필드로 줄인다**
- `DepartmentOptionController` 에 **`@RequireRole` 이 없다** — 로그인만 하면 누구나. 클래스 주석이 이유를 적는다: *"랜덤 풀이에서 부서를 고르려면 직원도 목록이 필요한데, 관리자용 `/api/admin/departments` 는 SUPER_ADMIN 전용이다"*

- [ ] **Step 1: 실패 테스트를 쓴다**

```typescript
it("활성 부서만 이름 오름차순으로 준다", async () => {
  await db.insert(departments).values([
    { name: "나팀", code: "B", status: "ACTIVE" },
    { name: "가팀", code: "A", status: "ACTIVE" },
    { name: "폐지팀", code: "Z", status: "INACTIVE" },
  ]);
  const res = await GET();
  const body = await res.json();
  expect(body.data.map((d: { name: string }) => d.name)).toEqual(["가팀", "나팀"]);
});

it("응답 필드는 정확히 id·name·code 다 — status·createdAt 은 안 나간다", async () => {
  // 관리자용 /api/admin/departments 는 전체 행을 준다. 같은 DAO 를 재사용하면 여기서 걸린다
  // (findAllTags vs findInUseTags 와 같은 함정).
  await db.insert(departments).values({ name: "가팀", code: "A", status: "ACTIVE" });
  const body = await (await GET()).json();
  expect(Object.keys(body.data[0]).sort()).toEqual(["code", "id", "name"]);
});

it("EMPLOYEE 도 쓸 수 있다 — 역할 제한이 없다", async () => {
  state.currentUser = { ...employee, role: "EMPLOYEE" };
  expect((await GET()).status).toBe(200);
});

it("비로그인은 401", async () => {
  state.currentUser = null;
  expect((await GET()).status).toBe(401);
});
```

- [ ] **Step 2: 실패 확인 → 구현 → 통과 확인**

```typescript
// web/lib/db/departments.ts 에 추가
// DepartmentMapper.xml:24-26 findAllActive 미러. **관리자 목록(findAllDepartments)과 다른
// 쿼리다** — 여기는 활성만이고, 서비스가 id·name·code 3필드로 줄인다(정답지 참고).
export async function findActiveDepartments(db: DbConn) {
  return db.select({ id: departments.id, name: departments.name, code: departments.code })
    .from(departments)
    .where(eq(departments.status, "ACTIVE"))
    .orderBy(asc(departments.name));
}
```

```typescript
// web/app/api/departments/route.ts
export const runtime = "nodejs";

/**
 * 로그인한 사용자라면 누구나 부서 선택지를 조회할 수 있다 — 랜덤 풀이에서 부서를 고르려면
 * 직원도 목록이 필요한데, 관리자용 `/api/admin/departments` 는 SUPER_ADMIN 전용이다.
 * `DepartmentOptionController` 미러이며 `@RequireRole` 이 없다.
 *
 * **이 라우트는 서브플랜 5가 빠뜨린 것이다.** 설계 배정표는 이걸 서브플랜 5에 배정했는데
 * 그 정답지가 SolveController 를 읽어 범위를 잡으면서 놓쳤다. 프론트
 * (`RandomSetupPage.jsx:34`)가 이미 호출하고 있어 부서 드롭다운이 실패하던 상태였다.
 */
export async function GET(): Promise<Response> {
  return handleRoute(async () => {
    await requireActor();        // 역할 제한 없음 — 로그인만 확인한다
    return findActiveDepartments(getDb());
  });
}
```

- [ ] **Step 3: 서브플랜 5 정답지에 누락을 기록한다**

`docs/qa/2026-08-21-solve-parity-checklist.md` 에 **U 절 뒤로 새 절**을 붙인다:

```markdown
## V. 부서 선택지 — `GET /api/departments` (서브플랜 6에서 뒤늦게 채움)

> **이 엔드포인트는 서브플랜 5가 빠뜨렸다.** 설계 스펙의 컨트롤러 배정표가 이걸 서브플랜 5에
> 배정했는데, 정답지가 `SolveController`·`AttemptController` 를 읽어 범위를 잡으면서 배정표를
> 보지 않았다. 착수 전 전체 검토에서 **Spring 31개 vs 포트 28개** 대조로 발견됐다.
> 구현은 서브플랜 6 Task 2 다.

| # | 시나리오 | 기대 | 근거 |
|---|---|---|---|
| V1 | 범위 | **활성 부서만** | `DepartmentMapper.xml:24-26` |
| V2 | 정렬 | 이름 오름차순 | 같은 곳 |
| V3 | 응답 필드 | 정확히 `{id, name, code}` — **`status`·`createdAt` 은 빠진다** | `DepartmentOptionServiceImpl` 이 3필드로 줄인다 |
| V4 | 권한 | `@RequireRole` 없음 — 로그인만 하면 누구나 | `DepartmentOptionController` 클래스 주석 |
| V5 | 관리자 목록과의 차이 | `/api/admin/departments` 는 SUPER_ADMIN 전용이고 전체 행을 준다 — **다른 쿼리·다른 DTO** | 같은 주석 |
| V6 | 프론트 소비처 | `RandomSetupPage.jsx:34` 의 부서 드롭다운 | 이 라우트가 없으면 "부서 목록을 불러오지 못했습니다." |
```

- [ ] **Step 4: 전체 스위트 + Commit**

```bash
cd web && pnpm test && pnpm build
git add web/lib/db/departments.ts web/app/api/departments docs/qa/2026-08-21-solve-parity-checklist.md
git commit -m "feat: add the department options endpoint sub-plan 5 missed"
```

---

## Task 3: 통계 서비스 (스코프·클램프·정답률)

**Files:**
- Create: `web/lib/stats/statsService.ts`, `web/lib/stats/statsService.test.ts`

**Interfaces:**
- Consumes: Task 1 의 DAO, `findProblemById`(`lib/db/problems`), `findChoicesByProblemId`(`lib/db/problemParts`)
- Produces:
  ```ts
  export interface ProblemStatItem {
    problemId: number; content: string; type: string; status: string;
    departmentId: number; departmentName: string | null;
    totalAttempts: number; correctAttempts: number;
    accuracyRate: number | null; lastAttemptAt: Date | null;
  }
  export interface ProblemStatDetail {
    summary: ProblemStatItem;
    choiceDistribution: { choiceId: number; choiceText: string; selectedCount: number }[] | null;
    excludedAttempts: number;
    recentWrongSamples: { submittedAnswer: string | null; submittedAt: Date }[];
  }
  export function effectiveDepartmentId(actor: AuthUser, requested: number | null): number | null;
  export function toStatItem(row: ProblemStatRow): ProblemStatItem;
  export async function listProblemStats(
    db: DbConn, actor: AuthUser, q: { departmentId: number | null; status: string | null; page: number; size: number }
  ): Promise<{ items: ProblemStatItem[]; totalCount: number; page: number; size: number }>;
  export async function getProblemStatDetail(db: DbConn, problemId: number, actor: AuthUser): Promise<ProblemStatDetail>;
  ```

- [ ] **Step 1: 스코프·클램프·정답률의 실패 테스트를 쓴다**

정답지 R4·R5·L1·L2·L12·X1·X2.

```typescript
describe("effectiveDepartmentId (R4·R5)", () => {
  it("SUPER_ADMIN 은 요청값을 그대로 쓴다", () =>
    expect(effectiveDepartmentId(superAdmin, 7)).toBe(7));
  it("SUPER_ADMIN 이 생략하면 null — 전 부서다", () =>
    expect(effectiveDepartmentId(superAdmin, null)).toBeNull());
  it("R5: DEPT_ADMIN 은 요청값을 무시하고 자기 부서를 쓴다 — 오류가 아니다", () =>
    expect(effectiveDepartmentId({ ...deptAdmin, departmentId: 3 }, 999)).toBe(3));
});

describe("정답률 (L12·X1·X2)", () => {
  it("X1: 시도 0건이면 null — 0.0 이 아니다", () =>
    expect(toStatItem({ ...row, totalAttempts: 0, correctAttempts: 0 }).accuracyRate).toBeNull());
  it("X2: 전부 오답이면 0.0 — null 이 아니다", () =>
    expect(toStatItem({ ...row, totalAttempts: 3, correctAttempts: 0 }).accuracyRate).toBe(0));
  it("L12: 나눗셈은 소수다", () =>
    expect(toStatItem({ ...row, totalAttempts: 3, correctAttempts: 1 }).accuracyRate)
      .toBeCloseTo(1 / 3, 15));
});

describe("클램프 (L1·L2)", () => {
  it.each([[0, 20], [-5, 20], [1000, 100], [50, 50]])("size %i → %i", async (given, want) => {
    expect((await listProblemStats(db, superAdmin, { departmentId: null, status: null, page: 1, size: given })).size)
      .toBe(want);
  });
  it.each([[0, 1], [-5, 1], [3, 3]])("page %i → %i", async (given, want) => {
    expect((await listProblemStats(db, superAdmin, { departmentId: null, status: null, page: given, size: 20 })).page)
      .toBe(want);
  });
});
```

> **X1 과 X2 가 이 서브플랜의 핵심 판별자다.** `null`(미응시)과 `0.0`(전부 오답)을 못 가르는
> 구현은 **정렬·검토필요 판정·화면 표기가 전부 조용히 틀린다.** 정답지가 그래서 두 행을 따로 뒀다.
> 실측 시점 DB 에 정답률 0.0 인 문제가 **없어서** Spring 으로는 못 쟀다 — 픽스처로 만든다.

- [ ] **Step 2: 실패 확인 → 구현 → 통과 확인**

```typescript
// web/lib/stats/statsService.ts (발췌)
const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;
const RECENT_WRONG_LIMIT = 5;
const CHOICE_TYPES = new Set(["MCQ_SINGLE", "MCQ_MULTI", "OX"]);

/**
 * StatsServiceImpl.effectiveDepartmentId(java:69-71) 미러.
 * 총괄은 요청한 부서를, 부서 관리자는 **요청값을 무시하고** 자기 부서를 쓴다.
 * 원주석: "이 스코프는 UI 가 아니라 여기서 강제된다."
 */
export function effectiveDepartmentId(actor: AuthUser, requested: number | null): number | null {
  return actor.role === "SUPER_ADMIN" ? requested : actor.departmentId;
}

/**
 * ProblemStatItem.from(java) 미러. **`totalAttempts === 0` 이면 `null` 이고 이건 "미응시"다
 * — `0` 이 아니다.** 정렬(NULLS LAST)·검토필요 판정(`accuracyRate != null`)·화면 표기가
 * 전부 이 규칙 위에 있다(정답지 X1·X2).
 */
export function toStatItem(row: ProblemStatRow): ProblemStatItem {
  return { ...row, accuracyRate: row.totalAttempts === 0 ? null : row.correctAttempts / row.totalAttempts };
}
```

> **정렬을 여기서 다시 하지 마라 — 승인된 이탈 ㉠.** Java 는 `LOWEST_ACCURACY_FIRST` 로 한 번 더
> 정렬하지만(no-op) 포트는 SQL 에만 둔다. 규칙은 Task 1 의 DAO 테스트가 고정한다.

- [ ] **Step 3: 상세 조립의 실패 테스트 → 구현 → 통과**

정답지 D1·D3·D7·D8·D11·D14·D15·R8.

```typescript
it("D1: 없는 문제 — 서브플랜 5와 다른 문구다", async () => {
  await expect(getProblemStatDetail(db, 999999, superAdmin)).rejects
    .toMatchObject({ message: "존재하지 않는 문제입니다." });
  // 풀이 쪽은 "존재하지 않거나 보관된 문제입니다." 였다. 여기는 보관 문제도 조회 대상이라 다르다.
});

it("R8: 없는 문제 + 남의 부서면 존재 검사가 먼저다", async () => {
  await expect(getProblemStatDetail(db, 999999, deptAdminOfOtherDept)).rejects
    .toMatchObject({ message: "존재하지 않는 문제입니다." });
});

it("D3: 남의 부서면 403/990", async () => {
  await expect(getProblemStatDetail(db, foreignProblemId, deptAdmin)).rejects
    .toMatchObject({ errorCode: ErrorCode.ACCESS_AUTH_DENIED });
});

it("D8: 아무도 안 고른 보기도 0회로 남는다", async () => {
  const d = await getProblemStatDetail(db, oxId, superAdmin);
  expect(d.choiceDistribution).toEqual([
    { choiceId: oChoiceId, choiceText: "O", selectedCount: 1 },
    { choiceId: xChoiceId, choiceText: "X", selectedCount: 0 },   // 0회가 남아야 한다
  ]);
});

it("D7/D14: 선택지 없는 유형은 분포 null, excludedAttempts 0", async () => {
  const d = await getProblemStatDetail(db, shortAnswerId, superAdmin);
  expect(d.choiceDistribution).toBeNull();
  expect(d.excludedAttempts).toBe(0);
});

it("D11: excludedAttempts = 전체 시도 − 분석된 시도", async () => {
  // 문제를 수정해 선택지 ID 가 바뀐 상황을 만든다 — 옛 기록은 현재 보기와 매칭되지 않는다.
  // 이 값이 없으면 "분포 합계 ≠ 시도 수"가 버그처럼 보인다(D12).
});

it("응답 키 집합", async () => {
  const d = await getProblemStatDetail(db, mcqId, superAdmin);
  expect(Object.keys(d).sort()).toEqual(["choiceDistribution", "excludedAttempts", "recentWrongSamples", "summary"]);
  expect(Object.keys(d.summary).sort()).toEqual(["accuracyRate", "content", "correctAttempts",
    "departmentId", "departmentName", "lastAttemptAt", "problemId", "status", "totalAttempts", "type"]);
  expect(Object.keys(d.choiceDistribution![0]).sort()).toEqual(["choiceId", "choiceText", "selectedCount"]);
  expect(Object.keys(d.recentWrongSamples[0]).sort()).toEqual(["submittedAnswer", "submittedAt"]);
});
```

- [ ] **Step 4: 라우트 2개 + 라우트 테스트**

```typescript
// web/app/api/admin/stats/problems/route.ts
export async function GET(request: Request): Promise<Response> {
  return handleRoute(async () => {
    // R1: 서브플랜 5의 /api/problems/** 와 달리 **역할 게이트가 있다.**
    const actor = await requireActor("SUPER_ADMIN", "DEPT_ADMIN");
    const p = new URL(request.url).searchParams;
    return listProblemStats(getDb(), actor, {
      departmentId: parseNumericParam(p.get("departmentId"), "departmentId"),
      status: p.get("status"),
      page: parseNumericParam(p.get("page"), "page") ?? 1,
      size: parseNumericParam(p.get("size"), "size") ?? 20,
    });
  });
}
```

라우트 테스트는 R1(EMPLOYEE 403/990) · R3(비로그인 401/980) · R5(DEPT_ADMIN 이 `departmentId` 위조해도 자기 부서) · E5(`/abc` → `요청 값의 형식이 올바르지 않습니다: id`) · L13(응답 키 4개)를 각각 고정한다.

- [ ] **Step 5: 변이 테스트**

| 변이 | 빨개져야 하는 테스트 |
|---|---|
| `requireActor("SUPER_ADMIN","DEPT_ADMIN")` → `requireActor()` | R1 |
| `effectiveDepartmentId` 가 항상 `requested` 반환 | R5 |
| `totalAttempts === 0 ? null : ...` → `... ?? 0` | X1 |
| `accuracyRate` 를 `correct/total` → `correct/(total||1)` | X2 |
| 상세의 존재 검사와 권한 검사 순서 뒤집기 | R8 |
| `CHOICE_TYPES` 에 `SHORT_ANSWER` 추가 | D7 |
| 0회 보기를 분포에서 제외 | D8 |

- [ ] **Step 6: 전체 스위트 + Commit**

```bash
cd web && pnpm test && pnpm build
git add web/lib/stats/statsService.ts web/lib/stats/statsService.test.ts web/app/api/admin/stats
git commit -m "feat: add problem statistics list and detail endpoints"
```

---

## Task 4: 통계 라우트 마무리 + 목록 페이징 실측 대조

> Task 3 에서 라우트를 이미 만들었다. 이 Task 는 **페이징이 SQL 순서 위에서 잘리는지**를 확인하는 데 집중한다 — 이탈 ㉠ 으로 Java 재정렬을 뺐으므로 여기가 유일한 안전망이다.

- [ ] **Step 1: 페이지 경계 테스트**

```typescript
it("페이지를 이어 붙이면 중복·누락이 없다 (이탈 ㉠ 의 안전망)", async () => {
  // 정답률이 서로 다른 문제 7개를 만들고 size=3 으로 3페이지를 받아 이어 붙인다.
  const all = [...p1.items, ...p2.items, ...p3.items].map((i) => i.problemId);
  expect(new Set(all).size).toBe(7);
  // 그리고 전체 정렬과 같은 순서여야 한다 — 페이지 안에서만 맞는 게 아니다.
  const whole = await listProblemStats(db, superAdmin, { ...q, page: 1, size: 100 });
  expect(all).toEqual(whole.items.map((i) => i.problemId));
});
```

- [ ] **Step 2: 전체 스위트 + Commit**

---

## Task 5: 대시보드

**Files:**
- Create: `web/lib/stats/dashboardService.ts`, `.../dashboardService.test.ts`
- Create: `web/app/api/admin/dashboard/route.ts`, `.../route.test.ts`

**Interfaces:**
- Consumes: Task 1 의 `findAllProblemStats`·`countActiveProblems`, `listProblems`(`lib/db/problems`)의 `findRecent` 대응
- Produces:
  ```ts
  export interface DashboardSummary {
    totalProblems: number; reviewNeededCount: number;
    totalAttempts: number; totalCorrectAttempts: number;
    averageAccuracyRate: number | null;
    lowAccuracyProblems: ProblemStatItem[];
    recentProblems: ProblemListItem[];
  }
  export function needsReview(item: ProblemStatItem): boolean;
  export async function getDashboardSummary(db: DbConn, actor: AuthUser, departmentId: number | null): Promise<DashboardSummary>;
  ```

> **`findRecent` 가 포트에 없다.** `ProblemMapper.xml:117` 미러를 `lib/db/problems.ts` 에 추가해야
> 한다 — `created_at DESC, p.id DESC`, 상태 필터 **없음**(정답지 B14), 태그 `array_agg`.

- [ ] **Step 1: `needsReview` 의 실패 테스트 — 경계가 전부다**

정답지 B7·X3·X4·X5.

```typescript
describe("needsReview (B7) — 네 조건이 전부 AND 다", () => {
  const base = { status: "ACTIVE", totalAttempts: 10, accuracyRate: 0.3 } as ProblemStatItem;
  it("X5: 보관 문제는 제외", () => expect(needsReview({ ...base, status: "ARCHIVED" })).toBe(false));
  it("X3: 시도 4회는 제외", () => expect(needsReview({ ...base, totalAttempts: 4 })).toBe(false));
  it("X3: 시도 5회는 포함", () => expect(needsReview({ ...base, totalAttempts: 5 })).toBe(true));
  it("X1: 미응시(null)는 제외", () => expect(needsReview({ ...base, accuracyRate: null })).toBe(false));
  it("X4: 정확히 0.5 는 제외", () => expect(needsReview({ ...base, accuracyRate: 0.5 })).toBe(false));
  it("X4: 0.49 는 포함", () => expect(needsReview({ ...base, accuracyRate: 0.49 })).toBe(true));
});
```

> **X4 는 실물 데이터에 판별자가 있다.** 실측 당시 문제 6번이 ACTIVE·시도 8·정답 4로
> **정확히 0.5** 였고, Spring 의 `reviewNeededCount` 가 4가 아니라 **3** 이었다. `<=` 로
> 잘못 쓰면 이 하나가 늘어난다. Task 6 E2E 가 이걸 실물로 다시 확인한다.

- [ ] **Step 2: 지표별 범위의 실패 테스트 — B2~B5**

```typescript
it("B2 vs B3: totalProblems 는 활성만, totalAttempts 는 보관 포함", async () => {
  await seedWithAttempts({ content: "활성" }, 2, 1);                      // 3건
  await seedWithAttempts({ content: "보관", status: "ARCHIVED" }, 1, 0);  // 1건
  const s = await getDashboardSummary(db, superAdmin, null);
  expect(s.totalProblems).toBe(1);    // 활성 1개
  expect(s.totalAttempts).toBe(4);    // 3 + 1 — 보관 문제의 시도도 센다
  // 한 응답 안에서 두 지표의 범위가 다르다. 이걸 통일하면 화면 문구가 거짓이 된다.
});

it("B5: 시도가 0건이면 averageAccuracyRate 는 null — 0.0 이 아니다", async () => {
  await seedWithAttempts({ content: "미응시" }, 0, 0);
  expect((await getDashboardSummary(db, superAdmin, null)).averageAccuracyRate).toBeNull();
});

it("B6: 전체 정답/전체 시도이지 문제별 정답률의 평균이 아니다", async () => {
  await seedWithAttempts({ content: "1/1" }, 1, 0);    // 100%
  await seedWithAttempts({ content: "1/9" }, 1, 8);    // 11.1%
  const s = await getDashboardSummary(db, superAdmin, null);
  expect(s.averageAccuracyRate).toBeCloseTo(2 / 10, 15);   // 0.2 — (1.0+0.111)/2 = 0.556 이 아니다
});

it("B8: reviewNeededCount 와 lowAccuracyProblems 가 같은 집합이다", async () => {
  const s = await getDashboardSummary(db, superAdmin, null);
  expect(s.lowAccuracyProblems.length).toBe(Math.min(s.reviewNeededCount, 5));
  expect(s.lowAccuracyProblems.every(needsReview)).toBe(true);
});
```

- [ ] **Step 3: 구현 + R6 (스코프를 두 번 계산한다)**

```typescript
// DashboardServiceImpl.java:44-46 미러.
// **StatsService 가 부서 스코프를 강제하지만 findRecent 는 원시 DAO 라 스스로 강제하지 않는다.**
// 같은 규칙으로 유효 부서 ID 를 계산해 넘긴다 — 두 곳이 어긋나면 최근 문제 목록만
// 다른 부서를 보여 준다(정답지 R6).
const scope = effectiveDepartmentId(actor, departmentId);
```

- [ ] **Step 4: 변이 테스트**

| 변이 | 빨개져야 하는 테스트 |
|---|---|
| `>= 5` → `> 5` | X3 (시도 5회) |
| `< 0.5` → `<= 0.5` | X4 (정확히 0.5) |
| `status === "ACTIVE"` 조건 제거 | X5 |
| `accuracyRate != null` 조건 제거 | X1 |
| `totalAttempts === 0 ? null : ...` → `?? 0` | B5 |
| 평균을 문제별 정답률의 평균으로 | B6 |
| `recentProblems` 의 스코프를 `departmentId`(원본)로 | R6 |
| `lowAccuracyProblems` 를 `allStats` 에서 직접 5건 자르기(필터 없이) | B8 |

- [ ] **Step 5: 응답 키 집합 + Commit**

```typescript
expect(Object.keys(s).sort()).toEqual(["averageAccuracyRate", "lowAccuracyProblems", "recentProblems",
  "reviewNeededCount", "totalAttempts", "totalCorrectAttempts", "totalProblems"]);
// B15: recentProblems 는 ProblemListItem 이라 `id` 를 쓴다 — 통계 항목의 `problemId` 와 다르다.
expect(Object.keys(s.recentProblems[0]).sort()).toEqual(["content", "createdAt", "departmentId",
  "departmentName", "id", "status", "tags", "type"]);
```

---

## Task 6: E2E 검증 + 이관 전체 컷오버 통합 목록

**Files:**
- Create: `docs/qa/2026-08-24-stats-e2e-verification.md`

- [ ] **Step 1: 서버 기동 후 62행 전수 대조**

정답지 65행을 한 줄씩 짚어 실측값과 대조한다. **대조하지 않은 행이 남으면 안 된다.**

**실측 시점 DB 기준 기대값**(정답지 "실측 기록" 절에 표로 있다). 최소 확인 항목:

| # | 확인 | 기대 |
|---|---|---|
| 1 | EMPLOYEE 로 세 엔드포인트 | 전부 **403 / 990** — 서브플랜 5의 풀이 라우트와 정반대다 |
| 2 | DEPT_ADMIN 이 `departmentId` 위조 | 자기 부서 결과. `totalProblems` 가 안 바뀐다 |
| 3 | 클램프 | `size=0`→20, `size=1000`→**100**, `page=0`·`-5`→1 |
| 4 | `totalCount` | 문제 수와 같다 — 시도 수에 부풀지 않는다 |
| 5 | 정렬 | 오름차순, 동률은 id 순, **null 이 맨 뒤** |
| 6 | **정답률 0.0 인 문제** | 맨 앞. **픽스처를 만들어야 한다** — 실측 시점 DB 에 없었다 |
| 7 | 상세 — 없는 문제 | `존재하지 않는 문제입니다.` (풀이의 문구와 다르다) |
| 8 | 상세 — 보관 문제 | **200**, `summary.status = ARCHIVED` |
| 9 | `choiceDistribution` | MCQ·OX 는 배열(0회 보기 포함), SHORT_ANSWER·FILL_BLANK 는 **null** |
| 10 | `excludedAttempts` | 실측 당시 문제 1번이 **3**(시도 8 − 분석 5) |
| 11 | **`reviewNeededCount` 와 0.5 경계** | 문제 6번이 정확히 0.5 인데 **집계에 안 들어간다** |
| 12 | 대시보드 범위 차이 | `totalProblems`(활성만) < 문제 총수, `totalAttempts` 에 보관 문제 시도 포함 |
| 13 | `recentProblems` | 5건, 키 8개(**`id`**), 보관 문제 포함 |
| 14 | **`GET /api/departments`** | 활성만·이름순·`{id,name,code}` 3필드. EMPLOYEE 도 200 |
| 15 | **엔드포인트 개수 대조** | Spring 31 = 포트 31. **이 검사는 이 서브플랜이 처음 한다** |

- [ ] **Step 2: 엔드포인트 개수 대조를 스크립트로 남긴다**

이번 착수 전 검토가 **서브플랜 5가 엔드포인트 하나를 통째로 빠뜨린 것**을 이 대조로 찾았다.
5개 서브플랜 동안 아무도 안 돌렸다. **검증 문서에 스크립트를 그대로 남겨** 다음 사람이 다시 짜지 않게 한다.

- [ ] **Step 3: 이관 전체 컷오버 통합 목록**

지금 컷오버 항목이 **문서 5개에 흩어져 있고 형식이 셋**이다. 핸드오프 절이 있는 건 서브플랜 4·5뿐이고, 2·3의 항목은 정답지 표 안에만 있다.

**이 문서에 전부 모은다** — 서브플랜 2·3·4·5·6 의 이월 항목을 하나의 표로. 최소한:

| 출처 | 항목 |
|---|---|
| 서브플랜 2 | 세션 강제 무효화 불가(JWT 무상태), 로그인 본문 파싱 이탈 |
| 서브플랜 3 | 4MB 상한(이탈 ④), SheetJS 행 번호(⑤), **타임스탬프 컨벤션(⑦ — Task 0 에서 확정됨)**, 대량 업로드 타임아웃 시 `successAccounts` 유실 |
| 서브플랜 4 | 이탈 ⑧ 공백 판정(**태그는 이름으로 중복 제거되므로 운영 데이터 이관 시 태그 중복으로 나타난다**), `excel_upload_logs.file_name` 초과, 4~5MB 이미지 구간, `drizzle.config.ts` 의 ambient 대상, 테스트 하니스 가드가 DB 이름만 검사 |
| 서브플랜 5 | C1 Supabase 환경변수 하드 의존, **C2 이미지 프록시의 배포 결합(SameSite=lax)**, ㉲ 숫자 파라미터 변환, Q12-1 반복 조회로 정답 수집, ㉰ 페이지네이션 없음, 1012 분기가 조용함 |
| 서브플랜 6 | ㉡ 전 문제 메모리 적재의 실측 성능 |

- [ ] **Step 4: 전체 검증**

```bash
cd web && pnpm test && pnpm build
cd ../backend && ./gradlew cleanTest test   # 301 유지
```

- [ ] **Step 5: Commit**

---

## Self-Review 결과

**Spec 커버리지** — 정답지 62행 + 서브플랜 5 누락분이 Task 에 배정됐는지 확인했다.

| 정답지 절 | Task |
|---|---|
| R (권한·스코프) 8행 | 3(서비스) · 4·5(라우트 테스트) |
| L (목록) 17행 | 1(DAO·정렬) · 3(클램프·정답률) · 4(페이징) |
| D (상세) 16행 | 1(DAO) · 3(조립) |
| B (대시보드) 16행 | 5 |
| X (경계) 8행 | 1(X1·X2) · 5(X3·X4·X5) · 6(X6·X7·X8 실측) |
| 서브플랜 5 누락(V 6행) | 2 |

**타입 일관성**
- 모든 DAO 는 `DbConn` 첫 인자. **이 서브플랜에는 쓰기가 없어 `Db` 예외가 없다.**
- `ProblemStatRow`(DAO) → `toStatItem` → `ProblemStatItem`(응답). 정답률 계산이 **한 곳**이다.
- `ProblemStatItem.problemId` 와 `ProblemListItem.id` 는 **다르다**(정답지 L14 vs B15) — 화면도 둘 다 쓴다(`DashboardPage.jsx`).

**놓치기 쉬운 지점**
- `/api/admin/stats/**` 는 **역할 게이트가 있다.** 서브플랜 5의 관용구(`requireActor()` 무인자)를 복사하면 EMPLOYEE 에게 열린다.
- `accuracyRate` 의 `null`(미응시) vs `0.0`(전부 오답) — 정렬·판정·표기가 전부 여기 걸려 있다.
- `needsReview` 의 네 조건은 **전부 AND** 이고 경계가 `>= 5`·`< 0.5` 다.
- `countProblemStats` 에 `attempts` 조인을 넣으면 총건수가 부푼다.
- `countAnalyzedAttempts` 의 `c.problem_id = a.problem_id` 를 빼면 `excludedAttempts` 가 항상 0 이 된다.
- postgres.js 는 `COUNT`/`SUM` 을 **문자열**로 준다 — `Number()` 로 바꿔야 한다.
- `findRecent` 는 포트에 **없다.** Task 5 가 추가한다.

**계획서를 쓰다 실측한 것 — 자기검토가 미측정 가정을 잡았다**

Task 3 의 라우트 조각이 `parseNumericParam(p.get("page"), "page") ?? 1` 을 쓰는데, `page`·`size` 는
`@RequestParam(defaultValue=...)` 라서 서브플랜 5의 `count`(필수 원시형)와 동작이 다를 수 있었다.
Spring 을 띄워 쟀다:

| 입력 | Spring |
|---|---|
| `?page=` (빈 문자열) | **200, page=1** — 기본값이 적용된다 |
| `?page=abc` · `?size=1.5` | 400 / `요청 값의 형식이 올바르지 않습니다: page`(`: size`) |
| `?status=BOGUS` | **200 / 0건** — 검증하지 않는다 |

**계획서의 조각이 우연이 아니라 실제로 맞다.** `parseNumericParam` 이 빈 문자열을 `null` 로
주므로 `?? 1` 이 기본값 역할을 하고, 정수가 아니면 같은 문구로 던진다. 정답지에 L15~L17 을
추가했다(62 → 65행) — 특히 **서브플랜 5의 `count` 와 다르다**는 것이 기록돼야 다음 사람이
그 관용구를 그대로 옮기지 않는다.

**계획서를 쓰다 확인한 것**
- 화면이 쓰는 필드를 실제로 확인했다(`DashboardPage.jsx`·`StatsListPage.jsx`·`StatsDetailPage.jsx`). 정답지의 필드 목록과 일치하고, `excludedAttempts` 도 `> 0` 일 때 조건부 렌더한다.
- 프론트 URL 3개(`api/stats.js:8,12`, `api/dashboard.js:5`)가 정답지 경로와 일치한다.

**미해결로 남기는 것**
- 컷오버 이월 항목은 Task 6 이 통합한다. 그 전까지는 문서 5개에 흩어져 있다.
