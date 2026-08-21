# 서브플랜 5 (풀이) 이관 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Spring 의 풀이 6개 엔드포인트(`SolveController` 4 + `AttemptController` 1 + `TagController.listInUse` 1)를 Next.js 로 이관하고, 서브플랜 4가 남긴 비공개 버킷 이미지 조회 경로를 확정한다.

**Architecture:** 서브플랜 3·4와 같은 3층 — route(`app/api/**`, `requireActor()` + `handleRoute`) → service(`lib/solve/*`) → DAO(`lib/db/*`, 전부 `DbConn` 을 첫 인자로). 채점은 DB 를 모르는 **순수 함수 모듈**로 분리해 5개 유형 × 20여 판정을 빠르게 고정한다. 이미지 조회는 저장된 `image_url` 을 그대로 쓸 수 있는 **프록시 라우트**로 붙인다.

**Tech Stack:** Next.js 15 (App Router, `runtime = "nodejs"`), Drizzle + postgres.js, Vitest, `@supabase/supabase-js`(이미 설치됨).

## Global Constraints

정답지: `docs/qa/2026-08-21-solve-parity-checklist.md` (86행). 아래는 그 위에 얹히는 프로젝트 규칙이다.

- **한글 메시지는 글자 단위로 일치해야 한다.** 여러 규칙이 동시에 깨졌을 때 **어느 메시지가 먼저 나오는지도 계약**이다.
- **파리티 문자열 단언에 `toThrow("문자열")` 을 쓰지 마라.** Vitest 에서 부분 문자열 매칭이다. `rejects.toMatchObject({ message: "..." })` 를 쓴다.
- 모든 DAO 는 첫 인자가 `DbConn`. 라우트만 `getDb()`(=`Db`)를 넘긴다.
- **테스트는 `.env` 를 로드하지 않는다.** Supabase 값이 필요하면 `web/test/env.ts` 를 import 한다. `truncateAll()` 은 인자를 받지 않는다.
- 모든 `pnpm` 명령 앞에 `export NODE_EXTRA_CA_CERTS="C:/Users/dda2220017/.certs/corp-root-ca.pem"` — 없으면 몇 분간 멈춘다.
- 착수 시점 스위트: **441 통과 / 40 파일**. 각 Task 마다 늘어난다.
- `backend/**` 는 읽기만 한다. 절대 수정하지 않는다.
- **TS 의 `!` 는 런타임 가드가 아니다.** 이 서브플랜에서 `!` 를 믿었다가 실제 결함이 한 번
  나왔다(NULL 이 `Math.min` 을 통과해 0 이 되고 정답이 전부 새어 나갔다). Java 가 그 자리에서
  NPE 로 죽는다면 포트도 **명시적으로 던져** 결과를 맞춰라.
- 서비스 롤 키를 출력·로그·커밋하지 않는다.
- 응답 봉투는 성공 `resultCode: 200`, 실패는 `ErrorCode` 의 코드. **이미지 프록시 라우트만 예외** — 바이너리를 그대로 내보낸다(Task 6 참고).

## 승인된 이탈

정답지의 이탈 후보를 여기서 확정한다. **구현자는 이 표를 파리티 위반으로 신고하지 마라.**

| # | 항목 | Spring | 이 포트 | 근거 |
|---|---|---|---|---|
| **㉮** | `count` 파라미터 누락(P1) | 200 / **-1** / `처리 중 오류가 발생하였습니다.` | **400 / 1000 / `잘못된 파라미터를 입력했습니다.`** | 서브플랜 3·4가 같은 모양(`MissingServletRequestPart` → catch-all)을 이탈 ⑥ 으로 이미 개선했다. `-1` 을 없애는 것이 이 이관의 목적 중 하나다. 프론트는 항상 `count` 를 보내므로(`frontend/src/api/solve.js:25`) 화면 동작에는 영향이 없다 |
| **㉯** | `submit` 이 비트랜잭션이고 자식 답안을 자르지 않는다(T8·T8-1·T8-2) | 600자 빈칸 답 → 200/-1, 그런데 `attempts` 행은 커밋돼 남는다(**실측**) | **① 한 트랜잭션으로 묶고 ② 자식 답안도 부모와 같은 500자 규칙으로 자른다** | 부모의 자르기 주석(`SolveServiceImpl.java:170`)이 "insert 실패를 막는다"고 밝히므로 자식 자르기는 **원저자 의도의 완성**이다. 트랜잭션은 그 위의 안전망. 방치하면 사용자가 실패로 보고 재제출해 시도가 중복되고 서브플랜 6 통계가 둘 다 센다 |
| **㉰** | 목록·이력에 페이지네이션 없음(S1·H3) | 전체 반환 | **그대로 이식** | 프론트 계약이 바뀐다. 성능은 컷오버 후 실측해 판단 |
| **㉲** | 숫자 파라미터 변환(P10-1) | `NumberUtils.parseNumber` — 공백을 전부 지운 뒤 `Integer.valueOf`(16진수는 `decode`). `1e2`·공백 거부, `"1 0"` → **10** | JS `Number()` + `Number.isSafeInteger`. `1e2` → 100, `" "` → 0, `"1 0"` → 거부 | `parseNumericParam` 은 **서브플랜 3·4가 이미 쓰는 공유 헬퍼**다. 지금 바꾸면 검증이 끝난 두 서브플랜의 동작이 함께 움직인다. 실무상 문제되는 입력은 화면에서 생성되지 않는다 — **컷오버 이월.** Task 7 은 이 행들을 파리티 위반으로 보고하지 마라 |
| **㉱** | 비공개 버킷 이미지 조회 | 로컬 디스크를 정적 리소스로 서빙 | **프록시 라우트 `GET /api/problem-images/[key]`** | 이탈 ①(이미지 저장 이관)의 연장. 근거는 Task 6 |
| **㉳** | `submit` 본문 `blankAnswers` 배열의 `null` 원소(예: `blankAnswers: [null]`, Task 4) | `BlankAnswerInput::getBlankKey` 를 null 에 호출해 NPE → catch-all → **200 / -1 / `처리 중 오류가 발생하였습니다.`** | **`{blankKey: null, submittedAnswer: null}` 로 매핑해 살려 둔다 → `grade()` 의 G9-G11 검증이 정의된 키가 아니라며 자연 실패 → 400 / 1000 / `제출한 빈칸 개수가 올바르지 않습니다.`** | `problemRequestBody.ts` 의 `readChoices`/`readBlanks` 와 같은 관용구 — null 원소를 던지지 않고 검증기로 넘겨 자연스러운 실패 문구를 내게 한다. `-1` 을 없애는 것이 이 서브플랜에서 반복되는 목적과 일치한다(㉮ 참고). `web/lib/solve/attemptRequestBody.ts` 의 `readBlankAnswers` 주석과 `attemptService.test.ts` 의 "㉳" 테스트가 근거다 |

---

## File Structure

| 파일 | 책임 | Task |
|---|---|---|
| `web/lib/solve/grading.ts` | **신규.** 5개 유형 채점 + `normalizeAnswer` + 요약 문자열. **DB 를 모른다** | 2 |
| `web/lib/solve/grading.test.ts` | 위의 단위 테스트 | 2 |
| `web/lib/db/solveProblems.ts` | **신규.** 풀이 목록·랜덤 세트 조회 | 1 |
| `web/lib/db/attempts.ts` | **신규.** 시도·선택지·빈칸답 저장 + 내 이력 | 1 |
| `web/lib/solve/solveQueryService.ts` | **신규.** 목록·랜덤·상세(정답 비노출) | 3 |
| `web/lib/solve/attemptService.ts` | **신규.** 채점 제출(트랜잭션). 내 이력은 라우트 → DAO 직행이라 여기 없다 | 4 |
| `web/app/api/problems/route.ts` | **신규.** `GET` 풀이 목록 | 3 |
| `web/app/api/problems/random/route.ts` | **신규.** `GET` 랜덤 세트 | 3 |
| `web/app/api/problems/[id]/route.ts` | **신규.** `GET` 풀이 상세 | 3 |
| `web/app/api/problems/[id]/attempts/route.ts` | **신규.** `POST` 채점 제출 | 4 |
| `web/app/api/attempts/me/route.ts` | **신규.** `GET` 내 이력 | 5 |
| `web/app/api/tags/in-use/route.ts` | **신규.** `GET` 활성 태그. DAO 는 이미 있다 | 5 |
| `web/app/api/problem-images/[key]/route.ts` | **신규.** 이미지 프록시 | 6 |
| `web/lib/problem/problemImage.ts` | **수정.** 버킷 상수와 클라이언트를 프록시가 재사용하도록 export | 6 |
| `docs/qa/2026-08-21-solve-e2e-verification.md` | **신규.** E2E 실측 기록 | 7 |

> **경로 주의 ①.** `web/app/api/problems/**` 는 **직원용**이고 `web/app/api/admin/problems/**` 는 관리자용이다. 이름이 비슷하니 헷갈리지 마라 — 직원용에는 `@RequireRole` 이 없고(E1) 부서 스코프도 없다(E4).
>
> **경로 주의 ② — `random` 이 `[id]` 로 새면 안 된다.** `app/api/problems/random/route.ts` 와
> `app/api/problems/[id]/route.ts` 가 형제다. App Router 는 정적 세그먼트를 동적보다 먼저 매칭하므로
> 정상 동작하고, 이 저장소에 **이미 같은 선례가 있다**(`admin/problems/next-source-number` + `[id]`,
> 서브플랜 4에서 실측 확인됨). 다만 서브플랜 4가 이걸 **정답지 행과 E2E 행으로 따로 고정한 이유**가
> 있다 — 새면 `존재하지 않거나 보관된 문제입니다.` 라는 **그럴듯한 오답**이 나와서 아무도 눈치채지
> 못한다. Task 3 의 라우트 테스트와 Task 7 의 E2E 에 각각 한 줄을 넣는다.

---

## 실행 구간 (4구간)

| 구간 | Task | 끝났을 때 동작하는 것 | 상태 |
|---|---|---|---|
| **M1 채점 코어** | 1 + 2 | 데이터 계층 + 채점 순수 함수. 엔드포인트 0개, 파리티 위험의 대부분이 여기서 고정된다. 테스트 441 → 498 | ☑ 2026-08-21 |
| **M2 조회** | 3 | 목록·랜덤·상세 3개. **정답 비노출이 성립한다**. 테스트 498 → 544 | ☑ 2026-08-21 |
| **M3 제출·이력** | 4 + 5 | 채점 제출·이력·활성태그 3개. 6개 엔드포인트 완성 | ☐ |
| **M4 이미지·검증** | 6 + 7 | 이미지 프록시 + E2E + 정답지 대조 | ☐ |

**구간을 마칠 때마다** `cd web && pnpm test && pnpm build` 가 통과해야 머지한다. 구간이 끝나면 위 표의 ☐ 를 ☑ 로 바꾸고 그 변경도 함께 커밋한다.

**순서 근거.** 서브플랜 4에서 검증 로직을 먼저 고정(M1)한 것이 이후 구간을 얹기만 하면 되게 만들었다. 여기서도 채점이 그 자리다 — DB 의존이 없어 테스트가 빠르고, 5개 유형 × 20여 판정이 파리티 위험의 대부분이다.

---

## Task 1: 데이터 계층 (풀이 조회 · 시도 저장)

**Files:**
- Create: `web/lib/db/solveProblems.ts`, `web/lib/db/solveProblems.test.ts`
- Create: `web/lib/db/attempts.ts`, `web/lib/db/attempts.test.ts`

**Interfaces:**
- Consumes: `DbConn`(`lib/db/client`), 스키마(`lib/db/schema`)의 `problems`·`departments`·`problemTags`·`tags`·`attempts`·`attemptChoices`·`attemptBlankAnswers`
- Produces:
  ```ts
  export type SolveListRow = {
    id: number; type: string; content: string;
    tags: string[]; departmentName: string; sourceNumber: number | null;
  };
  export async function findActiveSolveProblems(
    db: DbConn, filters: { keyword?: string | null; tag?: string | null }): Promise<SolveListRow[]>;
  export async function findRandomActiveProblems(
    db: DbConn, input: { count: number; departmentId?: number | null }): Promise<SolveListRow[]>;

  export type NewAttempt = { userId: number; problemId: number; submittedAnswer: string | null; isCorrect: boolean };
  export async function insertAttempt(db: DbConn, row: NewAttempt): Promise<number>;
  export async function insertAttemptChoices(
    db: DbConn, rows: { attemptId: number; choiceId: number; choiceText: string | null }[]): Promise<void>;
  export async function insertAttemptBlankAnswers(
    db: DbConn, rows: { attemptId: number; blankKey: string; submittedAnswer: string | null; isCorrect: boolean }[]): Promise<void>;

  export type AttemptHistoryRow = {
    problemId: number; problemContent: string; submittedAnswer: string | null;
    correct: boolean; submittedAt: Date; departmentName: string; sourceNumber: number | null;
  };
  export async function findAttemptsByUserId(db: DbConn, userId: number): Promise<AttemptHistoryRow[]>;
  ```

