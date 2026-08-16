# 이관 서브플랜 3 — 부서·계정 관리 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Foundation+Auth 레일 위에 **부서·계정 관리 API**를 파리티로 올린다 — 부서 CRUD, 계정 CRUD(마지막 총괄관리자 보호 포함), 감사 로그, 계정 엑셀 일괄 등록(행별 격리). 단 **메일은 D6/D7에 따라 제거**하고 임시 비밀번호를 응답에 담는다(승인된 유일한 의도적 이탈).

**Architecture:** Auth와 동일한 3층 — route(`app/api/admin/**`, `requireActor("SUPER_ADMIN")`) → service(순수 TS, `BizError`) → DAO(Drizzle). 쓰기는 Spring `@Transactional` 경계를 미러해 `db.transaction`으로 묶는다(부서/계정 생성·수정 = 본체+감사 한 트랜잭션). 엑셀은 **행마다 독립 트랜잭션**(Spring `REQUIRES_NEW` 미러)으로 한 행의 실패가 다른 행을 죽이지 않는다. 착수 전에 Auth 최종 리뷰가 파킹한 정리(M3 `Db` 위치·M4 departments DAO·M5 raw SQL 헬퍼)를 먼저 끝낸다 — 이 서브플랜부터 엔드포인트가 배로 늘기 때문.

**Tech Stack:** Foundation·Auth와 동일 + **SheetJS(`xlsx`)** (POI 대체). 라우트는 `runtime = "nodejs"`.

**Spec:** `docs/superpowers/specs/2026-08-15-spring-to-next-migration-design.md` (D6/D7은 `docs/superpowers/specs/2026-08-14-deployment.md`)

## Global Constraints

- **성공 기준은 파리티.** 아래 값은 현재 Spring 코드(`DepartmentServiceImpl`·`UserAdminServiceImpl`·`ExcelAccountUploadServiceImpl`·`AccountProvisioningServiceImpl`·`AuditLogServiceImpl`·매퍼 XML)에서 실측한 계약이다. **에러 문구는 글자까지 동일**해야 한다.
- **역할**: 7개 엔드포인트 전부 **SUPER_ADMIN 전용**(Spring `@RequireRole` 클래스 레벨 미러). 역할 불일치 → 403/990.
- **부서**: 목록 `ORDER BY name`, 응답 `{id,name,code,status}`. 생성 = name(≤100)·code(≤50) 검증 → 중복 코드 사전검사("이미 존재하는 부서 코드입니다: <code>") → insert(ACTIVE) + 감사(`DEPARTMENT_CREATED`, detail `{code}`). 수정 = name 검증 + status 필수("부서 상태를 선택하세요.") + 존재 검사("존재하지 않는 부서입니다.") → name/status만 갱신 + 감사(`DEPARTMENT_UPDATED`, detail `{code,name,status}`). 검증 문구: "부서명을 입력하세요." / "부서명은 100자를 넘을 수 없습니다." / "부서 코드를 입력하세요." / "부서 코드는 50자를 넘을 수 없습니다."
- **계정 목록**: `JOIN departments`, 선택 필터 `departmentId`, `ORDER BY employee_no`. 항목 `{id,employeeNo,name,email,departmentId,departmentName,role,status,lastLoginAt}`.
- **계정 생성(D6 적용)**: 검증 순서 = 사번(필수·≤50) → 이름(필수·≤100) → 이메일(필수·정규식 `^[^\s@]+@[^\s@]+\.[^\s@]+$`·≤255) → 역할 필수 → 사번 중복("이미 존재하는 사번입니다: <no>") → 이메일 중복(**대소문자 무시**, "이미 사용 중인 회사 이메일입니다: <email>") → 부서 존재("존재하지 않는 부서입니다."). 임시 비밀번호 = 문자셋 `ABCDEFGHJKMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789`(혼동문자 I,L,O,l,o,0,1 제외)에서 **10자**, bcrypt(10) 해시, `must_change_password=true`, `status=ACTIVE`. insert + 감사(`USER_CREATED`, detail `{employeeNo}` — **비밀번호 절대 미포함**) 한 트랜잭션. **응답: `{employeeNo,name,email,temporaryPassword}`** (Spring의 `mailSent:true` 대체 — D6 승인 이탈).
- **계정 수정**: 검증 = 이름·이메일·역할·status 필수("계정 상태를 선택하세요.") → 계정 존재("존재하지 않는 계정입니다.") → 부서 존재 → 이메일 변경 시에만 중복 검사(`equalsIgnoreCase` 비교) → **관리자 접근 보호**: ① 본인 SUPER_ADMIN 해제 금지("본인의 총괄 관리자 역할은 스스로 해제할 수 없습니다.") ② 본인 비활성화 금지("본인 계정은 스스로 비활성화할 수 없습니다.") ③ 마지막 활성 SUPER_ADMIN의 역할해제·비활성화 금지("마지막 활성 총괄 관리자입니다. 다른 총괄 관리자를 먼저 지정한 뒤 역할 변경 또는 비활성화하세요.", `countActiveSuperAdminsExcluding(id)==0` 기준). 갱신 필드 = name/email/departmentId/role/status. 감사(`USER_UPDATED`, detail `{employeeNo,name,email,departmentId,role,status}`).
- **감사 로그(fail-closed)**: `record(actorId, action, targetType, targetId, detail)` — detail(객체)에 **키 이름에 "password"가 포함된 키가 재귀적으로 하나라도 있으면 거부(throw)**. null detail은 통과. `audit_logs.detail`은 jsonb.
- **엑셀 일괄 등록(행별 격리 + D7)**: 컬럼 순서 고정 = ①사번 ②이름 ③이메일 ④부서코드 ⑤역할(Enum명). 헤더 1행. **최대 데이터 500행**(초과 시 처리 전 전체 거부: "한 번에 업로드할 수 있는 데이터 행은 최대 500건입니다. 파일을 나눠 업로드하세요."). 행 검증 순서/문구 = 필수값("필수값이 누락되었습니다.") → 이메일 형식("유효한 회사 이메일 형식이 아닙니다.") → 사번 중복(파일 내+DB, "이미 존재하는 사번입니다: <no>") → 이메일 중복(파일 내 소문자화+DB, "이미 사용 중인 회사 이메일입니다: <email>") → 부서코드("존재하지 않는 부서코드입니다: <code>") → 역할("유효하지 않은 역할입니다: <text>"). 각 성공 행은 **독립 트랜잭션**(insert+감사)으로 커밋 — 뒤 행이 실패해도 유지. 행 저장 실패 → "계정 저장에 실패했습니다."(D6로 메일 문구 제거 — 이탈 기록). 종료 후 `excel_upload_logs` 기록(+감사 `ACCOUNT_EXCEL_UPLOADED`, detail `{fileName,totalRows,successRows,failRows}`). **응답: `{totalRows,successRows,failRows,errorDetail}` + D7 추가 필드 `successAccounts:[{rowNumber,employeeNo,name,email,temporaryPassword}]`** (프론트가 표시·다운로드용 — 서버는 파일을 만들지 않는다). errorDetail 형식 = `"행 N: <사유>"` 줄바꿈 연결(없으면 null→생략).
- **파일 오류 계약**: 멀티파트 파싱 실패 → **HTTP 200** + 1009 "파일을 업로드할 수 없습니다."(Spring `handleMultipartException` 미러). **file 필드 부재도 같은 200/1009로 통일**(Spring은 MissingServletRequestPart가 catch-all로 떨어져 200/−1 — 의도적 개선, 이탈 ⑥). 열 수 없는 파일(손상·암호·비엑셀) → 400 + **1013** "엑셀 파일을 읽을 수 없습니다. 손상되었거나 암호가 설정된 파일인지 확인한 뒤 다시 올려 주세요." 시트 없음 → 400 + 1013 "엑셀 파일에 시트가 없습니다. 첫 번째 시트에 계정 목록을 담아 다시 올려 주세요." **크기 상한 4MB**(Q6 승인: 플랫폼 안전값, Spring 20MB에서 하향) 초과 → 400 + **1015**(기본 문구).
- **트랜잭션 경계**: 부서 생성/수정·계정 생성/수정 = 본체+감사 한 트랜잭션(감사 실패 시 본체 롤백 — Spring 미러). 엑셀 = 업로드 로그+그 감사 한 트랜잭션, 행별 provision은 각각 독립.
- 커밋 메시지는 `feat:`/`fix:`/`docs:`/`refactor:` 영문 Conventional Commits.

**승인된 이탈(체크리스트에 기록할 것):** ① D6 — 메일 제거, 단건 응답에 `temporaryPassword`(감사·서버로그에는 절대 미기록) ② D7 — 일괄 응답에 `successAccounts` 추가 ③ 행 실패 문구에서 메일 언급 제거 ④ 파일 상한 20MB→4MB(1015) ⑤ SheetJS `blankrows:false`는 중간 빈 행을 건너뛰어, 빈 행이 섞인 파일에선 오류 행 번호가 엑셀 표기와 어긋날 수 있다(POI는 null 행만 스킵·번호 유지 — 실사용 파일엔 빈 행이 없어 실질 무영향, 미세 이탈로만 기록) ⑥ file 필드 부재 → 200/1009로 통일(Spring은 catch-all 200/−1 — 더 나은 안내로의 의도적 개선).

## Foundation·Auth에서 소비하는 인터페이스 (이미 존재)

- `web/lib/http/errors.ts`: `BizError`, `handleRoute`. `errorCode.ts`: `ErrorCode`(1000/1009/1013/1015/980/990 사용). `body.ts`: `readJson`, `asStringField`.
- `web/lib/auth/session.ts`: `getAuthUser`. `guard.ts`: `requireRole`. `types.ts`: `AuthUser`, `UserRole`.
- `web/lib/db/client.ts`: `getDb`. `schema.ts`: `departments, users, auditLogs, excelUploadLogs`. `users.ts`(DAO): `findByEmployeeNo` 등. `web/test/db.ts`: 하네스.

---

## File Structure

