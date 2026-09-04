# 직군(기술직/행정직)별 문제 분리 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 로그인할 때 고른 직군(행정직/기술직)에 해당하는 문제만 풀이 화면에 보이게 한다.

**Architecture:** `problems` 에 `track` 컬럼 하나를 더한다. 사람에게는 직군을 저장하지 않고
로그인 화면에서 고른 값을 세션 토큰에 실어 나른다. 사용자가 문제에 닿는 8개 질의에
`problems.track = :track` 을 더하고, 쓰기 경로 2곳에는 `track` 을 필수 인자로 만들어
컴파일이 누락을 잡게 한다.

**Tech Stack:** Next.js 15 (App Router), TypeScript, drizzle-orm + postgres.js, vitest(실제
Postgres 를 띄우는 통합 테스트), jose(JWT), React 19 + JSX 화면.

**Spec:** `docs/superpowers/specs/2026-09-04-job-track-scoping-design.md`

## Global Constraints

- 직군 값은 `'ADMIN'`(행정직) / `'TECH'`(기술직) 두 가지뿐. 문자열 리터럴을 코드 곳곳에
  흩지 말고 `lib/problem/track.ts` 의 `Track` 타입과 `DEFAULT_TRACK` 을 쓴다(Task 1에서 만든다).
- **이건 잠금장치가 아니다.** 값이 없거나 이상하면 거절하지 말고 `'ADMIN'` 으로 읽는다.
  `getSolveDetail`·`submitAttempt` 에는 직군 검사를 넣지 않는다(스펙 "무엇이 아닌가").
- 명예의 전당 쿼리에 `problems` 를 조인할 때 **`p.status = 'ACTIVE'` 를 넣지 않는다.**
  지금은 보관된 문제의 정답도 세고 있고, 그 동작을 유지해야 한다.
- 관리자 통계·대시보드·계정 화면은 건드리지 않는다.
- 테스트는 `pnpm test`(vitest). DB 가 필요한 테스트는 `migrateTestDb()` / `truncateAll()` 을
  쓰는 기존 관례를 그대로 따른다(`lib/db/solveProblems.test.ts:1-30` 참고).
- 커밋 메시지는 저장소 관례를 따른다: `[ADD]` / `[MOD]` / `[FIX]` / `[CHORE]` 접두어.

## 스펙에서 한 가지를 바꾼다 — 읽고 시작할 것

스펙은 `ALTER COLUMN track DROP DEFAULT` 로 기본값을 떼어 drizzle 삽입 타입이 `track` 을
**필수**로 만들라고 적었다. 목적은 "쓰기 경로가 track 을 빠뜨리면 컴파일에서 걸리게" 다.

그 방법은 값을 치른다. `insert(problems)` 는 저장소에 **52곳**이 있고 그중 대부분이
28개 테스트 파일의 픽스처다. 기본값을 떼면 52줄을 기계적으로 고쳐야 하는데, 정작 위험한
쓰기 경로는 **두 곳뿐**이다(`lib/problem/problemExcel.ts:294`, `lib/problem/problemService.ts:161`).

그래서 **기본값은 남기고, 그 두 곳의 진입점 함수에 `track` 을 필수 인자로 만든다**(Task 8).
목적은 그대로 달성되고 — 라우트가 `track` 을 안 넘기면 컴파일이 실패한다 — 관계없는 테스트
52줄을 건드리지 않는다. 대량 기계 편집 자체가 사고가 나는 자리다.

## 작업 순서 — 번호대로 하지 마라

Task 10(로그인 토글)만 **맨 끝으로 뺀다.**

```
1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9 → 11 → 12 → 10
```

토글을 켜기 전까지 모두가 기본값 `ADMIN` 이므로 앱은 **오늘과 똑같이 동작한다.** 그동안
거르는 코드와 관리자 화면을 다 넣고(1~9, 11), 기술직 500문항을 적재한 뒤(12), 마지막에
토글을 연다(10).

번호대로 10을 먼저 하면 **기술직 문제가 하나도 없는 상태에서 기술직을 고를 수 있게 된다** —
문제 목록·팀 대항·부서 드롭다운·명예의 전당이 전부 빈 화면이다. Task 12 는 Task 11(관리자
직군 선택)이 있어야 올릴 수 있으므로 12 를 10 보다 앞에 두는 것이 가능하다.

## 파일 구조

| 파일 | 책임 | 상태 |
|---|---|---|
| `lib/problem/track.ts` | `Track` 타입, `DEFAULT_TRACK`, `parseTrack()` | 새로 만듦 |
| `lib/db/schema.ts` | `problems.track` 컬럼 | 수정 |
| `drizzle/00NN_*.sql` | 마이그레이션 | 생성됨 |
| `lib/auth/types.ts` · `lib/auth/jwt.ts` | 세션에 직군 싣기 | 수정 |
| `app/api/auth/login/route.ts` | 토글 값 받아 세션에 붙이기 | 수정 |
| `lib/db/solveProblems.ts` | 목록·랜덤 거르기 | 수정 |
| `lib/db/solveTeams.ts` | 팀 대항 4개 질의 거르기 | 수정 |
| `lib/db/departments.ts` | 직군별 부서 선택지 | 수정 |
| `lib/db/attempts.ts` | 학습 이력 거르기 | 수정 |
| `lib/db/hallOfFame.ts` | 개인·팀 순위 거르기 | 수정 |
| `lib/problem/problemService.ts` · `problemExcel.ts` | 쓰기 경로에 track 필수화 | 수정 |
| `lib/problemSync/snapshot.ts` 외 | 운영→로컬 동기화에 track 싣기 | 수정 |
| `screens/auth/LoginPage.jsx` | 직군 토글 + 기억 | 수정 |
| 관리자 화면 2곳 | 직군 선택 | 수정 |

---

### Task 1: track 컬럼과 공용 타입

**Files:**
- Create: `web/lib/problem/track.ts`
- Create: `web/lib/problem/track.test.ts`
- Modify: `web/lib/db/schema.ts` (`problems` 테이블 정의)
- Test: `web/lib/db/schema.test.ts` (뒤에 추가)

**Interfaces:**
- Consumes: 없음(첫 작업)
- Produces:
  - `export type Track = "ADMIN" | "TECH"`
  - `export const DEFAULT_TRACK: Track` (= `"ADMIN"`)
  - `export function parseTrack(value: unknown): Track` — 모르는 값이면 `DEFAULT_TRACK`
  - `problems.track` 컬럼(기본값 `'ADMIN'`, CHECK 제약)

- [ ] **Step 1: `parseTrack` 의 실패하는 테스트를 쓴다**

`web/lib/problem/track.test.ts` 를 만든다.

```ts
import { describe, it, expect } from "vitest";
import { DEFAULT_TRACK, parseTrack } from "./track";

describe("parseTrack", () => {
  it("아는 값은 그대로 돌려준다", () => {
    expect(parseTrack("ADMIN")).toBe("ADMIN");
    expect(parseTrack("TECH")).toBe("TECH");
  });

  // 잠금장치가 아니다 — 거절하지 않고 행정직으로 읽는다(스펙 "무엇이 아닌가").
  it("모르는 값·빈 값은 행정직으로 읽는다", () => {
    expect(parseTrack(null)).toBe(DEFAULT_TRACK);
    expect(parseTrack(undefined)).toBe(DEFAULT_TRACK);
    expect(parseTrack("")).toBe(DEFAULT_TRACK);
    expect(parseTrack("tech")).toBe(DEFAULT_TRACK); // 대소문자 관대하게 굴지 않는다
    expect(parseTrack(3)).toBe(DEFAULT_TRACK);
  });

  it("기본값은 행정직이다", () => {
    expect(DEFAULT_TRACK).toBe("ADMIN");
  });
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `cd web && pnpm exec vitest run lib/problem/track.test.ts`
Expected: FAIL — `Failed to resolve import "./track"`

- [ ] **Step 3: `track.ts` 를 만든다**

```ts
/**
 * 직군. 행정직(ADMIN)과 기술직(TECH) 두 가지뿐이다.
 *
 * 이 값은 **사람의 속성이 아니라 로그인할 때 고르는 화면 필터**다. 서버는 맞는지 확인하지
 * 않는다 — 두 직군의 문제은행은 이미 사내 파일서버에 서로 열려 있어 감출 대상이 아니고,
 * 목적은 접근 차단이 아니라 화면 정리다. 그래서 모르는 값이 와도 거절하지 않는다.
 */