- [ ] **Step 1: 풀이 목록 DAO 의 실패 테스트를 쓴다**

`ProblemMapper.xml:13` 을 그대로 미러한다. 정답지 S2·S3·S4·S5·S6·S7·S10.

```typescript
// web/lib/db/solveProblems.test.ts
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { migrateTestDb, testDb, truncateAll } from "../../test/db";
import { departments, problems, tags, problemTags, users } from "./schema";
import { findActiveSolveProblems, findRandomActiveProblems } from "./solveProblems";

const db = testDb();
let deptId = 0;
let userId = 0;

beforeAll(async () => { await migrateTestDb(); });
beforeEach(async () => {
  await truncateAll();
  [{ id: deptId }] = await db.insert(departments)
    .values({ name: "가팀", code: "A", status: "ACTIVE" }).returning({ id: departments.id });
  // problems.created_by 는 NOT NULL + users FK 다(schema.ts). 문제를 만들려면 사용자가 먼저다 —
  // 기존 lib/db/problems.test.ts:30-36 과 같은 형태를 쓴다.
  [{ id: userId }] = await db.insert(users).values({
    employeeNo: "admin", name: "관리자", email: "a@b.c", passwordHash: "x",
    departmentId: deptId, role: "SUPER_ADMIN", status: "ACTIVE", mustChangePassword: false,
  }).returning({ id: users.id });
});

async function seed(over: Partial<typeof problems.$inferInsert> = {}) {
  const [row] = await db.insert(problems).values({
    type: "OX", content: "본문", departmentId: deptId, status: "ACTIVE",
    createdBy: userId, sourceNumber: null, ...over,
  }).returning({ id: problems.id });
  return row.id;
}

describe("findActiveSolveProblems", () => {
  it("S2: ARCHIVED 는 제외한다", async () => {
    await seed({ content: "살아있음" });
    await seed({ content: "보관됨", status: "ARCHIVED" });
    const rows = await findActiveSolveProblems(db, {});
    expect(rows.map((r) => r.content)).toEqual(["살아있음"]);
  });

  it("S3: keyword 는 대소문자를 무시하고 부분 일치한다", async () => {
    await seed({ content: "SWOT 분석" });
    await seed({ content: "무관" });
    expect((await findActiveSolveProblems(db, { keyword: "swot" })).length).toBe(1);
  });

  it("S5: keyword 가 빈 문자열이면 필터를 적용하지 않는다", async () => {
    await seed(); await seed();
    expect((await findActiveSolveProblems(db, { keyword: "" })).length).toBe(2);
  });

  it("S4: tag 는 대소문자를 무시하고 정확히 일치해야 한다", async () => {
    const pid = await seed();
    const [tag] = await db.insert(tags).values({ name: "Alpha" }).returning({ id: tags.id });
    await db.insert(problemTags).values({ problemId: pid, tagId: tag.id });
    expect((await findActiveSolveProblems(db, { tag: "alpha" })).length).toBe(1);
    // 부분 일치가 아니다 — 'Alph' 로는 안 잡힌다.
    expect((await findActiveSolveProblems(db, { tag: "Alph" })).length).toBe(0);
  });

  it("S6: tags 는 이름 오름차순이고, 없으면 빈 배열이다", async () => {
    const pid = await seed();
    const rows = await db.insert(tags).values([{ name: "나" }, { name: "가" }]).returning({ id: tags.id });
    await db.insert(problemTags).values(rows.map((t) => ({ problemId: pid, tagId: t.id })));
    await seed({ content: "태그없음" });
    const list = await findActiveSolveProblems(db, {});
    expect(list.find((r) => r.id === pid)!.tags).toEqual(["가", "나"]);
    expect(list.find((r) => r.content === "태그없음")!.tags).toEqual([]);
  });

  it("S10: 태그가 여러 개여도 행이 부풀지 않는다", async () => {
    const pid = await seed();
    const rows = await db.insert(tags).values([{ name: "t1" }, { name: "t2" }, { name: "t3" }])
      .returning({ id: tags.id });
    await db.insert(problemTags).values(rows.map((t) => ({ problemId: pid, tagId: t.id })));
    expect((await findActiveSolveProblems(db, {})).length).toBe(1);
  });

  it("S1: 페이지네이션이 없다 — 전부 돌려준다", async () => {
    // 승인된 이탈 ㉰. 나중에 누가 LIMIT 을 '성능 개선'으로 끼워 넣으면 이 테스트가 잡는다.
    for (let i = 0; i < 30; i++) await seed({ content: `q${i}` });
    expect((await findActiveSolveProblems(db, {})).length).toBe(30);
  });

  it("S8: 응답 필드가 정확히 6개이고 정답 관련 필드가 없다", async () => {
    // 정답 비노출은 상세(Q11)만의 문제가 아니다. 목록이 새면 똑같이 망가진다.
    await seed();
    const row = (await findActiveSolveProblems(db, {}))[0];
    expect(Object.keys(row).sort()).toEqual(
      ["content", "departmentName", "id", "sourceNumber", "tags", "type"]);
    for (const leak of ["isCorrect", "explanation", "answerText", "choiceText"]) {
      expect(JSON.stringify(row)).not.toContain(leak);
    }
  });
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `cd web && export NODE_EXTRA_CA_CERTS="C:/Users/dda2220017/.certs/corp-root-ca.pem" && npx vitest run lib/db/solveProblems.test.ts`
Expected: FAIL — `Cannot find module './solveProblems'`

- [ ] **Step 3: 풀이 목록·랜덤 DAO 를 구현한다**

```typescript
// web/lib/db/solveProblems.ts
import { and, desc, eq, ilike, sql } from "drizzle-orm";
import type { DbConn } from "./client";
import { departments, problems, problemTags, tags } from "./schema";

export type SolveListRow = {
  id: number; type: string; content: string;
  tags: string[]; departmentName: string; sourceNumber: number | null;
};

// ProblemMapper.xml:13(findAllActive) / :29(findRandomActive) 미러.
// tags 는 array_agg(DISTINCT ...) 라 이름 오름차순으로 나오고, 없으면 '{}' 다(정답지 S6).
const TAG_AGG = sql<string[]>`COALESCE(array_agg(DISTINCT ${tags.name}) FILTER (WHERE ${tags.name} IS NOT NULL), '{}')`;

function baseSelect(db: DbConn) {
  return db
    .select({
      id: problems.id, type: problems.type, content: problems.content,
      departmentName: departments.name, sourceNumber: problems.sourceNumber, tags: TAG_AGG,
    })
    .from(problems)
    .innerJoin(departments, eq(departments.id, problems.departmentId))
    .leftJoin(problemTags, eq(problemTags.problemId, problems.id))
    .leftJoin(tags, eq(tags.id, problemTags.tagId));
}

export async function findActiveSolveProblems(
  db: DbConn,
  filters: { keyword?: string | null; tag?: string | null },
): Promise<SolveListRow[]> {
  // 빈 문자열**만** 필터가 아니다 — MyBatis 의 `<if test="... != null and ... != ''">` 미러.
  // **공백만 있는 값은 필터로 쓴다**(정답지 S5-1, 실측): OGNL 의 `"   " != ''` 는 참이라
  // Spring 은 `ILIKE '%   %'` 를 걸어 0건을 낸다. `trim()` 후 진리값으로 판단하면 65건이 나온다.
  const keyword = filters.keyword != null && filters.keyword !== "" ? filters.keyword : null;
  const tag = filters.tag != null && filters.tag !== "" ? filters.tag : null;

  const where = [eq(problems.status, "ACTIVE")];
  if (keyword) where.push(ilike(problems.content, `%${keyword}%`));
  if (tag) {
    where.push(sql`EXISTS (SELECT 1 FROM problem_tags fpt JOIN tags ft ON ft.id = fpt.tag_id
      WHERE fpt.problem_id = ${problems.id} AND lower(ft.name) = lower(${tag}))`);
  }

  // S9: 부서 필터가 **없다.** 직원은 전 부서 문제를 본다 — 관리자 목록과 다르다.
  //     "직원이니 자기 부서만 보여 주는 게 맞지 않나" 싶어도 넣지 마라. 파리티 위반이다.
  // ORDER BY 는 created_at DESC 뿐이다 — Java 에도 p.id 타이브레이커가 없다(정답지 S7).
  // 페이지네이션이 없어 중복·누락이 생기지 않으므로 그대로 이식한다.
  return baseSelect(db).where(and(...where))
    .groupBy(problems.id, departments.name)
    .orderBy(desc(problems.createdAt));
}

export async function findRandomActiveProblems(
  db: DbConn,
  input: { count: number; departmentId?: number | null },
): Promise<SolveListRow[]> {
  const where = [eq(problems.status, "ACTIVE")];
  if (input.departmentId != null) where.push(eq(problems.departmentId, input.departmentId));
  return baseSelect(db).where(and(...where))
    .groupBy(problems.id, departments.name)
    .orderBy(sql`random()`)
    .limit(input.count);
}
```

- [ ] **Step 4: 통과를 확인한다**

Run: `npx vitest run lib/db/solveProblems.test.ts`
Expected: PASS (6건)

- [ ] **Step 5: 랜덤 DAO 테스트를 더한다**

정답지 P6·P7·P8. `random()` 이라 순서는 못 고정하지만 **개수와 필터는 고정된다.**

```typescript
describe("findRandomActiveProblems", () => {
  it("P8: count 만큼만 돌려준다", async () => {
    for (let i = 0; i < 5; i++) await seed({ content: `q${i}` });
    expect((await findRandomActiveProblems(db, { count: 3 })).length).toBe(3);
  });

  it("P6: 있는 문제가 count 보다 적으면 있는 만큼만 — 오류가 아니다", async () => {
    await seed();
    expect((await findRandomActiveProblems(db, { count: 10 })).length).toBe(1);
  });

  it("P7: departmentId 를 주면 그 부서만", async () => {
    const [other] = await db.insert(departments)
      .values({ name: "나팀", code: "B", status: "ACTIVE" }).returning({ id: departments.id });
    await seed();
    await seed({ departmentId: other.id });
    const rows = await findRandomActiveProblems(db, { count: 10, departmentId: other.id });
    expect(rows.map((r) => r.departmentName)).toEqual(["나팀"]);
  });

  it("S2 와 같은 규칙: ARCHIVED 는 랜덤에도 안 나온다", async () => {
    await seed({ status: "ARCHIVED" });
    expect((await findRandomActiveProblems(db, { count: 10 })).length).toBe(0);
  });
});
```

- [ ] **Step 6: 시도 저장·이력 DAO 의 실패 테스트를 쓴다**

정답지 T1·T5·T7·T10·H1·H2·H4·H5·H8.

```typescript
// web/lib/db/attempts.test.ts — 앞의 seed 헬퍼와 같은 형태로 users 도 만든다.
it("T1/H4: is_correct 를 저장하고 이력에서 correct 로 읽는다", async () => {
  const attemptId = await insertAttempt(db, { userId, problemId, submittedAnswer: "가", isCorrect: true });
  const rows = await findAttemptsByUserId(db, userId);
  // Java 는 `a.is_correct AS correct` 별칭이 없으면 항상 false 가 됐다(정답지 H4).
  // 여기서 true 가 나오는 것이 그 함정을 피했다는 증거다.
  expect(rows[0].correct).toBe(true);
  expect(attemptId).toBeGreaterThan(0);
});

it("H1: 남의 시도는 안 나온다", async () => {
  await insertAttempt(db, { userId: otherUserId, problemId, submittedAnswer: null, isCorrect: false });
  expect(await findAttemptsByUserId(db, userId)).toEqual([]);
});

it("H2: submitted_at 내림차순", async () => {
  // submittedAt 을 **명시적으로** 넣는다. defaultNow() 에 맡기면 두 insert 가 같은 값을 받을 수
  // 있고, ORDER BY 에 타이브레이커가 없어(H2) 순서가 흔들린다. 서브플랜 4 에서 정렬을 고정하지
  // 않은 단언이 플래키로 두 번의 리뷰를 통과한 전례가 있다.
  await db.insert(attempts).values([
    { userId, problemId, submittedAnswer: "먼저", isCorrect: false, submittedAt: new Date("2026-01-01T00:00:00Z") },
    { userId, problemId, submittedAnswer: "나중", isCorrect: true,  submittedAt: new Date("2026-01-02T00:00:00Z") },
  ]);
  expect((await findAttemptsByUserId(db, userId)).map((r) => r.submittedAnswer)).toEqual(["나중", "먼저"]);
});

