# 이관 서브플랜 2 — Auth Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Foundation 레일 위에 **인증**을 파리티로 올린다 — 로그인(5회 실패 잠금·15분), bcrypt 검증, 비밀번호 변경 강제, JWT 발급/재발급, 로그아웃, 세션 상태 조회. 현재 Spring `AuthController`/`AuthServiceImpl`와 **같은 결과·규칙·에러**를 낸다.

**Architecture:** 서비스 로직은 순수 TS 모듈(`web/lib/auth/authService.ts`)로 두고 Foundation의 봉투·에러·JWT·DB를 소비한다. 계정 잠금은 **원자적 raw SQL 한 문장**으로(현재 MyBatis와 동일) 재현한다 — JS에서 read-modify-write 하지 않는다. 라우트(`app/api/auth/**/route.ts`)는 본문 파싱(Zod)·쿠키 설정/삭제·봉투만 담당한다. 세션 rotate(고정 공격 방지)는 JWT에선 **새 토큰 재발급**으로 대응한다.

**Tech Stack:** Foundation과 동일(Next.js App Router · Drizzle · jose · bcryptjs · Zod · Vitest). 라우트는 `export const runtime = "nodejs"`(postgres.js·bcryptjs 필요).

**Spec:** `docs/superpowers/specs/2026-08-15-spring-to-next-migration-design.md`

## Global Constraints

- **성공 기준은 파리티.** 아래 값은 현재 Spring 코드·`AuthServiceImplTest`에서 실측한 계약이며 **글자·코드까지 동일**해야 한다.
- **에러코드(Foundation `ErrorCode`)**: `INPUT_VALUE_INVALID`(1000), `ACCOUNT_LOCKED`(1010), `LOGIN_FAILED`(1011), `PASSWORD_CHANGE_REQUIRED`(1012), `EMPTY_SESSION`(980). 예외→상태 매핑은 Foundation `handleRoute`가 처리(980→401, 그 외 BizError→400).
- **로그인 규칙**: 빈 사번/비번→1000 "사번과 비밀번호를 입력하세요."; 없는 사번 또는 `status=INACTIVE`→1011; `locked_until`이 미래면 비번이 맞아도→1010; 비번 불일치→실패 카운트 원자 증가 후 이번 시도로 잠겼으면(1010) 아니면(1011); 성공→실패 카운트 리셋·`last_login_at`=now·JWT 발급.
- **잠금 파라미터**: 최대 실패 **5회**, 잠금 **15분**(현재 `@Value` 기본값 `app.auth.max-failed-attempts:5`, `app.auth.lockout-minutes:15`).
- **잠금 SQL은 원자적 단일 문장**(현재 `incrementFailedLogin` 그대로): `UPDATE users SET failed_login_count = failed_login_count + 1, locked_until = CASE WHEN failed_login_count + 1 >= <max> THEN <now+15m> ELSE locked_until END WHERE id = <id> RETURNING locked_until`.
- **비밀번호 변경**: 빈 값 또는 8자 미만→1000 "비밀번호는 8자 이상이어야 합니다."; 세션 없음→980; **현재 해시와 일치하는 비번→1000 "현재 비밀번호와 다른 비밀번호를 입력하세요."**; 성공→해시 갱신 + `must_change_password=FALSE` + **JWT 재발급(mustChangePassword=false)**. `MIN_PASSWORD_LENGTH=8`.
- **세션 상태 응답 필드**: JSON 키는 **`isLoggedIn`**(불리언), 그리고 `employeeNo, name, role, departmentId, departmentName, mustChangePassword`. 미로그인이면 `{isLoggedIn:false, employeeNo:null, name:null, role:null, departmentId:null, departmentName:null, mustChangePassword:false}` — **null 필드도 포함**(이 DTO엔 NON_NULL 없음). `departmentName`은 매 조회 시 부서 테이블에서 최신값을 읽는다.
- **성공 응답 본문**: 로그인 → `data:{name, role, mustChangePassword}`; 세션 → `data:{isLoggedIn,...}`; 로그아웃·비번변경 → `ok()`(= `{resultCode:200,resultMsg:"정상 처리되었습니다."}`, data 없음).
- **게이트(Foundation)**: `/api/auth/login`·`/api/auth/session`은 공개(세션 불필요). `/api/auth/logout`·`/api/auth/change-password`는 세션 필요, change-password는 `mustChangePassword` 중에도 통과(`/api/auth/` 접두사).
- **JWT 쿠키**: 로그인·비번변경 성공 시 `setSessionCookie(authUser)`; 로그아웃 시 `clearSessionCookie()`. (Foundation 제공.)
- 커밋 메시지는 `feat:`/`test:`/`docs:` 영문 Conventional Commits.

## Foundation에서 소비하는 인터페이스 (이미 존재)

- `web/lib/http/errors.ts`: `BizError`, `handleRoute(fn)`. `web/lib/http/errorCode.ts`: `ErrorCode`. `web/lib/http/envelope.ts`: `ok`, `okMessage`.
- `web/lib/auth/types.ts`: `AuthUser`, `UserRole`. `web/lib/auth/session.ts`: `getAuthUser()`, `setSessionCookie(user)`, `clearSessionCookie()`.
- `web/lib/db/client.ts`: `getDb()`. `web/lib/db/schema.ts`: `users`, `departments`. `web/test/db.ts`: `testDb`, `migrateTestDb`, `truncateAll`.

---

## File Structure

| 파일 | 책임 | Task |
|---|---|---|
| `docs/qa/2026-08-16-auth-parity-checklist.md` | Auth 파리티 정답지(현재 Spring 실측) | 1 |
| `web/lib/db/users.ts` | 사용자 DAO: findByEmployeeNo·incrementFailedLogin(원자)·resetFailedLogin·updateLastLoginAt·updatePassword | 2 |
| `web/lib/db/users.test.ts` | 위 함수 통합 테스트(특히 원자 잠금) | 2 |
| `web/lib/auth/authService.ts` | login·sessionStatus·changePassword 로직 | 3 |
| `web/lib/auth/authService.test.ts` | 서비스 통합 테스트(에러코드·잠금 에스컬레이션·비번변경 규칙) | 3 |
| `web/lib/auth/authSchemas.ts` | Zod 입력 스키마 + 서비스 입출력 타입 | 3 |
| `web/lib/http/envelope.ts` | (수정) `ok()`의 NON_NULL을 `data != null`로 강화 | 3 |
| `web/app/api/auth/login/route.ts` | POST 로그인 | 4 |
| `web/app/api/auth/logout/route.ts` | POST 로그아웃 | 4 |
| `web/app/api/auth/login/route.test.ts` | 로그인·로그아웃 라우트 테스트 | 4 |
| `web/app/api/auth/session/route.ts` | GET 세션 상태 | 5 |
| `web/app/api/auth/change-password/route.ts` | POST 비밀번호 변경 | 5 |
| `web/app/api/auth/session/route.test.ts` | 세션·비번변경 라우트 테스트 | 5 |