export type Track = "ADMIN" | "TECH";

export const DEFAULT_TRACK: Track = "ADMIN";

const KNOWN: readonly string[] = ["ADMIN", "TECH"];

/** 모르는 값·없는 값은 행정직으로 읽는다. 배포 전에 발급된 세션 토큰이 이 경로를 탄다. */
export function parseTrack(value: unknown): Track {
  return typeof value === "string" && KNOWN.includes(value) ? (value as Track) : DEFAULT_TRACK;
}
```

- [ ] **Step 4: 통과를 확인한다**

Run: `cd web && pnpm exec vitest run lib/problem/track.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: 스키마에 컬럼을 더한다**

`web/lib/db/schema.ts` 의 `problems` 정의에서 `sourceNumber` 줄 **아래**에 컬럼을 넣고,
테이블 두 번째 인자의 제약 목록에 CHECK 를 더한다.

```ts
  sourceNumber: integer("source_number"),
  // 직군. 사람이 아니라 문제에 붙는다 — 한 팀 안에 두 직군이 섞이므로(영업팀) 부서에서
  // 파생시킬 수 없다. 기본값이 있어 기존 행은 전부 ADMIN 이 된다.
  track: varchar("track", { length: 20 }).notNull().default("ADMIN"),
```

제약 목록에 추가:

```ts
  trackCheck: check("problems_track_check", sql`${t.track} IN ('ADMIN', 'TECH')`),
```

- [ ] **Step 6: 마이그레이션을 만든다**

Run: `cd web && pnpm drizzle:generate`
Expected: `drizzle/` 아래에 새 `.sql` 파일이 하나 생긴다. 열어서 `ADD COLUMN "track"` 과
`problems_track_check` 가 들어 있는지 눈으로 확인한다. **`DROP DEFAULT` 는 없어야 한다**
(위 "스펙에서 한 가지를 바꾼다" 참고).

- [ ] **Step 7: 컬럼 동작 테스트를 쓴다**

`web/lib/db/schema.test.ts` 끝에 붙인다. **이 파일에는 `deptId`·`userId` 같은 모듈 변수가
없다** — 모듈 수준에는 `db` 하나뿐이고 테스트마다 부서·사용자를 인라인으로 만든다
(`:27-30` 의 기존 테스트와 같은 모양). 아래 헬퍼를 `describe` 안에 같이 넣는다.

```ts
describe("problems.track", () => {
  async function makeOwner() {
    const [dept] = await db.insert(departments)
      .values({ name: "직군부서", code: "TRK" }).returning();
    const [admin] = await db.insert(users).values({
      employeeNo: "trk-admin", name: "관리자", email: "trk@example.com", passwordHash: "x",
      departmentId: dept.id, role: "SUPER_ADMIN",
    }).returning();
    return { departmentId: dept.id, createdBy: admin.id };
  }

  it("안 넘기면 행정직으로 들어간다", async () => {
    const owner = await makeOwner();
    const [row] = await db.insert(problems)
      .values({ type: "OX", content: "본문", ...owner })
      .returning({ track: problems.track });
    expect(row.track).toBe("ADMIN");
  });

  it("기술직으로 넣으면 그대로 저장된다", async () => {
    const owner = await makeOwner();
    const [row] = await db.insert(problems)
      .values({ type: "OX", content: "본문", track: "TECH", ...owner })
      .returning({ track: problems.track });
    expect(row.track).toBe("TECH");
  });

  it("두 값 밖은 DB 가 거절한다", async () => {
    const owner = await makeOwner();
    await expect(db.insert(problems).values({
      type: "OX", content: "본문", track: "SALES", ...owner,
    })).rejects.toThrow();
  });
});
```

`users` insert 의 필수 열(`email` 등)은 같은 파일 `:28-33` 의 기존 테스트를 보고 맞춘다.

- [ ] **Step 8: 테스트를 돌린다**

Run: `cd web && pnpm exec vitest run lib/db/schema.test.ts`
Expected: PASS. 실패하면 마이그레이션이 테스트 DB 에 안 걸린 것이다 — `migrateTestDb()` 가
`drizzle/` 을 읽으므로 Step 6 의 파일이 생겼는지 다시 본다.

- [ ] **Step 9: 커밋**

```bash
cd web && pnpm typecheck
git add lib/problem/track.ts lib/problem/track.test.ts lib/db/schema.ts lib/db/schema.test.ts drizzle/
git commit -m "[ADD] 문제에 직군(track) 컬럼"
```

---

### Task 2: 세션에 직군 싣기

**Files:**
- Modify: `web/lib/auth/types.ts`
- Modify: `web/lib/auth/jwt.ts:24-37` (`verifySession`)
- Modify: `web/lib/auth/authService.ts:52` (`login()` 이 AuthUser 를 만드는 자리)
- Modify: `web/app/api/auth/login/route.ts`
- Modify: **테스트 픽스처 60곳** (Step 8 — 이 계획에서 가장 큰 단계다)
- Test: `web/lib/auth/jwt.test.ts` (기존 파일 수정 + 추가)

**Interfaces:**
- Consumes: `Track`, `DEFAULT_TRACK`, `parseTrack` (Task 1)
- Produces: `AuthUser.track: Track` — Task 3~8 이 `actor.track` 으로 읽는다

> **이 작업의 크기를 미리 알고 시작하라.** `AuthUser` 에 필수 필드를 더하면 저장소 전체에서
> **타입 오류 62개**가 난다(실측). 그중 **생산 코드는 2곳뿐**이고(`jwt.ts:27`,
> `authService.ts:52` — 둘 다 아래 단계에 있다) 나머지 **60곳은 테스트 픽스처**다.
>
> 60곳은 전부 `track: "ADMIN"` 한 줄을 더하는 기계적 편집이고, 그 값은 기존 동작과 같다
> (지금 사용자는 전부 행정직이다). 컴파일러가 빠짐없이 짚어 주므로 누락은 생기지 않는다.
> 다만 **2~5분짜리 단계가 아니다.** Step 8 을 따로 떼어 두었으니 거기서 한 번에 끝내라.

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`web/lib/auth/jwt.test.ts` 에 추가한다. 이 파일의 기존 픽스처 이름은 **`user`** 다
(`baseUser` 가 아니다, `:5-7`). `SESSION_JWT_SECRET` 은 이미 `beforeAll` 이 넣어 준다.

```ts
describe("세션의 직군", () => {
  it("서명하고 복원하면 직군이 남아 있다", async () => {
    const restored = await verifySession(await signSession({ ...user, track: "TECH" }));
    expect(restored?.track).toBe("TECH");
  });

  // 배포 전에 발급된 토큰에는 track 이 없다. 강제 로그아웃 없이 넘어가야 한다.
  it("직군이 없는 옛 토큰은 행정직으로 읽는다", async () => {
    const { track: _drop, ...withoutTrack } = { ...user, track: "TECH" as const };
    const restored = await verifySession(await signSession(withoutTrack as never));
    expect(restored?.track).toBe("ADMIN");
  });
});
```