it("H5: 응답 필드가 정확히 7개다", async () => {
  await insertAttempt(db, { userId, problemId, submittedAnswer: "x", isCorrect: false });
  expect(Object.keys((await findAttemptsByUserId(db, userId))[0]).sort()).toEqual(
    ["correct", "departmentName", "problemContent", "problemId", "sourceNumber", "submittedAnswer", "submittedAt"]);
});

it("H7: 보관된 문제의 이력도 나온다 — 목록(S2)과 정반대다", async () => {
  // findAttemptsByUserId 에 p.status 조건을 넣고 싶어지는 자리다. Java 에는 없다.
  const archived = await seed({ status: "ARCHIVED" });
  await insertAttempt(db, { userId, problemId: archived, submittedAnswer: "x", isCorrect: false });
  expect((await findAttemptsByUserId(db, userId)).length).toBe(1);
});

it("H6: problems·departments 는 INNER JOIN 이다", async () => {
  // 문제는 보관만 되고 삭제되지 않으므로 실질 무해하지만, LEFT JOIN 으로 바꾸면 Java 와
  // 다른 행이 나올 수 있다. 조인 방식을 문서 대신 테스트로 남긴다.
  await insertAttempt(db, { userId, problemId, submittedAnswer: "x", isCorrect: false });
  const row = (await findAttemptsByUserId(db, userId))[0];
  expect(row.departmentName).toBe("가팀");
  expect(row.problemContent).toBe("본문");
});

it("T5/T7: 빈 배열이면 DB 를 건드리지 않는다(SQL 오류가 나면 안 된다)", async () => {
  await expect(insertAttemptChoices(db, [])).resolves.toBeUndefined();
  await expect(insertAttemptBlankAnswers(db, [])).resolves.toBeUndefined();
});
```

> **T9 의 근거.** Java 의 `<foreach>` 는 빈 컬렉션에서 `VALUES` 뒤가 비어 SQL 문법 오류가 난다. 포트는 **빈 배열을 조용히 통과**시켜 그 경로를 아예 없앤다. 정답지 T9 가 "포트는 이 경로를 도달 가능하게 만들지 말 것"이라고 적은 것이 이것이다.

- [ ] **Step 7: 실패 확인 → 시도 DAO 구현 → 통과 확인**

```typescript
// web/lib/db/attempts.ts
import { desc, eq } from "drizzle-orm";
import type { DbConn } from "./client";
import { attempts, attemptBlankAnswers, attemptChoices, departments, problems } from "./schema";

export type NewAttempt = { userId: number; problemId: number; submittedAnswer: string | null; isCorrect: boolean };

export async function insertAttempt(db: DbConn, row: NewAttempt): Promise<number> {
  const [inserted] = await db.insert(attempts).values(row).returning({ id: attempts.id });
  return inserted.id;
}

// 빈 배열을 그냥 통과시킨다 — Java 의 <foreach> 는 여기서 SQL 문법 오류가 났다(정답지 T9).
export async function insertAttemptChoices(
  db: DbConn, rows: { attemptId: number; choiceId: number; choiceText: string | null }[]): Promise<void> {
  if (rows.length === 0) return;
  await db.insert(attemptChoices).values(rows);
}

export async function insertAttemptBlankAnswers(
  db: DbConn, rows: { attemptId: number; blankKey: string; submittedAnswer: string | null; isCorrect: boolean }[],
): Promise<void> {
  if (rows.length === 0) return;
  await db.insert(attemptBlankAnswers).values(rows);
}

export type AttemptHistoryRow = {
  problemId: number; problemContent: string; submittedAnswer: string | null;
  correct: boolean; submittedAt: Date; departmentName: string; sourceNumber: number | null;
};

// AttemptMapper.xml:10 미러. Java 는 `a.is_correct AS correct` 별칭이 필수였다 —
// 빼면 mapUnderscoreToCamelCase 가 isCorrect 로 만들어 DTO 에 안 붙고 항상 false 가 됐다.
// 여기서는 select 의 키 이름이 곧 별칭이므로 `correct:` 로 적는 것이 그 미러다(정답지 H4).
export async function findAttemptsByUserId(db: DbConn, userId: number): Promise<AttemptHistoryRow[]> {
  return db.select({
    problemId: attempts.problemId, problemContent: problems.content,
    submittedAnswer: attempts.submittedAnswer, correct: attempts.isCorrect,
    submittedAt: attempts.submittedAt, departmentName: departments.name,
    sourceNumber: problems.sourceNumber,
  })
    .from(attempts)
    .innerJoin(problems, eq(problems.id, attempts.problemId))
    .innerJoin(departments, eq(departments.id, problems.departmentId))
    .where(eq(attempts.userId, userId))
    .orderBy(desc(attempts.submittedAt));
}
```

> **H7 을 잊지 마라.** 이력에는 `p.status` 조건이 **없다** — 보관된 문제의 이력도 나온다. 목록(S2)과 다르다. `where` 에 status 를 추가하고 싶어지면 정답지 H7 을 다시 읽어라.

- [ ] **Step 8: 전체 스위트 + Commit**

```bash
cd web && export NODE_EXTRA_CA_CERTS="C:/Users/dda2220017/.certs/corp-root-ca.pem" && pnpm test
git add web/lib/db/solveProblems.ts web/lib/db/solveProblems.test.ts web/lib/db/attempts.ts web/lib/db/attempts.test.ts
git commit -m "feat: add solve list, random set, and attempt data access"
```

---

## Task 2: 채점 로직 (순수 함수)

**Files:**
- Create: `web/lib/solve/grading.ts`, `web/lib/solve/grading.test.ts`

**Interfaces:**
- Consumes: `BizError`·`ErrorCode`(`lib/http/*`) 만. **DB 도, 네트워크도, 요청/응답도 모른다.**
  검증 실패를 `BizError` 로 던지는 것은 라우트 계층이 `handleRoute` 로 400/1000 을 만들게 하기
  위해서다 — 이 모듈이 HTTP 를 아는 것은 아니다
- Produces:
  ```ts
  export function normalizeAnswer(value: string | null | undefined): string;

  export interface BlankResult {
    blankKey: string; submittedAnswer: string | null; correct: boolean; correctAnswer: string;
  }
  export interface GradeResult {
    correct: boolean;
    submittedAnswerSummary: string | null;
    selectedChoices: { id: number; choiceText: string }[];  // 문제 정의 순서
    blankResults: BlankResult[] | null;
  }
  export type GradeInput =
    | { type: "MCQ_SINGLE" | "MCQ_MULTI" | "OX";
        // problem_choices.choice_text 는 NOT NULL 이다(schema.ts) — null 을 받을 필요가 없다.
        // 반면 attempt_choices.choice_text 는 nullable 이므로 저장 쪽 타입과 다르다.
        choices: { id: number; choiceText: string; isCorrect: boolean }[];
        selectedChoiceIds: number[] | null }
    | { type: "SHORT_ANSWER"; answers: string[]; submittedText: string | null }
    | { type: "FILL_BLANK";
        blanks: { blankKey: string; answerText: string }[];
        blankRevealCount: number;
        blankAnswers: { blankKey: string; submittedAnswer: string | null }[] | null };

  export function grade(input: GradeInput): GradeResult;   // 검증 실패 시 BizError 를 던진다
  ```

- [ ] **Step 1: `normalizeAnswer` 의 실패 테스트를 쓴다 — Java 와 JS 의 차이가 여기 숨어 있다**

정답지 G6·G7·G7-1·G8. **주의: Java 의 `trim()` 과 `\s` 는 JS 와 범위가 다르다.**

- Java `String.trim()` 은 **코드포인트 U+0020 이하**만 깎는다. JS `String.prototype.trim()` 은 U+00A0(비분할 공백) 같은 유니코드 공백까지 깎는다.
- Java 정규식 `\s` 는 `[ \t\n\x0B\f\r]` (ASCII). JS `\s` 는 U+00A0·U+2000~U+200A·U+3000 등을 포함한다.

한글 문서를 붙여넣으면 U+00A0 가 섞이는 일이 흔하므로 **실제로 갈릴 수 있는 차이다.**

```typescript
// web/lib/solve/grading.test.ts
import { describe, it, expect } from "vitest";
import { normalizeAnswer } from "./grading";

describe("normalizeAnswer — SolveServiceImpl.java:209-211 미러", () => {
  it("G6: null 과 undefined 는 빈 문자열이다", () => {
    expect(normalizeAnswer(null)).toBe("");
    expect(normalizeAnswer(undefined)).toBe("");
  });

  it("G7: 앞뒤를 깎고 소문자로 만들고 연속 공백을 하나로 접는다", () => {
    expect(normalizeAnswer("  AB   cd  ")).toBe("ab cd");
  });

  it("G7-1: 공백은 접힐 뿐 없어지지 않는다", () => {
    // 이 두 줄이 판별자다. 구현이 공백을 '삭제'하면 아래가 깨진다.
    expect(normalizeAnswer("  보정계수  ")).toBe("보정계수");
    expect(normalizeAnswer("보정 계수")).toBe("보정 계수");
    expect(normalizeAnswer("보정 계수")).not.toBe("보정계수");
  });

  it("Java 의 trim 은 U+0020 이하만 깎는다 — JS 기본 trim 을 쓰면 안 된다", () => {
    // U+00A0 는 Java trim 이 남기고 Java \s 도 안 잡는다. JS 기본 동작과 반대다.
    expect(normalizeAnswer("\u00A0가\u00A0")).toBe("\u00A0가\u00A0");
    expect(normalizeAnswer("\u0001가\u0001")).toBe("가");  // 제어문자는 U+0020 이하라 깎인다
  });

  it("G8: toLocaleLowerCase 가 아니라 toLowerCase 다", () => {
    // Java 의 무인자 toLowerCase() 는 Locale.getDefault() 를 쓰지만(터키어 I→ı),
    // 한글·ASCII 에서는 JS 의 로케일 무관 변환과 결과가 같다. JS 쪽이 서버 로케일 설정에
    // 흔들리지 않아 더 안전하다 — toLocaleLowerCase() 를 쓰면 그 안전성을 버리는 것이다.
    expect(normalizeAnswer("ABC")).toBe("abc");
    expect(normalizeAnswer("가나다")).toBe("가나다");
  });
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run lib/solve/grading.test.ts`
Expected: FAIL — 모듈 없음

- [ ] **Step 3: `normalizeAnswer` 를 구현한다**

```typescript
// web/lib/solve/grading.ts
/**
 * SolveServiceImpl.normalize(java:209-211) 미러 — 채점 **비교용**이다. 저장에는 쓰지 않는다
 * (정답지 T2-1: 저장은 제출 원문 그대로다).
 *
 * Java 와 JS 의 공백 정의가 다르므로 그대로 옮기면 안 된다:
 *  - Java `String.trim()` 은 코드포인트 U+0020 **이하**만 깎는다. JS `trim()` 은 U+00A0 같은
 *    유니코드 공백까지 깎는다.
 *  - Java 정규식 `\s` 는 `[ \t\n\x0B\f\r]`(ASCII). JS `\s` 는 U+00A0·U+3000 등을 포함한다.
 * 한글 문서를 붙여넣으면 U+00A0 가 섞이는 일이 흔해 실제로 갈린다.
 */
const JAVA_WHITESPACE = /[ \t\n\u000B\f\r]+/g;

function javaTrim(value: string): string {
  let start = 0;
  let end = value.length;
  while (start < end && value.charCodeAt(start) <= 0x20) start += 1;
  while (end > start && value.charCodeAt(end - 1) <= 0x20) end -= 1;
  return value.slice(start, end);
}

export function normalizeAnswer(value: string | null | undefined): string {
  if (value == null) return "";
  return javaTrim(value).toLowerCase().replace(JAVA_WHITESPACE, " ");
}
```

- [ ] **Step 4: 통과를 확인한다**

Run: `npx vitest run lib/solve/grading.test.ts`
Expected: PASS (5건)

- [ ] **Step 5: 5개 유형 채점의 실패 테스트를 쓴다**

정답지 G1~G14 전부. 아래는 **실측으로 확인된 기대값**이다(정답지 "실측 기록").

```typescript
import { grade } from "./grading";