---

### Task 1: Auth 파리티 체크리스트 작성 (현재 Spring 실측)

**Files:**
- Create: `docs/qa/2026-08-16-auth-parity-checklist.md`

**Interfaces:**
- Consumes: 현재 Spring `AuthServiceImpl`·`AuthController`·`AuthServiceImplTest`
- Produces: 이후 Task의 Vitest가 겨냥할 정답지(항목별 입력→기대결과).

**배경:** 스펙의 JIT 체크리스트 원칙 — 코드 이식 전에 현재 동작을 정답으로 고정한다. 아래 값은 `AuthServiceImpl`과 `AuthServiceImplTest`(1011/1010/1000 단언, `incrementFailedLogin(id,5,ts)` 검증)에서 실측한 것이다.

- [ ] **Step 1: 체크리스트 문서 작성**

`docs/qa/2026-08-16-auth-parity-checklist.md`에 아래 표를 담는다(각 행 = 시나리오/입력/사전조건/기대결과). 최소 항목:

| # | 시나리오 | 입력·사전조건 | 기대결과(HTTP·resultCode·메시지·부수효과) |
|---|---|---|---|
| L1 | 로그인 성공 | 유효 사번/비번, ACTIVE | 200 / 200 / data{name,role,mustChangePassword}; `failed_login_count=0`, `last_login_at` 갱신, JWT 쿠키 발급 |
| L2 | 빈 사번 또는 빈 비번 | employeeNo="" 또는 password="" | 400 / 1000 / "사번과 비밀번호를 입력하세요." |
| L3 | 없는 사번 | 미존재 사번 | 400 / 1011 / "사번 또는 비밀번호가 올바르지 않습니다." |
| L4 | 비활성 계정 | status=INACTIVE | 400 / 1011 (없는 사번과 동일) |
| L5 | 비번 불일치(임계 미만) | 틀린 비번, failed<4 | 400 / 1011; `failed_login_count`+1, `locked_until` 유지 |
| L6 | 비번 불일치(이번에 잠김) | 틀린 비번, failed=4→5 | 400 / **1010** "계정이 잠겼습니다. 잠시 후 다시 시도하세요."; `locked_until`=now+15m |
| L7 | 잠긴 계정 + 맞는 비번 | locked_until 미래, 올바른 비번 | 400 / 1010 (비번 검사 전에 차단) |
| L8 | 로그아웃 | 세션 유무 무관 | 200 / 200 / ok(); 쿠키 삭제 |
| S1 | 세션 조회(로그인) | 유효 JWT | 200 / 200 / data{isLoggedIn:true, employeeNo,name,role,departmentId,departmentName(최신), mustChangePassword} |
| S2 | 세션 조회(미로그인) | 쿠키 없음/위조 | 200 / 200 / data{isLoggedIn:false, 나머지 null/false} |
| C1 | 비번변경 성공 | 세션, 8자+ 새 비번(현재와 다름) | 200 / 200 / ok(); `password_hash` 갱신, `must_change_password=FALSE`, JWT 재발급(mustChangePassword=false) |
| C2 | 비번변경 짧음 | 8자 미만 | 400 / 1000 / "비밀번호는 8자 이상이어야 합니다." |
| C3 | 비번변경 세션없음 | 세션 없음 | 401 / 980 / "세션 정보가 없습니다." |
| C4 | 비번변경 현재와 동일 | 현재 비번과 같은 값 | 400 / 1000 / "현재 비밀번호와 다른 비밀번호를 입력하세요." |
| G1 | mustChangePassword 게이트 | mustChange=true로 `/api/problems` | 200 / 1012 (Foundation 게이트) |
| G2 | mustChangePassword가 change-password는 통과 | mustChange=true로 `/api/auth/change-password` | 게이트 통과(로직은 C1~C4) |

문서 상단에 잠금 파라미터(5회/15분)와 잠금 SQL(원자 RETURNING)을 명시한다.

- [ ] **Step 2: Commit**

```bash
git add docs/qa/2026-08-16-auth-parity-checklist.md
git commit -m "docs: author the auth parity checklist measured from the Spring app"
```

---

### Task 2: 사용자 DAO (원자적 계정 잠금 포함)

**Files:**
- Create: `web/lib/db/users.ts`
- Create: `web/lib/db/users.test.ts`

**Interfaces:**
- Consumes: `getDb`/`users`(Foundation)
- Produces:
  - `findByEmployeeNo(db, employeeNo: string)` → 사용자 행 또는 `undefined`.
  - `incrementFailedLogin(db, userId: number, maxFailedAttempts: number, lockedUntil: Date)` → `Date | null` (갱신 후 `locked_until`).
  - `resetFailedLogin(db, userId: number)` → `void`.
  - `updateLastLoginAt(db, userId: number, at: Date)` → `void`.
  - `updatePassword(db, userId: number, passwordHash: string)` → `void` (`must_change_password=false`도 함께).
  - `type Db = ReturnType<typeof getDb>` (Task 3이 재사용).

**배경(파리티):** `incrementFailedLogin`은 **SQL 한 문장**으로 카운트 증가·잠금 판정·`locked_until` 반환을 한다. JS에서 카운트를 읽어 계산하면 동시 요청이 잠금을 우회한다(현재 코드 주석).

- [ ] **Step 1: 실패하는 통합 테스트 작성**