| 파일 | 책임 | Task |
|---|---|---|
| `docs/qa/2026-08-16-dept-users-parity-checklist.md` | 파리티 정답지(실측) + 승인 이탈 4건 | 1 |
| `web/lib/db/client.ts` | (수정) `Db`·`DbConn`(트랜잭션 겸용) 타입의 단일 출처 | 2 |
| `web/lib/db/raw.ts` | **신규.** `executeRows<T>()`·`parseUtcTimestamp()` — raw SQL 관용구 캡슐화 | 2 |
| `web/lib/db/users.ts` | (수정) `Db` import 전환 + raw 헬퍼 사용, Task 5에서 DAO 함수 추가 | 2·5 |
| `web/lib/db/departments.ts` | **신규.** 부서 DAO(findAll/findById/findByCode/insert/update) | 2 |
| `web/lib/auth/currentUser.ts` | **신규.** `requireActor(...roles)` — 세션+역할 검사 원스톱 | 2 |
| `web/lib/http/params.ts` | **신규.** `parseNumericParam` — Spring 타입불일치 핸들러(400+1000) 미러 | 2 |
| `web/lib/auth/authService.ts` | (수정) departments 직접 select → DAO 사용(M4) | 2 |
| `web/lib/audit/auditLog.ts` | **신규.** fail-closed 감사 기록 | 3 |
| `web/lib/audit/auditLog.test.ts` | 감사 로그 테스트 | 3 |
| `web/lib/admin/departmentService.ts` | 부서 CRUD 로직 | 4 |
| `web/lib/admin/departmentService.test.ts` | 부서 통합 테스트 | 4 |
| `web/app/api/admin/departments/route.ts` | GET(목록)/POST(생성) | 4 |
| `web/app/api/admin/departments/[id]/route.ts` | PUT(수정) | 4 |
| `web/app/api/admin/departments/route.test.ts` | 부서 라우트 테스트 | 4 |
| `web/lib/admin/userAdminService.ts` | 계정 목록/생성(D6)/수정(보호 규칙) + `generateTempPassword` | 5 |
| `web/lib/admin/userAdminService.test.ts` | 계정 통합 테스트 | 5 |
| `web/app/api/admin/users/route.ts` | GET(목록)/POST(생성) | 5 |
| `web/app/api/admin/users/[id]/route.ts` | PUT(수정) | 5 |
| `web/app/api/admin/users/route.test.ts` | 계정 라우트 테스트 | 5 |
| `web/lib/admin/accountExcel.ts` | SheetJS 파싱 + 행별 처리 + 업로드 로그(D7) | 6 |
| `web/lib/admin/accountExcel.test.ts` | 엑셀 통합 테스트(픽스처는 SheetJS로 생성) | 6 |
| `web/app/api/admin/users/excel-upload/route.ts` | POST 멀티파트(1009/1015 처리) | 6 |
| `web/app/api/admin/users/excel-upload/route.test.ts` | 멀티파트 라우트 테스트(성공·1009·1015) | 6 |
| `docs/qa/2026-08-16-dept-users-e2e-verification.md` | E2E 실측 기록 | 7 |

---

### Task 1: 파리티 체크리스트 작성 (현재 Spring 실측)

**Files:**
- Create: `docs/qa/2026-08-16-dept-users-parity-checklist.md`

**Interfaces:**
- Consumes: 현재 Spring 소스(위 Global Constraints가 실측 요약)
- Produces: Task 3~7 테스트의 정답지.

- [ ] **Step 1: 문서 작성**

Global Constraints의 실측 계약을 행 단위 표로 옮긴다. 최소 섹션·행:

| 섹션 | 행 |
|---|---|
| D(부서) | D1 목록 정렬·형태 / D2 생성 성공(+감사 detail `{code}`) / D3 name 누락·초과 / D4 code 누락·초과 / D5 중복 코드 문구 / D6 수정 성공(+감사) / D7 status 누락 / D8 없는 부서 / D9 역할: DEPT_ADMIN·EMPLOYEE → 403/990 |
| U(계정) | U1 목록(부서 필터·정렬) / U2 생성 성공 → `temporaryPassword` 10자·문자셋, must_change=true, 감사 `{employeeNo}`만 **[D6 이탈]** / U3~U6 검증 문구(사번/이름/이메일/역할) / U7 사번 중복 / U8 이메일 중복(대소문자) / U9 없는 부서 / U10 수정 성공 / U11 본인 역할해제 금지 / U12 본인 비활성화 금지 / U13 마지막 관리자 보호 / U14 이메일 미변경 시 중복검사 생략 |
| A(감사) | A1 password 키 거부(재귀) / A2 null detail 허용 / A3 액션명·targetType 목록 |
| X(엑셀) | X1 성공+실패 혼합 → 행별 격리(성공 행 커밋 유지) / X2 500행 초과 사전 거부 / X3~X8 행 검증 문구 6종 / X9 업로드 로그·감사 / X10 응답 형태+`successAccounts` **[D7 이탈]** / X11 파일 없음→200/1009 / X12 비엑셀→400/1013 / X13 4MB 초과→400/1015 **[이탈]** / X14 행 실패 문구 **[이탈: 메일 문구 제거]** |

문서 상단에 승인 이탈 4건(D6/D7/행문구/4MB)과 근거(deployment.md D6·D7, 이관 스펙 Q6·Q7)를 명시한다.

- [ ] **Step 2: Commit**

```bash
git add docs/qa/2026-08-16-dept-users-parity-checklist.md
git commit -m "docs: author the department/account parity checklist measured from Spring"
```

---

### Task 2: 파킹 정리 (M3·M4·M5) + `requireActor`

**Files:**
- Modify: `web/lib/db/client.ts`, `web/lib/db/users.ts`, `web/lib/auth/authService.ts`
- Create: `web/lib/db/raw.ts`, `web/lib/db/departments.ts`, `web/lib/auth/currentUser.ts`
- Create: `web/lib/db/departments.test.ts`

**Interfaces:**
- Produces (이후 전 Task가 소비):
  - `client.ts`: `export type Db = ReturnType<typeof getDb>;` `export type DbConn = Db | Parameters<Parameters<Db["transaction"]>[0]>[0];` (DAO는 `DbConn`을 받아 트랜잭션 안팎 겸용)
  - `raw.ts`: `executeRows<T>(db: DbConn, query: SQL): Promise<T[]>`, `parseUtcTimestamp(value: string | null): Date | null`
  - `departments.ts`: `findAllDepartments(db)`(ORDER BY name), `findDepartmentById(db, id)`, `findDepartmentByCode(db, code)`, `insertDepartment(db, {name,code})`(returning), `updateDepartment(db, {id,name,status})`
  - `currentUser.ts`: `requireActor(...roles: UserRole[]): Promise<AuthUser>` — 세션 없으면 `BizError(EMPTY_SESSION)`, 역할 불일치면 `requireRole`이 throw. roles 생략 시 세션만 검사.
  - `params.ts`: `parseNumericParam(value: string | null | undefined, name: string): number | null` — 빈 값이면 null, 숫자가 아니면 `BizError(1000, "요청 값의 형식이 올바르지 않습니다: <name>")`(→400). Spring `handleTypeMismatchException` 미러 — Foundation이 이월한 "파라미터 타입 불일치는 400" 발산을 여기서 해소한다.

- [ ] **Step 1: 실패하는 테스트 작성** — `web/lib/db/departments.test.ts`:

```ts
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { migrateTestDb, testDb, truncateAll } from "../../test/db";
import { findAllDepartments, findDepartmentByCode, findDepartmentById, insertDepartment, updateDepartment } from "./departments";

const db = testDb();
beforeAll(async () => { await migrateTestDb(); });
beforeEach(async () => { await truncateAll(db); });

describe("departments dao", () => {
  it("inserts, finds by id/code, lists ordered by name", async () => {
    // 정렬 단언은 ASCII 이름으로 — 한글 정렬은 DB 콜레이션(C vs en_US.utf8)에 따라 달라 플래키하다.
    const b = await insertDepartment(db, { name: "beta", code: "B1" });
    await insertDepartment(db, { name: "alpha", code: "A1" });
    expect((await findDepartmentById(db, b.id))?.code).toBe("B1");
    expect((await findDepartmentByCode(db, "A1"))?.name).toBe("alpha");
    expect((await findAllDepartments(db)).map((d) => d.name)).toEqual(["alpha", "beta"]);
  });
  it("updates only name and status", async () => {
    const d = await insertDepartment(db, { name: "이전", code: "C1" });
    await updateDepartment(db, { id: d.id, name: "이후", status: "INACTIVE" });
    const after = await findDepartmentById(db, d.id);
    expect(after?.name).toBe("이후");
    expect(after?.status).toBe("INACTIVE");
    expect(after?.code).toBe("C1"); // code 는 불변
  });
});
```

- [ ] **Step 2: RED 확인** — `cd web && pnpm test lib/db/departments.test.ts` → 모듈 없음.

- [ ] **Step 3: 구현**

`web/lib/db/client.ts`에 추가(기존 코드 유지):
```ts
export type Db = ReturnType<typeof getDb>;
// 트랜잭션 콜백 인자 타입. DAO 가 이 타입을 받으면 db.transaction 안팎 어디서든 재사용된다.
export type DbConn = Db | Parameters<Parameters<Db["transaction"]>[0]>[0];
```

`web/lib/db/raw.ts`:
```ts
import type { SQL } from "drizzle-orm";
import type { DbConn } from "./client";

// db.execute(raw) 의 이중 캐스팅을 한 곳에 가둔다(Auth 리뷰 M5).
export async function executeRows<T>(db: DbConn, query: SQL): Promise<T[]> {
  const rows = await db.execute(query);
  return rows as unknown as T[];
}

// timestamp(무 tz) 텍스트를 Drizzle 컨벤션(UTC, +0000)으로 파싱한다.
export function parseUtcTimestamp(value: string | null): Date | null {
  return value === null ? null : new Date(value.replace(" ", "T") + "+0000");
}
```

`web/lib/db/users.ts` 수정: `export type Db` 제거 → `import type { DbConn } from "./client";` 후 전 함수 시그니처를 `DbConn`으로, `incrementFailedLogin`의 추출을 `executeRows<{ locked_until: string | null }>` + `parseUtcTimestamp`로 교체(동작 불변 — 기존 5개 테스트가 회귀 그물).

`web/lib/db/departments.ts`:
```ts
import { asc, eq } from "drizzle-orm";
import type { DbConn } from "./client";
import { departments } from "./schema";

export async function findAllDepartments(db: DbConn) {
  return db.select().from(departments).orderBy(asc(departments.name));
}
export async function findDepartmentById(db: DbConn, id: number) {
  return (await db.select().from(departments).where(eq(departments.id, id)).limit(1))[0];
}
export async function findDepartmentByCode(db: DbConn, code: string) {
  return (await db.select().from(departments).where(eq(departments.code, code)).limit(1))[0];
}
export async function insertDepartment(db: DbConn, input: { name: string; code: string }) {
  const [row] = await db.insert(departments).values({ name: input.name, code: input.code, status: "ACTIVE" }).returning();
  return row;
}
export async function updateDepartment(db: DbConn, input: { id: number; name: string; status: string }) {
  await db.update(departments).set({ name: input.name, status: input.status }).where(eq(departments.id, input.id));
}
```