const mcq = (selected: number[] | null) => grade({
  type: "MCQ_SINGLE",
  choices: [{ id: 1, choiceText: "가", isCorrect: true }, { id: 2, choiceText: "나", isCorrect: false }],
  selectedChoiceIds: selected,
});

describe("MCQ·OX — 집합 동등성(G2~G5)", () => {
  it("G2: 정답 집합과 같으면 정답", () => expect(mcq([1]).correct).toBe(true));
  it("G2: 다르면 오답", () => expect(mcq([2]).correct).toBe(false));
  it("G4: 같은 id 를 두 번 보내도 접힌다", () => expect(mcq([1, 1]).correct).toBe(true));
  it("G2: 과다 선택은 오답", () => expect(mcq([1, 2]).correct).toBe(false));
  it("G3: null 은 빈 집합", () => expect(mcq(null).correct).toBe(false));
  it("G3: 빈 배열도 빈 집합", () => expect(mcq([]).correct).toBe(false));
  it("G5: 남의 문제 choiceId 는 오답이고 선택 목록에도 안 들어간다", () => {
    const r = mcq([99]);
    expect(r.correct).toBe(false);
    expect(r.selectedChoices).toEqual([]);
  });
  it("T3: 요약은 선택지 본문을 문제 정의 순서로 잇는다", () => {
    const r = grade({ type: "MCQ_MULTI",
      choices: [{ id: 9, choiceText: "가", isCorrect: true }, { id: 10, choiceText: "나", isCorrect: true }],
      selectedChoiceIds: [10, 9] });   // 제출 순서를 뒤집어 보낸다
    expect(r.correct).toBe(true);
    expect(r.submittedAnswerSummary).toBe("가, 나");   // 제출 순서였다면 "나, 가"
    expect(r.selectedChoices.map((c) => c.id)).toEqual([9, 10]);
  });
});

describe("SHORT_ANSWER (G6·G7-1)", () => {
  const sa = (text: string | null) => grade({ type: "SHORT_ANSWER", answers: ["보정계수", "보정 계수"], submittedText: text });
  it("G6: 허용 정답 중 하나라도 맞으면 정답", () => expect(sa("보정 계수").correct).toBe(true));
  it("G7-1: 앞뒤 공백은 무시된다", () => expect(sa("  보정계수  ").correct).toBe(true));
  it("G3: null 은 오답", () => expect(sa(null).correct).toBe(false));
  it("T2-1: 요약은 제출 원문 그대로다", () => expect(sa("  보정계수  ").submittedAnswerSummary).toBe("  보정계수  "));
});

describe("FILL_BLANK (G9~G13)", () => {
  const base = {
    type: "FILL_BLANK" as const,
    blanks: [{ blankKey: "a", answerText: "서울" }, { blankKey: "b", answerText: "한라산" }],
    blankRevealCount: 2,
  };
  const fb = (answers: { blankKey: string; submittedAnswer: string | null }[] | null) =>
    grade({ ...base, blankAnswers: answers });

  it("G12: 전부 맞아야 정답", () => {
    expect(fb([{ blankKey: "a", submittedAnswer: "서울" }, { blankKey: "b", submittedAnswer: "한라산" }]).correct).toBe(true);
    expect(fb([{ blankKey: "a", submittedAnswer: "서울" }, { blankKey: "b", submittedAnswer: "오답" }]).correct).toBe(false);
  });

  it("G13: blankResults 에 정답이 함께 나온다", () => {
    const r = fb([{ blankKey: "a", submittedAnswer: "서울" }, { blankKey: "b", submittedAnswer: "오답" }]);
    expect(r.blankResults).toEqual([
      { blankKey: "a", submittedAnswer: "서울", correct: true, correctAnswer: "서울" },
      { blankKey: "b", submittedAnswer: "오답", correct: false, correctAnswer: "한라산" },
    ]);
  });

  // G9·G10·G11 은 세 조건이 한 if 로 묶여 있어 **문구가 구분되지 않는다**.
  // 나눠서 다른 문구를 내면 파리티 위반이다.
  const MSG = "제출한 빈칸 개수가 올바르지 않습니다.";
  it("G11: 개수가 blankRevealCount 와 다르면", () =>
    expect(() => fb([{ blankKey: "a", submittedAnswer: "서울" }])).toThrow(expect.objectContaining({ message: MSG })));
  it("G9: 중복 키면 같은 문구", () =>
    expect(() => fb([{ blankKey: "a", submittedAnswer: "x" }, { blankKey: "a", submittedAnswer: "y" }]))
      .toThrow(expect.objectContaining({ message: MSG })));
  it("G10: 정의되지 않은 키면 같은 문구", () =>
    expect(() => fb([{ blankKey: "a", submittedAnswer: "x" }, { blankKey: "zz", submittedAnswer: "y" }]))
      .toThrow(expect.objectContaining({ message: MSG })));
  it("G3: null 도 같은 문구(개수 0 != 2)", () =>
    expect(() => fb(null)).toThrow(expect.objectContaining({ message: MSG })));

  it("T4: 요약은 답만 잇고, 빈 칸은 (미입력) 이다", () => {
    const r = fb([{ blankKey: "a", submittedAnswer: "서울" }, { blankKey: "b", submittedAnswer: "   " }]);
    expect(r.submittedAnswerSummary).toBe("서울, (미입력)");
  });
});
```

- [ ] **Step 6: 실패 확인 → `grade` 구현 → 통과 확인**

```typescript
import { BizError } from "../http/errors";
import { ErrorCode } from "../http/errorCode";

const BLANK_COUNT_MESSAGE = "제출한 빈칸 개수가 올바르지 않습니다.";

export function grade(input: GradeInput): GradeResult {
  switch (input.type) {
    case "MCQ_SINGLE":
    case "MCQ_MULTI":
    case "OX": {
      const correctIds = new Set(input.choices.filter((c) => c.isCorrect).map((c) => c.id));
      const submittedIds = new Set(input.selectedChoiceIds ?? []);   // G3: null → 빈 집합
      const correct = correctIds.size === submittedIds.size
        && [...correctIds].every((id) => submittedIds.has(id));
      // G5·T3: 문제에 정의된 순서로 고정한다. 제출 배열은 순서가 의미 없고 남의 id 가 섞일 수 있다.
      const selectedChoices = input.choices.filter((c) => submittedIds.has(c.id))
        .map((c) => ({ id: c.id, choiceText: c.choiceText }));
      return {
        correct, selectedChoices, blankResults: null,
        submittedAnswerSummary: selectedChoices.map((c) => c.choiceText ?? "").join(", "),
      };
    }
    case "SHORT_ANSWER": {
      const submitted = normalizeAnswer(input.submittedText);
      return {
        correct: input.answers.some((a) => normalizeAnswer(a) === submitted),
        selectedChoices: [], blankResults: null,
        submittedAnswerSummary: input.submittedText,   // T2-1: 원문 그대로
      };
    }
    case "FILL_BLANK": {
      const submitted = input.blankAnswers ?? [];
      const submittedKeys = new Set(submitted.map((b) => b.blankKey));
      const definedKeys = new Set(input.blanks.map((b) => b.blankKey));
      // G9·G10·G11 이 한 조건으로 묶여 문구가 하나다 — 나누지 마라.
      if (submittedKeys.size !== submitted.length
        || ![...submittedKeys].every((k) => definedKeys.has(k))
        || submittedKeys.size !== input.blankRevealCount) {
        throw new BizError(ErrorCode.INPUT_VALUE_INVALID, BLANK_COUNT_MESSAGE);
      }
      const answerByKey = new Map(input.blanks.map((b) => [b.blankKey, b.answerText]));
      const blankResults = submitted.map((s) => {
        const correctAnswer = answerByKey.get(s.blankKey)!;
        return {
          blankKey: s.blankKey, submittedAnswer: s.submittedAnswer,
          correct: normalizeAnswer(correctAnswer) === normalizeAnswer(s.submittedAnswer),
          correctAnswer,
        };
      });
      return {
        correct: blankResults.every((r) => r.correct),
        selectedChoices: [], blankResults,
        // T4: 답만 잇는다. 키는 화면에 안 나오는 내부 식별자다.
        submittedAnswerSummary: submitted
          // javaTrim 이다. JS 의 trim() 은 U+00A0·U+3000 까지 깎아 Java 와 갈린다
          // — 이 파일이 세 문단 앞에서 금지한 바로 그 실수다(정답지 T4).
          .map((b) => (b.submittedAnswer == null || javaTrim(b.submittedAnswer) === "" ? "(미입력)" : b.submittedAnswer))
          .join(", "),
      };
    }
  }
}
```

- [ ] **Step 7: 변이 테스트 — 각 단언이 실제로 실패할 수 있는지 확인한다**

아래를 하나씩 넣고 **빨개지는지 보고 되돌린다.** 초록이면 그 테스트는 아무것도 지키지 않는다.

| 변이 | 빨개져야 하는 테스트 |
|---|---|
| `javaTrim` 을 `value.trim()` 으로 | U+00A0 테스트 |
| `JAVA_WHITESPACE` 를 `/\s+/g` 로 | U+00A0 테스트 |
| `.replace(JAVA_WHITESPACE, " ")` 을 `.replace(JAVA_WHITESPACE, "")` 로 | G7-1 |
| `selectedChoices` 를 제출 순서로 | T3 |
| FILL_BLANK 의 세 조건 중 하나를 빼기 | G9 / G10 / G11 중 하나 |
| `every((r) => r.correct)` 를 `some(...)` 으로 | G12 |

- [ ] **Step 8: 전체 스위트 + Commit**

```bash
cd web && pnpm test
git add web/lib/solve/grading.ts web/lib/solve/grading.test.ts
git commit -m "feat: add solve grading with java-faithful answer normalization"
```

---

## Task 3: 풀이 조회 서비스 + 라우트 3개

**Files:**
- Create: `web/lib/solve/solveQueryService.ts`, `web/lib/solve/solveQueryService.test.ts`
- Create: `web/app/api/problems/route.ts`, `web/app/api/problems/route.test.ts`
- Create: `web/app/api/problems/random/route.ts`, `web/app/api/problems/random/route.test.ts`
- Create: `web/app/api/problems/[id]/route.ts`, `web/app/api/problems/[id]/route.test.ts`

**Interfaces:**
- Consumes: `findActiveSolveProblems`·`findRandomActiveProblems`(Task 1), `findProblemById`(`lib/db/problems`), `findChoicesByProblemId`·`findBlanksByProblemId`(`lib/db/problemParts`), `findDepartmentById`(`lib/db/departments`)
- Produces:
  ```ts
  export interface SolveDetail {
    id: number; type: string; content: string; imageUrl: string | null; referenceText: string | null;
    choices: { id: number; text: string | null }[] | null;
    blanksToAnswer: string[] | null;
    revealedBlanks: { blankKey: string; answerText: string }[] | null;
    departmentName: string | null; sourceNumber: number | null;
  }
  export async function listSolveProblems(db: DbConn, f: { keyword?: string | null; tag?: string | null }): Promise<SolveListRow[]>;
  export async function randomSolveSet(db: DbConn, i: { count: number; departmentId?: number | null }): Promise<SolveListRow[]>;
  export async function getSolveDetail(db: DbConn, problemId: number): Promise<SolveDetail>;
  export function selectRandomBlankKeys(keys: string[], count: number): string[];
  ```

- [ ] **Step 1: 상세 조회의 실패 테스트를 쓴다 — 정답 비노출이 핵심이다**

정답지 Q1~Q12. **가장 중요한 단언은 "응답 어디에도 정답성 키가 없다" 이다.**

```typescript
it("Q1: 없는 문제와 보관된 문제가 같은 문구다", async () => {
  await expect(getSolveDetail(db, 999999)).rejects
    .toMatchObject({ message: "존재하지 않거나 보관된 문제입니다." });
  const archived = await seed({ status: "ARCHIVED" });
  await expect(getSolveDetail(db, archived)).rejects
    .toMatchObject({ message: "존재하지 않거나 보관된 문제입니다." });
});

it("Q2/Q3: 객관식 보기는 {id, text} 뿐이고 정답 플래그가 없다", async () => {
  const detail = await getSolveDetail(db, mcqId);
  expect(Object.keys(detail.choices![0]).sort()).toEqual(["id", "text"]);
  // 필드명이 choiceText 가 아니라 text 다(정답지 Q3) — DB 행을 그대로 spread 하면 어긋난다.
  expect(JSON.stringify(detail)).not.toContain("isCorrect");
  expect(JSON.stringify(detail)).not.toContain("choiceText");
});

