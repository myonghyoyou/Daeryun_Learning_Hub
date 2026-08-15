# 이관 서브플랜 1 — Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `web/`에 Next.js(App Router) 앱의 "레일"을 깐다 — Drizzle 스키마(현재 DDL 정확 재현) + Supabase 풀러 DB 클라이언트, `ResponseDto`/`ErrorResponse` 응답 봉투와 예외 프레임워크, 무상태 JWT 세션·인증 게이트·역할 가드, Vitest 하네스, 부트스트랩 시드. **기능(로그인·문제 등) 없음** — 이후 서브플랜이 이 위에 올린다.

**Architecture:** 단일 Next.js 앱(프론트+API)을 Vercel(icn1)에 배포한다. API는 `app/api/**/route.ts`, 인증 게이트는 `middleware.ts`, 순수 로직은 `web/lib/**`에 두고 Vitest로 고정한다. DB는 Supabase Postgres(서울)를 **트랜잭션 풀러**로 붙고 Drizzle로 접근한다. 세션은 메모리가 아니라 **httpOnly JWT 쿠키**다.

**Tech Stack:** Next.js 15(App Router) · React 19 · TypeScript · Drizzle ORM + postgres.js · jose(JWT) · bcryptjs · Zod · Vitest. 패키지 매니저 **pnpm**(조정 가능). 라우트 런타임 **nodejs**(postgres.js·bcryptjs 필요), 미들웨어는 DB 접근 없이 JWT 검증만 하므로 Edge 호환.

**Spec:** `docs/superpowers/specs/2026-08-15-spring-to-next-migration-design.md`

## Global Constraints

- **성공 기준은 파리티**: 현재 Spring 앱과 같은 결과·규칙·에러. Foundation은 기능이 없으므로 "프레임워크가 현재 계약을 그대로 재현하는가"가 파리티 기준이다.
- **응답 봉투 고정**: 모든 응답은 `{ resultCode:int, resultMsg:string }` + (성공 시) `data` 또는 (필드검증 시) `errorList`. `null` 필드는 **직렬화에서 생략**(현재 `@JsonInclude(NON_NULL)`).
- **예외→HTTP 상태**: `EMPTY_SESSION`(980)→**401**, `ACCESS_AUTH_DENIED`(990)→**403**, 그 외 BizError→**400**. 필드검증(1000)·예상못한 오류(-1)는 **HTTP 200**으로 나간다(프론트는 HTTP 상태가 아니라 `resultCode`로 분기).
- **세션 쿠키 미러**: 만료 **90분**, `SameSite=Lax`, `httpOnly`, `secure`는 `SESSION_COOKIE_SECURE` env로 전환.
- **인증 게이트(`SessionCheckFilter` 미러)**: `/api/**`는 로그인 필요. 단 `/api/auth/login`·`/api/auth/session`·`OPTIONS`는 예외. `mustChangePassword`면 `/api/auth/*` 외 접근을 **200 + resultCode 1012**로 차단.
- **역할 가드(`RoleCheckInterceptor` 미러)**: 라우트가 `requireRole(...)`로 역할을 강제, 불일치 시 `ACCESS_AUTH_DENIED`(403).
- **Drizzle 스키마 = DDL 계약**: `backend/src/main/resources/schema.sql`의 13개 테이블·타입·제약(유니크/FK `ON DELETE CASCADE`/체크/인덱스)을 정확히 재현한다.
- **bcrypt**: `bcryptjs`. 프로덕션은 빈 DB로 시작(D8)하므로 해시 이전 없음. 테스트 시드는 `bcryptjs`로 직접 해싱.
- 커밋 메시지는 `feat:`/`test:`/`chore:` 영문 Conventional Commits.

## 데이터 모델 — 현재 계약 발췌

응답 봉투(현재 `ResponseDto`/`ErrorResponse` 모두 `resultCode`/`resultMsg`로 직렬화):
```
성공:        { "resultCode": 200, "resultMsg": "정상 처리되었습니다.", "data": <T> }
BizError:    { "resultCode": <code>, "resultMsg": <message> }              (HTTP 401/403/400)
필드검증:    { "resultCode": 1000, "resultMsg": "...", "errorList": [{field,value,reason}] }  (HTTP 200)
```

ErrorCode(전체 이식):
```
MSG_PROC_FAIL(-1) INPUT_VALUE_INVALID(1000) FILE_REQUIRED(1009) ACCOUNT_LOCKED(1010)
LOGIN_FAILED(1011) PASSWORD_CHANGE_REQUIRED(1012) FILE_UNREADABLE(1013)
FILE_TYPE_NOT_ALLOWED(1014) FILE_TOO_LARGE(1015) EMPTY_SESSION(980) ACCESS_AUTH_DENIED(990)
```

---

## File Structure

| 파일 | 책임 | Task |
|---|---|---|
| `web/package.json`, `web/tsconfig.json`, `web/next.config.mjs`, `web/vercel.json`, `web/vitest.config.ts` | 툴체인·빌드·리전(icn1) | 1 |
| `web/app/layout.tsx`, `web/app/page.tsx` | 최소 페이지(빌드 가능) | 1 |
| `web/lib/http/errorCode.ts` | `ErrorCode` 상수(code+message) | 2 |
| `web/lib/http/envelope.ts` | `ok()`/`okMessage()` 봉투 빌더 | 2 |
| `web/lib/http/errors.ts` | `BizError`, 상태 매핑, `handleRoute()` 래퍼 | 2 |
| `web/lib/db/schema.ts` | Drizzle 스키마(13테이블, DDL 계약) | 3 |
| `web/lib/db/client.ts` | postgres.js(풀러) + drizzle 인스턴스 | 3 |
| `web/drizzle.config.ts`, `web/drizzle/**` | drizzle-kit 설정·마이그레이션 | 3 |
| `web/lib/auth/types.ts` | `AuthUser`·`UserRole` 타입 | 4 |
| `web/lib/auth/jwt.ts` | `signSession`/`verifySession`(jose, 90m) | 4 |
| `web/lib/auth/session.ts` | 쿠키 읽기/쓰기·`getAuthUser()` | 4 |
| `web/lib/auth/gate.ts` | `evaluateGate()` 순수 로직 | 5 |
| `web/lib/auth/guard.ts` | `requireRole()` | 5 |
| `web/middleware.ts` | `/api/**` 게이트 배선(`evaluateGate` 사용) | 5 |
| `web/lib/bootstrap.ts`, `web/scripts/bootstrap.ts` | 총괄관리자+본사 시드(멱등) | 6 |
| `web/test/db.ts` | 통합 테스트용 DB 헬퍼(마이그레이트·truncate) | 3 |