`web/lib/http/params.ts`:
```ts
import { BizError } from "./errors";
import { ErrorCode } from "./errorCode";

// Spring MethodArgumentTypeMismatchException 핸들러 미러: 잘못된 쿼리/경로 숫자 파라미터는
// 400 + 1000 + "요청 값의 형식이 올바르지 않습니다: <이름>" 으로 나간다(BizError → bizStatus 400).
export function parseNumericParam(value: string | null | undefined, name: string): number | null {
  if (value == null || value === "") return null;
  const n = Number(value);
  if (!Number.isFinite(n)) {
    throw new BizError(ErrorCode.INPUT_VALUE_INVALID, "요청 값의 형식이 올바르지 않습니다: " + name);
  }
  return n;
}
```

`web/lib/auth/currentUser.ts`:
```ts
import { ErrorCode } from "../http/errorCode";
import { BizError } from "../http/errors";
import { getAuthUser } from "./session";
import { requireRole } from "./guard";
import type { AuthUser, UserRole } from "./types";

// 라우트 1줄 관용구: const actor = await requireActor("SUPER_ADMIN");
// 미들웨어가 세션을 보장하지만, 라우트 단독 테스트·방어를 위해 한 번 더 검사한다(Spring 이중 구조 미러).
export async function requireActor(...roles: UserRole[]): Promise<AuthUser> {
  const user = await getAuthUser();
  if (!user) throw new BizError(ErrorCode.EMPTY_SESSION);
  if (roles.length > 0) requireRole(user, ...roles);
  return user;
}
```

`web/lib/auth/authService.ts` 수정: `sessionStatus`의 departments 직접 select를 `findDepartmentById(db, authUser.departmentId)`로 교체(M4). import 정리.

- [ ] **Step 4: GREEN + 전체 회귀** — `cd web && pnpm test` → 기존 73 + 신규 2 = **75 전부 통과**, `pnpm build` 성공.

- [ ] **Step 5: Commit**

```bash
git add web/lib/db/client.ts web/lib/db/raw.ts web/lib/db/users.ts web/lib/db/departments.ts web/lib/auth/currentUser.ts web/lib/http/params.ts web/lib/auth/authService.ts web/lib/db/departments.test.ts
git commit -m "refactor: settle parked cleanups (DbConn, departments dao, raw helpers, requireActor, parseNumericParam)"
```

---

### Task 3: 감사 로그 (fail-closed)

**Files:**
- Create: `web/lib/audit/auditLog.ts`, `web/lib/audit/auditLog.test.ts`

**Interfaces:**
- Produces: `recordAudit(db: DbConn, entry: { actorId: number; action: string; targetType: string; targetId: number | null; detail: Record<string, unknown> | null }): Promise<void>` — Task 4·5·6이 트랜잭션 안에서 호출.

- [ ] **Step 1: 실패하는 테스트 작성** — `web/lib/audit/auditLog.test.ts`:

```ts
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { migrateTestDb, testDb, truncateAll } from "../../test/db";
import { auditLogs, departments, users } from "../db/schema";
import { recordAudit } from "./auditLog";

const db = testDb();
async function seedActor() {
  const [d] = await db.insert(departments).values({ name: "부서", code: "D" + Math.random() }).returning();
  const [u] = await db.insert(users).values({
    employeeNo: "A" + Math.random(), name: "관리", email: "a" + Math.random() + "@x.local",
    passwordHash: "h", departmentId: d.id, role: "SUPER_ADMIN",
  }).returning();
  return u.id;
}
beforeAll(async () => { await migrateTestDb(); });
beforeEach(async () => { await truncateAll(db); });

describe("recordAudit (fail-closed)", () => {
  it("writes an audit row with jsonb detail", async () => {
    const actorId = await seedActor();
    await recordAudit(db, { actorId, action: "DEPARTMENT_CREATED", targetType: "DEPARTMENT", targetId: 7, detail: { code: "HQ" } });
    const rows = await db.select().from(auditLogs);
    expect(rows).toHaveLength(1);
    expect(rows[0].action).toBe("DEPARTMENT_CREATED");
    expect(rows[0].detail).toEqual({ code: "HQ" });
  });
  it("allows a null detail", async () => {
    const actorId = await seedActor();
    await recordAudit(db, { actorId, action: "X", targetType: "Y", targetId: null, detail: null });
    expect(await db.select().from(auditLogs)).toHaveLength(1);
  });
  it("rejects any key containing 'password' — recursively", async () => {
    const actorId = await seedActor();
    await expect(recordAudit(db, { actorId, action: "X", targetType: "Y", targetId: 1, detail: { temporaryPassword: "p" } }))
      .rejects.toThrow(/password/);
    await expect(recordAudit(db, { actorId, action: "X", targetType: "Y", targetId: 1, detail: { nested: { PassWordHash: "h" } } }))
      .rejects.toThrow(/password/);
    expect(await db.select().from(auditLogs)).toHaveLength(0); // fail-closed: 한 행도 안 남는다
  });
});
```

- [ ] **Step 2: RED 확인** — `pnpm test lib/audit/auditLog.test.ts`.

- [ ] **Step 3: 구현** — `web/lib/audit/auditLog.ts`:

```ts
import type { DbConn } from "../db/client";
import { auditLogs } from "../db/schema";

// Spring AuditLogServiceImpl 미러: detail 에 "password" 를 포함한 키가 재귀적으로 존재하면
// fail-closed 로 거부한다. 임시 비밀번호가 감사 로그로 새는 사고를 구조적으로 막는다.
function findPasswordKey(value: unknown): string | null {
  if (Array.isArray(value)) {
    for (const item of value) { const hit = findPasswordKey(item); if (hit) return hit; }
    return null;
  }
  if (value !== null && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      if (key.toLowerCase().includes("password")) return key;
      const hit = findPasswordKey(child); if (hit) return hit;
    }
  }
  return null;
}

export async function recordAudit(db: DbConn, entry: {
  actorId: number; action: string; targetType: string; targetId: number | null;
  detail: Record<string, unknown> | null;
}): Promise<void> {
  if (entry.detail !== null) {
    const offending = findPasswordKey(entry.detail);
    if (offending) throw new Error(`audit detail must not contain a password-related key: '${offending}'`);
  }
  await db.insert(auditLogs).values({
    actorId: entry.actorId, action: entry.action, targetType: entry.targetType,
    targetId: entry.targetId, detail: entry.detail,
  });
}
```

- [ ] **Step 4: GREEN** — 3건 통과. **Step 5: Commit**

```bash
git add web/lib/audit
git commit -m "feat: add fail-closed audit logging mirroring AuditLogServiceImpl"
```

---

### Task 4: 부서 API (service + routes)

**Files:**
- Create: `web/lib/admin/departmentService.ts`, `web/lib/admin/departmentService.test.ts`
- Create: `web/app/api/admin/departments/route.ts`, `web/app/api/admin/departments/[id]/route.ts`, `web/app/api/admin/departments/route.test.ts`

**Interfaces:**
- Consumes: departments DAO(Task 2), `recordAudit`(Task 3), `requireActor`(Task 2)
- Produces: `listDepartments(db)`, `createDepartment(db, input, actorId)`, `updateDepartmentInfo(db, id, input, actorId)`; `GET/POST /api/admin/departments`, `PUT /api/admin/departments/{id}`.

- [ ] **Step 1: 실패하는 서비스 테스트 작성** — `web/lib/admin/departmentService.test.ts` (요지: 성공 2 + 검증 문구 6 + 감사 검증):

```ts
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { migrateTestDb, testDb, truncateAll } from "../../test/db";
import { auditLogs, departments, users } from "../db/schema";
import { BizError } from "../http/errors";
import { createDepartment, listDepartments, updateDepartmentInfo } from "./departmentService";

const db = testDb();
let actorId: number;
async function seedActor() {
  const [d] = await db.insert(departments).values({ name: "본사", code: "HQ" }).returning();
  const [u] = await db.insert(users).values({
    employeeNo: "admin", name: "총괄", email: "admin@x.local", passwordHash: "h",
    departmentId: d.id, role: "SUPER_ADMIN",
  }).returning();
  return u.id;
}
function msg(fn: () => Promise<unknown>): Promise<string> {
  return fn().then(() => { throw new Error("expected throw"); }, (e) => {
    if (e instanceof BizError) return e.message; throw e;
  });
}
beforeAll(async () => { await migrateTestDb(); });
beforeEach(async () => { await truncateAll(db); actorId = await seedActor(); });

describe("createDepartment", () => {
  it("creates ACTIVE and records audit {code}", async () => {
    await createDepartment(db, { name: "개발팀", code: "DEV" }, actorId);
    const rows = await listDepartments(db);
    expect(rows.map((r) => r.code)).toContain("DEV");
    const [audit] = (await db.select().from(auditLogs)).filter((a) => a.action === "DEPARTMENT_CREATED");
    expect(audit.detail).toEqual({ code: "DEV" });
  });
  it("rejects blank/overlong name and code with the exact messages", async () => {
    expect(await msg(() => createDepartment(db, { name: " ", code: "X" }, actorId))).toBe("부서명을 입력하세요.");
    expect(await msg(() => createDepartment(db, { name: "a".repeat(101), code: "X" }, actorId))).toBe("부서명은 100자를 넘을 수 없습니다.");
    expect(await msg(() => createDepartment(db, { name: "팀", code: " " }, actorId))).toBe("부서 코드를 입력하세요.");
    expect(await msg(() => createDepartment(db, { name: "팀", code: "c".repeat(51) }, actorId))).toBe("부서 코드는 50자를 넘을 수 없습니다.");
  });
  it("rejects a duplicate code with the exact message", async () => {
    expect(await msg(() => createDepartment(db, { name: "중복", code: "HQ" }, actorId))).toBe("이미 존재하는 부서 코드입니다: HQ");
  });
});

describe("updateDepartmentInfo", () => {
  it("updates name/status only and records audit", async () => {
    const [dept] = (await listDepartments(db)).filter((d) => d.code === "HQ");
    await updateDepartmentInfo(db, dept.id, { name: "본사(개칭)", status: "INACTIVE" }, actorId);
    const after = (await listDepartments(db)).find((d) => d.id === dept.id)!;
    expect(after.name).toBe("본사(개칭)");
    expect(after.status).toBe("INACTIVE");
  });
  it("rejects missing status and unknown id with the exact messages", async () => {
    const [dept] = await listDepartments(db);
    expect(await msg(() => updateDepartmentInfo(db, dept.id, { name: "x", status: undefined }, actorId))).toBe("부서 상태를 선택하세요.");
    expect(await msg(() => updateDepartmentInfo(db, 999999, { name: "x", status: "ACTIVE" }, actorId))).toBe("존재하지 않는 부서입니다.");
  });
});
```