it("Q11: 응답 전체에 정답성 키가 하나도 없다", async () => {
  for (const id of [mcqId, oxId, shortId, blankId]) {
    const json = JSON.stringify(await getSolveDetail(db, id));
    for (const leak of ["\"correct\"", "\"isCorrect\"", "\"explanation\""]) {
      expect(json).not.toContain(leak);
    }
  }
});

it("Q4: 단답은 choices·blanksToAnswer·revealedBlanks 가 전부 null 이다", async () => {
  const d = await getSolveDetail(db, shortId);
  expect([d.choices, d.blanksToAnswer, d.revealedBlanks]).toEqual([null, null, null]);
});

it("Q5/Q6: 빈칸은 revealCount 개만 묻고 나머지는 정답째로 공개한다", async () => {
  // 빈칸 3개 · revealCount 1 로 만든다.
  const d = await getSolveDetail(db, blank3Id);
  expect(d.blanksToAnswer!.length).toBe(1);
  expect(d.revealedBlanks!.length).toBe(2);
  // 공개된 칸에는 answerText 가 들어 있다 — 설계 의도다(정답지 Q6). 막으면 안 된다.
  expect(d.revealedBlanks![0].answerText).toBeTruthy();
  // 물어보는 칸은 공개 목록에 없다.
  expect(d.revealedBlanks!.map((b) => b.blankKey)).not.toContain(d.blanksToAnswer![0]);
});

it("Q6-1: 전부 묻는 문제면 revealedBlanks 는 빈 배열이지 null 이 아니다", async () => {
  const d = await getSolveDetail(db, blankAllId);   // 빈칸 2 · revealCount 2
  expect(d.revealedBlanks).toEqual([]);
});

it("Q7: FILL_BLANK 는 choices 가 null 이다", async () => {
  expect((await getSolveDetail(db, blankId)).choices).toBeNull();
});

it("Q10: 부서명은 별도 조회다", async () => {
  expect((await getSolveDetail(db, mcqId)).departmentName).toBe("가팀");
});

// selectRandomBlankKeys 는 순수 함수라 무작위여도 성질은 결정적으로 고정된다(Q8·Q9).
describe("selectRandomBlankKeys", () => {
  it("Q8: count 개를 고르고, 원본의 부분집합이며, 중복이 없다", () => {
    const keys = ["a", "b", "c", "d"];
    for (let i = 0; i < 50; i++) {
      const picked = selectRandomBlankKeys(keys, 2);
      expect(picked).toHaveLength(2);
      expect(new Set(picked).size).toBe(2);          // 중복 없음
      expect(picked.every((k) => keys.includes(k))).toBe(true);
    }
  });

  it("Q8: 실제로 섞인다 — 50회 중 두 가지 이상의 결과가 나온다", () => {
    // 이 단언이 없으면 shuffle 을 빼고 앞에서 잘라도 통과한다. Java 는 shuffle 한다.
    const seen = new Set<string>();
    for (let i = 0; i < 50; i++) seen.add(selectRandomBlankKeys(["a", "b", "c"], 2).join(","));
    expect(seen.size).toBeGreaterThan(1);
  });

  it("Q9: count 가 빈칸 수보다 크면 전체를 돌려준다 — 오류가 아니다", () => {
    expect(selectRandomBlankKeys(["a", "b"], 5)).toHaveLength(2);
  });

  it("빈 배열이면 빈 배열", () => expect(selectRandomBlankKeys([], 3)).toEqual([]));
});
```

- [ ] **Step 2: 실패 확인 → 서비스 구현 → 통과 확인**

```typescript
// web/lib/solve/solveQueryService.ts (발췌)
const NOT_FOUND_MESSAGE = "존재하지 않거나 보관된 문제입니다.";