---

### Task 1: 프로젝트 스캐폴드 + 툴체인

**Files:**
- Create: `web/package.json`, `web/tsconfig.json`, `web/next.config.mjs`, `web/vercel.json`, `web/vitest.config.ts`
- Create: `web/app/layout.tsx`, `web/app/page.tsx`
- Create: `web/lib/sanity.ts`, `web/lib/sanity.test.ts`

**Interfaces:**
- Consumes: 없음
- Produces: 실행 가능한 Vitest·Next 빌드 환경. `pnpm --dir web test`, `pnpm --dir web build`.

- [ ] **Step 1: 실패하는 sanity 테스트 작성**

`web/lib/sanity.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { sanity } from "./sanity";

describe("sanity", () => {
  it("returns ok", () => {
    expect(sanity()).toBe("ok");
  });
});
```

- [ ] **Step 2: 툴체인 파일 작성**

`web/package.json`:
```json
{
  "name": "daeryun-learning-hub-web",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "test": "vitest run",
    "test:watch": "vitest",
    "drizzle:generate": "drizzle-kit generate",
    "drizzle:migrate": "drizzle-kit migrate",
    "bootstrap": "tsx scripts/bootstrap.ts"
  },
  "dependencies": {
    "next": "15.1.0",
    "react": "19.0.0",
    "react-dom": "19.0.0",
    "drizzle-orm": "0.36.4",
    "postgres": "3.4.5",
    "jose": "5.9.6",
    "bcryptjs": "2.4.3",
    "zod": "3.23.8"
  },
  "devDependencies": {
    "typescript": "5.6.3",
    "@types/node": "22.9.0",
    "@types/react": "19.0.0",
    "@types/bcryptjs": "2.4.6",
    "vitest": "2.1.5",
    "drizzle-kit": "0.28.1",
    "tsx": "4.19.2"
  }
}
```

`web/tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "jsx": "preserve",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "skipLibCheck": true,
    "paths": { "@/*": ["./*"] }
  },
  "include": ["**/*.ts", "**/*.tsx", "next-env.d.ts"],
  "exclude": ["node_modules"]
}
```

`web/next.config.mjs`:
```js
/** @type {import('next').NextConfig} */
const nextConfig = {};
export default nextConfig;
```

`web/vercel.json` (함수 리전 서울 고정 — 스펙 섹션 A):
```json
{ "regions": ["icn1"] }
```

`web/vitest.config.ts`:
```ts
import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

export default defineConfig({
  resolve: { alias: { "@": resolve(__dirname, ".") } },
  test: { environment: "node", include: ["**/*.test.ts"] },
});
```

`web/app/layout.tsx`:
```tsx
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
```

`web/app/page.tsx`:
```tsx
export default function Home() {
  return <main>문제 은행 Hub</main>;
}
```

- [ ] **Step 3: sanity 구현**

`web/lib/sanity.ts`:
```ts
export function sanity(): string {
  return "ok";
}
```

- [ ] **Step 4: 설치 + 테스트 통과 확인**

Run: `cd web && pnpm install && pnpm test`
Expected: 1 test 통과.

- [ ] **Step 5: 빌드 확인**

Run: `cd web && pnpm build`
Expected: Next 빌드 성공(정적 `/` 페이지).

- [ ] **Step 6: Commit**

```bash
git add web/package.json web/pnpm-lock.yaml web/tsconfig.json web/next.config.mjs web/vercel.json web/vitest.config.ts web/app web/lib/sanity.ts web/lib/sanity.test.ts
git commit -m "chore: scaffold the web Next.js app with vitest and build"
```

---

### Task 2: 응답 봉투 + 예외 프레임워크

**Files:**
- Create: `web/lib/http/errorCode.ts`
- Create: `web/lib/http/envelope.ts`
- Create: `web/lib/http/errors.ts`
- Create: `web/lib/http/errors.test.ts`

**Interfaces:**
- Consumes: 없음
- Produces:
  - `ErrorCode` — `{ MSG_PROC_FAIL:{code:-1,message}, ... }` 상수 맵.
  - `ok<T>(data?: T)` → `{resultCode:200, resultMsg:"정상 처리되었습니다.", data?}` (data가 `undefined`면 키 생략).
  - `okMessage(code:number, message:string)` → `{resultCode, resultMsg}`.
  - `class BizError extends Error { errorCode }`.
  - `bizStatus(entry)` → `401 | 403 | 400`.
  - `handleRoute(fn: () => Promise<unknown>)` → `Response` — 성공은 `ok(data)`, `BizError`·`ZodError`·기타를 봉투+상태로 변환. Task 5·이후 라우트가 사용.

- [ ] **Step 1: 실패하는 테스트 작성**

`web/lib/http/errors.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { ZodError, z } from "zod";
import { ErrorCode } from "./errorCode";
import { ok, okMessage } from "./envelope";
import { BizError, bizStatus, handleRoute } from "./errors";

describe("envelope", () => {
  it("ok wraps data with the fixed success message", () => {
    expect(ok({ id: 1 })).toEqual({ resultCode: 200, resultMsg: "정상 처리되었습니다.", data: { id: 1 } });
  });
  it("ok omits data when undefined (NON_NULL)", () => {
    expect(ok()).toEqual({ resultCode: 200, resultMsg: "정상 처리되었습니다." });
  });
  it("okMessage carries code and message only", () => {
    expect(okMessage(1012, "비밀번호 변경이 필요합니다.")).toEqual({ resultCode: 1012, resultMsg: "비밀번호 변경이 필요합니다." });
  });
});

describe("bizStatus", () => {
  it("maps EMPTY_SESSION to 401, ACCESS_AUTH_DENIED to 403, else 400", () => {
    expect(bizStatus(ErrorCode.EMPTY_SESSION)).toBe(401);
    expect(bizStatus(ErrorCode.ACCESS_AUTH_DENIED)).toBe(403);
    expect(bizStatus(ErrorCode.INPUT_VALUE_INVALID)).toBe(400);
  });
});

describe("handleRoute", () => {
  it("returns 200 + ok(data) on success", async () => {
    const res = await handleRoute(async () => ({ hello: "world" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ resultCode: 200, resultMsg: "정상 처리되었습니다.", data: { hello: "world" } });
  });

  it("maps BizError to its status and envelope", async () => {
    const res = await handleRoute(async () => {
      throw new BizError(ErrorCode.EMPTY_SESSION);
    });
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ resultCode: 980, resultMsg: "세션 정보가 없습니다." });
  });

  it("maps a custom BizError message", async () => {
    const res = await handleRoute(async () => {
      throw new BizError(ErrorCode.INPUT_VALUE_INVALID, "존재하지 않거나 보관된 문제입니다.");
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ resultCode: 1000, resultMsg: "존재하지 않거나 보관된 문제입니다." });
  });

  it("maps ZodError to HTTP 200 + errorList (field validation)", async () => {
    const res = await handleRoute(async () => {
      z.object({ name: z.string() }).parse({ name: 123 });
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.resultCode).toBe(1000);
    expect(body.resultMsg).toBe("잘못된 파라미터를 입력했습니다.");
    expect(Array.isArray(body.errorList)).toBe(true);
    expect(body.errorList[0].field).toBe("name");
  });

  it("maps an unexpected error to HTTP 200 + MSG_PROC_FAIL", async () => {
    const res = await handleRoute(async () => {
      throw new Error("boom");
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ resultCode: -1, resultMsg: "처리 중 오류가 발생하였습니다." });
  });
});
```