- [ ] **Step 2: RED 확인.**

- [ ] **Step 3: 구현** — `web/lib/admin/departmentService.ts`:

```ts
import type { Db } from "../db/client";
import { findAllDepartments, findDepartmentByCode, findDepartmentById, insertDepartment, updateDepartment } from "../db/departments";
import { recordAudit } from "../audit/auditLog";
import { BizError } from "../http/errors";
import { ErrorCode } from "../http/errorCode";

const NAME_MAX = 100;
const CODE_MAX = 50;

function validateName(name: string | undefined): asserts name is string {
  if (name == null || name.trim() === "") throw new BizError(ErrorCode.INPUT_VALUE_INVALID, "부서명을 입력하세요.");
  if (name.length > NAME_MAX) throw new BizError(ErrorCode.INPUT_VALUE_INVALID, `부서명은 ${NAME_MAX}자를 넘을 수 없습니다.`);
}
function validateCode(code: string | undefined): asserts code is string {
  if (code == null || code.trim() === "") throw new BizError(ErrorCode.INPUT_VALUE_INVALID, "부서 코드를 입력하세요.");
  if (code.length > CODE_MAX) throw new BizError(ErrorCode.INPUT_VALUE_INVALID, `부서 코드는 ${CODE_MAX}자를 넘을 수 없습니다.`);
}

export async function listDepartments(db: Db) {
  return (await findAllDepartments(db)).map((d) => ({ id: d.id, name: d.name, code: d.code, status: d.status }));
}

export async function createDepartment(db: Db, input: { name?: string; code?: string }, actorId: number): Promise<void> {
  validateName(input.name);
  validateCode(input.code);
  if (await findDepartmentByCode(db, input.code)) {
    throw new BizError(ErrorCode.INPUT_VALUE_INVALID, "이미 존재하는 부서 코드입니다: " + input.code);
  }
  // insert + 감사 = 한 트랜잭션(Spring @Transactional 미러): 감사 실패 시 부서 행도 롤백.
  await db.transaction(async (tx) => {
    const row = await insertDepartment(tx, { name: input.name!, code: input.code! });
    await recordAudit(tx, { actorId, action: "DEPARTMENT_CREATED", targetType: "DEPARTMENT", targetId: row.id, detail: { code: row.code } });
  });
}

export async function updateDepartmentInfo(db: Db, id: number, input: { name?: string; status?: string }, actorId: number): Promise<void> {
  validateName(input.name);
  if (input.status == null) throw new BizError(ErrorCode.INPUT_VALUE_INVALID, "부서 상태를 선택하세요.");
  const department = await findDepartmentById(db, id);
  if (!department) throw new BizError(ErrorCode.INPUT_VALUE_INVALID, "존재하지 않는 부서입니다.");
  await db.transaction(async (tx) => {
    await updateDepartment(tx, { id, name: input.name!, status: input.status! });
    await recordAudit(tx, { actorId, action: "DEPARTMENT_UPDATED", targetType: "DEPARTMENT", targetId: id, detail: { code: department.code, name: input.name!, status: input.status! } });
  });
}
```

- [ ] **Step 4: GREEN 확인 후 라우트 테스트 작성** — `web/app/api/admin/departments/route.test.ts` (vi.hoisted 패턴은 Auth 라우트 테스트와 동일):

```ts
import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import { migrateTestDb, testDb, truncateAll } from "../../../../test/db";
import { departments, users } from "../../../../lib/db/schema";
import type { AuthUser } from "../../../../lib/auth/types";

const state = vi.hoisted(() => ({ currentUser: null as unknown }));
vi.mock("../../../../lib/db/client", async () => {
  const { testDb } = await import("../../../../test/db");
  const actual = await vi.importActual<object>("../../../../lib/db/client");
  return { ...actual, getDb: () => testDb() };
});
vi.mock("../../../../lib/auth/session", () => ({ getAuthUser: async () => state.currentUser }));

const db = testDb();
async function seedAdmin(role: AuthUser["role"] = "SUPER_ADMIN") {
  const [d] = await db.insert(departments).values({ name: "본사", code: "HQ" }).returning();
  const [u] = await db.insert(users).values({
    employeeNo: "admin", name: "총괄", email: "admin@x.local", passwordHash: "h", departmentId: d.id, role,
  }).returning();
  state.currentUser = { userId: u.id, employeeNo: "admin", name: "총괄", role, departmentId: d.id, mustChangePassword: false } satisfies AuthUser;
}
beforeAll(async () => { await migrateTestDb(); });
beforeEach(async () => { await truncateAll(db); state.currentUser = null; });

describe("departments routes", () => {
  it("GET lists departments for a super admin", async () => {
    await seedAdmin();
    const { GET } = await import("./route");
    const body = await (await GET()).json();
    expect(body.resultCode).toBe(200);
    expect(body.data.map((d: { code: string }) => d.code)).toContain("HQ");
  });
  it("POST creates and returns bare ok", async () => {
    await seedAdmin();
    const { POST } = await import("./route");
    const res = await POST(new Request("http://localhost/api/admin/departments", { method: "POST", body: JSON.stringify({ name: "개발팀", code: "DEV" }), headers: { "content-type": "application/json" } }));
    expect(await res.json()).toEqual({ resultCode: 200, resultMsg: "정상 처리되었습니다." });
  });
  it("rejects a DEPT_ADMIN with 403/990", async () => {
    await seedAdmin("DEPT_ADMIN");
    const { GET } = await import("./route");
    const res = await GET();
    expect(res.status).toBe(403);
    expect((await res.json()).resultCode).toBe(990);
  });
  it("PUT updates via the [id] route", async () => {
    await seedAdmin();
    const [dept] = await db.select().from(departments);
    const { PUT } = await import("./[id]/route");
    const res = await PUT(new Request("http://localhost", { method: "PUT", body: JSON.stringify({ name: "개칭", status: "ACTIVE" }), headers: { "content-type": "application/json" } }), { params: Promise.resolve({ id: String(dept.id) }) });
    expect((await res.json()).resultCode).toBe(200);
  });
});
```

- [ ] **Step 5: 라우트 구현**

`web/app/api/admin/departments/route.ts`:
```ts
import { getDb } from "@/lib/db/client";
import { handleRoute } from "@/lib/http/errors";
import { readJson, asStringField } from "@/lib/http/body";
import { requireActor } from "@/lib/auth/currentUser";
import { createDepartment, listDepartments } from "@/lib/admin/departmentService";

export const runtime = "nodejs";

export async function GET(): Promise<Response> {
  return handleRoute(async () => {
    await requireActor("SUPER_ADMIN");
    return listDepartments(getDb());
  });
}

export async function POST(request: Request): Promise<Response> {
  return handleRoute(async () => {
    const actor = await requireActor("SUPER_ADMIN");
    const body = await readJson(request);
    await createDepartment(getDb(), { name: asStringField(body.name), code: asStringField(body.code) }, actor.userId);
    return undefined; // ok()
  });
}
```

`web/app/api/admin/departments/[id]/route.ts` (Next 15: `params`는 Promise):
```ts
import { getDb } from "@/lib/db/client";
import { handleRoute } from "@/lib/http/errors";
import { readJson, asStringField } from "@/lib/http/body";
import { parseNumericParam } from "@/lib/http/params";
import { requireActor } from "@/lib/auth/currentUser";
import { updateDepartmentInfo } from "@/lib/admin/departmentService";

export const runtime = "nodejs";

export async function PUT(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  return handleRoute(async () => {
    const actor = await requireActor("SUPER_ADMIN");
    const { id } = await context.params;
    const idNum = parseNumericParam(id, "id")!; // Spring 타입불일치 미러(400+1000)
    const body = await readJson(request);
    await updateDepartmentInfo(getDb(), idNum, { name: asStringField(body.name), status: asStringField(body.status) }, actor.userId);
    return undefined;
  });
}
```

- [ ] **Step 6: GREEN + 전체** — 서비스 5 + 라우트 4 통과, `pnpm test` 전체 green, `pnpm build`.

- [ ] **Step 7: Commit**

```bash
git add web/lib/admin/departmentService.ts web/lib/admin/departmentService.test.ts web/app/api/admin/departments
git commit -m "feat: add department admin API mirroring DepartmentServiceImpl"
```

---

### Task 5: 계정 API (목록/생성 D6/수정+보호 규칙)

**Files:**
- Modify: `web/lib/db/users.ts` (DAO 추가)
- Create: `web/lib/admin/userAdminService.ts`, `web/lib/admin/userAdminService.test.ts`
- Create: `web/app/api/admin/users/route.ts`, `web/app/api/admin/users/[id]/route.ts`, `web/app/api/admin/users/route.test.ts`

**Interfaces:**
- Produces:
  - DAO 추가: `listUsers(db, departmentId: number | null)`(JOIN·ORDER BY employee_no), `existsByEmployeeNo(db, no): Promise<boolean>`, `existsByEmail(db, email)`(lower 비교), `countActiveSuperAdminsExcluding(db, userId): Promise<number>`, `insertUser(db, values)`(returning), `updateUserAdminFields(db, {id,name,email,departmentId,role,status})`, `findUserById(db, id)`
  - 서비스: `listAccounts(db, departmentId)`, `createAccount(db, input, actorId): Promise<{employeeNo,name,email,temporaryPassword}>`, `updateAccount(db, id, input, actor: AuthUser)`, `generateTempPassword(): string`
  - 라우트: `GET/POST /api/admin/users`, `PUT /api/admin/users/{id}`

- [ ] **Step 1: 실패하는 서비스 테스트 작성** — `web/lib/admin/userAdminService.test.ts` (요지 — 전 문구는 체크리스트 값):