`web/lib/db/users.test.ts`:
```ts
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { eq } from "drizzle-orm";
import { migrateTestDb, testDb, truncateAll } from "../../test/db";
import { departments, users } from "./schema";
import { findByEmployeeNo, incrementFailedLogin, resetFailedLogin, updateLastLoginAt, updatePassword } from "./users";

const db = testDb();

async function seedUser(overrides: Partial<typeof users.$inferInsert> = {}) {
  const [dept] = await db.insert(departments).values({ name: "부서", code: "D" + Date.now() + Math.random() }).returning();
  const [user] = await db.insert(users).values({
    employeeNo: "E" + Date.now() + Math.random(), name: "홍길동", email: "u" + Date.now() + Math.random() + "@x.local",
    passwordHash: "hash", departmentId: dept.id, role: "EMPLOYEE", ...overrides,
  }).returning();
  return user;
}

beforeAll(async () => { await migrateTestDb(); });
beforeEach(async () => { await truncateAll(db); });

describe("users dao", () => {
  it("finds a user by employee number", async () => {
    const u = await seedUser({ employeeNo: "1001" });
    const found = await findByEmployeeNo(db, "1001");
    expect(found?.id).toBe(u.id);
    expect(await findByEmployeeNo(db, "nope")).toBeUndefined();
  });

  it("increments the failed count without locking below the threshold", async () => {
    const u = await seedUser({ failedLoginCount: 3 });
    const lockedUntil = await incrementFailedLogin(db, u.id, 5, new Date(Date.now() + 15 * 60000));
    expect(lockedUntil).toBeNull(); // 4 < 5
    const [after] = await db.select().from(users).where(eq(users.id, u.id));
    expect(after.failedLoginCount).toBe(4);
    expect(after.lockedUntil).toBeNull();
  });

  it("locks the account on the attempt that reaches the threshold", async () => {
    const u = await seedUser({ failedLoginCount: 4 });
    const until = new Date(Date.now() + 15 * 60000);
    const lockedUntil = await incrementFailedLogin(db, u.id, 5, until);
    expect(lockedUntil).not.toBeNull(); // 5 >= 5
    const [after] = await db.select().from(users).where(eq(users.id, u.id));
    expect(after.failedLoginCount).toBe(5);
    expect(after.lockedUntil).not.toBeNull();
  });

  it("resets the failed count and clears the lock", async () => {
    const u = await seedUser({ failedLoginCount: 5, lockedUntil: new Date() });
    await resetFailedLogin(db, u.id);
    const [after] = await db.select().from(users).where(eq(users.id, u.id));
    expect(after.failedLoginCount).toBe(0);
    expect(after.lockedUntil).toBeNull();
  });

  it("updates last login and password (clearing mustChangePassword)", async () => {
    const u = await seedUser({ mustChangePassword: true });
    await updateLastLoginAt(db, u.id, new Date());
    await updatePassword(db, u.id, "newhash");
    const [after] = await db.select().from(users).where(eq(users.id, u.id));
    expect(after.lastLoginAt).not.toBeNull();
    expect(after.passwordHash).toBe("newhash");
    expect(after.mustChangePassword).toBe(false);
  });
});
```

- [ ] **Step 2: 실패 확인 (RED)**

Run: `cd web && pnpm test lib/db/users.test.ts`
Expected: 모듈 없음으로 실패.

- [ ] **Step 3: 구현**

`web/lib/db/users.ts`:
```ts
import { eq, sql } from "drizzle-orm";
import type { getDb } from "./client";
import { users } from "./schema";

export type Db = ReturnType<typeof getDb>;

export async function findByEmployeeNo(db: Db, employeeNo: string) {
  const rows = await db.select().from(users).where(eq(users.employeeNo, employeeNo)).limit(1);
  return rows[0];
}

/**
 * 실패 카운트 증가 + 잠금 판정을 원자적 단일 문장으로. 현재 MyBatis incrementFailedLogin 미러.
 * JS 에서 카운트를 읽어 계산하면 동시 요청이 잠금을 우회한다.
 */
export async function incrementFailedLogin(
  db: Db, userId: number, maxFailedAttempts: number, lockedUntil: Date,
): Promise<Date | null> {
  const rows = await db.execute(sql`
    UPDATE users
    SET failed_login_count = failed_login_count + 1,
        locked_until = CASE
          WHEN failed_login_count + 1 >= ${maxFailedAttempts} THEN ${lockedUntil}
          ELSE locked_until
        END
    WHERE id = ${userId}
    RETURNING locked_until
  `);
  const value = (rows as unknown as Array<{ locked_until: Date | null }>)[0]?.locked_until ?? null;
  return value;
}

export async function resetFailedLogin(db: Db, userId: number): Promise<void> {
  await db.update(users).set({ failedLoginCount: 0, lockedUntil: null }).where(eq(users.id, userId));
}

export async function updateLastLoginAt(db: Db, userId: number, at: Date): Promise<void> {
  await db.update(users).set({ lastLoginAt: at }).where(eq(users.id, userId));
}

export async function updatePassword(db: Db, userId: number, passwordHash: string): Promise<void> {
  await db.update(users).set({ passwordHash, mustChangePassword: false }).where(eq(users.id, userId));
}
```

> **참고:** `db.execute(sql\`...\`)`가 반환하는 행 형태는 드라이버(postgres-js)에 따라 배열이다. 위 캐스팅으로 `locked_until`을 읽는다. 값이 `null`이면(임계 미만) `null` 반환.

- [ ] **Step 4: 통과 확인 (GREEN)**

Run: `cd web && pnpm test lib/db/users.test.ts`
Expected: 5건 통과.

- [ ] **Step 5: Commit**

```bash
git add web/lib/db/users.ts web/lib/db/users.test.ts
git commit -m "feat: add user dao with atomic account-lockout increment"
```

---

### Task 3: Auth 서비스 로직 (login·sessionStatus·changePassword)

**Files:**
- Create: `web/lib/auth/authSchemas.ts`
- Create: `web/lib/auth/authService.ts`
- Create: `web/lib/auth/authService.test.ts`
- Modify: `web/lib/http/envelope.ts`

**Interfaces:**
- Consumes: `users` DAO(Task 2), `AuthUser`/`UserRole`(Foundation), `BizError`/`ErrorCode`(Foundation), `departments`/`users` 스키마, `bcryptjs`.
- Produces:
  - `login(db, input: LoginInput)` → `{ authUser: AuthUser; response: LoginResult }` (throws `BizError`).
  - `sessionStatus(db, authUser: AuthUser | null)` → `SessionStatus`.
  - `changePassword(db, authUser: AuthUser | null, newPassword: string)` → `AuthUser` (갱신본, throws `BizError`).
  - `LoginInput`·`LoginResult`·`SessionStatus` 타입 + Zod `loginSchema`·`changePasswordSchema`.