- [ ] **Step 2: 실패 확인 (RED)**

Run: `cd web && pnpm test lib/http/errors.test.ts`
Expected: 모듈 없음으로 실패.

- [ ] **Step 3: 구현**

`web/lib/http/errorCode.ts`:
```ts
export interface ErrorCodeEntry {
  code: number;
  message: string;
}

// 현재 ErrorCode enum 전체 이식. code·message 는 파리티 앵커라 글자까지 동일.
export const ErrorCode = {
  MSG_PROC_FAIL: { code: -1, message: "처리 중 오류가 발생하였습니다." },
  INPUT_VALUE_INVALID: { code: 1000, message: "잘못된 파라미터를 입력했습니다." },
  FILE_REQUIRED: { code: 1009, message: "필수 파일이 누락되었습니다." },
  ACCOUNT_LOCKED: { code: 1010, message: "계정이 잠겼습니다. 잠시 후 다시 시도하세요." },
  LOGIN_FAILED: { code: 1011, message: "사번 또는 비밀번호가 올바르지 않습니다." },
  PASSWORD_CHANGE_REQUIRED: { code: 1012, message: "비밀번호 변경이 필요합니다." },
  FILE_UNREADABLE: { code: 1013, message: "파일을 읽을 수 없습니다." },
  FILE_TYPE_NOT_ALLOWED: { code: 1014, message: "허용되지 않는 파일 형식입니다." },
  FILE_TOO_LARGE: { code: 1015, message: "파일 크기가 허용 범위를 초과했습니다." },
  EMPTY_SESSION: { code: 980, message: "세션 정보가 없습니다." },
  ACCESS_AUTH_DENIED: { code: 990, message: "접근 권한이 없습니다." },
} as const satisfies Record<string, ErrorCodeEntry>;
```

`web/lib/http/envelope.ts`:
```ts
export interface Envelope<T> {
  resultCode: number;
  resultMsg: string;
  data?: T;
}

// 현재 ResponseDto.ok 미러: 성공 코드 200 + 고정 문구. data 가 undefined 면 키를 넣지 않는다(NON_NULL).
export function ok<T>(data?: T): Envelope<T> {
  const body: Envelope<T> = { resultCode: 200, resultMsg: "정상 처리되었습니다." };
  if (data !== undefined) body.data = data;
  return body;
}

export function okMessage(code: number, message: string): Envelope<never> {
  return { resultCode: code, resultMsg: message };
}
```

`web/lib/http/errors.ts`:
```ts
import { ZodError } from "zod";
import { ErrorCode, type ErrorCodeEntry } from "./errorCode";
import { ok, okMessage } from "./envelope";

export class BizError extends Error {
  constructor(public readonly errorCode: ErrorCodeEntry, message?: string) {
    super(message ?? errorCode.message);
  }
}

// 현재 GlobalExceptionHandler.handleBizException 미러.
export function bizStatus(entry: ErrorCodeEntry): 401 | 403 | 400 {
  if (entry.code === ErrorCode.EMPTY_SESSION.code) return 401;
  if (entry.code === ErrorCode.ACCESS_AUTH_DENIED.code) return 403;
  return 400;
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json;charset=UTF-8" },
  });
}

/**
 * 라우트 핸들러를 감싸 예외를 현재 계약대로 봉투+상태로 바꾼다.
 * - 성공: 200 + ok(data)
 * - BizError: bizStatus + okMessage(code, message)
 * - ZodError(필드검증): HTTP 200 + { resultCode:1000, errorList } (현재 handleValidationException 미러)
 * - 기타: HTTP 200 + MSG_PROC_FAIL (현재 handleUnexpectedException 미러)
 */
export async function handleRoute(fn: () => Promise<unknown>): Promise<Response> {
  try {
    const data = await fn();
    return json(ok(data), 200);
  } catch (error) {
    if (error instanceof BizError) {
      return json(okMessage(error.errorCode.code, error.message), bizStatus(error.errorCode));
    }
    if (error instanceof ZodError) {
      const errorList = error.errors.map((e) => ({
        field: e.path.join("."),
        value: null,
        reason: e.message,
      }));
      return json({ resultCode: ErrorCode.INPUT_VALUE_INVALID.code, resultMsg: ErrorCode.INPUT_VALUE_INVALID.message, errorList }, 200);
    }
    console.error("처리되지 않은 예외가 발생했습니다.", error);
    return json(okMessage(ErrorCode.MSG_PROC_FAIL.code, ErrorCode.MSG_PROC_FAIL.message), 200);
  }
}
```

- [ ] **Step 4: 통과 확인 (GREEN)**

Run: `cd web && pnpm test lib/http/errors.test.ts`
Expected: 전부 통과.

- [ ] **Step 5: Commit**

```bash
git add web/lib/http
git commit -m "feat: add response envelope and error framework mirroring ResponseDto"
```

---

### Task 3: Drizzle 스키마(DDL 계약) + DB 클라이언트 + 통합 테스트 하네스