**같은 파일의 기존 테스트 하나도 같이 고쳐야 한다.** `:16` 의
`expect(await verifySession(token)).toEqual(user)` 는 복원 객체에 `track` 이 붙으면서
**런타임에 깨진다** — 타입 검사로는 안 걸리는 실패다. 픽스처 `user` 에 `track: "ADMIN"` 을
넣어 두면 양쪽이 맞는다(Step 8 에서 어차피 넣게 되지만, 이 테스트를 돌리려면 지금 넣어야 한다).

- [ ] **Step 2: 실패를 확인한다**

Run: `cd web && pnpm exec vitest run lib/auth/jwt.test.ts`
Expected: FAIL — `restored.track` 이 `undefined`

- [ ] **Step 3: `AuthUser` 에 필드를 더한다**

`web/lib/auth/types.ts`:

```ts
import type { Track } from "../problem/track";

export interface AuthUser {
  userId: number;
  employeeNo: string;
  name: string;
  role: UserRole;
  departmentId: number;
  mustChangePassword: boolean;
  /** 로그인할 때 고른 직군. 사람의 속성이 아니라 이 세션의 화면 필터다. */
  track: Track;
}
```

- [ ] **Step 4: `verifySession` 에 매핑을 더한다**

`web/lib/auth/jwt.ts` 의 `verifySession` 반환 객체 마지막에 한 줄 넣는다.

```ts
      mustChangePassword: payload.mustChangePassword as boolean,
      // signSession 은 스프레드지만 여기는 열거식이다. 이 줄을 빠뜨리면 track 이 조용히
      // 사라지고, middleware.ts:21 이 매 요청 재서명하므로 다음 요청에 ADMIN 으로 굳는다.
      track: parseTrack(payload.track),
```

파일 위에 `import { parseTrack } from "../problem/track";` 를 더한다.

- [ ] **Step 5: `login()` 이 AuthUser 를 만드는 자리를 채운다**

`web/lib/auth/authService.ts:52` 는 DB 행으로 `AuthUser` 를 만든다. 여기가 생산 코드에서
`track` 이 필요한 **두 곳 중 나머지 하나**다(다른 하나는 Step 4 의 `verifySession`).

```ts
    mustChangePassword: user.mustChangePassword,
    // 직군은 자격증명이 아니다 — 로그인 라우트가 토글 값으로 곧바로 덮어쓴다(Step 6).
    // login() 시그니처에 track 을 끌어들이지 마라. 직군이 인증 정보처럼 보이게 된다.
    track: DEFAULT_TRACK,
```

`import { DEFAULT_TRACK } from "../problem/track";` 를 더한다.

- [ ] **Step 6: 통과를 확인한다**

Run: `cd web && pnpm exec vitest run lib/auth/jwt.test.ts`
Expected: PASS

- [ ] **Step 7: 로그인 라우트가 토글 값을 받게 한다**

`web/app/api/auth/login/route.ts` — `login()` 은 자격증명만 받으므로 `track` 은 여기서 붙인다.

```ts
    const body = await readJson(request);
    const { authUser, response } = await login(getDb(), {
      employeeNo: asStringField(body.employeeNo),
      password: asStringField(body.password),
    });
    // 직군은 자격증명이 아니다 — 로그인 화면 토글에서 온 값을 여기서 세션에 얹는다.
    await setSessionCookie({ ...authUser, track: parseTrack(body.track) });
    return response;
```

`import { parseTrack } from "@/lib/problem/track";` 를 더한다.

- [ ] **Step 8: 테스트 픽스처 60곳을 채운다 — 이 계획에서 가장 큰 단계**

Run: `cd web && pnpm typecheck 2>&1 | grep "error TS" | sed 's/(.*//' | sort | uniq -c | sort -rn`

파일별 개수가 나온다(실측 기준 60곳, `feedbackService.test.ts` 7 · `authService.test.ts` 4 ·
`statsService.test.ts` 3 …). **한 파일씩** 처리한다.

각 오류는 `AuthUser` 모양의 객체 리터럴에 `track` 이 없다는 것이다. **`track: "ADMIN"` 한
줄을 더한다** — 지금 사용자는 전부 행정직이므로 기존 테스트의 뜻을 바꾸지 않는 값이다.
`mustChangePassword` 가 있는 줄 옆이 대체로 그 자리다.

주의할 것 두 가지:

- `users` 테이블에 **insert** 하는 객체는 `AuthUser` 가 아니다. 거기에는 넣지 마라
  (`users` 에는 `track` 컬럼이 없다). 컴파일러가 가리킨 줄만 고친다.
- 파일 하나를 끝낼 때마다 `pnpm typecheck` 로 남은 개수가 줄어드는지 본다. 늘어나면
  방금 잘못된 자리에 넣은 것이다.

오류가 0이 될 때까지 반복한다.

- [ ] **Step 9: 전체 테스트를 돌린다**

Run: `cd web && pnpm typecheck && pnpm test`
Expected: 타입 오류 0. 테스트는 Task 1 이전과 같은 통과/실패 수. 새로 깨진 것이 있으면
Step 8 에서 `users` insert 에 잘못 넣지 않았는지, 그리고 `jwt.test.ts:16` 의
`toEqual(user)` 를 Step 1 에서 처리했는지 본다.

- [ ] **Step 10: 커밋**

```bash
git add -A
git commit -m "[ADD] 세션에 직군 싣기"
```

---

### Task 3: 문제 목록·랜덤 풀이 거르기

**Files:**
- Modify: `web/lib/db/solveProblems.ts:26,56`
- Modify: `web/lib/solve/solveQueryService.ts:28,35`
- Modify: 위 두 서비스를 부르는 라우트(`pnpm typecheck` 가 가리킨다)
- Test: `web/lib/db/solveProblems.test.ts`

**Interfaces:**
- Consumes: `AuthUser.track` (Task 2)
- Produces:
  - `findActiveSolveProblems(db, filters, track: Track)`
  - `findRandomActiveProblems(db, { count, departmentId, track })`
  - `listSolveProblems(db, filters, track)` · `randomSolveSet(db, { count, departmentId, track })`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`web/lib/db/solveProblems.test.ts` 에 추가한다. 파일 안의 `seed()` 헬퍼를 그대로 쓴다.