**배경(파리티):** 현재 `AuthServiceImpl`을 그대로 옮긴다. 세션 대신 JWT라, `login`/`changePassword`는 **쿠키를 직접 만지지 않고** 갱신된 `AuthUser`를 반환한다 — 라우트(Task 4·5)가 `setSessionCookie`로 발급한다.

- [ ] **Step 1: envelope NON_NULL 강화 테스트 추가 + 실패 확인**

Foundation 리뷰의 이월 항목: `ok(null)`이 `"data":null`을 내보내 Spring `@JsonInclude(NON_NULL)`(null도 생략)과 어긋난다. Auth가 첫 실제 소비처이므로 여기서 바로잡는다.

`web/lib/http/errors.test.ts`에 케이스 추가(기존 파일):
```ts
it("ok omits data when it is null (NON_NULL parity)", () => {
  expect(ok(null)).toEqual({ resultCode: 200, resultMsg: "정상 처리되었습니다." });
});
```
Run: `cd web && pnpm test lib/http/errors.test.ts` → 이 케이스 실패(RED).

`web/lib/http/envelope.ts` 수정:
```ts
export function ok<T>(data?: T): Envelope<T> {
  const body: Envelope<T> = { resultCode: 200, resultMsg: "정상 처리되었습니다." };
  if (data != null) body.data = data; // undefined·null 모두 생략(NON_NULL 파리티)
  return body;
}
```
Run 재확인 → GREEN.

- [ ] **Step 2: 실패하는 서비스 테스트 작성**

`web/lib/auth/authService.test.ts`:
```ts
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { migrateTestDb, testDb, truncateAll } from "../../test/db";
import { departments, users } from "../db/schema";
import { BizError } from "../http/errors";
import { login, sessionStatus, changePassword } from "./authService";
import type { AuthUser } from "./types";

const db = testDb();

async function seedUser(opts: { password?: string; status?: string; mustChange?: boolean; failed?: number; lockedUntil?: Date | null } = {}) {
  const [dept] = await db.insert(departments).values({ name: "개발팀", code: "D" + Math.random() }).returning();
  const [user] = await db.insert(users).values({
    employeeNo: "1001", name: "홍길동", email: "u" + Math.random() + "@x.local",
    passwordHash: await bcrypt.hash(opts.password ?? "password1", 10),
    departmentId: dept.id, role: "EMPLOYEE", status: opts.status ?? "ACTIVE",
    mustChangePassword: opts.mustChange ?? false, failedLoginCount: opts.failed ?? 0, lockedUntil: opts.lockedUntil ?? null,
  }).returning();
  return { user, dept };
}

function code(fn: () => Promise<unknown>): Promise<number> {
  return fn().then(() => { throw new Error("expected throw"); }, (e) => {
    if (e instanceof BizError) return e.errorCode.code;
    throw e;
  });
}

beforeAll(async () => { await migrateTestDb(); });
beforeEach(async () => { await truncateAll(db); });

describe("login", () => {
  it("succeeds and returns name/role/mustChangePassword; resets failures", async () => {
    const { user } = await seedUser({ failed: 3 });
    const { authUser, response } = await login(db, { employeeNo: "1001", password: "password1" });
    expect(response).toEqual({ name: "홍길동", role: "EMPLOYEE", mustChangePassword: false });
    expect(authUser.userId).toBe(user.id);
    const [after] = await db.select().from(users).where(eq(users.id, user.id));
    expect(after.failedLoginCount).toBe(0);
    expect(after.lastLoginAt).not.toBeNull();
  });

  it("rejects blank credentials with 1000", async () => {
    expect(await code(() => login(db, { employeeNo: "", password: "" }))).toBe(1000);
  });
  it("rejects unknown employeeNo with 1011", async () => {
    expect(await code(() => login(db, { employeeNo: "nope", password: "x" }))).toBe(1011);
  });
  it("rejects an inactive account with 1011", async () => {
    await seedUser({ status: "INACTIVE" });
    expect(await code(() => login(db, { employeeNo: "1001", password: "password1" }))).toBe(1011);
  });
  it("wrong password below threshold reports 1011 and increments", async () => {
    const { user } = await seedUser({ failed: 0 });
    expect(await code(() => login(db, { employeeNo: "1001", password: "wrong" }))).toBe(1011);
    const [after] = await db.select().from(users).where(eq(users.id, user.id));
    expect(after.failedLoginCount).toBe(1);
  });
  it("the attempt that reaches 5 reports 1010 (ACCOUNT_LOCKED, not LOGIN_FAILED)", async () => {
    await seedUser({ failed: 4 });
    expect(await code(() => login(db, { employeeNo: "1001", password: "wrong" }))).toBe(1010);
  });
  it("a locked account rejects with 1010 even with the correct password", async () => {
    await seedUser({ lockedUntil: new Date(Date.now() + 15 * 60000) });
    expect(await code(() => login(db, { employeeNo: "1001", password: "password1" }))).toBe(1010);
  });
});

describe("sessionStatus", () => {
  it("returns not-logged-in shape for a null user", async () => {
    expect(await sessionStatus(db, null)).toEqual({
      isLoggedIn: false, employeeNo: null, name: null, role: null,
      departmentId: null, departmentName: null, mustChangePassword: false,
    });
  });
  it("returns the logged-in shape with a fresh department name", async () => {
    const { user, dept } = await seedUser();
    const authUser: AuthUser = { userId: user.id, employeeNo: "1001", name: "홍길동", role: "EMPLOYEE", departmentId: dept.id, mustChangePassword: false };
    expect(await sessionStatus(db, authUser)).toEqual({
      isLoggedIn: true, employeeNo: "1001", name: "홍길동", role: "EMPLOYEE",
      departmentId: dept.id, departmentName: "개발팀", mustChangePassword: false,
    });
  });
});

describe("changePassword", () => {
  it("rejects a short password with 1000", async () => {
    const { user, dept } = await seedUser();
    const authUser: AuthUser = { userId: user.id, employeeNo: "1001", name: "홍길동", role: "EMPLOYEE", departmentId: dept.id, mustChangePassword: true };
    expect(await code(() => changePassword(db, authUser, "short7!"))).toBe(1000);
  });
  it("rejects when there is no session user with 980", async () => {
    expect(await code(() => changePassword(db, null, "longenough1"))).toBe(980);
  });
  it("rejects reusing the current password with 1000", async () => {
    const { user, dept } = await seedUser({ password: "password1" });
    const authUser: AuthUser = { userId: user.id, employeeNo: "1001", name: "홍길동", role: "EMPLOYEE", departmentId: dept.id, mustChangePassword: true };
    expect(await code(() => changePassword(db, authUser, "password1"))).toBe(1000);
  });
  it("changes the password, clears mustChangePassword, returns updated authUser", async () => {
    const { user, dept } = await seedUser({ password: "password1", mustChange: true });
    const authUser: AuthUser = { userId: user.id, employeeNo: "1001", name: "홍길동", role: "EMPLOYEE", departmentId: dept.id, mustChangePassword: true };
    const updated = await changePassword(db, authUser, "brandnew123");
    expect(updated.mustChangePassword).toBe(false);
    const [after] = await db.select().from(users).where(eq(users.id, user.id));
    expect(after.mustChangePassword).toBe(false);
    expect(await bcrypt.compare("brandnew123", after.passwordHash)).toBe(true);
  });
});
```