```ts
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { migrateTestDb, testDb, truncateAll } from "../../test/db";
import { auditLogs, departments, users } from "../db/schema";
import { BizError } from "../http/errors";
import type { AuthUser } from "../auth/types";
import { createAccount, generateTempPassword, listAccounts, updateAccount } from "./userAdminService";

const db = testDb();
let hq: { id: number }; let admin: { id: number }; let actor: AuthUser;
function msg(fn: () => Promise<unknown>): Promise<string> {
  return fn().then(() => { throw new Error("expected throw"); }, (e) => { if (e instanceof BizError) return e.message; throw e; });
}
beforeAll(async () => { await migrateTestDb(); });
beforeEach(async () => {
  await truncateAll(db);
  [hq] = await db.insert(departments).values({ name: "본사", code: "HQ" }).returning();
  [admin] = await db.insert(users).values({ employeeNo: "admin", name: "총괄", email: "admin@x.local", passwordHash: "h", departmentId: hq.id, role: "SUPER_ADMIN" }).returning();
  actor = { userId: admin.id, employeeNo: "admin", name: "총괄", role: "SUPER_ADMIN", departmentId: hq.id, mustChangePassword: false };
});

describe("generateTempPassword", () => {
  it("is 10 chars from the confusion-free charset", () => {
    for (let i = 0; i < 20; i++) {
      const p = generateTempPassword();
      expect(p).toHaveLength(10);
      expect(p).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789]{10}$/);
    }
  });
});

describe("createAccount (D6)", () => {
  it("creates an ACTIVE must-change user and returns the temp password; audit has employeeNo only", async () => {
    const res = await createAccount(db, { employeeNo: "1001", name: "홍길동", email: "hong@x.local", departmentId: hq.id, role: "EMPLOYEE" }, actor.userId);
    expect(res.employeeNo).toBe("1001");
    expect(res.temporaryPassword).toHaveLength(10);
    const [u] = await db.select().from(users).where(eq(users.employeeNo, "1001"));
    expect(u.mustChangePassword).toBe(true);
    expect(await bcrypt.compare(res.temporaryPassword, u.passwordHash)).toBe(true);
    const audit = (await db.select().from(auditLogs)).find((a) => a.action === "USER_CREATED")!;
    expect(audit.detail).toEqual({ employeeNo: "1001" }); // 비밀번호 미포함 (D6 성질 유지)
  });
  it("rejects duplicates and unknown department with the exact messages", async () => {
    expect(await msg(() => createAccount(db, { employeeNo: "admin", name: "x", email: "n@x.local", departmentId: hq.id, role: "EMPLOYEE" }, actor.userId))).toBe("이미 존재하는 사번입니다: admin");
    expect(await msg(() => createAccount(db, { employeeNo: "n1", name: "x", email: "ADMIN@x.local", departmentId: hq.id, role: "EMPLOYEE" }, actor.userId))).toBe("이미 사용 중인 회사 이메일입니다: ADMIN@x.local");
    expect(await msg(() => createAccount(db, { employeeNo: "n1", name: "x", email: "n@x.local", departmentId: 999999, role: "EMPLOYEE" }, actor.userId))).toBe("존재하지 않는 부서입니다.");
  });
  it("rejects blank/invalid fields with the exact messages", async () => {
    expect(await msg(() => createAccount(db, { employeeNo: " ", name: "x", email: "n@x.local", departmentId: hq.id, role: "EMPLOYEE" }, actor.userId))).toBe("사번을 입력하세요.");
    expect(await msg(() => createAccount(db, { employeeNo: "n1", name: " ", email: "n@x.local", departmentId: hq.id, role: "EMPLOYEE" }, actor.userId))).toBe("이름을 입력하세요.");
    expect(await msg(() => createAccount(db, { employeeNo: "n1", name: "x", email: "broken", departmentId: hq.id, role: "EMPLOYEE" }, actor.userId))).toBe("유효한 회사 이메일을 입력하세요.");
    expect(await msg(() => createAccount(db, { employeeNo: "n1", name: "x", email: "n@x.local", departmentId: hq.id, role: undefined }, actor.userId))).toBe("역할을 선택하세요.");
  });
});

describe("updateAccount admin-access protection", () => {
  it("blocks self role-drop and self-deactivation", async () => {
    expect(await msg(() => updateAccount(db, admin.id, { name: "총괄", email: "admin@x.local", departmentId: hq.id, role: "EMPLOYEE", status: "ACTIVE" }, actor))).toBe("본인의 총괄 관리자 역할은 스스로 해제할 수 없습니다.");
    expect(await msg(() => updateAccount(db, admin.id, { name: "총괄", email: "admin@x.local", departmentId: hq.id, role: "SUPER_ADMIN", status: "INACTIVE" }, actor))).toBe("본인 계정은 스스로 비활성화할 수 없습니다.");
  });
  it("blocks demoting the last active super admin (by another actor)", async () => {
    const [other] = await db.insert(users).values({ employeeNo: "sa2", name: "부관리", email: "sa2@x.local", passwordHash: "h", departmentId: hq.id, role: "SUPER_ADMIN" }).returning();
    const otherActor: AuthUser = { ...actor, userId: other.id, employeeNo: "sa2" };
    // other 가 admin 을 강등하려면 admin 외 활성 SUPER_ADMIN 이 있어야 한다(여기선 other 가 있어 성공해야 함)
    await updateAccount(db, admin.id, { name: "총괄", email: "admin@x.local", departmentId: hq.id, role: "EMPLOYEE", status: "ACTIVE" }, otherActor);
    // 이제 other 가 마지막 활성 SUPER_ADMIN — admin(이제 EMPLOYEE) 이 other 를 강등 시도하면 보호에 걸린다
    const adminActor: AuthUser = { ...actor, role: "EMPLOYEE" };
    expect(await msg(() => updateAccount(db, other.id, { name: "부관리", email: "sa2@x.local", departmentId: hq.id, role: "EMPLOYEE", status: "ACTIVE" }, adminActor)))
      .toBe("마지막 활성 총괄 관리자입니다. 다른 총괄 관리자를 먼저 지정한 뒤 역할 변경 또는 비활성화하세요.");
  });
  it("skips the email duplicate check when the email is unchanged (case-insensitive)", async () => {
    await updateAccount(db, admin.id, { name: "총괄", email: "ADMIN@x.local", departmentId: hq.id, role: "SUPER_ADMIN", status: "ACTIVE" }, actor);
    const [u] = await db.select().from(users).where(eq(users.id, admin.id));
    expect(u.email).toBe("ADMIN@x.local");
  });
});

describe("listAccounts", () => {
  it("joins department name, filters by department, orders by employee_no", async () => {
    const [dev] = await db.insert(departments).values({ name: "개발팀", code: "DEV" }).returning();
    await db.insert(users).values({ employeeNo: "e2", name: "b", email: "b@x.local", passwordHash: "h", departmentId: dev.id, role: "EMPLOYEE" });
    await db.insert(users).values({ employeeNo: "e1", name: "a", email: "a@x.local", passwordHash: "h", departmentId: dev.id, role: "EMPLOYEE" });
    const all = await listAccounts(db, null);
    expect(all.map((u) => u.employeeNo)).toEqual(["admin", "e1", "e2"]);
    const filtered = await listAccounts(db, dev.id);
    expect(filtered).toHaveLength(2);
    expect(filtered[0].departmentName).toBe("개발팀");
  });
});
```

- [ ] **Step 2: RED 확인.**

- [ ] **Step 3: DAO 추가** — `web/lib/db/users.ts`에 append:

```ts
import { and, asc, eq, ne, sql as rawSql } from "drizzle-orm"; // 기존 import 와 병합
import { departments } from "./schema";

export async function listUsers(db: DbConn, departmentId: number | null) {
  const base = db.select({
    id: users.id, employeeNo: users.employeeNo, name: users.name, email: users.email,
    departmentId: users.departmentId, departmentName: departments.name,
    role: users.role, status: users.status, lastLoginAt: users.lastLoginAt,
  }).from(users).innerJoin(departments, eq(departments.id, users.departmentId));
  const rows = departmentId == null ? await base.orderBy(asc(users.employeeNo))
    : await base.where(eq(users.departmentId, departmentId)).orderBy(asc(users.employeeNo));
  return rows;
}
export async function existsByEmployeeNo(db: DbConn, employeeNo: string): Promise<boolean> {
  return (await db.select({ id: users.id }).from(users).where(eq(users.employeeNo, employeeNo)).limit(1)).length > 0;
}
export async function existsByEmail(db: DbConn, email: string): Promise<boolean> {
  return (await db.select({ id: users.id }).from(users)
    .where(rawSql`lower(${users.email}) = lower(${email})`).limit(1)).length > 0;
}
export async function countActiveSuperAdminsExcluding(db: DbConn, userId: number): Promise<number> {
  const rows = await db.select({ id: users.id }).from(users)
    .where(and(eq(users.role, "SUPER_ADMIN"), eq(users.status, "ACTIVE"), ne(users.id, userId)));
  return rows.length;
}
export async function findUserById(db: DbConn, id: number) {
  return (await db.select().from(users).where(eq(users.id, id)).limit(1))[0];
}
export async function insertUser(db: DbConn, values: typeof users.$inferInsert) {
  const [row] = await db.insert(users).values(values).returning();
  return row;
}
export async function updateUserAdminFields(db: DbConn, input: { id: number; name: string; email: string; departmentId: number; role: string; status: string }) {
  await db.update(users).set({ name: input.name, email: input.email, departmentId: input.departmentId, role: input.role, status: input.status }).where(eq(users.id, input.id));
}
```

- [ ] **Step 4: 서비스 구현** — `web/lib/admin/userAdminService.ts`:

```ts
import { randomInt } from "node:crypto";
import bcrypt from "bcryptjs";
import type { Db } from "../db/client";
import { countActiveSuperAdminsExcluding, existsByEmail, existsByEmployeeNo, findUserById, insertUser, listUsers, updateUserAdminFields } from "../db/users";
import { findDepartmentById } from "../db/departments";
import { recordAudit } from "../audit/auditLog";
import { BizError } from "../http/errors";
import { ErrorCode } from "../http/errorCode";
import type { AuthUser, UserRole } from "../auth/types";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const TEMP_PASSWORD_CHARS = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
const TEMP_PASSWORD_LENGTH = 10;
const ROLES: readonly string[] = ["SUPER_ADMIN", "DEPT_ADMIN", "EMPLOYEE"];

export function generateTempPassword(): string {
  let out = "";
  for (let i = 0; i < TEMP_PASSWORD_LENGTH; i++) out += TEMP_PASSWORD_CHARS[randomInt(TEMP_PASSWORD_CHARS.length)];
  return out;
}

function validateEmployeeNo(v: string | undefined): asserts v is string {
  if (v == null || v.trim() === "") throw new BizError(ErrorCode.INPUT_VALUE_INVALID, "사번을 입력하세요.");
  if (v.length > 50) throw new BizError(ErrorCode.INPUT_VALUE_INVALID, "사번은 50자를 넘을 수 없습니다.");
}
function validateUserName(v: string | undefined): asserts v is string {
  if (v == null || v.trim() === "") throw new BizError(ErrorCode.INPUT_VALUE_INVALID, "이름을 입력하세요.");
  if (v.length > 100) throw new BizError(ErrorCode.INPUT_VALUE_INVALID, "이름은 100자를 넘을 수 없습니다.");
}
function validateEmail(v: string | undefined): asserts v is string {
  if (v == null || v.trim() === "" || !EMAIL_PATTERN.test(v.trim())) throw new BizError(ErrorCode.INPUT_VALUE_INVALID, "유효한 회사 이메일을 입력하세요.");
  if (v.length > 255) throw new BizError(ErrorCode.INPUT_VALUE_INVALID, "회사 이메일은 255자를 넘을 수 없습니다.");
}
function validateRoleValue(v: string | undefined): asserts v is UserRole {
  if (v == null || !ROLES.includes(v)) throw new BizError(ErrorCode.INPUT_VALUE_INVALID, "역할을 선택하세요.");
}

export async function listAccounts(db: Db, departmentId: number | null) {
  return listUsers(db, departmentId);
}

// D6: 메일 대신 임시 비밀번호를 응답으로 반환한다(승인 이탈). 감사·로그에는 절대 남기지 않는다.
export async function createAccount(db: Db, input: { employeeNo?: string; name?: string; email?: string; departmentId?: number; role?: string }, actorId: number) {
  validateEmployeeNo(input.employeeNo);
  validateUserName(input.name);
  validateEmail(input.email);
  validateRoleValue(input.role);
  if (await existsByEmployeeNo(db, input.employeeNo)) throw new BizError(ErrorCode.INPUT_VALUE_INVALID, "이미 존재하는 사번입니다: " + input.employeeNo);
  if (await existsByEmail(db, input.email)) throw new BizError(ErrorCode.INPUT_VALUE_INVALID, "이미 사용 중인 회사 이메일입니다: " + input.email);
  const department = input.departmentId == null ? undefined : await findDepartmentById(db, input.departmentId);
  if (!department) throw new BizError(ErrorCode.INPUT_VALUE_INVALID, "존재하지 않는 부서입니다.");

  const temporaryPassword = generateTempPassword();
  const passwordHash = await bcrypt.hash(temporaryPassword, 10);
  await db.transaction(async (tx) => {
    const user = await insertUser(tx, {
      employeeNo: input.employeeNo!, name: input.name!, email: input.email!,
      passwordHash, departmentId: department.id, role: input.role!, status: "ACTIVE", mustChangePassword: true,
    });
    await recordAudit(tx, { actorId, action: "USER_CREATED", targetType: "USER", targetId: user.id, detail: { employeeNo: user.employeeNo } });
  });
  return { employeeNo: input.employeeNo, name: input.name, email: input.email, temporaryPassword };
}

export async function updateAccount(db: Db, id: number, input: { name?: string; email?: string; departmentId?: number; role?: string; status?: string }, actor: AuthUser): Promise<void> {
  validateUserName(input.name);
  validateEmail(input.email);
  validateRoleValue(input.role);
  if (input.status == null) throw new BizError(ErrorCode.INPUT_VALUE_INVALID, "계정 상태를 선택하세요.");
  const user = await findUserById(db, id);
  if (!user) throw new BizError(ErrorCode.INPUT_VALUE_INVALID, "존재하지 않는 계정입니다.");
  const department = input.departmentId == null ? undefined : await findDepartmentById(db, input.departmentId);
  if (!department) throw new BizError(ErrorCode.INPUT_VALUE_INVALID, "존재하지 않는 부서입니다.");
  if (input.email.toLowerCase() !== user.email.toLowerCase() && await existsByEmail(db, input.email)) {
    throw new BizError(ErrorCode.INPUT_VALUE_INVALID, "이미 사용 중인 회사 이메일입니다: " + input.email);
  }

  // Spring validateAdminAccessIsPreserved 미러
  const losesSuperAdminRole = user.role === "SUPER_ADMIN" && input.role !== "SUPER_ADMIN";
  const isDeactivated = user.status === "ACTIVE" && input.status === "INACTIVE";
  if (actor.userId === user.id) {
    if (losesSuperAdminRole) throw new BizError(ErrorCode.INPUT_VALUE_INVALID, "본인의 총괄 관리자 역할은 스스로 해제할 수 없습니다.");
    if (isDeactivated) throw new BizError(ErrorCode.INPUT_VALUE_INVALID, "본인 계정은 스스로 비활성화할 수 없습니다.");
  }
  if ((losesSuperAdminRole || (isDeactivated && user.role === "SUPER_ADMIN"))
      && await countActiveSuperAdminsExcluding(db, user.id) === 0) {
    throw new BizError(ErrorCode.INPUT_VALUE_INVALID, "마지막 활성 총괄 관리자입니다. 다른 총괄 관리자를 먼저 지정한 뒤 역할 변경 또는 비활성화하세요.");
  }

  await db.transaction(async (tx) => {
    await updateUserAdminFields(tx, { id, name: input.name!, email: input.email!, departmentId: department.id, role: input.role!, status: input.status! });
    await recordAudit(tx, { actorId: actor.userId, action: "USER_UPDATED", targetType: "USER", targetId: id, detail: { employeeNo: user.employeeNo, name: input.name!, email: input.email!, departmentId: department.id, role: input.role!, status: input.status! } });
  });
}
```

- [ ] **Step 5: 라우트 구현 + 테스트**

`web/app/api/admin/users/route.ts`:
```ts
import { getDb } from "@/lib/db/client";
import { handleRoute } from "@/lib/http/errors";
import { readJson, asStringField } from "@/lib/http/body";
import { parseNumericParam } from "@/lib/http/params";
import { requireActor } from "@/lib/auth/currentUser";
import { createAccount, listAccounts } from "@/lib/admin/userAdminService";

export const runtime = "nodejs";

export async function GET(request: Request): Promise<Response> {
  return handleRoute(async () => {
    await requireActor("SUPER_ADMIN");
    const raw = new URL(request.url).searchParams.get("departmentId");
    return listAccounts(getDb(), parseNumericParam(raw, "departmentId")); // 잘못된 값 → 400+1000(Spring 미러)
  });
}

export async function POST(request: Request): Promise<Response> {
  return handleRoute(async () => {
    const actor = await requireActor("SUPER_ADMIN");
    const body = await readJson(request);
    return createAccount(getDb(), {
      employeeNo: asStringField(body.employeeNo), name: asStringField(body.name), email: asStringField(body.email),
      departmentId: typeof body.departmentId === "number" ? body.departmentId : Number(asStringField(body.departmentId)) || undefined,
      role: asStringField(body.role),
    }, actor.userId);
  });
}
```

`web/app/api/admin/users/[id]/route.ts`:
```ts
import { getDb } from "@/lib/db/client";
import { handleRoute } from "@/lib/http/errors";
import { readJson, asStringField } from "@/lib/http/body";
import { parseNumericParam } from "@/lib/http/params";
import { requireActor } from "@/lib/auth/currentUser";
import { updateAccount } from "@/lib/admin/userAdminService";

export const runtime = "nodejs";

export async function PUT(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  return handleRoute(async () => {
    const actor = await requireActor("SUPER_ADMIN");
    const { id } = await context.params;
    const idNum = parseNumericParam(id, "id")!;
    const body = await readJson(request);
    await updateAccount(getDb(), idNum, {
      name: asStringField(body.name), email: asStringField(body.email),
      departmentId: typeof body.departmentId === "number" ? body.departmentId : Number(asStringField(body.departmentId)) || undefined,
      role: asStringField(body.role), status: asStringField(body.status),
    }, actor); // 보호 규칙이 actor 본인 여부를 봐야 하므로 actor 전체를 넘긴다
    return undefined;
  });
}
```

`web/app/api/admin/users/route.test.ts` (부서 라우트 테스트와 같은 mock 구성):
```ts
import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import { migrateTestDb, testDb, truncateAll } from "../../../../test/db";
import { departments, users } from "../../../../lib/db/schema";
import type { AuthUser } from "../../../../lib/auth/types";

const state = vi.hoisted(() => ({ currentUser: null as unknown }));
vi.mock("../../../../lib/db/client", async () => {
  const { testDb } = await import("../../../../test/db");
  const actual = await vi.importActual<object>("../../../../lib/db/client");
  return { ...actual, getDb: () => testDb() };
});
vi.mock("../../../../lib/auth/session", () => ({ getAuthUser: async () => state.currentUser }));

const db = testDb();
let hqId: number;
async function seedAdmin(role: AuthUser["role"] = "SUPER_ADMIN") {
  const [d] = await db.insert(departments).values({ name: "본사", code: "HQ" }).returning();
  hqId = d.id;
  const [u] = await db.insert(users).values({
    employeeNo: "admin", name: "총괄", email: "admin@x.local", passwordHash: "h", departmentId: d.id, role,
  }).returning();
  state.currentUser = { userId: u.id, employeeNo: "admin", name: "총괄", role, departmentId: d.id, mustChangePassword: false } satisfies AuthUser;
  return u.id;
}
beforeAll(async () => { await migrateTestDb(); });
beforeEach(async () => { await truncateAll(db); state.currentUser = null; });

describe("users routes", () => {
  it("GET lists accounts", async () => {
    await seedAdmin();
    const { GET } = await import("./route");
    const body = await (await GET(new Request("http://localhost/api/admin/users"))).json();
    expect(body.resultCode).toBe(200);
    expect(body.data[0].employeeNo).toBe("admin");
  });
  it("GET rejects a malformed departmentId with 400/1000 (Spring type-mismatch parity)", async () => {
    await seedAdmin();
    const { GET } = await import("./route");
    const res = await GET(new Request("http://localhost/api/admin/users?departmentId=abc"));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.resultCode).toBe(1000);
    expect(body.resultMsg).toBe("요청 값의 형식이 올바르지 않습니다: departmentId");
  });
  it("POST creates and returns the temporary password (D6)", async () => {
    await seedAdmin();
    const { POST } = await import("./route");
    const res = await POST(new Request("http://localhost/api/admin/users", { method: "POST", body: JSON.stringify({ employeeNo: "1001", name: "홍길동", email: "hong@x.local", departmentId: hqId, role: "EMPLOYEE" }), headers: { "content-type": "application/json" } }));
    const body = await res.json();
    expect(body.resultCode).toBe(200);
    expect(body.data.temporaryPassword).toHaveLength(10);
  });
  it("rejects a DEPT_ADMIN with 403/990", async () => {
    await seedAdmin("DEPT_ADMIN");
    const { GET } = await import("./route");
    const res = await GET(new Request("http://localhost/api/admin/users"));
    expect(res.status).toBe(403);
    expect((await res.json()).resultCode).toBe(990);
  });
});
```

- [ ] **Step 6: GREEN + 전체** — 서비스 8 + 라우트 3 통과, `pnpm test` 전체 green, `pnpm build`.

- [ ] **Step 7: Commit**

```bash
git add web/lib/db/users.ts web/lib/admin/userAdminService.ts web/lib/admin/userAdminService.test.ts web/app/api/admin/users
git commit -m "feat: add account admin API with D6 temp-password response"
```

---