**Files:**
- Create: `web/lib/db/schema.ts`
- Create: `web/lib/db/client.ts`
- Create: `web/drizzle.config.ts`
- Create: `web/test/db.ts`
- Create: `web/lib/db/schema.test.ts`

**Interfaces:**
- Consumes: 없음
- Produces:
  - `schema` — Drizzle 테이블 객체(`departments`, `users`, `problems`, …, `auditLogs`).
  - `getDb()` → drizzle 인스턴스(postgres.js, 풀러 URL `DATABASE_URL`).
  - `web/test/db.ts`: `migrateTestDb()`(마이그레이션 적용), `truncateAll(db)`(테이블 비우기), `testDb()`(테스트 전용 drizzle). Task 6·이후 통합 테스트가 사용.

**배경:** 현재 `schema.sql`은 13개 테이블이다(`departments users problems problem_choices problem_answers problem_blanks attempts attempt_blank_answers attempt_choices excel_upload_logs tags problem_tags audit_logs`). 제약이 파리티 앵커다 — 특히 `uq_problems_department_source_number`, `attempt_choices` 는 `choice_id`에 FK를 걸지 않음(현재 주석의 의도), `problem_tags` 복합 PK, `ON DELETE CASCADE` 지점.

- [ ] **Step 1: 테스트 DB 준비 (일회성)**

Run:
```bash
docker exec probank-postgres psql -U probank -c "CREATE DATABASE probank_test" || true
```
`web/.env.test`(git 무시)에:
```
DATABASE_URL=postgres://probank:probank_dev@localhost:5434/probank_test
```

- [ ] **Step 2: 실패하는 통합 테스트 작성**

`web/lib/db/schema.test.ts`:
```ts
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { eq } from "drizzle-orm";
import { migrateTestDb, testDb, truncateAll } from "../../test/db";
import { departments, users, problems } from "./schema";

const db = testDb();

beforeAll(async () => {
  await migrateTestDb();
});
beforeEach(async () => {
  await truncateAll(db);
});

describe("schema round-trip", () => {
  it("inserts and reads a department", async () => {
    const [row] = await db.insert(departments).values({ name: "본사", code: "HQ" }).returning();
    expect(row.status).toBe("ACTIVE"); // 기본값
    const found = await db.select().from(departments).where(eq(departments.id, row.id));
    expect(found[0].name).toBe("본사");
  });

  it("enforces the unique department code", async () => {
    await db.insert(departments).values({ name: "A", code: "DUP" });
    await expect(db.insert(departments).values({ name: "B", code: "DUP" })).rejects.toMatchObject({ code: "23505" });
  });

  it("enforces unique (department_id, source_number) on problems", async () => {
    const [dept] = await db.insert(departments).values({ name: "부서", code: "D1" }).returning();
    const [admin] = await db.insert(users).values({
      employeeNo: "A1", name: "관리", email: "a1@x.local", passwordHash: "h",
      departmentId: dept.id, role: "SUPER_ADMIN",
    }).returning();
    const base = { type: "SHORT_ANSWER" as const, content: "q", departmentId: dept.id, createdBy: admin.id, sourceNumber: 7 };
    await db.insert(problems).values(base);
    await expect(
      db.insert(problems).values({ ...base, content: "q2" }),
    ).rejects.toMatchObject({ code: "23505" });
  });
});
```

- [ ] **Step 3: 실패 확인 (RED)**

Run: `cd web && pnpm test lib/db/schema.test.ts`
Expected: 모듈 없음으로 실패.

- [ ] **Step 4: Drizzle 스키마 구현**