/** SolveServiceImpl.selectRandomBlankKeys(java:94-98) 미러 — shuffle 후 앞에서 count 개. */
// import { randomInt } from "node:crypto";  ← Java 의 SecureRandom 대응. Math.random() 을 쓰지 마라.
export function selectRandomBlankKeys(keys: string[], count: number): string[] {
  const shuffled = [...keys];
  for (let i = shuffled.length - 1; i > 0; i -= 1) {
    const j = randomInt(i + 1);                       // node:crypto — Java 의 SecureRandom 미러
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled.slice(0, Math.min(count, shuffled.length));
}

export async function getSolveDetail(db: DbConn, problemId: number): Promise<SolveDetail> {
  const problem = await findProblemById(db, problemId);
  // Q1: 없는 것과 보관된 것이 같은 문구다. 나누지 마라.
  if (!problem || problem.status !== "ACTIVE") {
    throw new BizError(ErrorCode.INPUT_VALUE_INVALID, NOT_FOUND_MESSAGE);
  }

  let choices: SolveDetail["choices"] = null;
  let blanksToAnswer: string[] | null = null;
  let revealedBlanks: SolveDetail["revealedBlanks"] = null;

  if (problem.type === "FILL_BLANK") {
    const blanks = await findBlanksByProblemId(db, problemId);
    // **`!` 는 아무것도 지켜 주지 않는다.** 초판 계획서가 여기서 틀렸다 — `!` 를 쓰면 NULL 이
    // 알아서 터질 거라고 가정했는데, `Math.min(null, n)` 은 **0** 이다. 그러면 물어보는 빈칸이
    // 0개가 되고 필터가 **모든 빈칸을 정답째로 내보낸다.** 오류 없이 200 으로.
    // Java 는 `selectRandomBlankKeys(List, int)` 가 원시형이라 언박싱 NPE → catch-all →
    // 200/-1 이고 정답은 하나도 안 나간다. 명시적으로 막아 그 결과를 맞춘다.
    if (problem.blankRevealCount == null || problem.blankRevealCount < 0) {
      throw new BizError(ErrorCode.MSG_PROC_FAIL);
    }
    const selected = selectRandomBlankKeys(blanks.map((b) => b.blankKey), problem.blankRevealCount);
    blanksToAnswer = selected;
    // Q6: 안 물어보는 칸은 정답째로 내보낸다. 정답 비노출의 승인된 예외다.
    // Q6-1: filter 결과라 항상 배열이다 — 전부 물어보면 [] 이지 null 이 아니다.
    revealedBlanks = blanks.filter((b) => !selected.includes(b.blankKey))
      .map((b) => ({ blankKey: b.blankKey, answerText: b.answerText }));
  } else if (problem.type !== "SHORT_ANSWER") {
    // Q4: 단답은 어느 분기에도 들어가지 않아 셋 다 null 로 남는다.
    // Q2/Q3: id 와 text 만. isCorrect 를 절대 실어 보내지 마라.
    choices = (await findChoicesByProblemId(db, problemId))
      .map((c) => ({ id: c.id, text: c.choiceText }));
  }

  const department = await findDepartmentById(db, problem.departmentId);
  return {
    id: problem.id, type: problem.type, content: problem.content, imageUrl: problem.imageUrl,
    referenceText: problem.referenceText, choices, blanksToAnswer, revealedBlanks,
    departmentName: department?.name ?? null,     // Q10: 부서가 없으면 null
    sourceNumber: problem.sourceNumber,
    // Q11: explanation 은 여기 없다. 채점 응답에서만 나온다.
  };
}
```

- [ ] **Step 3: 라우트 3개를 구현한다**

```typescript
// web/app/api/problems/route.ts
export const runtime = "nodejs";
export async function GET(request: Request): Promise<Response> {
  return handleRoute(async () => {
    await requireActor();                    // E1: 역할 제한이 없다. 로그인만 확인한다.
    const params = new URL(request.url).searchParams;
    return listSolveProblems(getDb(), { keyword: params.get("keyword"), tag: params.get("tag") });
  });
}
```

```typescript
// web/app/api/problems/random/route.ts
export async function GET(request: Request): Promise<Response> {
  return handleRoute(async () => {
    await requireActor();
    const params = new URL(request.url).searchParams;
    const raw = params.get("count");

    // count 에는 세 갈래가 있고 **문구가 서로 다르다**(정답지 P1·P9·P2·P10, 전부 실측).
    //  ① 파라미터 자체가 없다        → 승인된 이탈 ㉮ (Spring 은 catch-all 로 200/-1 이었다)
    //  ② 값이 빈 문자열이다          → 타입 불일치. ①과 다른 경로다
    //  ③ 값이 정수가 아니다(abc·1.5) → 타입 불일치
    // parseNumericParam 은 빈 문자열을 null(미지정)로 취급하므로 ②를 여기서 갈라 줘야 한다.
    // 안 그러면 count=null 이 그대로 흘러가 LIMIT 이 깨진다.
    if (raw === null) {
      throw new BizError(ErrorCode.INPUT_VALUE_INVALID, ErrorCode.INPUT_VALUE_INVALID.message);
    }
    if (raw === "") {
      throw new BizError(ErrorCode.INPUT_VALUE_INVALID, "요청 값의 형식이 올바르지 않습니다: count");
    }
    const count = parseNumericParam(raw, "count")!;   // ③ 은 여기서 같은 문구로 던진다

    // departmentId 는 비대칭이다 — 선택적 Long 이라 빈 문자열이 그냥 "미지정"이고,
    // 없는 부서 id 는 오류가 아니라 0건이다(정답지 P11, 실측).
    const departmentId = parseNumericParam(params.get("departmentId"), "departmentId");
    return randomSolveSet(getDb(), { count, departmentId });
  });
}
```

> **`requireActor()` 를 인자 없이 부르는 것이 맞다 — 확인했다.** `lib/auth/currentUser.ts:9-14` 가 `if (roles.length > 0) requireRole(...)` 이므로 인자가 없으면 **세션만 검사한다.** E1(역할 제한 없음)이 이 동작 그대로다.

- [ ] **Step 3-1: `[id]` 라우트의 경로변수 파싱 (E5)**

세 라우트 중 `app/api/problems/[id]/route.ts` 만 경로변수를 받는다. **`Number(id)` 나
`parseInt` 를 쓰지 마라** — `parseNumericParam(id, "id")` 여야 E5 의 문구가 나온다.

```typescript
// web/app/api/problems/[id]/route.ts
export const runtime = "nodejs";
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  return handleRoute(async () => {
    await requireActor();
    const { id } = await context.params;
    // E5: "요청 값의 형식이 올바르지 않습니다: id". Number(id) 를 쓰면 NaN 이 흘러가
    // "존재하지 않거나 보관된 문제입니다." 라는 **그럴듯한 오답**이 나온다.
    return getSolveDetail(getDb(), parseNumericParam(id, "id")!);
  });
}
```

**Task 4 의 `[id]/attempts` 도 같은 문구를 낸다** — `SolveController.java:34` 와 `:39` 가 둘 다
`@PathVariable Long id` 다. 두 Task 가 서로 상대가 했겠거니 하기 쉬운 자리다.

- [ ] **Step 4: 라우트 테스트 — 역할과 봉투**

> **테스트 골격은 `web/app/api/admin/problems/[id]/route.test.ts:1-40` 을 그대로 따른다.**
> `vi.hoisted` 로 `state.currentUser` 를 만들고 `lib/db/client` 의 `getDb` 를 `testDb()` 로,
> `lib/auth/session` 의 `getAuthUser` 를 그 상태로 목한다. 아래 조각의 `state`·`req`·`employee` 는
> 그 파일의 관용구를 가리킨다 — 새로 발명하지 마라. 이 계획서의 조각에서 `employee` 는
> `{ userId, employeeNo: "emp01", name: "직원", role: "EMPLOYEE", departmentId, mustChangePassword: false }`
> 형태의 `AuthUser` 를, `req(path)` 는 `new Request("http://localhost" + path)` 를 뜻한다. 같은 규칙으로
> `inUseGET`·`historyGET` 은 각 라우트의 `GET` 을, `tagsAll`/`tagsInUse` 는 두 태그 라우트를,
> `validBlankBody` 는 통과하는 FILL_BLANK 제출 본문을, `attemptDao` 는 `lib/db/attempts` 모듈을
> 가리키는 **조각 안의 약칭**이다 — 실제 파일에서는 풀어 쓴다.

```typescript
it("E1: EMPLOYEE 도 통과한다 — 이 엔드포인트에는 역할 제한이 없다", async () => {
  state.currentUser = employee;
  expect((await GET(req("/api/problems"))).status).toBe(200);
});
it("E1: DEPT_ADMIN·SUPER_ADMIN 도 같다", async () => {
  for (const role of ["DEPT_ADMIN", "SUPER_ADMIN"] as const) {
    state.currentUser = { ...employee, role };
    expect((await GET(req("/api/problems"))).status).toBe(200);
  }
});
it("㉮: count 가 없으면 400/1000 이다(승인된 이탈)", async () => {
  const res = await GET(req("/api/problems/random"));
  expect(res.status).toBe(400);
  expect(await res.json()).toMatchObject({ resultCode: 1000, resultMsg: "잘못된 파라미터를 입력했습니다." });
});
it("P3/P4: 범위를 벗어나면 문제 수 문구다", async () => {
  for (const c of [0, -1, 51]) {
    expect(await (await GET(req(`/api/problems/random?count=${c}`))).json())
      .toMatchObject({ resultMsg: "문제 수는 1 이상 50 이하여야 합니다." });
  }
});
it("P5: 1 과 50 은 통과한다(경계 포함)", async () => {
  for (const c of [1, 50]) {
    expect((await GET(req(`/api/problems/random?count=${c}`))).status).toBe(200);
  }
});
it("E5: /api/problems/abc 는 400/1000 이고 문구에 파라미터 이름이 붙는다", async () => {
  const res = await GET(req("/api/problems/abc"), { params: Promise.resolve({ id: "abc" }) });
  expect(res.status).toBe(400);
  expect(await res.json()).toMatchObject({ resultMsg: "요청 값의 형식이 올바르지 않습니다: id" });
});
it("random 이 [id] 로 새지 않는다", async () => {
  // 새면 "존재하지 않거나 보관된 문제입니다." 라는 그럴듯한 오답이 나온다(경로 주의 ②).
  const res = await GET(req("/api/problems/random?count=1"));
  expect(await res.json()).not.toMatchObject({ resultMsg: "존재하지 않거나 보관된 문제입니다." });
});
```

- [ ] **Step 5: 전체 스위트 + Commit**

```bash
cd web && pnpm test && pnpm build
git add web/lib/solve/solveQueryService.ts web/lib/solve/solveQueryService.test.ts web/app/api/problems
git commit -m "feat: add solve list, random set, and answer-free detail endpoints"
```

---

## Task 4: 채점 제출 (트랜잭션)

**Files:**
- Create: `web/lib/solve/attemptRequestBody.ts`, `web/lib/solve/attemptRequestBody.test.ts`
- Create: `web/lib/solve/attemptService.ts`, `web/lib/solve/attemptService.test.ts`
- Create: `web/app/api/problems/[id]/attempts/route.ts`, `.../route.test.ts`

**Interfaces:**
- Consumes: `grade`(Task 2), Task 1 의 시도 DAO, `findProblemById`·`findChoicesByProblemId`·`findAnswersByProblemId`·`findBlanksByProblemId`, `readJsonStrict`(`lib/http/body`), `MessageNotReadableError`(`lib/http/errors`)
- Produces:
  ```ts
  // AttemptSubmitRequest.java 미러. 세 필드 모두 선택적이다 — 유형에 따라 하나만 쓴다.
  export interface AttemptSubmitBody {
    selectedChoiceIds: number[] | null;
    submittedText: string | null;
    blankAnswers: { blankKey: string; submittedAnswer: string | null }[] | null;
  }
  export function toAttemptSubmitBody(body: Record<string, unknown>): AttemptSubmitBody;

  export interface AttemptResult { correct: boolean; explanation: string | null; blankResults: BlankResult[] | null }
  export async function submitAttempt(
    db: Db, problemId: number, body: AttemptSubmitBody, actor: AuthUser): Promise<AttemptResult>;

  // DB 행 + 요청 본문 → grade() 의 순수 입력. 유형별로 **어떤 DAO 를 부를지가 여기서 갈린다.**
  async function buildGradeInput(db: DbConn, problem: ProblemRow, body: AttemptSubmitBody): Promise<GradeInput>;
  ```

**`buildGradeInput` 이 이 Task 의 조용한 위험 지점이다.** 유형별로 부르는 DAO 가 다르고, 잘못
불러도 예외가 아니라 **오답 판정**으로 끝난다(빈 배열 → 정답 집합이 비어 있음 → 전부 오답).

```typescript
async function buildGradeInput(
  db: DbConn, problem: ProblemRow, body: AttemptSubmitBody,
): Promise<GradeInput> {
  switch (problem.type) {
    case "MCQ_SINGLE": case "MCQ_MULTI": case "OX":
      return { type: problem.type,
        choices: await findChoicesByProblemId(db, problem.id),
        selectedChoiceIds: body.selectedChoiceIds };
    case "SHORT_ANSWER":
      return { type: "SHORT_ANSWER",
        answers: (await findAnswersByProblemId(db, problem.id)).map((a) => a.answerText),
        submittedText: body.submittedText };
    case "FILL_BLANK":
      return { type: "FILL_BLANK",
        blanks: await findBlanksByProblemId(db, problem.id),
        // `!` 로 넘기지 마라 — Task 3 에서 같은 자리가 실제 결함이 됐다. `!` 는 타입만
        // 잠재울 뿐 런타임에서 NULL 을 막지 않는다. 생성 검증이 >= 1 을 강제하므로
        // (ProblemServiceImpl.java:441) 도달 불가지만, 도달하면 Java 는 언박싱 NPE 로
        // 죽는다(200/-1). 그 결과를 명시적으로 맞춘다:
        //   if (problem.blankRevealCount == null || problem.blankRevealCount < 0)
        //     throw new BizError(ErrorCode.MSG_PROC_FAIL);
        blankRevealCount: problem.blankRevealCount,
        blankAnswers: body.blankAnswers };
    default:
      // 열거형상 도달 불가. Java 도 여기서 MSG_PROC_FAIL 을 던진다
      // (SolveServiceImpl.java:163-164). 대응하는 G행은 없다 —
      // `problems.type` 은 varchar 라 TS 가 이 분기를 지워 주지 않으므로 **반드시 남겨라.**
      throw new BizError(ErrorCode.MSG_PROC_FAIL);
  }
}
```

> **제출한 빈칸 키가 "보여 준 키"와 같은지는 검사하지 않는다 — 검사할 수 없다.**
> 상세 조회가 매 요청 무작위로 고르고 **그 선택을 어디에도 저장하지 않으므로**, 서버는 이
> 사용자에게 무엇을 물었는지 모른다. Java 는 `definedKeys.containsAll(submittedKeys)` 로
> **정의된 키인지만** 본다(G10). 즉 클라이언트가 쉬운 빈칸을 골라 답해도 통과한다.
> **이것을 "보안 구멍"으로 판단해 막지 마라** — 막으려면 무엇을 보여 줬는지 저장하는
> 새 상태가 필요하고, 그건 이 서브플랜의 범위가 아니다. 파리티 대상이다.

**메시지 순서가 계약이다 (E5-1, 실측).** Global Constraints 가 "여러 규칙이 동시에 깨졌을 때
어느 메시지가 먼저 나오는지도 계약"이라고 못 박은 자리가 바로 여기다. Spring 은
`@PathVariable`(0번 인자) → `@RequestBody`(1번) → 서비스 순으로 처리하므로:

| 요청 | 결과 |
|---|---|
| 잘못된 id + 깨진 본문 | **400** / `요청 값의 형식이 올바르지 않습니다: id` |
| 없는 문제 + 깨진 본문 | **200** / 1000 / `잘못된 파라미터를 입력했습니다.` ← 조회보다 본문이 먼저다 |
| 없는 문제 + 정상 본문 | 400 / `존재하지 않거나 보관된 문제입니다.` |
| 잘못된 id + 정상 본문 | 400 / `요청 값의 형식이 올바르지 않습니다: id` |

**따라서 라우트는 이 순서로 써야 한다: 경로변수 파싱 → `readJsonStrict` → `submitAttempt`.**
본문 읽기를 `submitAttempt` 안으로 넣거나 문제 조회 뒤로 미루면 두 번째 줄이 뒤집힌다.
네 줄 전부 라우트 테스트로 고정하라.

**본문을 어떻게 읽는가 — E6 이 여기 걸려 있다.**

- `readJson` 이 **아니라 `readJsonStrict`** 를 쓴다. `readJson` 은 깨진 본문을 `{}` 로 삼켜 버리는데,
  그건 로그인 라우트가 "사번과 비밀번호를 입력하세요." 를 내기 위한 특례다(`lib/http/body.ts:3-9` 주석).
  문제 라우트처럼 본문을 DTO 로 매핑하는 곳은 엄격한 쪽을 써야 `MessageNotReadableError` →
  **200 / 1000 / `errorList` 없음**(E6)이 나온다.
- 필드 변환은 `lib/problem/problemRequestBody.ts` 의 관용구를 따른다 — 값이 기대한 타입이 아니면
  `MessageNotReadableError` 를 던지고, 오류 메시지에 `blankAnswers[2].blankKey` 같은 **필드 경로**를
  남긴다(로그용이며 사용자에게는 안 나간다). Jackson 이 역직렬화에 실패하는 자리를 그대로 미러한다.
- **`toAttemptSubmitBody` 는 셀(엑셀)에 쓰지 마라.** 서브플랜 4 의 `problemRequestBody` 와 같은
  경계다 — 이건 JSON 본문 전용이다.
  **첫 인자가 `Db` 다 — `DbConn` 이 아니다.** 이 함수가 트랜잭션을 **연다**. 이미 열린 핸들을 받으면 Drizzle 이 SAVEPOINT 로 중첩시켜 의도가 깨지므로 타입으로 막는다(서브플랜 4 Task 9 와 같은 이유).

- [ ] **Step 1: 실패 테스트 — 이탈 ㉯ 가 여기서 고정된다**

```typescript
const MAX_SUBMITTED_ANSWER_LENGTH = 500;

it("T2: 요약이 500자를 넘으면 잘라서 저장한다", async () => {
  await submitAttempt(db, shortId, { submittedText: "가".repeat(600) }, actor);
  const [row] = await db.select().from(attempts);
  expect(row.submittedAnswer!.length).toBe(500);
});

it("㉯/T8-1: 빈칸 답이 500자를 넘어도 실패하지 않는다 — 자식도 자른다", async () => {
  // Spring 은 여기서 200/-1 을 내면서 attempts 행만 남겼다(정답지 T8-1, 실측).
  const long = "가".repeat(600);
  await submitAttempt(db, blankId, { blankAnswers: [{ blankKey: "a", submittedAnswer: long }] }, actor);
  const rows = await db.select().from(attemptBlankAnswers);
  expect(rows).toHaveLength(1);
  expect(rows[0].submittedAnswer!.length).toBe(500);
});

it("㉯: 자식 insert 가 실패하면 attempts 도 남지 않는다", async () => {
  // **부모가 커밋된 뒤 자식이 죽는 상황**을 만들어야 한다. 존재하지 않는 문제로는 안 된다 —
  // submitAttempt 가 문제를 먼저 조회해 "존재하지 않거나 보관된 문제입니다." 로 끝나므로
  // insert 자체가 일어나지 않아 **틀린 이유로 통과한다.**
  // 정상 경로로는 유도할 수 없으니(자르기가 컬럼 초과를 막는다) 자식 DAO 를 한 번 던지게 한다.
  const spy = vi.spyOn(attemptDao, "insertAttemptBlankAnswers")
    .mockRejectedValueOnce(new Error("자식 insert 실패"));
  await expect(submitAttempt(db, blankId, validBlankBody, actor)).rejects.toThrow("자식 insert 실패");
  expect(await db.select().from(attempts)).toHaveLength(0);   // 롤백됐다
  spy.mockRestore();
});

it("T5: 선택지가 없으면 attempt_choices 를 만들지 않는다", async () => {
  await submitAttempt(db, mcqId, { selectedChoiceIds: [] }, actor);
  expect(await db.select().from(attemptChoices)).toHaveLength(0);
});

it("T6: choice_text 는 저장 시점 스냅샷이다", async () => {
  await submitAttempt(db, mcqId, { selectedChoiceIds: [choiceId] }, actor);
  await db.update(problemChoices).set({ choiceText: "바뀐 문구" }).where(eq(problemChoices.id, choiceId));
  expect((await db.select().from(attemptChoices))[0].choiceText).toBe("가");
});

it("G14: 채점 응답에 explanation 이 나온다 — 상세에는 없던 값이다", async () => {
  const r = await submitAttempt(db, withExplanationId, { selectedChoiceIds: [] }, actor);
  expect(r.explanation).toBe("해설 본문");
});
```

- [ ] **Step 2: 실패 확인 → 구현 → 통과 확인**

```typescript
// web/lib/solve/attemptService.ts (발췌)
const MAX_SUBMITTED_ANSWER_LENGTH = 500;

/** attempts·attempt_blank_answers 의 submitted_answer 는 둘 다 varchar(500) 이다. */
function truncate(value: string | null): string | null {
  if (value == null) return null;
  return value.length > MAX_SUBMITTED_ANSWER_LENGTH ? value.slice(0, MAX_SUBMITTED_ANSWER_LENGTH) : value;
}