- [ ] **Step 3: 실패 확인 (RED)**

Run: `cd web && pnpm test lib/auth/authService.test.ts`
Expected: 모듈 없음으로 실패.

- [ ] **Step 4: 구현**

`web/lib/auth/authSchemas.ts`:
```ts
import { z } from "zod";
import type { UserRole } from "./types";

export const loginSchema = z.object({
  employeeNo: z.string().optional(),
  password: z.string().optional(),
});
export type LoginInput = { employeeNo?: string; password?: string };

export const changePasswordSchema = z.object({
  newPassword: z.string().optional(),
});

export interface LoginResult {
  name: string;
  role: UserRole;
  mustChangePassword: boolean;
}

export interface SessionStatus {
  isLoggedIn: boolean;
  employeeNo: string | null;
  name: string | null;
  role: UserRole | null;
  departmentId: number | null;
  departmentName: string | null;
  mustChangePassword: boolean;
}
```

`web/lib/auth/authService.ts`:
```ts
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { ErrorCode } from "../http/errorCode";
import { BizError } from "../http/errors";
import { departments } from "../db/schema";
import type { Db } from "../db/users";
import { findByEmployeeNo, incrementFailedLogin, resetFailedLogin, updateLastLoginAt, updatePassword } from "../db/users";
import type { AuthUser, UserRole } from "./types";
import type { LoginInput, LoginResult, SessionStatus } from "./authSchemas";

const MIN_PASSWORD_LENGTH = 8;
const MAX_FAILED_ATTEMPTS = Number(process.env.AUTH_MAX_FAILED_ATTEMPTS ?? 5);
const LOCKOUT_MINUTES = Number(process.env.AUTH_LOCKOUT_MINUTES ?? 15);

function isBlank(value: string | undefined | null): boolean {
  return value == null || value.trim() === "";
}

export async function login(db: Db, input: LoginInput): Promise<{ authUser: AuthUser; response: LoginResult }> {
  if (isBlank(input.employeeNo) || isBlank(input.password)) {
    throw new BizError(ErrorCode.INPUT_VALUE_INVALID, "사번과 비밀번호를 입력하세요.");
  }
  const user = await findByEmployeeNo(db, input.employeeNo!.trim());
  if (!user || user.status === "INACTIVE") {
    throw new BizError(ErrorCode.LOGIN_FAILED);
  }
  if (user.lockedUntil && user.lockedUntil.getTime() > Date.now()) {
    throw new BizError(ErrorCode.ACCOUNT_LOCKED);
  }
  const matches = await bcrypt.compare(input.password!, user.passwordHash);
  if (!matches) {
    const lockedUntil = await incrementFailedLogin(
      db, user.id, MAX_FAILED_ATTEMPTS, new Date(Date.now() + LOCKOUT_MINUTES * 60000));
    if (lockedUntil && lockedUntil.getTime() > Date.now()) {
      throw new BizError(ErrorCode.ACCOUNT_LOCKED);
    }
    throw new BizError(ErrorCode.LOGIN_FAILED);
  }

  await resetFailedLogin(db, user.id);
  await updateLastLoginAt(db, user.id, new Date());

  const authUser: AuthUser = {
    userId: user.id, employeeNo: user.employeeNo, name: user.name,
    role: user.role as UserRole, departmentId: user.departmentId, mustChangePassword: user.mustChangePassword,
  };
  return { authUser, response: { name: user.name, role: user.role as UserRole, mustChangePassword: user.mustChangePassword } };
}

export async function sessionStatus(db: Db, authUser: AuthUser | null): Promise<SessionStatus> {
  if (!authUser) {
    return { isLoggedIn: false, employeeNo: null, name: null, role: null, departmentId: null, departmentName: null, mustChangePassword: false };
  }
  const dept = authUser.departmentId == null ? undefined
    : (await db.select().from(departments).where(eq(departments.id, authUser.departmentId)).limit(1))[0];
  return {
    isLoggedIn: true, employeeNo: authUser.employeeNo, name: authUser.name, role: authUser.role,
    departmentId: authUser.departmentId, departmentName: dept?.name ?? null, mustChangePassword: authUser.mustChangePassword,
  };
}

export async function changePassword(db: Db, authUser: AuthUser | null, newPassword: string): Promise<AuthUser> {
  if (isBlank(newPassword) || newPassword.length < MIN_PASSWORD_LENGTH) {
    throw new BizError(ErrorCode.INPUT_VALUE_INVALID, "비밀번호는 8자 이상이어야 합니다.");
  }
  if (!authUser) {
    throw new BizError(ErrorCode.EMPTY_SESSION);
  }
  const user = await findByEmployeeNo(db, authUser.employeeNo);
  if (user && await bcrypt.compare(newPassword, user.passwordHash)) {
    throw new BizError(ErrorCode.INPUT_VALUE_INVALID, "현재 비밀번호와 다른 비밀번호를 입력하세요.");
  }
  await updatePassword(db, authUser.userId, await bcrypt.hash(newPassword, 10));
  return { ...authUser, mustChangePassword: false };
}
```