`web/lib/db/schema.ts` — 현재 `schema.sql` 13테이블을 정확 재현:
```ts
import {
  pgTable, bigserial, varchar, text, integer, boolean, timestamp, bigint, jsonb,
  uniqueIndex, index, primaryKey, unique,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const departments = pgTable("departments", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  name: varchar("name", { length: 100 }).notNull(),
  code: varchar("code", { length: 50 }).notNull().unique(),
  status: varchar("status", { length: 20 }).notNull().default("ACTIVE"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const users = pgTable("users", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  employeeNo: varchar("employee_no", { length: 50 }).notNull().unique(),
  name: varchar("name", { length: 100 }).notNull(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  passwordHash: varchar("password_hash", { length: 255 }).notNull(),
  departmentId: bigint("department_id", { mode: "number" }).notNull().references(() => departments.id),
  role: varchar("role", { length: 20 }).notNull(),
  status: varchar("status", { length: 20 }).notNull().default("ACTIVE"),
  mustChangePassword: boolean("must_change_password").notNull().default(true),
  failedLoginCount: integer("failed_login_count").notNull().default(0),
  lockedUntil: timestamp("locked_until"),
  lastLoginAt: timestamp("last_login_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const problems = pgTable("problems", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  type: varchar("type", { length: 20 }).notNull(),
  content: text("content").notNull(),
  imageUrl: varchar("image_url", { length: 500 }),
  referenceText: text("reference_text"),
  explanation: text("explanation"),
  blankRevealCount: integer("blank_reveal_count"),
  status: varchar("status", { length: 20 }).notNull().default("ACTIVE"),
  departmentId: bigint("department_id", { mode: "number" }).notNull().references(() => departments.id),
  sourceNumber: integer("source_number"),
  createdBy: bigint("created_by", { mode: "number" }).notNull().references(() => users.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (t) => ({
  uqDeptSource: unique("uq_problems_department_source_number").on(t.departmentId, t.sourceNumber),
}));

export const problemChoices = pgTable("problem_choices", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  problemId: bigint("problem_id", { mode: "number" }).notNull().references(() => problems.id, { onDelete: "cascade" }),
  choiceText: varchar("choice_text", { length: 500 }).notNull(),
  isCorrect: boolean("is_correct").notNull().default(false),
  displayOrder: integer("display_order").notNull(),
});

export const problemAnswers = pgTable("problem_answers", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  problemId: bigint("problem_id", { mode: "number" }).notNull().references(() => problems.id, { onDelete: "cascade" }),
  answerText: varchar("answer_text", { length: 500 }).notNull(),
});

export const problemBlanks = pgTable("problem_blanks", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  problemId: bigint("problem_id", { mode: "number" }).notNull().references(() => problems.id, { onDelete: "cascade" }),
  blankKey: varchar("blank_key", { length: 50 }).notNull(),
  answerText: varchar("answer_text", { length: 500 }).notNull(),
  displayOrder: integer("display_order").notNull(),
});

export const attempts = pgTable("attempts", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  userId: bigint("user_id", { mode: "number" }).notNull().references(() => users.id),
  problemId: bigint("problem_id", { mode: "number" }).notNull().references(() => problems.id),
  submittedAnswer: varchar("submitted_answer", { length: 500 }),
  isCorrect: boolean("is_correct").notNull(),
  submittedAt: timestamp("submitted_at").notNull().defaultNow(),
});

export const attemptBlankAnswers = pgTable("attempt_blank_answers", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  attemptId: bigint("attempt_id", { mode: "number" }).notNull().references(() => attempts.id, { onDelete: "cascade" }),
  blankKey: varchar("blank_key", { length: 50 }).notNull(),
  submittedAnswer: varchar("submitted_answer", { length: 500 }),
  isCorrect: boolean("is_correct").notNull(),
});

// choice_id 에 FK 를 걸지 않는 것은 의도(현재 schema.sql 주석): 문제 수정이 보기를 지우고 다시 넣어
// CASCADE 는 풀이 기록을 지우고 RESTRICT 는 수정을 막는다. 제출 시점 보기 본문을 함께 남긴다.
export const attemptChoices = pgTable("attempt_choices", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  attemptId: bigint("attempt_id", { mode: "number" }).notNull().references(() => attempts.id, { onDelete: "cascade" }),
  choiceId: bigint("choice_id", { mode: "number" }).notNull(),
  choiceText: varchar("choice_text", { length: 500 }),
}, (t) => ({
  uqAttemptChoice: unique().on(t.attemptId, t.choiceId),
  choiceIdIdx: index("idx_attempt_choices_choice_id").on(t.choiceId),
}));

export const excelUploadLogs = pgTable("excel_upload_logs", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  uploadedBy: bigint("uploaded_by", { mode: "number" }).notNull().references(() => users.id),
  departmentId: bigint("department_id", { mode: "number" }).references(() => departments.id),
  fileName: varchar("file_name", { length: 255 }).notNull(),
  totalRows: integer("total_rows").notNull(),
  successRows: integer("success_rows").notNull(),
  failRows: integer("fail_rows").notNull(),
  errorDetail: text("error_detail"),
  targetType: varchar("target_type", { length: 20 }).notNull().default("PROBLEM"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const tags = pgTable("tags", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  name: varchar("name", { length: 100 }).notNull().unique(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const problemTags = pgTable("problem_tags", {
  problemId: bigint("problem_id", { mode: "number" }).notNull().references(() => problems.id, { onDelete: "cascade" }),
  tagId: bigint("tag_id", { mode: "number" }).notNull().references(() => tags.id, { onDelete: "cascade" }),
}, (t) => ({
  pk: primaryKey({ columns: [t.problemId, t.tagId] }),
}));

export const auditLogs = pgTable("audit_logs", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  actorId: bigint("actor_id", { mode: "number" }).notNull().references(() => users.id),
  action: varchar("action", { length: 50 }).notNull(),
  targetType: varchar("target_type", { length: 50 }).notNull(),
  targetId: bigint("target_id", { mode: "number" }),
  detail: jsonb("detail"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
```

> **주의(파리티):** `status`/`role`/`type`/`target_type`의 CHECK 제약은 현재 DB에 있다. Drizzle의 `varchar`만으론 CHECK가 빠지므로, 생성된 마이그레이션 SQL에 CHECK 제약을 손으로 보완하거나 후속 raw SQL 마이그레이션으로 추가한다. 초기 마이그레이션 생성 후 현재 `schema.sql`과 대조해 누락된 CHECK를 채운다(아래 Step 6).

`web/lib/db/client.ts`:
```ts
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

// Vercel 서버리스 + Supabase 트랜잭션 풀러(6543): prepare 를 꺼야 한다.
let client: ReturnType<typeof postgres> | undefined;

export function getDb() {
  if (!client) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL 이 설정되지 않았습니다.");
    client = postgres(url, { prepare: false });
  }
  return drizzle(client, { schema });
}
```

`web/drizzle.config.ts`:
```ts
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./lib/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: { url: process.env.DATABASE_URL! },
});
```

`web/test/db.ts`:
```ts
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { sql } from "drizzle-orm";
import * as schema from "../lib/db/schema";

const url = process.env.DATABASE_URL ?? "postgres://probank:probank_dev@localhost:5434/probank_test";

export function testDb() {
  return drizzle(postgres(url, { prepare: false, max: 1 }), { schema });
}

export async function migrateTestDb() {
  const migrationClient = postgres(url, { prepare: false, max: 1 });
  await migrate(drizzle(migrationClient), { migrationsFolder: "./drizzle" });
  await migrationClient.end();
}

// FK 순서를 신경 쓰지 않도록 CASCADE 로 전부 비운다.
export async function truncateAll(db: ReturnType<typeof testDb>) {
  await db.execute(sql`TRUNCATE TABLE
    audit_logs, problem_tags, tags, excel_upload_logs, attempt_choices,
    attempt_blank_answers, attempts, problem_blanks, problem_answers,
    problem_choices, problems, users, departments RESTART IDENTITY CASCADE`);
}
```

- [ ] **Step 5: 마이그레이션 생성 + 적용**

Run:
```bash
cd web && DATABASE_URL=postgres://probank:probank_dev@localhost:5434/probank_test pnpm drizzle:generate
```
그런 다음 생성된 `web/drizzle/0000_*.sql`을 현재 `backend/src/main/resources/schema.sql`과 대조해 **CHECK 제약(status/role/type/target_type)** 이 빠졌으면 그 SQL 파일에 손으로 추가한다.

- [ ] **Step 6: 통과 확인 (GREEN)**

Run: `cd web && pnpm test lib/db/schema.test.ts`
Expected: 3 test 통과(라운드트립·부서코드 유니크·문항번호 유니크).

- [ ] **Step 7: Commit**

```bash
git add web/lib/db web/drizzle.config.ts web/drizzle web/test/db.ts web/lib/db/schema.test.ts
git commit -m "feat: add Drizzle schema mirroring schema.sql with an integration test harness"
```

---

### Task 4: JWT 세션 + 쿠키 + getAuthUser

**Files:**
- Create: `web/lib/auth/types.ts`
- Create: `web/lib/auth/jwt.ts`
- Create: `web/lib/auth/session.ts`
- Create: `web/lib/auth/jwt.test.ts`