export async function submitAttempt(
  db: Db, problemId: number, body: AttemptSubmitBody, actor: AuthUser,
): Promise<AttemptResult> {
  const problem = await findProblemById(db, problemId);
  if (!problem || problem.status !== "ACTIVE") {
    throw new BizError(ErrorCode.INPUT_VALUE_INVALID, "존재하지 않거나 보관된 문제입니다.");
  }

  const result = grade(await buildGradeInput(db, problem, body));   // 검증 실패는 여기서 던진다

  // 승인된 이탈 ㉯. Spring 은 트랜잭션이 없어 자식 insert 가 실패하면 attempts 만 남았고,
  // 사용자는 -1 을 보고 재제출해 시도가 중복됐다(정답지 T8-1, 실측).
  await db.transaction(async (tx) => {
    const attemptId = await insertAttempt(tx, {
      userId: actor.userId, problemId,
      submittedAnswer: truncate(result.submittedAnswerSummary),
      isCorrect: result.correct,
    });
    await insertAttemptChoices(tx, result.selectedChoices.map((c) => ({
      attemptId, choiceId: c.id, choiceText: c.choiceText,
    })));
    await insertAttemptBlankAnswers(tx, (result.blankResults ?? []).map((r) => ({
      attemptId, blankKey: r.blankKey,
      // ㉯ ②: Java 는 여기서만 자르지 않아 컬럼 초과로 죽었다.
      submittedAnswer: truncate(r.submittedAnswer),
      isCorrect: r.correct,
    })));
  });

  return { correct: result.correct, explanation: problem.explanation, blankResults: result.blankResults };
}
```

- [ ] **Step 2-1: 응답의 키 집합을 고정한다 (M2 가 배운 것)**

M2 에서 "정답이 안 샌다"를 **세 문자열 거부목록**으로 단언했더니, 리뷰어가 `hint: explanation`
을 추가했을 때 40개가 전부 통과했다. 같은 값을 다른 키 이름으로 실어 보내면 안 보인다.
M2 는 그래서 **키 집합 단언**으로 바꿨다. Task 4 도 같은 것이 필요하다:

```typescript
expect(Object.keys(result).sort()).toEqual(["blankResults", "correct", "explanation"]);
expect(Object.keys(result.blankResults![0]).sort())
  .toEqual(["blankKey", "correct", "correctAnswer", "submittedAnswer"]);  // BlankAnswerResult.java 4필드
```

두 번째가 특히 중요하다 — `blankResults` 를 DB 행에서 spread 하면 `problem_blanks.id` 와
`displayOrder` 가 함께 나간다. M2 의 `revealedBlanks` 에서 실제로 살아남은 변이가 그것이다.

**`PROBLEM_NOT_FOUND_MESSAGE` 는 `lib/solve/solveQueryService.ts` 에서 import 한다.** 다시
타이핑하지 마라 — Java 도 두 자리가 같은 문구다(`SolveServiceImpl.java:62-64`, `:103-105`).

- [ ] **Step 3: 변이 테스트**

| 변이 | 빨개져야 하는 테스트 |
|---|---|
| `db.transaction` 을 벗기고 `db` 로 직접 | "자식 insert 가 실패하면 attempts 도 남지 않는다" |
| 자식의 `truncate(...)` 를 `r.submittedAnswer` 로 | T8-1 테스트 |
| `problem.explanation` 을 `null` 로 | G14 |

- [ ] **Step 4: 라우트 + 전체 스위트 + Commit**

```bash
cd web && pnpm test && pnpm build
git add web/lib/solve/attemptService.ts web/lib/solve/attemptService.test.ts web/app/api/problems/\[id\]/attempts
git commit -m "feat: grade and record attempts in one transaction"
```

---

## Task 5: 내 이력 + 활성 태그 라우트

**Files:**
- Create: `web/app/api/attempts/me/route.ts`, `.../route.test.ts`
- Create: `web/app/api/tags/in-use/route.ts`, `.../route.test.ts`

**Interfaces:**
- Consumes: `findAttemptsByUserId`(Task 1), `findInUseTags`(**이미 있다** — `web/lib/db/tags.ts:16-24`)
- Produces: 없음

- [ ] **Step 1: 두 라우트를 구현한다**

```typescript
// web/app/api/attempts/me/route.ts
export const runtime = "nodejs";
export async function GET(): Promise<Response> {
  return handleRoute(async () => {
    const actor = await requireActor();          // E1: 역할 제한 없음
    return findAttemptsByUserId(getDb(), actor.userId);   // H1: 본인 것만
  });
}
```

```typescript
// web/app/api/tags/in-use/route.ts — DAO 는 서브플랜 4에서 이미 만들어졌다(정답지 U6).
export const runtime = "nodejs";
export async function GET(): Promise<Response> {
  return handleRoute(async () => {
    await requireActor();
    return findInUseTags(getDb());
  });
}
```

- [ ] **Step 2: 테스트**

```typescript
it("H1: 다른 사람의 이력은 안 나온다", async () => {
  await db.insert(attempts).values([
    { userId: meId,    problemId, submittedAnswer: "내 것",   isCorrect: true },
    { userId: otherId, problemId, submittedAnswer: "남의 것", isCorrect: true },
  ]);
  state.currentUser = { ...employee, userId: meId };
  const body = await (await GET()).json();
  expect(body.data.map((r: { submittedAnswer: string }) => r.submittedAnswer)).toEqual(["내 것"]);
});
it("U1: 보관된 문제에만 붙은 태그는 빠진다", async () => {
  // lib/db/tags.test.ts:74 와 같은 상황을 HTTP 로 한 번 더 본다 — DAO 는 맞는데 라우트가
  // findAllTags 를 부르는 실수를 잡는 것이 목적이다(U4 와 짝).
  const archived = await seed({ status: "ARCHIVED" });
  const [t] = await db.insert(tags).values({ name: "죽은태그" }).returning({ id: tags.id });
  await db.insert(problemTags).values({ problemId: archived, tagId: t.id });
  const body = await (await GET()).json();
  expect(body.data).toEqual([]);
});
it("U4: /api/tags 와 /api/tags/in-use 가 다른 결과를 낸다", async () => {
  // 같은 DAO 를 재사용하는 실수를 잡는 판별자다.
  expect((await tagsAll()).length).toBeGreaterThan((await tagsInUse()).length);
});
it("U2: 이름 오름차순이고 중복이 없다", async () => {
  // 한 태그를 활성 문제 두 개에 붙여 DISTINCT 가 실제로 필요한 상황을 만든다.
  const body = await (await inUseGET()).json();
  const names = body.data.map((t: { name: string }) => t.name);
  expect(names).toEqual([...names].sort());
  expect(new Set(names).size).toBe(names.length);
});
it("U3: 응답 필드는 id·name·createdAt 이다", async () => {
  // Tag 도메인을 그대로 내보내는 Spring 응답과 필드가 어긋나면 안 된다
  // (lib/db/tags.ts:9-12 의 findAllTags 주석이 같은 이유를 적고 있다).
  const body = await (await inUseGET()).json();
  expect(Object.keys(body.data[0]).sort()).toEqual(["createdAt", "id", "name"]);
});
// U5 도 이 테스트가 덮는다 — TagController 에는 @RequireRole 이 없다.
it("E1/U5: EMPLOYEE 도 두 엔드포인트를 쓸 수 있다", async () => {
  state.currentUser = { ...employee, role: "EMPLOYEE" };
  expect((await historyGET()).status).toBe(200);
  expect((await inUseGET()).status).toBe(200);
});
```

- [ ] **Step 3: 전체 스위트 + Commit**

```bash
cd web && pnpm test && pnpm build
git add web/app/api/attempts web/app/api/tags/in-use
git commit -m "feat: add attempt history and in-use tag endpoints"
```

---

## Task 6: 이미지 프록시 라우트 (승인된 이탈 ㉱)

**Files:**
- Create: `web/app/api/problem-images/[key]/route.ts`, `.../route.test.ts`
- Modify: `web/lib/problem/problemImage.ts` (버킷 상수·클라이언트를 export)

**결정 근거 — 왜 서명 URL 이 아니라 프록시인가**

| | 프록시 라우트 | 서명 URL |
|---|---|---|
| 저장된 `image_url` | **그대로 쓴다** — 이미 `/api/problem-images/<uuid>.<ext>` 다 | 응답마다 변환해야 한다. 서명 URL 은 만료되므로 저장할 수 없다 |
| 파리티 영향 | 없음 | 상세·목록·이력 등 이미지 URL 을 싣는 **모든 응답의 값이 바뀐다** |
| 세션 게이트 | `middleware.ts` 의 `/api/:path*` 가 **자동으로** 건다 | 발급 시점에만 확인. URL 이 유출되면 만료까지 누구나 |
| 회수 | 즉시 | 만료까지 불가 |
| 비용 | 함수 호출 + 대역폭 | Supabase 가 직접 서빙 |

M6 이 접두어를 `/api/problem-images/` 로 고른 것이 **정확히 프록시를 염두에 둔 선택**이었다(`web/lib/problem/imageUrl.ts:1-4` 주석). 비용 쪽 우려는 실물 데이터로 반박된다 — 실제 스프레드시트 12개에서 **이미지 셀이 0건**이었다(서브플랜 4 M7 실측).

- [ ] **Step 1: 실패 테스트를 쓴다**

```typescript
it("정상 키는 오브젝트를 그대로 내보낸다", async () => {
  const res = await GET(req("/api/problem-images/" + key), { params: { key } });
  expect(res.status).toBe(200);
  expect(res.headers.get("content-type")).toBe("image/png");
  expect(Buffer.from(await res.arrayBuffer())).toEqual(PNG);
});

it("삭제된 오브젝트는 404 다", async () => {
  // 실제로 이 상태의 행이 하나 있다 — M7 이 버킷을 비우면서 생겼다
  // (2026-08-19-problem-bank-e2e-verification.md I12). 첫 테스트 케이스다.
  expect((await GET(req("/api/problem-images/" + missingKey), { params: { key: missingKey } })).status).toBe(404);
});

it("키 형식이 아니면 스토리지를 건드리지 않고 404 다", async () => {
  // 경로 탈출·임의 오브젝트 열람을 키 형식으로 막는다.
  for (const bad of ["../secret.png", "a/b.png", "not-a-uuid.png", key + ".png.exe"]) {
    expect((await GET(req("/api/problem-images/" + bad), { params: { key: bad } })).status).toBe(404);
    expect(storageState.downloads).toEqual([]);   // 호출 자체가 없어야 한다
  }
});

it("응답 봉투를 쓰지 않는다 — 바이너리다", async () => {
  const res = await GET(req("/api/problem-images/" + key), { params: { key } });
  expect(res.headers.get("content-type")).not.toContain("application/json");
});
```

> **먼저 정할 것 — 미들웨어가 이 라우트에도 JSON 봉투를 씌운다.** `middleware.ts` 의 matcher 가
> `/api/:path*` 라 비로그인은 **401 + JSON**, `mustChangePassword` 사용자는 **200 + JSON(1012)**
> 를 받는다. `<img>` 태그가 그 응답을 받으면 깨진 이미지가 된다. Global Constraints 는 이 라우트를
> 봉투 예외로 뒀지만 **그건 성공 경로 얘기**다. 두 실패 경로를 그대로 둘지(브라우저에는 깨진
> 이미지, 서버 로그에는 이유가 남는다) 아니면 이 경로만 matcher 에서 빼고 라우트가 직접 세션을
> 볼지 **의식적으로 정하고 그 근거를 남겨라.** 기본값은 "그대로 둔다" 다 — 로그인하지 않은
> 사용자에게 이미지가 안 보이는 것은 올바른 결과이고, 봉투를 벗기면 인증 게이트를 손대게 된다.

- [ ] **Step 2: 실패 확인 → 구현 → 통과 확인**

```typescript
// web/app/api/problem-images/[key]/route.ts
import { getStorageClient, PROBLEM_IMAGE_BUCKET } from "@/lib/problem/problemImage";
// ↑ 이 두 이름은 **아직 export 되어 있지 않다.** problemImage.ts 에 `getStorageClient` 는
// 같은 이름의 모듈 내부 함수로 존재하고(:27), 버킷 상수는 `BUCKET` 이라는 이름이다(:12).
// 이 Task 가 할 일: 함수에 `export` 를 붙이고, 상수를 `PROBLEM_IMAGE_BUCKET` 으로 바꿔 export 한 뒤
// problemImage.ts 안의 사용처를 함께 고친다. 이름을 바꾸기 싫으면 `BUCKET` 을 그대로 export 하고
// 여기 import 를 맞춰라 — 둘 중 하나로 통일하면 된다.