- [ ] **Step 5: 통과 확인 (GREEN)**

Run: `cd web && pnpm test lib/auth/authService.test.ts lib/http/errors.test.ts`
Expected: 서비스 13건 + envelope 추가 1건 통과.

- [ ] **Step 6: Commit**

```bash
git add web/lib/auth/authSchemas.ts web/lib/auth/authService.ts web/lib/auth/authService.test.ts web/lib/http/envelope.ts web/lib/http/errors.test.ts
git commit -m "feat: add auth service (login/session/change-password) mirroring AuthServiceImpl"
```

---

### Task 4: 로그인·로그아웃 라우트

**Files:**
- Create: `web/app/api/auth/login/route.ts`
- Create: `web/app/api/auth/logout/route.ts`
- Create: `web/app/api/auth/login/route.test.ts`

**Interfaces:**
- Consumes: `login`(Task 3), `getDb`, `setSessionCookie`/`clearSessionCookie`, `handleRoute`/`ok`.
- Produces: `POST /api/auth/login`, `POST /api/auth/logout`.

**배경:** 라우트는 본문 파싱 + 쿠키 + 봉투만. 현재 `LoginRequest`가 `@RequestBody(required=false)`라 본문이 없거나 깨져도 서비스의 빈-값 검사가 "사번과 비밀번호를 입력하세요."(1000)를 낸다 — 본문 파싱 실패를 빈 객체로 강등해 동일 경로를 탄다.

- [ ] **Step 1: 실패하는 라우트 테스트 작성**

`web/app/api/auth/login/route.test.ts`:
```ts
import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import bcrypt from "bcryptjs";
import { migrateTestDb, testDb, truncateAll } from "../../../../test/db";
import { departments, users } from "../../../../lib/db/schema";

// getDb 를 테스트 DB 로 대체
vi.mock("../../../../lib/db/client", () => ({ getDb: () => testDb() }));
// 쿠키 설정은 next/headers 를 쓰므로 스파이로 대체(라우트가 호출하는지만 확인)
const setSessionCookie = vi.fn();
const clearSessionCookie = vi.fn();
vi.mock("../../../../lib/auth/session", () => ({ setSessionCookie: (u: unknown) => setSessionCookie(u), clearSessionCookie: () => clearSessionCookie() }));

const db = testDb();
async function seedUser() {
  const [dept] = await db.insert(departments).values({ name: "개발팀", code: "D" + Math.random() }).returning();
  await db.insert(users).values({
    employeeNo: "1001", name: "홍길동", email: "u" + Math.random() + "@x.local",
    passwordHash: await bcrypt.hash("password1", 10), departmentId: dept.id, role: "EMPLOYEE",
  });
}

beforeAll(async () => { await migrateTestDb(); process.env.SESSION_JWT_SECRET = "test-secret-at-least-32-bytes-long-000"; });
beforeEach(async () => { await truncateAll(db); setSessionCookie.mockClear(); clearSessionCookie.mockClear(); });

function post(body: unknown): Request {
  return new Request("http://localhost/api/auth/login", { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } });
}

describe("POST /api/auth/login", () => {
  it("logs in and sets the session cookie", async () => {
    await seedUser();
    const { POST } = await import("./route");
    const res = await POST(post({ employeeNo: "1001", password: "password1" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ resultCode: 200, resultMsg: "정상 처리되었습니다.", data: { name: "홍길동", role: "EMPLOYEE", mustChangePassword: false } });
    expect(setSessionCookie).toHaveBeenCalledOnce();
  });

  it("rejects a wrong password with 1011 and sets no cookie", async () => {
    await seedUser();
    const { POST } = await import("./route");
    const res = await POST(post({ employeeNo: "1001", password: "wrong" }));
    expect(res.status).toBe(400);
    expect((await res.json()).resultCode).toBe(1011);
    expect(setSessionCookie).not.toHaveBeenCalled();
  });

  it("treats a missing body as blank credentials (1000)", async () => {
    const { POST } = await import("./route");
    const res = await POST(new Request("http://localhost/api/auth/login", { method: "POST" }));
    expect((await res.json()).resultCode).toBe(1000);
  });
});
```

- [ ] **Step 2: 실패 확인 (RED)**

Run: `cd web && pnpm test app/api/auth/login/route.test.ts`
Expected: 모듈 없음으로 실패.

- [ ] **Step 3: 구현**

`web/app/api/auth/login/route.ts`:
```ts
import { getDb } from "@/lib/db/client";
import { handleRoute } from "@/lib/http/errors";
import { login } from "@/lib/auth/authService";
import { setSessionCookie } from "@/lib/auth/session";

export const runtime = "nodejs";

async function readJson(request: Request): Promise<Record<string, unknown>> {
  try {
    return (await request.json()) as Record<string, unknown>;
  } catch {
    return {}; // 본문 없음/깨짐 → 빈 값 검사가 "사번과 비밀번호를 입력하세요."(1000)를 낸다(파리티)
  }
}

export async function POST(request: Request): Promise<Response> {
  return handleRoute(async () => {
    const body = await readJson(request);
    const { authUser, response } = await login(getDb(), {
      employeeNo: body.employeeNo as string | undefined,
      password: body.password as string | undefined,
    });
    await setSessionCookie(authUser);
    return response; // handleRoute 가 ok(response) 로 감싼다
  });
}
```

> **라우트 테스트의 mock 경로 주의:** 라우트는 `@/lib/...`로 import한다. 테스트의 `vi.mock`은 상대경로를 쓰지만, `@/` 별칭과 상대경로는 **같은 절대 파일로 해석**되어 vitest가 동일 모듈로 매칭한다(mock 적용됨). 만약 mock이 안 걸리면 mock 경로를 `@/lib/...` 별칭으로 바꾼다.

`web/app/api/auth/logout/route.ts`:
```ts
import { handleRoute } from "@/lib/http/errors";
import { clearSessionCookie } from "@/lib/auth/session";

export const runtime = "nodejs";

export async function POST(): Promise<Response> {
  return handleRoute(async () => {
    await clearSessionCookie();
    return undefined; // ok() (data 없음) — 현재 logout 응답과 동일
  });
}
```

- [ ] **Step 4: 통과 확인 (GREEN)**