```ts
describe("직군 거르기", () => {
  it("목록은 고른 직군 문제만 낸다", async () => {
    await seed({ content: "행정직 문제" });
    await seed({ content: "기술직 문제", track: "TECH" });

    const admin = await findActiveSolveProblems(db, {}, "ADMIN");
    expect(admin.map((r) => r.content)).toEqual(["행정직 문제"]);

    const tech = await findActiveSolveProblems(db, {}, "TECH");
    expect(tech.map((r) => r.content)).toEqual(["기술직 문제"]);
  });

  it("랜덤도 고른 직군 문제만 낸다", async () => {
    await seed({ content: "행정직 문제" });
    await seed({ content: "기술직 문제", track: "TECH" });

    const rows = await findRandomActiveProblems(db, { count: 10, track: "TECH" });
    expect(rows.map((r) => r.content)).toEqual(["기술직 문제"]);
  });

  it("랜덤에 다른 직군 부서를 지정하면 0건이다", async () => {
    await seed({ content: "행정직 문제" });
    const rows = await findRandomActiveProblems(db, { count: 10, departmentId: deptId, track: "TECH" });
    expect(rows).toEqual([]);
  });
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `cd web && pnpm exec vitest run lib/db/solveProblems.test.ts`
Expected: FAIL — 인자 개수가 안 맞거나, 두 직군이 다 나온다

- [ ] **Step 3: DAO 두 개를 고친다**

`findActiveSolveProblems` 시그니처와 `where` 배열:

```ts
export async function findActiveSolveProblems(
  db: DbConn,
  filters: { keyword?: string | null; tag?: string | null },
  track: Track,
): Promise<SolveListRow[]> {
```

`const where = [eq(problems.status, "ACTIVE")];` 를 다음으로 바꾼다.

```ts
  // S9 의 "부서 필터를 넣지 마라"(Java 파리티)와 **다른 얘기다.** 저건 부서 필터고 이건
  // 직군 필터이며, 2026-09 에 들어온 새 업무 규칙이다. 둘을 헷갈리지 말 것.
  const where = [eq(problems.status, "ACTIVE"), eq(problems.track, track)];
```

`findRandomActiveProblems` 는 입력 객체에 `track` 을 더한다.

```ts
export async function findRandomActiveProblems(
  db: DbConn,
  input: { count: number; departmentId?: number | null; track: Track },
): Promise<SolveListRow[]> {
  const where = [eq(problems.status, "ACTIVE"), eq(problems.track, input.track)];
  if (input.departmentId != null) where.push(eq(problems.departmentId, input.departmentId));
```

`import type { Track } from "../problem/track";` 를 더한다.

- [ ] **Step 4: 통과를 확인한다**

Run: `cd web && pnpm exec vitest run lib/db/solveProblems.test.ts`
Expected: PASS

- [ ] **Step 5: 서비스와 라우트를 잇는다**

`lib/solve/solveQueryService.ts` 의 두 함수에 `track` 을 받아 그대로 넘긴다. 그다음
`pnpm typecheck` 가 가리키는 라우트에서 `actor.track` 을 넘긴다 — 라우트는 이미
`requireActor()` 로 `actor` 를 가지고 있다. 없으면 받아 온다.

- [ ] **Step 6: 전체 확인**

Run: `cd web && pnpm typecheck && pnpm test`
Expected: 타입 오류 0. 실패한 라우트 테스트가 있으면 그 테스트의 픽스처에 `track` 을 채운다.

- [ ] **Step 7: 커밋**

```bash
git add -A && git commit -m "[MOD] 문제 목록·랜덤 풀이를 직군으로 거른다"
```

---

### Task 4: 팀 대항 거르기

**Files:**
- Modify: `web/lib/db/solveTeams.ts:31,45,61,81`
- Modify: `web/lib/solve/teamRunService.ts:55,83`
- Test: `web/lib/db/solveTeams.test.ts`

**Interfaces:**
- Consumes: `AuthUser.track`
- Produces:
  - `findTeamCounts(db, track)`
  - `findTeamProblemIds(db, departmentId, track)`
  - `findWrongProblemIds(db, userId, departmentId, track)`
  - `countWrongByDepartment(db, userId, track)`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`web/lib/db/solveTeams.test.ts` 에 추가한다. 이 파일의 기존 시드 헬퍼 이름을 먼저 읽고 맞춘다.

```ts
describe("직군 거르기", () => {
  it("다른 직군 문제만 있는 팀은 목록에서 빠진다", async () => {
    // 가팀에는 행정직만, 나팀에는 기술직만 넣는다.
    const [{ id: otherDept }] = await db.insert(departments)
      .values({ name: "나팀", code: "B", status: "ACTIVE" }).returning({ id: departments.id });
    await seed({ track: "ADMIN" });
    await seed({ departmentId: otherDept, track: "TECH" });

    const admin = await findTeamCounts(db, "ADMIN");
    expect(admin.map((r) => r.departmentName)).toEqual(["가팀"]);

    const tech = await findTeamCounts(db, "TECH");
    expect(tech.map((r) => r.departmentName)).toEqual(["나팀"]);
  });

  // FILTER 만 고치고 HAVING 을 안 고치면 여기서 0건짜리 팀이 남는다.
  it("0건짜리 팀이 목록에 남지 않는다", async () => {
    await seed({ track: "ADMIN" });
    const tech = await findTeamCounts(db, "TECH");
    expect(tech).toEqual([]);
  });

  it("팀 문제 목록도 직군으로 거른다", async () => {
    const adminId = await seed({ track: "ADMIN" });
    await seed({ track: "TECH" });
    expect(await findTeamProblemIds(db, deptId, "ADMIN")).toEqual([adminId]);
  });
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `cd web && pnpm exec vitest run lib/db/solveTeams.test.ts`
Expected: FAIL

- [ ] **Step 3: `findTeamCounts` 를 고친다 — 세는 식과 거르는 식을 같이**

```sql
    SELECT d.id::int AS "departmentId", d.name AS "departmentName",
           count(p.id) FILTER (WHERE p.status = 'ACTIVE' AND p.track = ${track})::int AS "totalCount"
    FROM departments d
    LEFT JOIN problems p ON p.department_id = d.id
    WHERE d.status = 'ACTIVE'
    GROUP BY d.id, d.name
    HAVING count(p.id) FILTER (WHERE p.status = 'ACTIVE' AND p.track = ${track}) > 0
    ORDER BY d.id
```

**두 곳 다 고쳐야 한다.** `FILTER` 만 고치고 `HAVING` 을 두면 다른 직군 문제만 있는 팀이
`totalCount = 0` 인 채로 목록에 남는다. Step 1 의 두 번째 테스트가 그걸 잡는다.

- [ ] **Step 4: 나머지 세 질의를 고친다**

`findTeamProblemIds` · `findWrongProblemIds` 의 `WHERE` 에 `AND p.track = ${track}` 를 더하고,
`countWrongByDepartment` 의 `WHERE p.status = 'ACTIVE' AND last.is_correct = false` 뒤에도
같은 조건을 더한다. 세 함수 모두 시그니처 마지막에 `track: Track` 을 받는다.

- [ ] **Step 5: 통과를 확인한다**

Run: `cd web && pnpm exec vitest run lib/db/solveTeams.test.ts`
Expected: PASS

- [ ] **Step 6: `teamRunService` 를 잇는다**

`listTeams(db, actor)` 안의 `findTeamCounts(db)` → `findTeamCounts(db, actor.track)`,
`countWrongByDepartment(db, actor.userId)` → `(db, actor.userId, actor.track)`.
`startRun(db, actor, departmentId, mode)` 안의 두 호출에도 `actor.track` 을 넘긴다.

- [ ] **Step 7: 전체 확인 후 커밋**

```bash
cd web && pnpm typecheck && pnpm test
git add -A && git commit -m "[MOD] 팀 대항을 직군으로 거른다"
```

---

### Task 5: 랜덤 풀이의 부서 선택지 거르기

**Files:**
- Modify: `web/lib/db/departments.ts:10`
- Modify: `web/app/api/departments/route.ts:19`
- Test: `web/lib/db/departments.test.ts` (이미 있는 파일에 추가)

**Interfaces:**
- Consumes: `Track`
- Produces: `findDepartmentsWithProblems(db, track)` — `{ id, name, code }[]`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

이 파일에는 모듈 변수가 `db` 하나뿐이고 `problems`·`users` 를 임포트하지 않는다. 아래
헬퍼를 `describe` 안에 같이 넣고, 상단 임포트에 `problems`, `users`, `insertDepartment`,
`findDepartmentsWithProblems` 를 더한다.

**부서 이름은 ASCII 로 짓는다** — 이 파일 `:11` 의 기존 주석이 경고한다: 한글 정렬은 DB
콜레이션(C vs en_US.utf8)에 따라 달라져 플래키하다.

```ts
describe("findDepartmentsWithProblems", () => {
  async function seedProblem(departmentCode: string, over: Record<string, unknown> = {}) {
    const dept = await insertDepartment(db, { name: `dept-${departmentCode}`, code: departmentCode });
    const [owner] = await db.insert(users).values({
      employeeNo: `emp-${departmentCode}`, name: "관리자", email: `${departmentCode}@example.com`,
      passwordHash: "x", departmentId: dept.id, role: "SUPER_ADMIN",
    }).returning();
    await db.insert(problems).values({
      type: "OX", content: "본문", departmentId: dept.id, createdBy: owner.id, ...over,
    });
    return dept;
  }

  it("그 직군의 문제가 있는 부서만 낸다", async () => {
    await seedProblem("A1", { track: "ADMIN" });
    await seedProblem("T1", { track: "TECH" });

    expect((await findDepartmentsWithProblems(db, "ADMIN")).map((d) => d.code)).toEqual(["A1"]);
    expect((await findDepartmentsWithProblems(db, "TECH")).map((d) => d.code)).toEqual(["T1"]);
  });

  it("보관된 문제만 있는 부서는 빠진다", async () => {
    await seedProblem("A2", { track: "ADMIN", status: "ARCHIVED" });
    expect(await findDepartmentsWithProblems(db, "ADMIN")).toEqual([]);
  });

  // 한 부서에 두 직군이 섞여도 각 직군에서 한 번씩만 나와야 한다(selectDistinct 확인).
  it("한 부서에 문제가 여러 개여도 한 번만 나온다", async () => {
    const dept = await seedProblem("M1", { track: "ADMIN" });
    const [owner] = await db.select().from(users);
    await db.insert(problems).values({
      type: "OX", content: "둘째", departmentId: dept.id, createdBy: owner.id, track: "ADMIN",
    });
    expect((await findDepartmentsWithProblems(db, "ADMIN")).map((d) => d.code)).toEqual(["M1"]);
  });
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `cd web && pnpm exec vitest run lib/db/departments.test.ts`
Expected: FAIL — 함수가 없다

- [ ] **Step 3: DAO 를 더한다**

`web/lib/db/departments.ts` 에 넣는다.

> **`findActiveDepartments` 는 이 작업 뒤 호출부가 없어진다.** 유일한 호출부가 지금 바꾸는
> `app/api/departments/route.ts:20` 이다(관리자 화면은 `lib/admin/departmentService` 의
> `listDepartments` 를 쓴다 — 다른 함수다). **같이 지운다.** 남겨 두면 다음 사람이 "활성
> 부서 목록"이 필요할 때 직군을 안 거르는 쪽을 집어 든다.

```ts
/**
 * 그 직군의 ACTIVE 문제가 하나 이상 있는 부서만.
 *
 * 거르는 규칙이 `findTeamCounts`(lib/db/solveTeams.ts:31)와 같아야 한다 — 어긋나면
 * 랜덤에서는 고를 수 있는데 팀 대항에는 없는 부서가 생긴다.
 */
export async function findDepartmentsWithProblems(db: DbConn, track: Track) {
  return db.selectDistinct({ id: departments.id, name: departments.name, code: departments.code })
    .from(departments)
    .innerJoin(problems, eq(problems.departmentId, departments.id))
    .where(and(
      eq(departments.status, "ACTIVE"),
      eq(problems.status, "ACTIVE"),
      eq(problems.track, track),
    ))
    .orderBy(asc(departments.name));
}
```

`and`, `problems`, `Track` 임포트를 더한다.

- [ ] **Step 4: 통과를 확인한다**

Run: `cd web && pnpm exec vitest run lib/db/departments.test.ts`
Expected: PASS

- [ ] **Step 5: 라우트를 바꾼다**

`web/app/api/departments/route.ts`:

```ts
export async function GET(): Promise<Response> {
  return handleRoute(async () => {
    const actor = await requireActor();   // 역할 제한 없음 — 로그인만 확인한다
    // 전 부서를 주면 행정직 사용자의 랜덤 드롭다운에 `기술직` 이 뜬다. 고르면 0문제가
    // 나와 화면이 고장난 것처럼 보인다.
    return findDepartmentsWithProblems(getDb(), actor.track);
  });
}
```

- [ ] **Step 6: 커밋**

```bash
cd web && pnpm typecheck && pnpm test
git add -A && git commit -m "[MOD] 부서 선택지를 직군으로 거른다"
```

---

### Task 6: 학습 이력 거르기

**Files:**
- Modify: `web/lib/db/attempts.ts:35`
- Modify: `web/lib/solve/attemptHistoryService.ts:65`
- Modify: `web/app/api/attempts/me/route.ts`
- Test: `web/lib/db/attempts.test.ts`

**Interfaces:**
- Produces: `findAttemptsByUserId(db, userId, track)` ·
  `findAttemptHistoryWithAnswers(db, userId, track)`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

```ts
it("이력은 고른 직군 것만 보인다", async () => {
  const adminProblem = await seed({ content: "행정직", track: "ADMIN" });
  const techProblem = await seed({ content: "기술직", track: "TECH" });
  await insertAttempt(db, { userId, problemId: adminProblem, submittedAnswer: "O", isCorrect: true });
  await insertAttempt(db, { userId, problemId: techProblem, submittedAnswer: "O", isCorrect: true });

  const rows = await findAttemptsByUserId(db, userId, "TECH");
  expect(rows.map((r) => r.problemContent)).toEqual(["기술직"]);
});
```

`insertAttempt(db, row)` 의 `row` 는 `NewAttempt = { userId, problemId, submittedAnswer,
isCorrect }` 다(`lib/db/attempts.ts:5-7`). `seed()` 는 이 테스트 파일의 기존 헬퍼를 쓴다.

- [ ] **Step 2: 실패를 확인한다**

Run: `cd web && pnpm exec vitest run lib/db/attempts.test.ts`
Expected: FAIL

- [ ] **Step 3: DAO 를 고친다**

이미 `problems` 를 이너조인하고 있으므로 조건 한 줄이다.

```ts
export async function findAttemptsByUserId(
  db: DbConn, userId: number, track: Track,
): Promise<AttemptHistoryRow[]> {
```

`.where(eq(attempts.userId, userId))` 를 바꾼다.

```ts
    .where(and(eq(attempts.userId, userId), eq(problems.track, track)))
```

- [ ] **Step 4: 통과 확인 후 서비스·라우트를 잇는다**

Run: `cd web && pnpm exec vitest run lib/db/attempts.test.ts` → PASS
`findAttemptHistoryWithAnswers(db, userId, track)` 로 바꿔 그대로 넘기고,
`app/api/attempts/me/route.ts` 에서 `actor.track` 을 넘긴다.

- [ ] **Step 5: 커밋**

```bash
cd web && pnpm typecheck && pnpm test
git add -A && git commit -m "[MOD] 학습 이력을 직군으로 거른다"
```

---

### Task 7: 명예의 전당 거르기

**Files:**
- Modify: `web/lib/db/hallOfFame.ts:37,65`
- Modify: `web/lib/solve/hallOfFameService.ts`
- Test: `web/lib/db/hallOfFame.test.ts`

**Interfaces:**
- Produces: `findCorrectCountsByUser(db, period, track)` ·
  `findCorrectCountsByTeam(db, period, track)`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

```ts
describe("직군 거르기", () => {
  it("개인 순위가 직군별로 갈린다", async () => {
    // 한 사람이 두 직군을 다 풀어도, 각 순위에는 그 직군 몫만 잡힌다.
    await correctAttempt({ track: "ADMIN" });
    await correctAttempt({ track: "TECH" });
    await correctAttempt({ track: "TECH" });

    const admin = await findCorrectCountsByUser(db, "ALL", "ADMIN");
    expect(admin[0].correctCount).toBe(1);

    const tech = await findCorrectCountsByUser(db, "ALL", "TECH");
    expect(tech[0].correctCount).toBe(2);
  });

  it("팀 순위도 갈린다 — 개인 것을 묶은 게 아니라 자체 쿼리다", async () => {
    await correctAttempt({ track: "TECH" });
    expect(await findCorrectCountsByTeam(db, "ALL", "ADMIN")).toEqual([]);
    expect((await findCorrectCountsByTeam(db, "ALL", "TECH"))[0].correctCount).toBe(1);
  });

  // 지금 두 쿼리에는 문제 상태 조건이 없다. 조인을 더하면서 무심코 넣으면 과거 점수가 바뀐다.
  it("보관된 문제의 정답도 계속 센다", async () => {
    await correctAttempt({ track: "ADMIN", status: "ARCHIVED" });
    expect((await findCorrectCountsByUser(db, "ALL", "ADMIN"))[0].correctCount).toBe(1);
  });
});
```

`correctAttempt` 는 이 파일에 헬퍼가 이미 있으면 그것을 쓰고, 없으면 문제 하나를 만들고
`is_correct = true` 인 시도를 하나 넣는 헬퍼를 파일 안에 만든다.

- [ ] **Step 2: 실패를 확인한다**

Run: `cd web && pnpm exec vitest run lib/db/hallOfFame.test.ts`
Expected: FAIL

- [ ] **Step 3: 두 쿼리에 조인과 조건을 더한다**

`findCorrectCountsByUser` 의 SQL:

```sql
    FROM attempts a
    JOIN users u ON u.id = a.user_id
    JOIN departments d ON d.id = u.department_id
    JOIN problems p ON p.id = a.problem_id
    WHERE a.is_correct = true AND u.status = 'ACTIVE' AND p.track = ${track} ${periodFilter}
```

`findCorrectCountsByTeam` 도 **똑같이** 고친다. 팀 순위는 개인 행을 묶은 것이 아니라
자체 SQL 이라, 한쪽만 고치면 팀 순위만 두 직군 합계로 남는다.

> `p.status = 'ACTIVE'` 를 **넣지 마라.** 조인을 더하는 김에 붙이고 싶어지는 자리인데,
> 지금 동작은 보관된 문제의 정답도 세는 것이고 그걸 유지해야 한다.

`attempts.problem_id` 는 `problems` 를 가리키는 NOT NULL FK 라 이너조인이 행을 늘리거나
줄이지 않는다.

- [ ] **Step 4: 통과 확인 후 서비스를 잇는다**

Run: `cd web && pnpm exec vitest run lib/db/hallOfFame.test.ts` → PASS
`hallOfFameService` 에서 두 호출에 `actor.track` 을 넘긴다. `findMyTeamRank(rows, actor.departmentId)`
는 그대로 둔다 — 팀 식별은 여전히 부서다.

- [ ] **Step 5: 커밋**

```bash
cd web && pnpm typecheck && pnpm test
git add -A && git commit -m "[MOD] 명예의 전당을 직군별로 나눈다"
```

---

### Task 8: 쓰기 경로에 직군 필수화

**Files:**
- Modify: `web/lib/db/problems.ts:10-12` (`ProblemPatch` 에 `track` 허용)
- Modify: `web/lib/problem/problemService.ts:147` (`createProblem`) · `:188` (`updateProblem`)
- Modify: `web/lib/problem/problemExcel.ts:259`
- Modify: `web/app/api/admin/problems/route.ts:22`
- Modify: `web/app/api/admin/problems/[id]/route.ts:28`
- Modify: `web/app/api/admin/problems/excel-upload/route.ts:74`
- Test: `web/lib/problem/problemService.test.ts` · `web/lib/problem/problemExcel.test.ts`

**Interfaces:**
- Produces:
  - `createProblem(conn, input, requestedDepartmentId, track, actor)`
  - `updateProblem(conn, id, input, track, actor)`
  - `uploadProblemsExcel(db, file, requestedDepartmentId, track, actor)`

**이 작업이 이 계획의 핵심 안전장치다.** 두 함수에 `track` 을 **필수 위치 인자**로 넣으면,
라우트가 안 넘길 때 컴파일이 실패한다. 기본값에 기대면 기술직 428행이 조용히 행정직으로
들어가고, 업로드는 되돌리기 어렵다.

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`web/lib/problem/problemService.test.ts` 에 추가:

```ts
it("등록할 때 고른 직군이 저장된다", async () => {
  await createProblem(db, validOxInput(), deptId, "TECH", superAdmin);
  const [row] = await db.select().from(problems);
  expect(row.track).toBe("TECH");
});
```

`web/lib/problem/problemExcel.test.ts` 에 추가:

```ts
it("엑셀로 올린 문제에 고른 직군이 붙는다", async () => {
  const result = await uploadProblemsExcel(db, oneRowFile(), deptId, "TECH", superAdmin);
  expect(result.successRows).toBe(1);
  const [row] = await db.select().from(problems);
  expect(row.track).toBe("TECH");
});
```

`validOxInput()` · `oneRowFile()` · `superAdmin` 은 각 테스트 파일에 이미 있는 헬퍼를
쓴다. 없으면 그 파일의 기존 테스트가 쓰는 방식을 그대로 복사한다.

- [ ] **Step 2: 실패를 확인한다**

Run: `cd web && pnpm exec vitest run lib/problem/problemService.test.ts lib/problem/problemExcel.test.ts`
Expected: FAIL — 인자 개수가 안 맞는다

- [ ] **Step 3: `createProblem` 을 고친다**

```ts
export async function createProblem(
  conn: DbConn, input: ProblemCreateInput, requestedDepartmentId: number | null,
  track: Track, actor: AuthUser,
): Promise<void> {
```

`insertProblem(tx, { ... })` 호출에 `track,` 을 더한다.

- [ ] **Step 3-1: 수정 경로도 직군을 바꿀 수 있게 한다**

잘못된 직군으로 등록한 문제를 화면에서 고칠 수 있어야 한다. 부서에는 전용 이동 기능이
따로 있지만(`lib/problem/departmentMove.ts`) 직군에는 없으므로, 수정 화면이 유일한 통로다.

`lib/db/problems.ts:10-12` 의 `ProblemPatch` 에 `"track"` 을 더한다.

```ts
export type ProblemPatch = Partial<
  Pick<NewProblem, "content" | "imageUrl" | "referenceText" | "explanation"
    | "blankRevealCount" | "sourceNumber" | "track">
>;
```

`problemService.ts:188` 의 `updateProblem` 에 `track` 인자를 넣고 패치에 싣는다.

```ts
export async function updateProblem(
  conn: DbConn, id: number, input: ProblemCreateInput, track: Track, actor: AuthUser,
): Promise<void> {
```

```ts
      await updateProblemRow(tx, id, {
        content: req.content!,
        imageUrl: req.imageUrl ?? null,
        referenceText: req.referenceText ?? null,
        explanation: req.explanation ?? null,
        blankRevealCount: blankRevealCountToStore(req),
        sourceNumber: req.sourceNumber ?? null,
        track,
      });
```

`:206` 의 주석("type·status·departmentId·createdBy 는 이 경로에서 바뀌지 않는다")은
그대로 맞다 — `track` 은 이제 **일부러** 바뀌는 값이므로 그 목록에 넣지 말고, 대신 한 줄을
덧붙인다: `track 은 수정 화면에서 고칠 수 있다 — 잘못 등록한 직군을 되돌릴 유일한 통로다.`

테스트를 하나 더한다.

```ts
it("수정으로 직군을 바꿀 수 있다", async () => {
  await createProblem(db, validOxInput(), deptId, "ADMIN", superAdmin);
  const [before] = await db.select().from(problems);
  await updateProblem(db, before.id, validOxInput(), "TECH", superAdmin);
  const [after] = await db.select().from(problems);
  expect(after.track).toBe("TECH");
});
```

- [ ] **Step 4: `uploadProblemsExcel` 을 고친다**

```ts
export async function uploadProblemsExcel(
  db: Db,
  file: { buffer: ArrayBuffer; fileName: string },
  requestedDepartmentId: number | null,
  track: Track,
  actor: AuthUser,
): Promise<ExcelResult> {
```

`insertProblem(tx, { ... })` 호출(`:294`)에 `track,` 을 더한다. 파일 안 다른 곳은 안 바꾼다 —
행 파싱 규칙과 엑셀 컬럼은 그대로다(직군은 화면에서 고르지 엑셀 열로 받지 않는다).

- [ ] **Step 5: 통과를 확인한다**

Run: `cd web && pnpm exec vitest run lib/problem/problemService.test.ts lib/problem/problemExcel.test.ts`
Expected: PASS

- [ ] **Step 6: 두 라우트를 고친다**

둘 다 `departmentId` 를 쿼리 파라미터로 읽고 있다. `track` 도 같은 방식으로 받는다.

`app/api/admin/problems/route.ts`:

```ts
    const departmentId = parseNumericParam(new URL(request.url).searchParams.get("departmentId"), "departmentId");
    const track = parseTrack(new URL(request.url).searchParams.get("track"));
    await createProblem(getDb(), body, departmentId, track, actor);
```

`app/api/admin/problems/excel-upload/route.ts` 도 같은 자리에서 `track` 을 읽어 넘긴다.

수정 라우트 `app/api/admin/problems/[id]/route.ts:28` 도 같은 방식으로 고친다.

```ts
    const track = parseTrack(new URL(request.url).searchParams.get("track"));
    await updateProblem(getDb(), parseNumericParam(id, "id")!, body, track, actor);
```

> 여기서 `parseTrack` 이 모르는 값을 `ADMIN` 으로 바꾸는 성질에 주의하라. 수정 화면이
> `track` 을 **안 보내면 그 문제는 행정직으로 덮어써진다.** Task 11 Step 4 에서 수정
> 화면이 반드시 현재 값을 실어 보내게 해야 하는 이유다.

- [ ] **Step 7: 전체 확인**

Run: `cd web && pnpm typecheck && pnpm test`
Expected: 타입 오류 0. 이 두 함수를 부르던 기존 테스트가 인자 부족으로 깨지면
`"ADMIN"` 을 넣는다 — 기존 동작과 같은 값이다.

- [ ] **Step 8: 커밋**

```bash
git add -A && git commit -m "[MOD] 문제 등록·엑셀 업로드에 직군을 필수로 받는다"
```

---

### Task 9: 운영 → 로컬 동기화에 직군 싣기

**Files:**
- Modify: `web/lib/problemSync/snapshot.ts:7,19-38`
- Modify: `web/lib/problemSync/exportSnapshot.ts` · `importSnapshot.ts`
- Test: `web/lib/problemSync/importSnapshot.test.ts`

**Interfaces:**
- Produces: `SnapshotProblem.track: Track`, `SNAPSHOT_VERSION = 2`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

```ts
it("스냅샷의 직군이 들여올 때 살아 있다", async () => {
  await importSnapshot(db, snapshotWith({ track: "TECH" }));
  const [row] = await db.select().from(problems);
  expect(row.track).toBe("TECH");
});

// 버전 1로 만들어 둔 옛 파일에는 track 이 없다. 거절하지 말고 행정직으로 채운다.
it("직군이 없는 옛 스냅샷은 행정직으로 들어온다", async () => {
  const old = snapshotWith({});
  delete (old.problems[0] as Record<string, unknown>).track;
  await importSnapshot(db, old);
  const [row] = await db.select().from(problems);
  expect(row.track).toBe("ADMIN");
});
```

`snapshotWith` 는 이 파일에 이미 있는 스냅샷 픽스처 헬퍼를 쓴다.

- [ ] **Step 2: 실패를 확인한다**

Run: `cd web && pnpm exec vitest run lib/problemSync/importSnapshot.test.ts`
Expected: FAIL

- [ ] **Step 3: 스냅샷 형식을 고친다**

`snapshot.ts` 의 `SnapshotProblem` 에 `track: Track;` 을 더하고 `SNAPSHOT_VERSION` 을 `2` 로
올린다. 검증 함수에서 `track` 은 **없어도 통과**시키고 `parseTrack` 으로 채운다 — 옛 파일을
거절하면 아무 이득 없이 재수출만 강요한다.

- [ ] **Step 4: 내보내기·들여오기를 잇는다**

`exportSnapshot.ts` 의 문제 select 에 `track: problems.track` 을 더하고,
`importSnapshot.ts` 의 insert 에 `track: parseTrack(p.track)` 을 넘긴다.

- [ ] **Step 5: 통과 확인 후 커밋**

```bash
cd web && pnpm exec vitest run lib/problemSync && pnpm typecheck
git add -A && git commit -m "[MOD] 운영 동기화 스냅샷에 직군을 싣는다"
```

---

### Task 10: 로그인 화면 직군 토글

**Files:**
- Modify: `web/screens/auth/LoginPage.jsx`
- Modify: `web/apiClient/auth.js:3`

**Interfaces:**
- Consumes: `POST /api/auth/login` 이 본문의 `track` 을 읽는다(Task 2)

- [ ] **Step 1: apiClient 가 track 을 보내게 한다**

```js
export function login({ employeeNo, password, track }) {
  return apiPost("/api/auth/login", { employeeNo, password, track });
}
```

- [ ] **Step 2: 화면에 토글을 넣는다**

`LoginPage.jsx` 에 상태와 저장/복원을 더한다. 저장 자리는 **브라우저**다 — 사람마다
DB 에 저장하지 않기로 했다.

```jsx
const TRACK_KEY = "solve.track";

const [track, setTrack] = useState("ADMIN");

// 지난번에 고른 값을 기억해 둔다. 다른 PC 에서는 처음 한 번 다시 고르게 된다.
useEffect(() => {
  try {
    const saved = window.localStorage.getItem(TRACK_KEY);
    if (saved === "ADMIN" || saved === "TECH") setTrack(saved);
  } catch {
    // 사생활 보호 모드 등에서 localStorage 접근이 막힐 수 있다. 기본값으로 간다.
  }
}, []);
```

제출 직전에 저장하고 함께 보낸다.

```jsx
try { window.localStorage.setItem(TRACK_KEY, track); } catch { /* 저장 실패는 무시 */ }
await login({ employeeNo, password, track });
```

토글 자체는 이 화면의 기존 입력 요소와 같은 모양으로 만든다. 두 개의 라디오 버튼이면
충분하다 — 라벨은 `행정직` / `기술직`.

- [ ] **Step 3: 손으로 확인한다**

Run: `cd web && pnpm dev` (포트 3100)
확인: 행정직으로 로그인 → 문제 목록에 도시가스사업법 문제가 없다. 로그아웃 후 다시 오면
토글이 `행정직` 으로 잡혀 있다. 기술직으로 로그인 → 팀 대항에 `기술직` 만 보인다.

- [ ] **Step 4: 커밋**

```bash
git add -A && git commit -m "[ADD] 로그인 화면 직군 토글"
```

---

### Task 11: 관리자 화면 직군 선택

**Files:**
- Modify: `web/apiClient/problems.js:25`(`createProblem`) · `:54`(`uploadProblemsExcel`)
- Modify: `web/screens/admin/problems/ProblemExcelUploadPage.jsx:54,102,174,212`
- Modify: `web/screens/admin/problems/ProblemFormPage.jsx` (개별 등록/수정)
- Modify: `web/screens/admin/problems/ProblemListPage.jsx` (직군 열)

- [ ] **Step 1: apiClient 두 함수가 track 을 쿼리로 붙이게 한다**

두 라우트 모두 `track` 을 쿼리 파라미터로 읽는다(Task 8 Step 6). 부서를 붙이는 기존
방식을 그대로 따른다.

```js
export function createProblem(payload, departmentId, track) {
  const query = new URLSearchParams();
  if (departmentId) query.set("departmentId", departmentId);
  if (track) query.set("track", track);
  const qs = query.toString();
  return apiPost(`/api/admin/problems${qs ? `?${qs}` : ""}`, payload);
}
```

`uploadProblemsExcel(file, departmentId, track)` 와 `updateProblem(id, payload, track)` 도
같은 모양으로 고친다(`:54-59`, `:30` 부근).

- [ ] **Step 2: 엑셀 업로드 화면에 직군 선택을 넣는다**

`ProblemExcelUploadPage.jsx`. 부서 상태(`:54`) 옆에 직군 상태를 더한다.

```jsx
const [track, setTrack] = useState("ADMIN");
```

부서 `<select>`(`:174`) 바로 옆에 같은 모양의 직군 선택을 둔다(행정직/기술직 두 항목).
업로드 호출(`:102`)을 바꾼다.

```jsx
const uploadResult = await uploadProblemsExcel(file, departmentId, track);
```

- [ ] **Step 3: 업로드 결과에 부서와 직군을 같이 보여 준다**

결과 요약(`:212`)은 지금 건수만 낸다 — 어느 부서·직군으로 들어갔는지 어디에도 안 나온다.
잘못 고른 업로드는 되돌리기 어려우므로 이 표시가 유일한 사후 확인 수단이다. 방금 고른
부서명과 직군을 건수 앞에 적는다.

```jsx
<p>{selectedDepartmentName} · {track === "TECH" ? "기술직" : "행정직"}</p>
```

`selectedDepartmentName` 은 이미 화면이 가진 부서 목록에서 `departmentId` 로 찾는다.

- [ ] **Step 4: 개별 등록·수정 화면에 직군 선택을 넣는다**

`ProblemFormPage.jsx` 는 등록과 수정을 같이 쓴다. **양쪽 모두에서 직군을 고를 수 있어야
한다** — 잘못 등록한 직군을 되돌릴 유일한 통로다(부서와 달리 전용 이동 기능이 없다).

- 등록: 기본값 `행정직`
- 수정: **불러온 문제의 현재 직군으로 초기화한다.** 이게 빠지면 저장할 때마다
  `parseTrack` 이 빈 값을 `ADMIN` 으로 읽어 **기술직 문제가 조용히 행정직으로 바뀐다.**
  Task 8 Step 6 의 경고와 같은 지점이다.

상세 조회 응답에 `track` 이 없으면 `lib/problem/problemService.ts` 의 `getProblemDetail`
select 에 컬럼을 더한다. 저장 호출은 `createProblem(payload, departmentId, track)` /
`updateProblem(id, payload, track)`.

- [ ] **Step 5: 관리자 문제 목록에 직군 열을 더한다**

`ProblemListPage.jsx` 의 표에 열 하나. 값은 `행정직` / `기술직`.

**필터는 넣지 않는다.** 기술직 문제는 전부 `기술직` 부서에 들어가므로 이미 있는 부서
필터가 같은 일을 한다. 목록 API 가 `track` 을 안 내려주면 `lib/problem/problemListService.ts`
의 select 에 컬럼을 더한다.

- [ ] **Step 6: 손으로 확인 후 커밋**

```bash
cd web && pnpm typecheck && pnpm test
git add -A && git commit -m "[ADD] 관리자 화면 직군 선택"
```

---

### Task 12: 기술직 500문항 적재

코드 작업이 아니다. 배포 후 운영에서 사람이 하는 절차다.

- [ ] **Step 0: 기준 숫자를 먼저 적어 둔다**

마이그레이션 **전에** 운영에서 찍어 종이에 적는다. Step 5 의 "전과 같다" 를 판정할 근거다.

```sql
SELECT count(*) FROM problems WHERE status = 'ACTIVE';
```

- [ ] **Step 1: 마이그레이션 배포**

Run: `cd web && pnpm migrate:prod`
확인: 기존 문제가 전부 `track = 'ADMIN'` 이고, 합계가 Step 0 의 숫자와 같은지.

```sql
SELECT track, count(*) FROM problems WHERE status = 'ACTIVE' GROUP BY track;
```

- [ ] **Step 2: 부서 `기술직` 생성**

관리자 → 부서 관리 → 이름 `기술직`, 코드 `TECH`.

- [ ] **Step 3: 엑셀 업로드**

문제 관리 → 문제 엑셀 일괄 등록 → **부서 `기술직`, 직군 `기술직`** 을 고른다 →
`docs/문제은행_엑셀_기술직/문제_기술직.xlsx`(428행) 업로드.
Expected: 성공 428 / 실패 0. 결과 화면의 부서·직군 표시를 눈으로 확인한다.

- [ ] **Step 4: 수동 입력 72문항**

`docs/문제은행_엑셀_기술직/_미업로드_빈칸_수동입력.xlsx` 를 보고 개별 등록 화면에서
넣는다. 직군은 `기술직`. `문항번호` 열 값을 문항 번호 칸에 그대로 넣는다.

- [ ] **Step 5: 양쪽 직군으로 확인**

- 기술직으로 로그인 → 문제 목록·랜덤·팀 대항에 도시가스사업법 문제만 나온다
- 행정직으로 로그인 → 문제 목록 건수가 **Step 0 에서 적어 둔 숫자**와 같다
- 명예의 전당이 직군별로 갈린다

---

## 자체 점검

**스펙 대응**

| 스펙 요구 | 처리 |
|---|---|
| `problems.track` 추가 | Task 1 |
| `users` 는 안 건드림 | 전 작업에서 지킴 |
| 세션에 직군, 없으면 ADMIN | Task 2 |
| verifySession 열거식 + 미들웨어 재서명 | Task 2 Step 4 |
| 토글 값이 흐르는 길 | Task 2 Step 6 · Task 10 |
| 거르는 곳 8개 | Task 3(2) · 4(4) · 5(1) · 6(1) |
| `findTeamCounts` FILTER+HAVING | Task 4 Step 3 |
| 부서 선택지는 팀 목록과 같은 규칙 | Task 5 Step 3 |
| 학습 이력은 고른 직군만 | Task 6 |
| 명예의 전당 두 쿼리 + status 조건 금지 | Task 7 |
| 쓰기 경로 컴파일 강제 | Task 8 (기본값 유지 + 필수 인자로 대체, 상단 참고) |
| 스냅샷에 track | Task 9 |
| 관리자 화면 직군 선택, 필터는 없음 | Task 11 |
| **수정 화면에서 직군 변경**(스펙에 없던 결정, 2026-09-04 확정) | Task 8 Step 3-1 · Task 11 Step 4 |
| 교정용 시트 손대지 않음 | 어느 작업에도 없음 — 의도한 것 |
| `getSolveDetail`·`submitAttempt` 검사 없음 | 어느 작업에도 없음 — 의도한 것 |
| 적재 순서 | Task 12 |

**빠진 것 없음 확인**: 스펙의 "안 하는 것" 6개 항목은 모두 어느 작업에도 들어가지 않았다.

**이름 일관성**: `Track` · `DEFAULT_TRACK` · `parseTrack` · `findDepartmentsWithProblems` ·
`findAttemptsByUserId(db, userId, track)` · `findCorrectCountsByUser(db, period, track)` ·
`findCorrectCountsByTeam(db, period, track)` — Task 1 에서 정의한 이름을 이후 작업이 그대로 쓴다.