**Interfaces:**
- Consumes: 없음
- Produces:
  - `type UserRole = "SUPER_ADMIN" | "DEPT_ADMIN" | "EMPLOYEE"`.
  - `interface AuthUser { userId:number; employeeNo:string; name:string; role:UserRole; departmentId:number; mustChangePassword:boolean }`.
  - `signSession(user: AuthUser): Promise<string>` — HS256, 90분 만료.
  - `verifySession(token: string): Promise<AuthUser | null>` — 위조·만료면 `null`.
  - `SESSION_COOKIE` = `{ name:"session", maxAge:5400 }`.
  - `readAuthUser(cookieValue: string | undefined): Promise<AuthUser | null>` — 게이트·`getAuthUser`가 사용.

- [ ] **Step 1: 실패하는 테스트 작성**

`web/lib/auth/jwt.test.ts`:
```ts
import { describe, it, expect, beforeAll } from "vitest";
import { signSession, verifySession } from "./jwt";
import type { AuthUser } from "./types";

const user: AuthUser = {
  userId: 1, employeeNo: "1001", name: "홍길동", role: "EMPLOYEE", departmentId: 10, mustChangePassword: false,
};

beforeAll(() => {
  process.env.SESSION_JWT_SECRET = "test-secret-at-least-32-bytes-long-000";
});

describe("jwt session", () => {
  it("round-trips the auth user", async () => {
    const token = await signSession(user);
    expect(await verifySession(token)).toEqual(user);
  });

  it("returns null for a tampered token", async () => {
    const token = await signSession(user);
    expect(await verifySession(token + "x")).toBeNull();
  });

  it("returns null for an expired token", async () => {
    const token = await signSession(user, 0); // 즉시 만료
    await new Promise((r) => setTimeout(r, 1100));
    expect(await verifySession(token)).toBeNull();
  });
});
```

- [ ] **Step 2: 실패 확인 (RED)**

Run: `cd web && pnpm test lib/auth/jwt.test.ts`
Expected: 모듈 없음으로 실패.

- [ ] **Step 3: 구현**

`web/lib/auth/types.ts`:
```ts
export type UserRole = "SUPER_ADMIN" | "DEPT_ADMIN" | "EMPLOYEE";

export interface AuthUser {
  userId: number;
  employeeNo: string;
  name: string;
  role: UserRole;
  departmentId: number;
  mustChangePassword: boolean;
}
```

`web/lib/auth/jwt.ts`:
```ts
import { SignJWT, jwtVerify } from "jose";
import type { AuthUser } from "./types";

const DEFAULT_TTL_SECONDS = 90 * 60; // 현재 세션 타임아웃 90분

function secret(): Uint8Array {
  const value = process.env.SESSION_JWT_SECRET;
  if (!value) throw new Error("SESSION_JWT_SECRET 이 설정되지 않았습니다.");
  return new TextEncoder().encode(value);
}

export async function signSession(user: AuthUser, ttlSeconds = DEFAULT_TTL_SECONDS): Promise<string> {
  return new SignJWT({ ...user })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(Math.floor(Date.now() / 1000) + ttlSeconds)
    .sign(secret());
}

export async function verifySession(token: string): Promise<AuthUser | null> {
  try {
    const { payload } = await jwtVerify(token, secret());
    return {
      userId: payload.userId as number,
      employeeNo: payload.employeeNo as string,
      name: payload.name as string,
      role: payload.role as AuthUser["role"],
      departmentId: payload.departmentId as number,
      mustChangePassword: payload.mustChangePassword as boolean,
    };
  } catch {
    return null;
  }
}
```

`web/lib/auth/session.ts`:
```ts
import { cookies } from "next/headers";
import { signSession, verifySession } from "./jwt";
import type { AuthUser } from "./types";

export const SESSION_COOKIE = { name: "session", maxAge: 90 * 60 } as const;

export async function readAuthUser(cookieValue: string | undefined): Promise<AuthUser | null> {
  if (!cookieValue) return null;
  return verifySession(cookieValue);
}

// 라우트(서버 컴포넌트/핸들러)에서 현재 사용자를 얻는다. 현재 @LoginUser 대응.
export async function getAuthUser(): Promise<AuthUser | null> {
  const store = await cookies();
  return readAuthUser(store.get(SESSION_COOKIE.name)?.value);
}

// 로그인 성공 시(서브플랜 2) 호출. secure 는 SESSION_COOKIE_SECURE env 로 전환.
export async function setSessionCookie(user: AuthUser): Promise<void> {
  const store = await cookies();
  store.set(SESSION_COOKIE.name, await signSession(user), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.SESSION_COOKIE_SECURE === "true",
    path: "/",
    maxAge: SESSION_COOKIE.maxAge,
  });
}

export async function clearSessionCookie(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE.name);
}
```

- [ ] **Step 4: 통과 확인 (GREEN)**

Run: `cd web && pnpm test lib/auth/jwt.test.ts`
Expected: 3 test 통과.

- [ ] **Step 5: Commit**

```bash
git add web/lib/auth/types.ts web/lib/auth/jwt.ts web/lib/auth/session.ts web/lib/auth/jwt.test.ts
git commit -m "feat: add stateless JWT session cookies mirroring the 90m Lax session"
```

---

### Task 5: 인증 게이트(순수 로직) + 역할 가드 + 미들웨어 배선

**Files:**
- Create: `web/lib/auth/gate.ts`
- Create: `web/lib/auth/guard.ts`
- Create: `web/middleware.ts`
- Create: `web/lib/auth/gate.test.ts`

**Interfaces:**
- Consumes: `AuthUser`(Task 4), `ErrorCode`·`okMessage`(Task 2)
- Produces:
  - `evaluateGate(pathname:string, method:string, user:AuthUser|null)` → `{ action:"allow" } | { action:"reject", status:number, body:{resultCode:number,resultMsg:string} }`.
  - `requireRole(user:AuthUser, ...roles:UserRole[]): void` — 불일치 시 `BizError(ACCESS_AUTH_DENIED)`.

**배경(현재 `SessionCheckFilter` 미러):** `/api/**`만 게이트. `OPTIONS`·`/api/auth/login`·`/api/auth/session`은 통과. 세션 없으면 401 `EMPTY_SESSION`. `mustChangePassword`면 `/api/auth/*` 외 접근을 **200 + 1012**로 차단(현재도 PASSWORD_CHANGE_REQUIRED는 HTTP 200).