Run: `cd web && pnpm test app/api/auth/login/route.test.ts`
Expected: 3건 통과.

- [ ] **Step 5: Commit**

```bash
git add web/app/api/auth/login web/app/api/auth/logout
git commit -m "feat: add login and logout routes issuing the JWT cookie"
```

---

### Task 5: 세션 상태·비밀번호 변경 라우트

**Files:**
- Create: `web/app/api/auth/session/route.ts`
- Create: `web/app/api/auth/change-password/route.ts`
- Create: `web/app/api/auth/session/route.test.ts`

**Interfaces:**
- Consumes: `sessionStatus`/`changePassword`(Task 3), `getAuthUser`/`setSessionCookie`, `getDb`, `handleRoute`.
- Produces: `GET /api/auth/session`, `POST /api/auth/change-password`.

**배경:** 세션 라우트는 공개(게이트 통과)이며 미로그인이면 `{isLoggedIn:false,...}`를 200으로 낸다(401 아님). change-password는 세션의 `AuthUser`로 검증하고, 성공 시 **갱신된 AuthUser로 쿠키를 재발급**한다(JWT 불변 → 재발급이 세션 rotate 대응).

- [ ] **Step 1: 실패하는 라우트 테스트 작성**

`web/app/api/auth/session/route.test.ts`:
```ts
import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import bcrypt from "bcryptjs";
import { migrateTestDb, testDb, truncateAll } from "../../../../test/db";
import { departments, users } from "../../../../lib/db/schema";
import type { AuthUser } from "../../../../lib/auth/types";

let currentUser: AuthUser | null = null;
const setSessionCookie = vi.fn();
vi.mock("../../../../lib/db/client", () => ({ getDb: () => testDb() }));
vi.mock("../../../../lib/auth/session", () => ({
  getAuthUser: async () => currentUser,
  setSessionCookie: (u: unknown) => setSessionCookie(u),
}));

const db = testDb();
async function seedUser(mustChange = false) {
  const [dept] = await db.insert(departments).values({ name: "개발팀", code: "D" + Math.random() }).returning();
  const [u] = await db.insert(users).values({
    employeeNo: "1001", name: "홍길동", email: "u" + Math.random() + "@x.local",
    passwordHash: await bcrypt.hash("password1", 10), departmentId: dept.id, role: "EMPLOYEE", mustChangePassword: mustChange,
  }).returning();
  return { u, dept };
}

beforeAll(async () => { await migrateTestDb(); process.env.SESSION_JWT_SECRET = "test-secret-at-least-32-bytes-long-000"; });
beforeEach(async () => { await truncateAll(db); currentUser = null; setSessionCookie.mockClear(); });

describe("GET /api/auth/session", () => {
  it("returns not-logged-in when there is no session", async () => {
    const { GET } = await import("./route");
    const res = await GET();
    expect(await res.json()).toEqual({ resultCode: 200, resultMsg: "정상 처리되었습니다.", data: {
      isLoggedIn: false, employeeNo: null, name: null, role: null, departmentId: null, departmentName: null, mustChangePassword: false,
    }});
  });
  it("returns the logged-in shape with department name", async () => {
    const { u, dept } = await seedUser();
    currentUser = { userId: u.id, employeeNo: "1001", name: "홍길동", role: "EMPLOYEE", departmentId: dept.id, mustChangePassword: false };
    const { GET } = await import("./route");
    const data = (await (await GET()).json()).data;
    expect(data.isLoggedIn).toBe(true);
    expect(data.departmentName).toBe("개발팀");
  });
});

describe("POST /api/auth/change-password", () => {
  it("changes password and re-issues the cookie", async () => {
    const { u, dept } = await seedUser(true);
    currentUser = { userId: u.id, employeeNo: "1001", name: "홍길동", role: "EMPLOYEE", departmentId: dept.id, mustChangePassword: true };
    const { POST } = await import("../change-password/route");
    const res = await POST(new Request("http://localhost/api/auth/change-password", { method: "POST", body: JSON.stringify({ newPassword: "brandnew123" }), headers: { "content-type": "application/json" } }));
    expect(res.status).toBe(200);
    expect(setSessionCookie).toHaveBeenCalledOnce();
    expect(setSessionCookie.mock.calls[0][0].mustChangePassword).toBe(false);
  });
  it("rejects change-password without a session (980)", async () => {
    currentUser = null;
    const { POST } = await import("../change-password/route");
    const res = await POST(new Request("http://localhost/api/auth/change-password", { method: "POST", body: JSON.stringify({ newPassword: "brandnew123" }), headers: { "content-type": "application/json" } }));
    expect(res.status).toBe(401);
    expect((await res.json()).resultCode).toBe(980);
  });
});
```

- [ ] **Step 2: 실패 확인 (RED)**

Run: `cd web && pnpm test app/api/auth/session/route.test.ts`
Expected: 모듈 없음으로 실패.

- [ ] **Step 3: 구현**

`web/app/api/auth/session/route.ts`:
```ts
import { getDb } from "@/lib/db/client";
import { handleRoute } from "@/lib/http/errors";
import { getAuthUser } from "@/lib/auth/session";
import { sessionStatus } from "@/lib/auth/authService";

export const runtime = "nodejs";

export async function GET(): Promise<Response> {
  return handleRoute(async () => sessionStatus(getDb(), await getAuthUser()));
}
```

`web/app/api/auth/change-password/route.ts`:
```ts
import { getDb } from "@/lib/db/client";
import { handleRoute } from "@/lib/http/errors";
import { getAuthUser, setSessionCookie } from "@/lib/auth/session";
import { changePassword } from "@/lib/auth/authService";

export const runtime = "nodejs";

async function readJson(request: Request): Promise<Record<string, unknown>> {
  try {
    return (await request.json()) as Record<string, unknown>;
  } catch {
    return {};
  }
}

export async function POST(request: Request): Promise<Response> {
  return handleRoute(async () => {
    const body = await readJson(request);
    const updated = await changePassword(getDb(), await getAuthUser(), (body.newPassword as string) ?? "");
    await setSessionCookie(updated); // JWT 재발급 = 세션 rotate 대응
    return undefined; // ok()
  });
}
```

- [ ] **Step 4: 통과 확인 (GREEN)**