export const runtime = "nodejs";

// 업로드가 만드는 이름은 <uuid>.<ext> 뿐이다(problemImage.ts 의 storedName).
// 이 형식만 통과시키면 경로 탈출도, 임의 오브젝트 열람도 스토리지 호출 전에 막힌다.
const KEY_PATTERN = /^[0-9a-f-]{36}\.[a-z0-9]{1,5}$/;

/**
 * 승인된 이탈 ㉱ — Spring 은 로컬 디스크를 정적 리소스로 서빙했다. 비공개 버킷이라
 * 공개 URL 을 내줄 수 없으므로 서버가 대신 받아 내보낸다.
 *
 * 세션 검사는 여기서 하지 않는다 — `middleware.ts` 의 matcher 가 `/api/:path*` 라
 * 로그인하지 않은 요청은 이 함수에 도달하지 못한다(정답지 E2).
 *
 * 이 라우트만 응답 봉투를 쓰지 않는다. 바이너리를 그대로 내보내야 <img> 가 렌더한다.
 */
export async function GET(_request: Request, context: { params: Promise<{ key: string }> }): Promise<Response> {
  const { key } = await context.params;
  if (!KEY_PATTERN.test(key)) return new Response(null, { status: 404 });

  const { data, error } = await getStorageClient().storage.from(PROBLEM_IMAGE_BUCKET).download(key);
  if (error || !data) return new Response(null, { status: 404 });

  return new Response(data, {
    status: 200,
    headers: {
      "content-type": data.type || "application/octet-stream",
      // 로그인한 사용자에게만 나가는 자원이다. 공유 캐시에 남기지 않는다.
      "cache-control": "private, max-age=3600",
      "content-disposition": "inline",
    },
  });
}
```

- [ ] **Step 3: 실물 확인 — 목이 아니라 진짜 버킷**

이 Task 는 목만으로는 의미가 없다. 서버를 띄우고 **실제로 한 장 올린 뒤 프록시로 받아** 바이트가 같은지 확인한다. 끝나면 **올린 오브젝트를 지우고 버킷이 비었음을 재조회로 확인한다**(서브플랜 4 Ruling 12 승계 — 이미지를 지우는 API 는 없다).

- [ ] **Step 4: 전체 스위트 + Commit**

```bash
cd web && pnpm test && pnpm build
git add web/app/api/problem-images web/lib/problem/problemImage.ts
git commit -m "feat: serve private bucket images through a session-gated proxy route"
```

---

## Task 7: E2E 검증 + 정답지 대조

**Files:**
- Create: `docs/qa/2026-08-21-solve-e2e-verification.md`

- [ ] **Step 1: 서버 기동**

```bash
cd web && pnpm build && pnpm start
```

- [ ] **Step 2: 6개 엔드포인트 전수 확인**

응답 본문을 **그대로** 문서에 적는다. 최소 항목:

| # | 확인 | 기대 |
|---|---|---|
| 1 | EMPLOYEE 로 목록·랜덤·상세·제출·이력·태그 전부 | 6개 모두 200 — 역할 제한이 없다(E1) |
| 2 | 비로그인 | 401 / 980 |
| 3 | 상세 5개 유형 | 응답에 `correct`·`isCorrect`·`explanation` 이 **한 번도 안 나온다** |
| 4 | FILL_BLANK 상세를 5회 호출 | `blanksToAnswer` 조합이 최소 2가지 이상 — 무작위가 실제로 동작 |
| 5 | 전부 묻는 빈칸 문제 | `revealedBlanks` 가 `[]` (null 아님) |
| 6 | `random` count 누락 | **400 / 1000**(이탈 ㉮) — `-1` 이 나오면 실패 |
| 7 | `random?count=0`·`51` | `문제 수는 1 이상 50 이하여야 합니다.` |
| 8 | 단답 `보정 계수` vs `  보정계수  ` | 앞은 오답, 뒤는 정답(G7-1) |
| 9 | MCQ 를 `[10,9]` 순서로 제출 | `attempts.submitted_answer` 가 `가, 나` (T3) |
| 10 | 빈칸 답 600자 제출 | **200 + 정상 채점**, 자식 행 500자로 저장(이탈 ㉯). Spring 은 여기서 `-1` + 고아 행이었다 |
| 11 | 남의 부서 문제 상세 | **허용**(E4) — 막히면 실패 |
| 12 | 이력 | 본인 것만, `correct` 에 true 가 실제로 있다(H4) |
| 13 | 보관된 문제의 이력 | **나온다**(H7). 목록에는 안 나온다(S2) |
| 14 | 이미지 프록시 | 업로드 → 프록시로 받기 → 바이트 일치 → 삭제 → 버킷 빔 확인 |
| 15 | `/api/problems/random?count=1` | 랜덤 세트가 나온다 — `존재하지 않거나 보관된 문제입니다.` 가 나오면 `[id]` 로 샌 것이다(경로 주의 ②) |
| 16 | `?count=` · `?count=1.5` | 둘 다 `요청 값의 형식이 올바르지 않습니다: count` (P9·P10). **누락(㉮)과 문구가 다르다** |
| 17 | `?count=1&departmentId=99999` | 200 / 0건 — 없는 부서는 오류가 아니다(P11) |

- [ ] **Step 3: 정답지 대조**

정답지 86행을 한 줄씩 짚어 실측값과 대조한다. **대조하지 않은 행이 남으면 안 된다** — 재현 불가한 행은 사유를 적고 단위 테스트로 대체됐음을 밝힌다.

- [ ] **Step 4: 전체 검증**

```bash
cd web && pnpm test && pnpm build
cd ../backend && ./gradlew cleanTest test   # 301 유지 — 이 서브플랜은 backend 를 건드리지 않는다
```

- [ ] **Step 5: Commit**

```bash
git add docs/qa/2026-08-21-solve-e2e-verification.md
git commit -m "docs: record the solve end-to-end verification results"
```

---

## Self-Review 결과

**Spec 커버리지** — 정답지 79행이 Task 에 배정됐는지 확인했다.

| 정답지 절 | Task |
|---|---|
| E (권한·공통) 7행 | E1·E4·E5·E6 은 3·4·5 의 라우트 테스트. **E2(401)·E3(비밀번호 변경 강제)는 미들웨어가 이미 고정한 동작이라 새 테스트를 만들지 않는다** — 서브플랜 1·2 소관이고, Task 7 E2E 에서 한 줄로 재확인한다 |
| S (목록) 10행 | 1(DAO) · 3(라우트) |
| P (랜덤) 12행 | 1(DAO) · 3(라우트·이탈 ㉮) |
| Q (상세·정답 비노출) 14행 | 3 |
| G (채점) 15행 | 2 |
| T (시도 저장) 13행 | 1(DAO) · 2(요약) · 4(트랜잭션·자르기) |
| H (이력) 8행 | 1(DAO) · 5(라우트) |
| U (활성 태그) 6행 | 5 |
| 미결정(이미지 조회) | 6 |

**타입 일관성**
- DAO 는 전부 `DbConn` 을 첫 인자로 받는다. **예외는 `submitAttempt(db: Db, ...)` 하나** — 트랜잭션을 여는 쪽이라 의도적으로 다르다.
- `SolveListRow` 는 Task 1 이 정의하고 3 이 그대로 내보낸다.
- `GradeResult.selectedChoices` 가 Task 4 의 `attempt_choices` 입력이 된다 — 순서가 여기서 결정된다.
- `BlankResult` 는 Task 2 가 정의하고 4 가 저장·응답 양쪽에 쓴다.

**놓치기 쉬운 지점**
- `web/app/api/problems/**`(직원)와 `web/app/api/admin/problems/**`(관리자)를 헷갈리면 안 된다.
- 상세 응답에 `isCorrect` 를 실어 보내면 정답이 샌다 — DB 행을 그대로 spread 하지 마라(Q2·Q3).
- 반대로 `revealedBlanks` 의 `answerText` 는 **일부러** 정답이다. 막으면 안 된다(Q6).
- FILL_BLANK 검증 3조건은 **한 문구**다. 나누면 파리티 위반(G9~G11).
- `normalizeAnswer` 는 JS 기본 `trim()`·`\s` 를 쓰면 안 된다(Java 와 범위가 다르다).
- 이력에는 `p.status` 조건이 없다(H7). 목록과 다르다.
- `findInUseTags` 는 **이미 있다.** 새로 만들지 마라(U6).

**푸시 전 재검토가 찾은 것 (2026-08-21, 코드베이스와 1:1 대조)**

서브플랜 4에서 같은 검토가 시그니처 불일치 8건을 잡았기에, 계획서가 코드베이스에 대해 주장하는
것을 전부 실제 파일과 대조했다. **결함 3건**이 나왔다.

| # | 문제 | 확인 |
|---|---|---|
| 1 | Task 1 의 seed 헬퍼가 `createdBy: null` 이었다 | `problems.created_by` 는 **NOT NULL + users FK**(`schema.ts`). 첫 insert 부터 죽는다. 기존 `lib/db/problems.test.ts:30-36` 처럼 사용자를 먼저 만들도록 고쳤다 |
| 2 | `AttemptSubmitBody`·`buildGradeInput` 을 쓰면서 **어디에도 정의하지 않았다** | 위장된 placeholder 다. `attemptRequestBody.ts` 를 Task 4 의 산출물로 추가하고 타입과 변환 규칙을 명시했다 |
| 3 | 요청 본문을 어떤 리더로 읽는지 안 적었다 | E6(200/1000/`errorList` 없음)은 `readJsonStrict` 라야 나온다. `readJson` 은 깨진 본문을 `{}` 로 삼킨다(`lib/http/body.ts:3-9`) — 로그인 라우트 전용 특례다 |

**보강한 것**

- **정적/동적 라우트 우선순위**(`random` vs `[id]`)를 아예 안 적었다. 저장소에 선례가 있어 동작은
  하지만, 새면 "존재하지 않거나 보관된 문제입니다." 라는 **그럴듯한 오답**이 나온다 — 서브플랜 4가
  이걸 따로 고정한 이유다. 경로 주의 ② + 라우트 테스트 + E2E 행 15 를 넣었다.
- **H2 테스트가 플래키였다.** `defaultNow()` 에 맡기면 두 insert 가 같은 타임스탬프를 받을 수 있고
  `ORDER BY` 에 타이브레이커가 없다. `submittedAt` 을 명시하도록 고쳤다.
- **㉯ 의 롤백 테스트가 틀린 이유로 통과할 참이었다.** 없는 문제 id 를 쓰면 `submitAttempt` 가
  조회 단계에서 먼저 끝나 insert 자체가 일어나지 않는다. 자식 DAO 를 한 번 던지게 바꿨다.
- Task 6 의 import 두 이름은 **아직 export 되어 있지 않다**(`getStorageClient` 는 내부 함수,
  상수는 `BUCKET`). 무엇을 고쳐야 하는지 적었다.
- `randomInt` 의 출처(`node:crypto`)와 `Math.random()` 금지를 명시했다.
- `problem_choices.choice_text` 는 NOT NULL 이라 `string | null` 이 과했다. 저장 쪽
  (`attempt_choices`)은 nullable 이라 서로 다르다는 것도 적었다.
- E2·E3 은 미들웨어가 이미 고정한 동작이라 새 테스트 대상이 아님을 커버리지 표에 명시했다.

**계획서를 쓰다 고친 것 (초안 Self-Review 가 잡은 실제 결함)**

초안은 `count` 를 `raw === null` 하나로만 갈랐다. 그런데 `parseNumericParam` 은 **빈 문자열을
`null`(미지정)로 돌려주므로**, `?count=` 가 이탈 ㉮ 로 새거나 `count=null` 이 그대로 흘러가
`LIMIT` 이 깨질 참이었다. Spring 을 다시 띄워 재 보니 `?count=` 는 **누락이 아니라 타입 불일치**
(`요청 값의 형식이 올바르지 않습니다: count`)였다. 정답지에 P9·P10·P11 을 추가하고 라우트
코드를 세 갈래로 고쳤다. `?count=1.5` 도 함께 쟀다 — 포트의 `Number.isSafeInteger` 가 이미 맞다.

`requireActor()` 무인자 동작도 추측으로 두지 않고 `lib/auth/currentUser.ts:9-14` 를 읽어 확정했다.

**미해결로 남기는 것**
- 컷오버 이월 항목은 이 서브플랜 범위 밖이다 — `docs/qa/2026-08-19-problem-bank-e2e-verification.md` 의 "컷오버 핸드오프" 절이 계속 유효하다.