- [ ] **Step 1: 실패하는 테스트 작성**

`web/lib/auth/gate.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { evaluateGate, requireRole } from "./gate";
import { BizError } from "../http/errors";
import type { AuthUser } from "./types";

const employee: AuthUser = { userId: 1, employeeNo: "1001", name: "홍", role: "EMPLOYEE", departmentId: 10, mustChangePassword: false };
const mustChange: AuthUser = { ...employee, mustChangePassword: true };

describe("evaluateGate", () => {
  it("allows OPTIONS", () => {
    expect(evaluateGate("/api/problems", "OPTIONS", null).action).toBe("allow");
  });
  it("allows the public auth paths without a session", () => {
    expect(evaluateGate("/api/auth/login", "POST", null).action).toBe("allow");
    expect(evaluateGate("/api/auth/session", "GET", null).action).toBe("allow");
  });
  it("rejects a protected path without a session as 401 EMPTY_SESSION", () => {
    const d = evaluateGate("/api/problems", "GET", null);
    expect(d).toEqual({ action: "reject", status: 401, body: { resultCode: 980, resultMsg: "세션 정보가 없습니다." } });
  });
  it("allows a logged-in user on a protected path", () => {
    expect(evaluateGate("/api/problems", "GET", employee).action).toBe("allow");
  });
  it("blocks mustChangePassword on non-auth paths with 200 + 1012", () => {
    const d = evaluateGate("/api/problems", "GET", mustChange);
    expect(d).toEqual({ action: "reject", status: 200, body: { resultCode: 1012, resultMsg: "비밀번호 변경이 필요합니다." } });
  });
  it("lets mustChangePassword reach the auth paths (to change it)", () => {
    expect(evaluateGate("/api/auth/change-password", "POST", mustChange).action).toBe("allow");
  });
});

describe("requireRole", () => {
  it("passes when the role matches", () => {
    expect(() => requireRole(employee, "EMPLOYEE", "DEPT_ADMIN")).not.toThrow();
  });
  it("throws ACCESS_AUTH_DENIED when it does not", () => {
    expect(() => requireRole(employee, "SUPER_ADMIN")).toThrow(BizError);
  });
});
```

- [ ] **Step 2: 실패 확인 (RED)**

Run: `cd web && pnpm test lib/auth/gate.test.ts`
Expected: 모듈 없음으로 실패.

- [ ] **Step 3: 구현**

`web/lib/auth/gate.ts`:
```ts
import { ErrorCode } from "../http/errorCode";
import type { AuthUser, UserRole } from "./types";

const PUBLIC_PATHS = new Set(["/api/auth/login", "/api/auth/session"]);

export type GateDecision =
  | { action: "allow" }
  | { action: "reject"; status: number; body: { resultCode: number; resultMsg: string } };

// 현재 SessionCheckFilter.shouldNotFilter + doFilterInternal 미러.
export function evaluateGate(pathname: string, method: string, user: AuthUser | null): GateDecision {
  if (method === "OPTIONS") return { action: "allow" };
  if (!pathname.startsWith("/api/")) return { action: "allow" };
  if (PUBLIC_PATHS.has(pathname)) return { action: "allow" };

  if (!user) {
    return { action: "reject", status: 401, body: { resultCode: ErrorCode.EMPTY_SESSION.code, resultMsg: ErrorCode.EMPTY_SESSION.message } };
  }
  if (user.mustChangePassword && !pathname.startsWith("/api/auth/")) {
    // 현재도 PASSWORD_CHANGE_REQUIRED 는 HTTP 200 으로 나간다(프론트가 resultCode 로 분기).
    return { action: "reject", status: 200, body: { resultCode: ErrorCode.PASSWORD_CHANGE_REQUIRED.code, resultMsg: ErrorCode.PASSWORD_CHANGE_REQUIRED.message } };
  }
  return { action: "allow" };
}

export { requireRole } from "./guard";
```

`web/lib/auth/guard.ts`:
```ts
import { BizError } from "../http/errors";
import { ErrorCode } from "../http/errorCode";
import type { AuthUser, UserRole } from "./types";

// 현재 RoleCheckInterceptor 미러: @RequireRole 대응.
export function requireRole(user: AuthUser, ...roles: UserRole[]): void {
  if (!roles.includes(user.role)) {
    throw new BizError(ErrorCode.ACCESS_AUTH_DENIED);
  }
}
```

`web/middleware.ts` (얇은 배선 — 순수 로직은 `evaluateGate`가 검증됨):
```ts
import { NextResponse, type NextRequest } from "next/server";
import { verifySession } from "./lib/auth/jwt";
import { evaluateGate } from "./lib/auth/gate";
import { SESSION_COOKIE } from "./lib/auth/session";

export async function middleware(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE.name)?.value;
  const user = token ? await verifySession(token) : null;
  const decision = evaluateGate(request.nextUrl.pathname, request.method, user);
  if (decision.action === "reject") {
    return NextResponse.json(decision.body, { status: decision.status });
  }
  return NextResponse.next();
}

// /api/** 만 게이트. 정적 자원·페이지는 통과(페이지 인가는 프론트가 담당, 현재와 동일).
export const config = { matcher: ["/api/:path*"] };
```

- [ ] **Step 4: 통과 확인 (GREEN)**

Run: `cd web && pnpm test lib/auth/gate.test.ts`
Expected: 8 test 통과.

- [ ] **Step 5: 빌드 확인(미들웨어 컴파일)**

Run: `cd web && pnpm build`
Expected: 빌드 성공(미들웨어 포함).

- [ ] **Step 6: Commit**

```bash
git add web/lib/auth/gate.ts web/lib/auth/guard.ts web/middleware.ts web/lib/auth/gate.test.ts
git commit -m "feat: add the auth gate and role guard mirroring the session filter"
```

---

### Task 6: 부트스트랩 시드(총괄관리자 + 본사)

**Files:**
- Create: `web/lib/bootstrap.ts`
- Create: `web/scripts/bootstrap.ts`
- Create: `web/lib/bootstrap.test.ts`

**Interfaces:**
- Consumes: `schema`(Task 3), `bcryptjs`
- Produces: `bootstrap(db): Promise<void>` — 총괄관리자가 없을 때만 본사(HQ) 부서 + 총괄관리자 생성(멱등).