Run: `cd web && pnpm test app/api/auth/session/route.test.ts`
Expected: 4건 통과.

- [ ] **Step 5: 전체 스위트 + 빌드**

Run: `cd web && pnpm test && pnpm build`
Expected: Foundation + Auth 전부 통과, 빌드 성공(4개 auth 라우트).

- [ ] **Step 6: Commit**

```bash
git add web/app/api/auth/session web/app/api/auth/change-password web/app/api/auth/session/route.test.ts
git commit -m "feat: add session-status and change-password routes"
```

---

### Task 6: E2E 브라우저/curl 검증 (실행 중인 Next + 실 DB)

**Files:** (문서만)
- Create: `docs/qa/2026-08-16-auth-e2e-verification.md`

**배경(스펙 ④):** 화면은 아직 없으므로 auth E2E는 API 레벨이다. 실행 중인 Next dev + `probank_test`(또는 별도 dev DB) + 부트스트랩한 사용자로, 쿠키가 실제로 발급·검증되는지 사람이 확인한다. 단위/통합이 못 잡는 런타임 배선(next/headers 쿠키, 미들웨어 게이트 실경로)을 덮는다.

- [ ] **Step 1: 환경 기동**

```bash
cd web
# 필요한 env (로컬 .env.local 또는 셸)
#   DATABASE_URL=postgres://probank:probank_dev@localhost:5434/probank_test
#   SESSION_JWT_SECRET=<32+ bytes>
#   BOOTSTRAP_ADMIN_EMPLOYEE_NO=admin BOOTSTRAP_ADMIN_EMAIL=admin@company.local BOOTSTRAP_ADMIN_PASSWORD=changeme1234
pnpm drizzle:migrate           # probank_test 에 스키마 적용(비어 있으면)
pnpm bootstrap                 # 총괄관리자+본사 시드(멱등)
pnpm dev                       # http://localhost:3000
```

- [ ] **Step 2: 로그인 흐름 확인 (curl, 쿠키 저장)**

```bash
# 로그인 성공 → Set-Cookie: session=... 확인, data{name,role,mustChangePassword:true}
curl -i -c cookie.txt -X POST http://localhost:3000/api/auth/login \
  -H 'content-type: application/json' -d '{"employeeNo":"admin","password":"changeme1234"}'

# 세션 조회 → isLoggedIn:true, departmentName:"본사"
curl -s -b cookie.txt http://localhost:3000/api/auth/session

# 게이트: mustChangePassword=true 이므로 보호 경로는 1012
curl -s -b cookie.txt http://localhost:3000/api/problems   # (아직 라우트 없음 → 미들웨어 1012 또는 404; 1012 게이트가 먼저 걸리는지 확인)
```

기대: 로그인 200+쿠키, 세션 `isLoggedIn:true`·`departmentName:"본사"`·`mustChangePassword:true`.

- [ ] **Step 3: 비밀번호 변경 + 재검증**

```bash
# 8자 미만 → 1000
curl -s -b cookie.txt -X POST http://localhost:3000/api/auth/change-password -H 'content-type: application/json' -d '{"newPassword":"short7!"}'
# 현재와 동일 → 1000
curl -s -b cookie.txt -X POST http://localhost:3000/api/auth/change-password -H 'content-type: application/json' -d '{"newPassword":"changeme1234"}'
# 성공 → ok(); 이후 세션 조회 시 mustChangePassword:false (쿠키 재발급 확인)
curl -i -c cookie.txt -b cookie.txt -X POST http://localhost:3000/api/auth/change-password -H 'content-type: application/json' -d '{"newPassword":"newpass1234"}'
curl -s -b cookie.txt http://localhost:3000/api/auth/session   # mustChangePassword:false
```

- [ ] **Step 4: 잠금 확인 (5회 실패)**

```bash
# 틀린 비번 5회 → 5회째 1010(ACCOUNT_LOCKED), 이후 맞는 비번도 1010
for i in 1 2 3 4 5; do
  curl -s -X POST http://localhost:3000/api/auth/login -H 'content-type: application/json' -d '{"employeeNo":"admin","password":"wrong"}' | grep -o '"resultCode":[0-9-]*'
done
curl -s -X POST http://localhost:3000/api/auth/login -H 'content-type: application/json' -d '{"employeeNo":"admin","password":"newpass1234"}' | grep -o '"resultCode":[0-9-]*'
```

기대: 1~4회 1011, 5회 **1010**, 잠긴 뒤 맞는 비번도 1010. (확인 후 `resetFailedLogin` 또는 DB에서 `locked_until=null`로 원복.)

- [ ] **Step 5: 결과 문서화 + Commit**

`docs/qa/2026-08-16-auth-e2e-verification.md`에 각 단계 실제 응답(resultCode·주요 필드)과 통과 여부를 기록한다.

```bash
git add docs/qa/2026-08-16-auth-e2e-verification.md
git commit -m "docs: record the auth end-to-end verification results"
```

---

## Self-Review 결과

- **스펙 커버리지:** JIT 체크리스트(Task 1) → 파리티 정답지; login/lockout/bcrypt/change-password/session/logout(Task 2·3·4·5) → Plan2 Auth 파리티; E2E(Task 6) → 스펙 ④ 브라우저/런타임 검증. 이월 항목 `ok(null)` NON_NULL(Task 3 Step 1)·본문 파싱 강등(Task 4·5 `readJson`) 반영.
- **플레이스홀더 스캔:** 없음. 모든 코드 스텝에 실제 코드. 에러코드·메시지·잠금 SQL·세션 필드명(`isLoggedIn`)은 현재 Spring 실측값.
- **타입 일관성:** `Db`(Task 2)를 Task 3이 소비. `AuthUser`(Foundation)를 서비스·라우트가 동일 필드로 사용. `login` 반환 `{authUser,response}`를 Task 4 라우트가 그대로 구조분해. `sessionStatus`/`changePassword` 시그니처가 Task 5 라우트와 일치. `LoginResult`/`SessionStatus` 필드가 테스트 기대값과 동일.

## Execution Handoff

이 계획을 다 만들었다. 두 가지 실행 방식이 있다:

1. **Subagent-Driven (권장)** — Task마다 새 서브에이전트, 사이사이 리뷰
2. **Inline Execution** — executing-plans로 배치 실행 + 체크포인트

어느 방식으로 진행할까?