### Task 6: 계정 엑셀 일괄 등록 (행별 격리 + D7)

**Files:**
- Create: `web/lib/admin/accountExcel.ts`, `web/lib/admin/accountExcel.test.ts`
- Create: `web/app/api/admin/users/excel-upload/route.ts`
- Modify: `web/package.json` (`pnpm add xlsx`)

**Interfaces:**
- Produces: `uploadAccountsExcel(db, file: { buffer: ArrayBuffer; fileName: string }, actorId): Promise<{totalRows,successRows,failRows,errorDetail:string|null,successAccounts:Array<{rowNumber,employeeNo,name,email,temporaryPassword}>}>`; `POST /api/admin/users/excel-upload`.

- [ ] **Step 1: 실패하는 테스트 작성** — `web/lib/admin/accountExcel.test.ts` (픽스처는 SheetJS로 즉석 생성):

```ts
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import * as XLSX from "xlsx";
import { eq } from "drizzle-orm";
import { migrateTestDb, testDb, truncateAll } from "../../test/db";
import { auditLogs, departments, excelUploadLogs, users } from "../db/schema";
import { BizError } from "../http/errors";
import { uploadAccountsExcel } from "./accountExcel";

const db = testDb();
let actorId: number;
function sheetBuffer(rows: unknown[][]): ArrayBuffer {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["사번", "이름", "이메일", "부서코드", "역할"], ...rows]));
  const out = XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
  return out;
}
beforeAll(async () => { await migrateTestDb(); });
beforeEach(async () => {
  await truncateAll(db);
  const [hq] = await db.insert(departments).values({ name: "본사", code: "HQ" }).returning();
  const [admin] = await db.insert(users).values({ employeeNo: "admin", name: "총괄", email: "admin@x.local", passwordHash: "h", departmentId: hq.id, role: "SUPER_ADMIN" }).returning();
  actorId = admin.id;
});

describe("uploadAccountsExcel", () => {
  it("isolates rows: good rows commit even when a bad row is between them (D7 successAccounts)", async () => {
    const buffer = sheetBuffer([
      ["e1", "가", "e1@x.local", "HQ", "EMPLOYEE"],
      ["e2", "나", "broken-email", "HQ", "EMPLOYEE"],
      ["e3", "다", "e3@x.local", "HQ", "EMPLOYEE"],
    ]);
    const result = await uploadAccountsExcel(db, { buffer, fileName: "accounts.xlsx" }, actorId);
    expect(result.totalRows).toBe(3);
    expect(result.successRows).toBe(2);
    expect(result.failRows).toBe(1);
    expect(result.errorDetail).toBe("행 3: 유효한 회사 이메일 형식이 아닙니다.");
    expect(result.successAccounts.map((a) => a.employeeNo)).toEqual(["e1", "e3"]);
    expect(result.successAccounts[0].temporaryPassword).toHaveLength(10);
    expect((await db.select().from(users)).map((u) => u.employeeNo)).toEqual(expect.arrayContaining(["e1", "e3"]));
    const log = (await db.select().from(excelUploadLogs))[0];
    expect(log.targetType).toBe("ACCOUNT");
    expect(log.successRows).toBe(2);
    expect((await db.select().from(auditLogs)).filter((a) => a.action === "USER_CREATED")).toHaveLength(2);
    expect((await db.select().from(auditLogs)).filter((a) => a.action === "ACCOUNT_EXCEL_UPLOADED")).toHaveLength(1);
  });

  it("reports the exact per-row failure reasons", async () => {
    const buffer = sheetBuffer([
      ["", "가", "a@x.local", "HQ", "EMPLOYEE"],
      ["admin", "나", "b@x.local", "HQ", "EMPLOYEE"],
      ["e9", "다", "ADMIN@x.local", "HQ", "EMPLOYEE"],
      ["e8", "라", "d@x.local", "NOPE", "EMPLOYEE"],
      ["e7", "마", "e@x.local", "HQ", "WIZARD"],
    ]);
    const result = await uploadAccountsExcel(db, { buffer, fileName: "f.xlsx" }, actorId);
    expect(result.failRows).toBe(5);
    expect(result.errorDetail!.split("\n")).toEqual([
      "행 2: 필수값이 누락되었습니다.",
      "행 3: 이미 존재하는 사번입니다: admin",
      "행 4: 이미 사용 중인 회사 이메일입니다: ADMIN@x.local",
      "행 5: 존재하지 않는 부서코드입니다: NOPE",
      "행 6: 유효하지 않은 역할입니다: WIZARD",
    ]);
  });

  it("rejects over 500 data rows before processing any", async () => {
    const rows = Array.from({ length: 501 }, (_, i) => [`m${i}`, "x", `m${i}@x.local`, "HQ", "EMPLOYEE"]);
    await expect(uploadAccountsExcel(db, { buffer: sheetBuffer(rows), fileName: "big.xlsx" }, actorId)).rejects.toThrow(/최대 500건/);
    expect(await db.select().from(users)).toHaveLength(1); // admin 뿐 — 아무 행도 커밋 안 됨
  });

  it("rejects an unreadable file with 1013", async () => {
    const junk = new TextEncoder().encode("this is not xlsx").buffer as ArrayBuffer;
    const err = await uploadAccountsExcel(db, { buffer: junk, fileName: "junk.xlsx" }, actorId).then(() => null, (e) => e as BizError);
    expect(err).toBeInstanceOf(BizError);
    expect((err as BizError).errorCode.code).toBe(1013);
  });

  it("detects in-file duplicate employeeNo/email", async () => {
    const buffer = sheetBuffer([
      ["d1", "가", "dup@x.local", "HQ", "EMPLOYEE"],
      ["d1", "나", "n2@x.local", "HQ", "EMPLOYEE"],
      ["d3", "다", "DUP@x.local", "HQ", "EMPLOYEE"],
    ]);
    const result = await uploadAccountsExcel(db, { buffer, fileName: "dup.xlsx" }, actorId);
    expect(result.successRows).toBe(1);
    expect(result.errorDetail!.split("\n")).toEqual([
      "행 3: 이미 존재하는 사번입니다: d1",
      "행 4: 이미 사용 중인 회사 이메일입니다: DUP@x.local",
    ]);
  });
});
```

- [ ] **Step 2: RED 확인** (`pnpm add xlsx` 먼저).

- [ ] **Step 3: 구현** — `web/lib/admin/accountExcel.ts`:

```ts
import * as XLSX from "xlsx";
import bcrypt from "bcryptjs";
import type { Db } from "../db/client";
import { existsByEmail, existsByEmployeeNo, insertUser } from "../db/users";
import { findDepartmentByCode } from "../db/departments";
import { recordAudit } from "../audit/auditLog";
import { generateTempPassword } from "./userAdminService";
import { excelUploadLogs } from "../db/schema";
import { BizError } from "../http/errors";
import { ErrorCode } from "../http/errorCode";

const HEADER_ROW_COUNT = 1;
const MAX_DATA_ROWS = 500;
const UNREADABLE = "엑셀 파일을 읽을 수 없습니다. 손상되었거나 암호가 설정된 파일인지 확인한 뒤 다시 올려 주세요.";
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ROLES: readonly string[] = ["SUPER_ADMIN", "DEPT_ADMIN", "EMPLOYEE"];

interface RowOutcome { rowNumber: number; success: boolean; reason: string | null; account?: { employeeNo: string; name: string; email: string; temporaryPassword: string } }

export async function uploadAccountsExcel(db: Db, file: { buffer: ArrayBuffer; fileName: string }, actorId: number) {
  let rows: string[][];
  try {
    const workbook = XLSX.read(new Uint8Array(file.buffer), { type: "array" });
    if (workbook.SheetNames.length === 0) {
      throw new BizError(ErrorCode.FILE_UNREADABLE, "엑셀 파일에 시트가 없습니다. 첫 번째 시트에 계정 목록을 담아 다시 올려 주세요.");
    }
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    // raw:false = POI DataFormatter 대응(표시 문자열), blankrows:false = 빈 행 스킵(POI null row 대응)
    rows = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1, raw: false, defval: "", blankrows: false });
  } catch (error) {
    if (error instanceof BizError) throw error;
    throw new BizError(ErrorCode.FILE_UNREADABLE, UNREADABLE);
  }

  const dataRows = rows.slice(HEADER_ROW_COUNT);
  if (dataRows.length > MAX_DATA_ROWS) {
    throw new BizError(ErrorCode.INPUT_VALUE_INVALID, `한 번에 업로드할 수 있는 데이터 행은 최대 ${MAX_DATA_ROWS}건입니다. 파일을 나눠 업로드하세요.`);
  }

  const outcomes: RowOutcome[] = [];
  const seenEmployeeNos = new Set<string>();
  const seenEmails = new Set<string>();

  for (let i = 0; i < dataRows.length; i++) {
    const rowNumber = i + HEADER_ROW_COUNT + 1; // 엑셀 표기 행 번호(헤더=1행)
    outcomes.push(await processRow(db, dataRows[i], rowNumber, seenEmployeeNos, seenEmails, actorId));
  }

  const successes = outcomes.filter((o) => o.success);
  const failures = outcomes.filter((o) => !o.success);
  const errorDetail = failures.length === 0 ? null : failures.map((f) => `행 ${f.rowNumber}: ${f.reason}`).join("\n");

  // 업로드 로그 + 그 감사 = 한 트랜잭션(행별 커밋과 독립 — Spring 경계 미러)
  await db.transaction(async (tx) => {
    const [log] = await tx.insert(excelUploadLogs).values({
      uploadedBy: actorId, departmentId: null, targetType: "ACCOUNT", fileName: file.fileName,
      totalRows: outcomes.length, successRows: successes.length, failRows: failures.length, errorDetail,
    }).returning();
    await recordAudit(tx, { actorId, action: "ACCOUNT_EXCEL_UPLOADED", targetType: "EXCEL_UPLOAD_LOG", targetId: log.id,
      detail: { fileName: file.fileName, totalRows: outcomes.length, successRows: successes.length, failRows: failures.length } });
  });

  return {
    totalRows: outcomes.length, successRows: successes.length, failRows: failures.length, errorDetail,
    successAccounts: successes.map((s) => ({ rowNumber: s.rowNumber, ...s.account! })), // D7
  };
}

async function processRow(db: Db, row: string[], rowNumber: number, seenEmployeeNos: Set<string>, seenEmails: Set<string>, actorId: number): Promise<RowOutcome> {
  const [employeeNo = "", name = "", email = "", departmentCode = "", roleText = ""] = row.map((c) => (c ?? "").trim());
  const fail = (reason: string): RowOutcome => ({ rowNumber, success: false, reason });

  if (!employeeNo || !name || !email || !departmentCode || !roleText) return fail("필수값이 누락되었습니다.");
  if (!EMAIL_PATTERN.test(email)) return fail("유효한 회사 이메일 형식이 아닙니다.");
  if (seenEmployeeNos.has(employeeNo) || await existsByEmployeeNo(db, employeeNo)) return fail("이미 존재하는 사번입니다: " + employeeNo);
  const normalizedEmail = email.toLowerCase();
  if (seenEmails.has(normalizedEmail) || await existsByEmail(db, email)) return fail("이미 사용 중인 회사 이메일입니다: " + email);
  const department = await findDepartmentByCode(db, departmentCode);
  if (!department) return fail("존재하지 않는 부서코드입니다: " + departmentCode);
  if (!ROLES.includes(roleText)) return fail("유효하지 않은 역할입니다: " + roleText);

  const temporaryPassword = generateTempPassword();
  const passwordHash = await bcrypt.hash(temporaryPassword, 10);
  try {
    // 행별 독립 트랜잭션(Spring REQUIRES_NEW 미러): 이 행의 실패는 이 행만 롤백한다.
    await db.transaction(async (tx) => {
      const user = await insertUser(tx, {
        employeeNo, name, email, passwordHash, departmentId: department.id,
        role: roleText, status: "ACTIVE", mustChangePassword: true,
      });
      await recordAudit(tx, { actorId, action: "USER_CREATED", targetType: "USER", targetId: user.id, detail: { employeeNo } });
    });
  } catch {
    // 임시 비밀번호는 절대 로그로 내보내지 않는다. (D6: 메일이 없으므로 문구에서 메일 언급 제거 — 이탈 기록됨)
    return fail("계정 저장에 실패했습니다.");
  }
  seenEmployeeNos.add(employeeNo);
  seenEmails.add(normalizedEmail);
  return { rowNumber, success: true, reason: null, account: { employeeNo, name, email, temporaryPassword } };
}
```