**배경(현재 `SuperAdminBootstrapRunner` 미러):** `existsSuperAdmin`이면 즉시 반환. 아니면 코드 `HQ`·이름 `본사`·`ACTIVE` 부서를 없으면 만들고, 사번/이메일/비밀번호를 env(`BOOTSTRAP_ADMIN_*`)에서 받아 이름 `총괄관리자`·역할 `SUPER_ADMIN`·`ACTIVE`·`mustChangePassword=true`·bcrypt 해시로 생성. 서버리스엔 `CommandLineRunner`가 없으므로 배포 후 **일회성 스크립트**로 실행한다.

- [ ] **Step 1: 실패하는 통합 테스트 작성**

`web/lib/bootstrap.test.ts`:
```ts
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { migrateTestDb, testDb, truncateAll } from "../test/db";
import { departments, users } from "./db/schema";
import { bootstrap } from "./bootstrap";

const db = testDb();

beforeAll(async () => {
  await migrateTestDb();
  process.env.BOOTSTRAP_ADMIN_EMPLOYEE_NO = "admin";
  process.env.BOOTSTRAP_ADMIN_EMAIL = "admin@company.local";
  process.env.BOOTSTRAP_ADMIN_PASSWORD = "changeme1234";
});
beforeEach(async () => {
  await truncateAll(db);
});

describe("bootstrap", () => {
  it("creates the HQ department and a super admin when none exists", async () => {
    await bootstrap(db);

    const [hq] = await db.select().from(departments).where(eq(departments.code, "HQ"));
    expect(hq.name).toBe("본사");

    const [admin] = await db.select().from(users).where(eq(users.role, "SUPER_ADMIN"));
    expect(admin.employeeNo).toBe("admin");
    expect(admin.name).toBe("총괄관리자");
    expect(admin.mustChangePassword).toBe(true);
    expect(admin.departmentId).toBe(hq.id);
    expect(await bcrypt.compare("changeme1234", admin.passwordHash)).toBe(true);
  });

  it("is idempotent — a second run creates no second admin", async () => {
    await bootstrap(db);
    await bootstrap(db);
    const admins = await db.select().from(users).where(eq(users.role, "SUPER_ADMIN"));
    expect(admins).toHaveLength(1);
  });
});
```

- [ ] **Step 2: 실패 확인 (RED)**

Run: `cd web && pnpm test lib/bootstrap.test.ts`
Expected: 모듈 없음으로 실패.

- [ ] **Step 3: 구현**

`web/lib/bootstrap.ts`:
```ts
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import type { getDb } from "./db/client";
import { departments, users } from "./db/schema";

type Db = ReturnType<typeof getDb>;

const HQ_CODE = "HQ";
const HQ_NAME = "본사";

export async function bootstrap(db: Db): Promise<void> {
  const existing = await db.select({ id: users.id }).from(users).where(eq(users.role, "SUPER_ADMIN")).limit(1);
  if (existing.length > 0) return;

  let [hq] = await db.select().from(departments).where(eq(departments.code, HQ_CODE));
  if (!hq) {
    [hq] = await db.insert(departments).values({ name: HQ_NAME, code: HQ_CODE, status: "ACTIVE" }).returning();
  }

  const employeeNo = required("BOOTSTRAP_ADMIN_EMPLOYEE_NO");
  const email = required("BOOTSTRAP_ADMIN_EMAIL");
  const password = required("BOOTSTRAP_ADMIN_PASSWORD");

  await db.insert(users).values({
    employeeNo,
    name: "총괄관리자",
    email,
    passwordHash: await bcrypt.hash(password, 10),
    departmentId: hq.id,
    role: "SUPER_ADMIN",
    status: "ACTIVE",
    mustChangePassword: true,
  });
}

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} 이 설정되지 않았습니다.`);
  return value;
}
```

`web/scripts/bootstrap.ts`:
```ts
import { getDb } from "../lib/db/client";
import { bootstrap } from "../lib/bootstrap";

bootstrap(getDb())
  .then(() => {
    console.log("bootstrap 완료");
    process.exit(0);
  })
  .catch((error) => {
    console.error("bootstrap 실패", error);
    process.exit(1);
  });
```

- [ ] **Step 4: 통과 확인 (GREEN)**

Run: `cd web && pnpm test lib/bootstrap.test.ts`
Expected: 2 test 통과.

- [ ] **Step 5: 전체 스위트 확인**

Run: `cd web && pnpm test`
Expected: Task 1~6 전부 통과. `pnpm build` 성공.

- [ ] **Step 6: Commit**

```bash
git add web/lib/bootstrap.ts web/scripts/bootstrap.ts web/lib/bootstrap.test.ts
git commit -m "feat: add an idempotent super-admin bootstrap seed"
```

---

## Self-Review 결과

- **스펙 커버리지:** 스펙 섹션 A(토폴로지·`web/` 구조)→Task 1·`vercel.json`; 섹션 B(응답 봉투·에러 프레임워크→Task 2, Drizzle DDL 계약→Task 3, JWT→Task 4, 게이트·역할가드→Task 5, bcrypt→Task 6); 섹션 D 서브플랜 1(Foundation) 전 항목이 Task로 존재. Supabase 풀러(`prepare:false`)→Task 3 `client.ts`. 로그인·비밀번호변경 엔드포인트 자체는 **서브플랜 2** 범위라 여기선 게이트만 만든다(공개 경로 예약).
- **플레이스홀더 스캔:** 없음. 모든 코드 스텝에 실제 코드. Task 3 Step 5의 "CHECK 제약 보완"은 구체 지시(생성 SQL을 `schema.sql`과 대조)라 플레이스홀더가 아니다.
- **타입 일관성:** `AuthUser`(Task 4)가 Task 5 게이트·미들웨어와 동일 필드. `ErrorCode`(Task 2)를 Task 5 게이트·가드가 동일 참조. `ok`/`okMessage`(Task 2)를 Task 2 래퍼가 사용. `testDb`/`migrateTestDb`/`truncateAll`(Task 3)을 Task 6 테스트가 동일 시그니처로 사용. `getDb`(Task 3)를 Task 6 스크립트가 사용.

## Execution Handoff

이 계획을 다 만들었다. 두 가지 실행 방식이 있다:

1. **Subagent-Driven (권장)** — Task마다 새 서브에이전트, 사이사이 리뷰, 빠른 반복
2. **Inline Execution** — 이 세션에서 executing-plans로 배치 실행 + 체크포인트

어느 방식으로 진행할까?