- [ ] **Step 4: 라우트 구현** — `web/app/api/admin/users/excel-upload/route.ts`:

```ts
import { getDb } from "@/lib/db/client";
import { handleRoute, BizError } from "@/lib/http/errors";
import { ErrorCode } from "@/lib/http/errorCode";
import { okMessage } from "@/lib/http/envelope";
import { requireActor } from "@/lib/auth/currentUser";
import { uploadAccountsExcel } from "@/lib/admin/accountExcel";

export const runtime = "nodejs";
const MAX_FILE_BYTES = 4 * 1024 * 1024; // Q6 승인: 플랫폼 안전값(Spring 20MB 에서 하향, 이탈 기록됨)

export async function POST(request: Request): Promise<Response> {
  // Spring handleMultipartException 미러: 멀티파트 실패/file 부재는 HTTP 200 + 1009.
  let file: File | null = null;
  try {
    const form = await request.formData();
    const entry = form.get("file");
    file = entry instanceof File ? entry : null;
  } catch {
    file = null;
  }
  if (!file) {
    return new Response(JSON.stringify(okMessage(ErrorCode.FILE_REQUIRED.code, "파일을 업로드할 수 없습니다.")),
      { status: 200, headers: { "content-type": "application/json;charset=UTF-8" } });
  }
  const uploaded = file;
  return handleRoute(async () => {
    const actor = await requireActor("SUPER_ADMIN");
    if (uploaded.size > MAX_FILE_BYTES) throw new BizError(ErrorCode.FILE_TOO_LARGE);
    return uploadAccountsExcel(getDb(), { buffer: await uploaded.arrayBuffer(), fileName: uploaded.name }, actor.userId);
  });
}
```

- [ ] **Step 5: 라우트 테스트 작성** — `web/app/api/admin/users/excel-upload/route.test.ts` (1009·1015 분기를 단위로 고정):

```ts
import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import * as XLSX from "xlsx";
import { migrateTestDb, testDb, truncateAll } from "../../../../../test/db";
import { departments, users } from "../../../../../lib/db/schema";
import type { AuthUser } from "../../../../../lib/auth/types";

const state = vi.hoisted(() => ({ currentUser: null as unknown }));
vi.mock("../../../../../lib/db/client", async () => {
  const { testDb } = await import("../../../../../test/db");
  const actual = await vi.importActual<object>("../../../../../lib/db/client");
  return { ...actual, getDb: () => testDb() };
});
vi.mock("../../../../../lib/auth/session", () => ({ getAuthUser: async () => state.currentUser }));

const db = testDb();
async function seedAdmin() {
  const [d] = await db.insert(departments).values({ name: "본사", code: "HQ" }).returning();
  const [u] = await db.insert(users).values({ employeeNo: "admin", name: "총괄", email: "admin@x.local", passwordHash: "h", departmentId: d.id, role: "SUPER_ADMIN" }).returning();
  state.currentUser = { userId: u.id, employeeNo: "admin", name: "총괄", role: "SUPER_ADMIN", departmentId: d.id, mustChangePassword: false } satisfies AuthUser;
}
function xlsxFile(): File {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["사번", "이름", "이메일", "부서코드", "역할"], ["r1", "가", "r1@x.local", "HQ", "EMPLOYEE"]]));
  const buf = XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
  return new File([buf], "ok.xlsx", { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}
function post(form: FormData): Request {
  return new Request("http://localhost/api/admin/users/excel-upload", { method: "POST", body: form });
}
beforeAll(async () => { await migrateTestDb(); });
beforeEach(async () => { await truncateAll(db); state.currentUser = null; });

describe("excel-upload route", () => {
  it("uploads and returns D7 successAccounts", async () => {
    await seedAdmin();
    const form = new FormData();
    form.set("file", xlsxFile());
    const { POST } = await import("./route");
    const body = await (await POST(post(form))).json();
    expect(body.resultCode).toBe(200);
    expect(body.data.successAccounts[0].employeeNo).toBe("r1");
  });
  it("returns HTTP 200 + 1009 when the file field is missing", async () => {
    await seedAdmin();
    const { POST } = await import("./route");
    const res = await POST(post(new FormData()));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ resultCode: 1009, resultMsg: "파일을 업로드할 수 없습니다." });
  });
  it("rejects a >4MB file with 400/1015", async () => {
    await seedAdmin();
    const form = new FormData();
    form.set("file", new File([new Uint8Array(4 * 1024 * 1024 + 1)], "big.xlsx"));
    const { POST } = await import("./route");
    const res = await POST(post(form));
    expect(res.status).toBe(400);
    expect((await res.json()).resultCode).toBe(1015);
  });
});
```

- [ ] **Step 6: GREEN + 전체** — 서비스 5건 + 라우트 3건 통과, `pnpm test` 전체 green, `pnpm build`(라우트 등록 확인).

- [ ] **Step 7: Commit**

```bash
git add web/package.json web/pnpm-lock.yaml web/lib/admin/accountExcel.ts web/lib/admin/accountExcel.test.ts web/app/api/admin/users/excel-upload
git commit -m "feat: add account excel upload with per-row isolation and D7 passwords"
```

---

### Task 7: E2E curl 검증

**Files:**
- Create: `docs/qa/2026-08-16-dept-users-e2e-verification.md`

**배경:** Auth Task 6과 동일 방식 — Next dev(:3100, 3000 불가침) + probank_test + 부트스트랩 admin(로그인·비번변경 완료 상태로 시작). 체크리스트 행 ID를 인용하며 실측을 기록한다. **모든 상태 확인 curl에 `-i`를 쓴다**(Auth E2E 리뷰 교훈).

- [ ] **Step 1: 기동** — Auth E2E와 동일 env로 `next dev -p 3100` + admin 로그인(cookie.txt).

- [ ] **Step 2: 부서 시나리오** — 목록/생성/중복 코드/이름 누락/수정/없는 부서 + **EMPLOYEE 계정으로 403/990**(엑셀로 직원 하나 만들거나 DB 시드 후 로그인).

- [ ] **Step 3: 계정 시나리오** — 생성 → 응답의 `temporaryPassword`로 **실제 로그인 성공까지 확인**(D6 왕복 증명) → 수정 → 본인 비활성화 금지 → 마지막 관리자 보호.

- [ ] **Step 4: 엑셀 시나리오** — 성공 2+실패 1 혼합 파일(로컬에서 Node로 생성) 업로드 → `successAccounts` 비밀번호로 로그인 확인 → 500행 초과 파일 거부 → 비엑셀 바이트 1013 → file 필드 없이 POST → 200/1009.

- [ ] **Step 5: 정리 + 문서화 + Commit** — 서버 kill, cookie/임시파일 삭제, DB 최종 상태 기록.

```bash
git add docs/qa/2026-08-16-dept-users-e2e-verification.md
git commit -m "docs: record the department/account end-to-end verification results"
```

---

## Self-Review 결과

- **스펙 커버리지:** 스펙 서브플랜 3("부서/계정 CRUD, D6/D7, 계정 엑셀 행별 복원") → Task 4·5·6. JIT 체크리스트 → Task 1. Auth 최종 리뷰 파킹(M3·M4·M5) → Task 2. 감사 로그(파리티 앵커) → Task 3. E2E(스펙 ④) → Task 7. **화면(UI)은 이 서브플랜 범위 밖** — 스펙 A의 "React 화면 흡수"는 별도 단계(컷오버 전)로 남는다. D7의 다운로드 UI도 그 단계 몫이며, 서버는 `successAccounts`로 값만 공급한다.
- **플레이스홀더 스캔:** 없음. 모든 라우트·테스트가 전문 코드로 수록됨(users/[id] 라우트·계정 라우트 테스트·엑셀 라우트 테스트 포함). `parseNumericParam`(Task 2)이 Foundation이 이월한 "파라미터 타입 불일치 → 400" 발산을 이 서브플랜에서 해소한다(Spring `handleTypeMismatchException` 문구까지 미러).
- **타입 일관성:** `DbConn`(Task 2)을 DAO 전부가 사용, 서비스는 `Db`. `recordAudit` 시그니처를 Task 4·5·6이 동일하게 소비. `generateTempPassword`를 Task 6이 Task 5에서 import. `requireActor` 반환 `AuthUser`를 라우트가 `actor.userId`/`actor`로 사용. 응답 형태(부서 `{id,name,code,status}`, 계정 목록 9필드, 생성 `{...,temporaryPassword}`, 엑셀 `{...,successAccounts}`)가 테스트 기대값과 일치.

## Execution Handoff

이 계획을 다 만들었다. 두 가지 실행 방식이 있다:

1. **Subagent-Driven (권장)** — Task마다 새 서브에이전트, 사이사이 리뷰
2. **Inline Execution** — executing-plans로 배치 실행 + 체크포인트

어느 방식으로 진행할까?
