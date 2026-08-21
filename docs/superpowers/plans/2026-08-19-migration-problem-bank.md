# 이관 서브플랜 4 — 문제은행 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Foundation·Auth·부서계정 레일 위에 **문제은행 관리 API 10개 엔드포인트**를 파리티로 올린다 — 문제 CRUD(5유형)·목록(필터 9개·페이지네이션)·부서 이동·다음 문항번호·이미지 업로드·문제 엑셀 일괄 등록·관리자 태그 목록.

**Architecture:** 서브플랜 3과 동일한 3층 — route(`app/api/admin/**`, `requireActor(...)`) → service(순수 TS, `BizError`) → DAO(Drizzle). **검증 로직은 서비스에서 분리해 순수 모듈(`problemValidation.ts`)로 둔다** — 5유형 × 20여 개 문구가 이 서브플랜 파리티 위험의 대부분이고, DB 없이 테스트할 수 있어야 빠르게 고정된다. 엑셀은 서브플랜 3이 확립한 **행별 독립 트랜잭션**(`db.transaction` per row)을 그대로 쓴다. 이미지는 로컬 디스크가 없는 Vercel 환경이라 **Supabase Storage** 로 간다(파리티가 아닌 목표 동작).

**Tech Stack:** Foundation·Auth·서브플랜3과 동일 + `xlsx` **0.20.3**(SheetJS CDN tarball — 2026-08-19 교체 완료) + `@supabase/supabase-js`(이미지). 라우트는 `runtime = "nodejs"`.

**Spec:** `docs/superpowers/specs/2026-08-15-spring-to-next-migration-design.md`

---

## 실행 구간 (7구간) — 한 번에 다 하지 마라

이 계획은 10 Task / 63 스텝이라 한 세션에 다 돌리면 중간에 끊겼을 때 이어받기가 어렵다.
**아래 구간 단위로 브랜치를 파고 구간이 끝날 때마다 master 에 머지한다.** 세션이 끊겨도
master 는 항상 초록이고, 다음 세션은 이 표와 SDD 원장만 보고 이어받는다.

| 구간 | Task | 스텝 | 끝났을 때 동작하는 것 | 상태 |
|---|---|--:|---|---|
| **M1 기반** | 1 + 4 | 12 | 정답지 131행 + 검증 모듈. 테스트 116 → 159 | ☑ 2026-08-19 |
| **M2 데이터 계층** | 2 + 3 | 15 | 태그 목록 1개(`/api/tags`). 테스트 159 → 185 | ☑ 2026-08-19 |
| **M3 CRUD** | 5 | 10 | 생성·수정·보관·상세 4개. 테스트 185 → 225 | ☑ 2026-08-20 |
| **M4 조회·이동** | 6 + 7 | 9 | 목록·부서이동·다음번호 3개. 테스트 225 → 361 | ☑ 2026-08-20 |
| **M5 엑셀** | 9 | 4 | 엑셀 일괄 등록 1개 — **722문항 적재 경로가 열린다**. 테스트 361 → 418 | ☑ 2026-08-20 |
| **M6 이미지** | 8 | 5 | 이미지 업로드 1개 endpoint. 테스트 418 → 441 | ☑ 2026-08-20 |
| **M7 검증** | 10 | 5 | E2E + 정답지 대조(138행 중 133 실측). 테스트 441 유지 | ☑ 2026-08-21 |

**구간을 마칠 때마다** `cd web && pnpm test && pnpm build` 가 통과해야 머지한다.
구간이 끝나면 위 표의 ☐ 를 ☑ 로 바꾸고 그 변경도 함께 커밋한다 — 다음 세션이 여기를 본다.

**순서에 대한 근거**
- **M1 이 먼저다.** 파리티 위험이 가장 몰린 곳이 검증 로직(5유형 × 20여 문구)인데 DB 의존이 없어
  테스트가 빠르고 다른 무엇에도 의존하지 않는다. 여기서 문구를 고정하면 M3·M5 가 얹히기만 한다.
- **M5(엑셀)를 M6(이미지)보다 앞에 둔다.** 엑셀은 722문항 실적재에 필요하고, 이미지는 현재
  26문제 중 **0건**이 쓴다.
- **M6 은 순서를 미뤄도 된다.** `T4` 에만 의존해 언제든 끼워 넣을 수 있다.

**이 7구간에 의도적으로 들어 있지 않은 것 — `GET /api/tags/in-use`.**
이관 설계의 컨트롤러 배정표가 `TagController` 를 "4(관리자 태그) + **5(풀이 활성 태그)**"로 나눴다.
M2 가 `GET /api/tags` 를 만들면서 DAO(`findInUseTags`)까지 함께 만들었지만 **라우트는 서브플랜 5 것이다.**
여기서 만들지 않는 이유는 소비자(풀이 목록 화면)가 아직 이관되지 않아 검증할 대상이 없기 때문이다.
컷오버는 서브플랜 7 이라 그 전에 문제가 드러날 일도 없다. 이 사실은 이관 설계 스펙의 진행 현황
표 아래에도 적어 두었다 — 서브플랜 5 계획서를 쓸 사람이 거기를 본다.

**M6 착수 전에 사람이 준비할 것** — Supabase 비공개 버킷 `problem-images` 와 환경변수
`SUPABASE_URL`·`SUPABASE_SERVICE_ROLE_KEY`. 세션 중간에 막히지 않도록 미리 만들어 둔다.

---

## Global Constraints

아래 값은 전부 **현재 Spring 코드에서 실측한 계약**이다(`ProblemController`·`ProblemServiceImpl`·`ExcelProblemUploadServiceImpl`·`ProblemImageServiceImpl`·`ProblemProvisioningServiceImpl`·`OwningDepartmentResolver`·`ImageUrlValidator`·`TagServiceImpl`·`ProblemMapper.xml`). **에러 문구는 글자까지 동일**해야 한다.

### 역할 — 서브플랜 3과 다르다

- `ProblemController` 는 클래스 레벨 `@RequireRole({SUPER_ADMIN, DEPT_ADMIN})` 이다. **9개 중 8개가 두 역할 모두 허용**된다.
- 예외는 **부서 이동 하나** — 메서드 레벨 `@RequireRole(SUPER_ADMIN)` 으로 좁혀진다. `RoleCheckInterceptor` 가 메서드 애너테이션을 먼저 보기 때문이다. 이유는 원본 주석에 있다: 부서 관리자에게 열어 주면 자기 부서 문제를 남의 부서로 던져 버릴 수 있다.
- `TagController` 는 **인증만 요구**하고 역할 제한이 없다(관리자 태그 목록). `requireActor()` 를 인자 없이 호출한다.
- 역할 불일치 → 990 / HTTP 403.

### 부서 스코프 — 두 개의 서로 다른 관문

| 관문 | 위치 | 규칙 |
|---|---|---|
| `OwningDepartmentResolver.resolve(requested, actor)` | **쓰기**(생성·엑셀·다음번호) | SUPER_ADMIN 이 아니면 요청값 무시하고 `actor.departmentId` 반환. SUPER_ADMIN 이면 `requested==null` → "문제가 귀속될 부서를 선택하세요." / 없는 부서 → "존재하지 않는 부서입니다." / 비활성 → "비활성 부서에는 문제를 등록할 수 없습니다: \<부서명\>" |
| `assertOwnership(problem, actor)` | **읽기·수정·보관** | SUPER_ADMIN 이 아니고 `problem.departmentId !== actor.departmentId` → `ACCESS_AUTH_DENIED`(990) |

목록 조회는 세 번째 형태다: `effectiveDepartmentId = actor.role === "SUPER_ADMIN" ? departmentId : actor.departmentId`. **부서 관리자는 요청 파라미터가 무시된다**(전체 조회 불가).

### 문제 생성·수정 검증 순서 (글자까지 고정)

`normalize()` → `validate()` → `validateSourceNumber()` 순서다. **normalize 가 먼저**인 이유는 원본 주석에 있다 — 빈칸 마커 검사가 실제 저장될 키와 같은 값으로 수행돼야 검증과 저장이 어긋나지 않는다.

**normalize:** `content`·`imageUrl`·`referenceText`·`explanation`·각 `choice.text`·`answers[]`·각 `blank.blankKey`·`blank.answerText` 를 `trimToNull`(trim 후 빈 문자열이면 `null`).

**validate 순서:**
1. `type == null` → "문제 유형을 선택하세요." — 가장 먼저. 없으면 switch 가 아무 분기도 타지 않아 검증 없이 통과한다.
2. `content` 공백 → "문제 내용을 입력하세요."
3. `imageUrl` 검사(아래)
4. 유형별 분기

**imageUrl 검사** (`ImageUrlValidator`, 단일 규칙 — JSON·엑셀 두 경로가 공유):
- 비었거나 `null` → 통과
- 접두어가 다르거나 `..` 포함 → "이미지는 이미지 업로드 API로 등록한 경로(\<PREFIX\>...)만 사용할 수 있습니다."
- 500자 초과 → "이미지 경로는 500자 이하여야 합니다."

**유형별:**

| 유형 | 규칙 | 문구 |
|---|---|---|
| MCQ_SINGLE | 보기 2~5개, 정답 정확히 1개 | |
| MCQ_MULTI | 보기 2~5개, 정답 1개 이상 | |
| OX | **보기가 정확히 2개** 아니면 "OX 문제는 보기 2개(O/X)가 필요합니다." → 그 다음 정답 1개 검사 | |
| SHORT_ANSWER | `answers` 비면 "정답을 최소 1개 입력하세요." / 빈 항목 "빈 정답은 입력할 수 없습니다." / 500자 초과 "정답은 500자 이하여야 합니다." | |
| FILL_BLANK | 아래 별도 | |

**보기 공통 문구:** 개수 위반 "보기는 2개 이상 5개 이하이어야 합니다." / 빈 보기 "빈 보기는 입력할 수 없습니다." / 500자 초과 "보기는 500자 이하여야 합니다." / 정답 수 불일치(exact) "정답 개수가 올바르지 않습니다." / 정답 0개(multi) "정답을 최소 1개 선택하세요."

**FILL_BLANK 검증 순서:**
1. `blanks` 비면 "빈칸을 최소 1개 정의하세요."
2. 각 빈칸: 키·정답 중 하나라도 공백 → "빈칸 키와 정답을 모두 입력하세요." / 키 50자 초과 → "빈칸 키는 50자 이하여야 합니다." / 정답 500자 초과 → "빈칸 정답은 500자 이하여야 합니다."
3. 키 중복 → "빈칸 키가 중복되었습니다."
4. 선언된 키가 본문에 없으면 → "본문에 없는 빈칸 마커입니다: \<key\>"
5. **역방향** — 본문의 마커 중 선언되지 않은 것이 있으면 → "정답이 등록되지 않은 빈칸 마커가 본문에 있습니다: \<key\>". 마커 패턴은 `/\{\{([A-Za-z0-9_-]+)\}\}/g` 로 프론트 `blankSegments.js` 와 같은 문자 집합이어야 한다.
6. `blankRevealCount` 가 `null`·1 미만·`blanks.length` 초과 → "출제할 빈칸 개수가 유효하지 않습니다."

**문항 번호:** `null` → "문항 번호를 입력하세요." / `< 1` → "문항 번호는 1 이상이어야 합니다." **등록·수정 모두 필수**.

**태그 정규화:** trim → 빈 것 제거 → **`toLowerCase(Locale.ROOT)`** → 중복 제거. 20개 초과 또는 100자 초과 → "태그는 문제당 20개, 태그명은 100자 이하여야 합니다." (TS 는 `toLowerCase()` 가 로케일 독립이라 그대로 쓰면 된다 — Java 가 `Locale.ROOT` 를 명시한 이유는 tr-TR 에서 `"I".toLowerCase()` 가 `"ı"` 가 되기 때문이고 JS 에는 그 함정이 없다. **`toLocaleLowerCase()` 를 쓰면 안 된다.**)

### 중복 문항번호 — QA-1 재발 금지

`UNIQUE(department_id, source_number)` 위반(SQLState **23505**) → 한국어 문구 `"<부서명> <번호>번은 이미 있습니다. 다른 번호를 입력하세요."`

> ⚠️ **부서명을 catch 안에서 조회하면 안 된다.** 2026-08-14 에 Spring 에서 Critical 로 잡힌 결함이 정확히 이것이다 — PostgreSQL 은 제약 위반이 나면 트랜잭션 전체를 abort 하므로(25P02) catch 안의 SELECT 가 새 예외를 던져 안내 문구가 만들어지지도 못한 채 `-1 "처리 중 오류가 발생하였습니다"` 로 나갔다. **부서명은 쓰기 전에 읽어 둔다.** `docs/qa/2026-08-14-source-number-qa.md` 참조.

제약 이름이 다른 UNIQUE 위반이면 번호 탓으로 돌리지 않고 그대로 던진다.

**오류 객체의 속성 이름은 실측했다.** `postgres.js` 는 `code: "23505"` 와 **`constraint_name`** 을 준다 — `constraint` 는 `undefined` 다(pg 드라이버와 이름이 다르니 주의). 확인에 쓴 명령:

```javascript
// 같은 code 로 departments 를 두 번 insert 했을 때
// code: '23505', constraint_name: 'departments_code_unique', constraint: undefined
// 보유 키: name, severity_local, severity, code, detail, schema_name, table_name, constraint_name, file, line, routine
```

### 목록 조회

- 필터 9개: `departmentId` · `type` · `status` · `createdFrom` · `createdTo` · `tag` · `keyword` · `page`(기본 1) · `size`(기본 20)
- `size <= 0` → 20, `size > 100` → 100. `page < 1` → 1. **이 클램프가 없으면 `size=100000` 이 페이징을 무력화한다.**
- `createdTo` 는 **`< (createdTo + INTERVAL '1 day')`** — 그 날 전체를 포함한다
- `tag` 는 `EXISTS (… lower(t.name) = lower(:tag))` 상관 서브쿼리
- `keyword` 는 `p.content ILIKE '%' || :keyword || '%'`
- 정렬 **`ORDER BY p.created_at DESC, p.id DESC`** — `p.id` 타이브레이커가 없으면 엑셀 업로드로 `created_at` 이 같은 행이 생겼을 때 LIMIT/OFFSET 페이징에서 중복·누락이 난다
- **`countAll` 은 태그 조인을 하지 않는다.** 조인을 둔 채 `count(*)` 를 쓰면 태그 수만큼 부풀어 총건수가 틀린다
- 응답: `{items:[{id,type,content,status,departmentId,departmentName,createdAt,tags:[]}], totalCount, page, size}`
- **날짜 파라미터 파싱.** Spring 은 `@DateTimeFormat(ISO.DATE)` 로 `"2026-08-01"` 을 받고, 이게 없으면 `MethodArgumentTypeMismatchException` 으로 **목록 조회 전체가 실패**한다(원본 주석의 QA D1). Next 에는 대응 헬퍼가 없으므로 **`parseDateParam(value, name)` 을 Task 6 에서 만든다** — `null`/빈 문자열이면 `null`, `YYYY-MM-DD` 가 아니면 `parseNumericParam` 과 같은 모양으로 `BizError(1000, "요청 값의 형식이 올바르지 않습니다: <name>")`. 정규식 `/^\d{4}-\d{2}-\d{2}$/` 로 형식을 먼저 보고, `Date` 로 만들었을 때 `NaN` 이면 같은 오류를 낸다(`2026-02-30` 같은 값을 거른다).

### 엑셀 일괄 등록 — 13컬럼

컬럼 인덱스 고정: `0 유형 · 1 내용 · 2 이미지 · 3 참조지문 · 4~8 보기1~5 · 9 정답 · 10 해설 · 11 태그 · 12 문항번호`. 헤더 1행, **최대 500행**.

**행 검증 순서와 문구:**
1. 유형·내용 누락 → "문제유형과 문제내용은 필수입니다."
2. `FILL_BLANK` → "빈칸 채우기는 엑셀 업로드를 지원하지 않습니다. 개별 입력을 이용하세요."
3. 알 수 없는 유형 → "유효하지 않은 문제유형입니다: \<원문\>"
4. 번호 없음 → "문항 번호는 필수입니다."
5. 번호가 숫자 아님 → "문항 번호는 숫자여야 합니다: \<원문\>"
6. 번호 < 1 → "문항 번호는 1 이상이어야 합니다: \<번호\>"
7. **파일 안 중복** → "파일 안에서 문항 번호가 중복됩니다: \<번호\>"
8. 태그 초과 → "태그는 문제당 20개, 태그명은 100자 이하여야 합니다."
9. 정답 없음 → "정답은 필수입니다."
10. 이미지 열 값이 `ImageUrlValidator.check`에서 `VALID`가 아님(빈 값이 아니면서 접두어 불일치·`..` 포함·500자 초과) → "이미지는 엑셀로 등록할 수 없습니다. 이미지 열은 비워 두고, 문제 개별 등록/수정 화면에서 이미지를 첨부하세요." — 단, 값이 이미 `/uploads/images/...` 형식의 유효한 경로면 거부되지 않고 그대로 저장된다(`ExcelProblemUploadServiceImpl.java:238-246,251`). "이미지 열은 반드시 비어 있어야 한다"가 아니다.
11. 보기/정답 유형별 검증(아래)
12. 저장 시 23505 → "문항 번호 \<번호\>번은 이 부서에 이미 있습니다." — **일반 문구에 묻히면 안 된다**
13. 그 밖의 저장 실패 → "문제 저장 중 오류가 발생했습니다."

**보기·정답 문구:** "보기는 2개 이상 5개 이하이어야 합니다." / "빈 보기는 입력할 수 없습니다." / "OX 문제는 보기 2개(O/X)가 필요합니다." / "정답은 보기 번호(1부터 시작)여야 합니다: \<원문\>" / "정답 번호가 보기 범위를 벗어났습니다: \<index\>" / "이 유형은 정답이 1개여야 합니다." / "정답을 최소 1개 선택하세요." / SHORT_ANSWER 빈 정답 → "빈 정답은 입력할 수 없습니다."

**파일 수준:** 500행 초과 → "한 번에 업로드할 수 있는 데이터 행은 최대 500건입니다. 파일을 나눠 업로드하세요." / 열 수 없음 → 1013 "엑셀 파일을 읽을 수 없습니다. 손상되었거나 암호가 설정된 파일인지 확인한 뒤 다시 올려 주세요." / 시트 없음 → 1013 "엑셀 파일에 시트가 없습니다. **첫 번째 시트에 문제 목록을 담아** 다시 올려 주세요." (계정 업로드와 문구가 다르다) / 확장자 → 1014 "xlsx 또는 xls 엑셀 파일만 업로드할 수 있습니다."

**행별 격리:** 각 성공 행은 **독립 트랜잭션**으로 커밋(문제 insert + 보기/정답 insert + 태그 연결 + 감사 `PROBLEM_CREATED_BY_EXCEL`). 653행 중 한 행 실패가 나머지를 롤백하지 않는다 — 이번 실적재의 근거다.

### 감사 로그

| 동작 | action | detail |
|---|---|---|
| 생성 | `PROBLEM_CREATED` | `{"type":"<유형>"}` |
| 수정 | `PROBLEM_UPDATED` | `{"type":"<기존 유형>"}` |
| 보관 | `PROBLEM_ARCHIVED` | `{}` |
| 부서 이동 | `PROBLEM_DEPARTMENT_CHANGED` | `{"from":n,"to":n,"sourceNumberFrom":n,"sourceNumberTo":n}` |
| 엑셀 문제 | `PROBLEM_CREATED_BY_EXCEL` | `{"type":"<유형>"}` |
| 엑셀 업로드 | `PROBLEM_EXCEL_UPLOADED` (targetType `EXCEL_UPLOAD_LOG`, targetId = 로그 id) | `{fileName,totalRows,successRows,failRows,departmentId}` — **`departmentId` 를 빠뜨리지 말 것** |
| 이미지 | `PROBLEM_IMAGE_UPLOADED` (targetType `PROBLEM_IMAGE`, targetId **null**) | `{"fileName":"<uuid.ext>"}` |

> **이미지 감사는 fail-closed 다.** 감사 기록이 실패하면 이미 올라간 파일을 지우고 업로드 전체를
> `MSG_PROC_FAIL` + "이미지 업로드에 실패했습니다." 로 실패시킨다. 감사 없이 파일만 남는 상태를
> 만들지 않는다 — Task 8 에서 이 순서를 유지한다.

`recordAudit` 의 fail-closed 규칙(키 이름에 "password" 포함 시 거부)은 서브플랜 3에서 이미 구현됐다.

### 이미지 — 파리티가 아니라 목표 동작

Spring 은 로컬 디스크(`./uploads/images`)에 쓰고 정적 리소스로 서빙한다. **Vercel 서버리스에는 영속 디스크가 없어 그대로 이식할 수 없다.** Supabase Storage 로 간다.

유지하는 규칙: 확장자 허용목록 `png/jpg/jpeg/gif/webp`(**svg 제외** — 인라인 `<script>` 로 저장형 XSS), Content-Type 허용목록 `image/png,image/jpeg,image/gif,image/webp`, **5MB 상한**("이미지 크기는 5MB를 초과할 수 없습니다."), UUID 파일명, 확장자 불일치 → 1014 "허용되지 않는 파일 형식입니다. png, jpg, jpeg, gif, webp 이미지만 업로드할 수 있습니다."

바뀌는 것: 저장 위치와 반환 URL 접두어. `ImageUrlValidator.PREFIX` 를 새 접두어로 바꾼다. **현재 `problems.image_url` 이 NULL 이 아닌 행은 0건**(26건 중 0)이라 기존 데이터가 깨지지 않는다 — 이 사실을 정답지에 근거로 남긴다.

### 공통

- 응답 봉투 `{resultCode,resultMsg,data}`. `create`·`update`·`archive` 는 `data` 없이 `ok()`.
- `changeDepartment` 응답 `{sourceNumber: n}`. `nextSourceNumber` 응답은 **숫자 그대로**.
- 커밋 메시지는 `feat:`/`fix:`/`docs:`/`refactor:` 영문 Conventional Commits.

**승인된 이탈(정답지에 기록할 것):** ① 이미지 저장이 로컬 디스크 → Supabase Storage(플랫폼 제약, 목표 동작) ② 이미지 URL 접두어 변경(기존 데이터 0건) ③ 엑셀 파일 상한 20MB→4MB(서브플랜 3 Q6 승인 기준 유지) ④ SheetJS `blankrows:false` 로 인한 빈 행 번호 어긋남(서브플랜 3 이탈 ⑤와 동일).

---

## 서브플랜 1~3에서 소비하는 인터페이스 (이미 존재)

**아래 시그니처는 실제 파일에서 확인한 것이다. 기억으로 쓰지 말고 이대로 호출하라.**

- `web/lib/http/errors.ts`: `BizError`, `handleRoute`, `bizStatus`. `errorCode.ts`: `ErrorCode`(1000/1009/1013/1014/1015/980/990). `body.ts`: `readJson`, `asStringField`. `envelope.ts`: `ok<T>(data?)`, `okMessage(code, message)`.
- `web/lib/http/params.ts`: **`parseNumericParam(value: string|null|undefined, name: string): number|null`** — 이름이 `numberParam` 이 아니고 **인자가 2개**다. 잘못된 값이면 `BizError(1000, "요청 값의 형식이 올바르지 않습니다: <name>")` 를 던진다(Spring `MethodArgumentTypeMismatchException` 핸들러 미러).
- `web/lib/auth/currentUser.ts`: `requireActor(...roles)` — **가변 인자**라 `requireActor("SUPER_ADMIN","DEPT_ADMIN")` 가 그대로 된다. `types.ts`: `AuthUser`, `UserRole`.
- `web/lib/db/client.ts`: `getDb`, 타입 `Db`·**`DbConn`**(트랜잭션 겸용 — 이미 존재하므로 파킹된 "승격"은 추가 작업이 없다). `schema.ts`: `problems, problemChoices, problemAnswers, problemBlanks, tags, problemTags, departments, auditLogs, excelUploadLogs`(전부 존재 확인). `raw.ts`: `executeRows<T>(db, query)`, `parseUtcTimestamp(value)`.
- `web/lib/db/departments.ts`: **`findDepartmentById(db, id)`** — 행 전체를 돌려주므로 `.name`·`.status` 를 그대로 쓴다. **부서명 조회용 함수를 새로 만들지 마라.**
- `web/lib/audit/auditLog.ts`: **`recordAudit(db: DbConn, entry: {actorId, action, targetType, targetId, detail})`** — **두 번째 인자가 객체다.** 위치 인자로 부르면 컴파일되지 않는다. `detail` 은 `Record<string, unknown> | null` 이고, 키 이름에 "password" 가 재귀적으로 하나라도 있으면 던진다(fail-closed).
- `web/lib/admin/accountExcel.ts`: 엑셀 파싱·행별 트랜잭션의 **참조 구현**. 새 코드는 이 구조를 따른다.
- `web/test/db.ts`: `testDb()`, `migrateTestDb()`, `truncateAll()`.

---

## File Structure

| 파일 | 책임 | Task |
|---|---|---|
| `docs/qa/2026-08-19-problem-bank-parity-checklist.md` | 파리티 정답지(실측) + 승인 이탈 4건 | 1 |
| `docs/superpowers/specs/2026-08-14-deployment.md` | (수정) 상단에 superseded 표시 | 1 |
| `web/scripts/bootstrap.ts` | (수정) `.env` 로드 추가 | 1 |
| `web/lib/db/problems.ts` | **신규.** 문제 DAO — insert/update/findById/updateStatus/updateDepartmentAndSourceNumber/findMaxSourceNumber | 2 |
| `web/lib/db/problemParts.ts` | **신규.** 보기·정답·빈칸 DAO — insertAll/deleteByProblemId/findByProblemId | 2 |
| `web/lib/db/tags.ts` | **신규.** 태그 DAO — findAll/findInUse/findOrCreateByNames/replaceTags/findNamesByProblemId | 3 |
| `web/app/api/tags/route.ts` | **신규.** 태그 목록. **경로는 `/api/admin/tags` 가 아니라 `/api/tags` 다** — `TagController` 가 `@RequestMapping("/api/tags")` 이고 기존 클라이언트가 `apiGet("/api/tags")` 로 부른다(`frontend/src/api/problems.js:11`). rewrite 도 없다(`next.config.mjs` 는 `{}`). 404 는 `ProblemListPage` 의 `.catch(() => setTags([]))` 가 삼켜서 태그 필터가 조용히 비어 보인다. 형제 엔드포인트 `/api/tags/in-use`(`findInUseTags` 소비처)는 직원 풀이 화면 서브플랜에서 붙는다 — 그래서 M2 시점의 `findInUseTags` 에는 아직 호출부가 없다 | 3 |
| `web/lib/problem/problemValidation.ts` | **신규.** 순수 검증·정규화 — DB 없이 테스트 가능한 파리티 표면 전부 | 4 |
| `web/lib/problem/imageUrl.ts` | **신규.** `ImageUrlValidator` 이식(JSON·엑셀 공유) | 4 |
| `web/lib/problem/owningDepartment.ts` | **신규.** `OwningDepartmentResolver` 이식 | 5 |
| `web/lib/problem/problemService.ts` | **신규.** create/update/archive/getDetail | 5 |
| `web/app/api/admin/problems/route.ts` | **신규.** POST 생성 · GET 목록 | 5·6 |
| `web/app/api/admin/problems/[id]/route.ts` | **신규.** GET 상세 · PUT 수정 · DELETE 보관 | 5 |
| `web/lib/problem/problemListService.ts` | **신규.** 목록 조회(필터 9개·페이지네이션) | 6 |
| `web/lib/problem/departmentMove.ts` | **신규.** 부서 이동 + 다음 문항번호 | 7 |
| `web/app/api/admin/problems/[id]/department/route.ts` | **신규.** PUT 부서 이동 | 7 |
| `web/app/api/admin/problems/next-source-number/route.ts` | **신규.** GET 다음 번호 | 7 |
| `web/lib/problem/problemImage.ts` | **신규.** Supabase Storage 업로드 | 8 |
| `web/app/api/admin/problems/images/route.ts` | **신규.** POST 이미지 업로드 | 8 |
| `web/lib/problem/problemExcel.ts` | **신규.** 엑셀 일괄 등록(행별 격리) | 9 |
| `web/app/api/admin/problems/excel-upload/route.ts` | **신규.** POST 엑셀 업로드 | 9 |
| `docs/qa/2026-08-19-problem-bank-e2e-verification.md` | E2E curl 검증 결과 | 10 |

> **라우트 경로 충돌 주의.** `next-source-number` 는 `[id]` 와 같은 세그먼트를 다툰다. Next.js App Router 는 정적 세그먼트를 동적 세그먼트보다 우선하므로 `app/api/admin/problems/next-source-number/route.ts` 가 먼저 잡힌다(Spring 의 패턴 우선순위와 같은 결과). Task 7 Step 마지막에 실제로 확인한다.

---

## Task 1: 파리티 정답지 + 파킹 정리

**Files:**
- Create: `docs/qa/2026-08-19-problem-bank-parity-checklist.md`
- Modify: `docs/superpowers/specs/2026-08-14-deployment.md` (상단)
- Modify: `web/scripts/bootstrap.ts`

**Interfaces:**
- Consumes: 없음
- Produces: 정답지 — Task 2~10 이 문구·순서를 여기서 인용한다

- [ ] **Step 1: 정답지 작성**

`docs/qa/2026-08-19-problem-bank-parity-checklist.md` 를 만든다. 서브플랜 3의 `2026-08-16-dept-users-parity-checklist.md` 형식을 따른다. 위 Global Constraints 의 표를 그대로 옮기되, **각 행에 Spring 출처(파일:줄)를 적는다.** 최소 아래 구획:

| 구획 | 행 수(최소) |
|---|--:|
| 역할·부서 스코프 | 6 |
| 생성·수정 검증(5유형) | 25 |
| 문항번호 | 5 |
| 목록 필터·정렬·페이징 | 12 |
| 부서 이동·다음번호 | 6 |
| 이미지 | 8 |
| 엑셀 행 검증 | 20 |
| 엑셀 파일 수준 | 5 |
| 감사 로그 | 7 |
| 승인된 이탈 | 4 |

정답지의 모든 값은 위 Global Constraints 에 이미 실측돼 있다 — **비어 있는 칸을 남기지 마라.** 각 행에 출처를 붙일 때 아래로 확인한다:

```bash
grep -rn 'auditLogService.record' backend/src/main/java/com/daeryun/probank/service/Problem*.java backend/src/main/java/com/daeryun/probank/service/ExcelProblem*.java
```

- [ ] **Step 2: 배포 스펙에 superseded 표시**

`docs/superpowers/specs/2026-08-14-deployment.md` 의 제목 바로 아래에 삽입한다:

```markdown
> **⚠️ 이 문서는 대체되었다 (2026-08-19).**
> D1 "Spring Boot 를 유지하고 Vercel 은 프록시로 쓴다"는 더 이상 유효하지 않다.
> 2026-08-15 부터 Next.js 이관이 진행 중이며
> `docs/superpowers/specs/2026-08-15-spring-to-next-migration-design.md` 가 이를 대체한다.
>
> 다만 **D6(메일 제거·임시 비밀번호 화면 표시)와 D7(일괄 등록 결과 표시·다운로드)은 계속 유효**하며
> 이관 설계가 이를 명시적으로 승계했다. 나머지 결정(D1~D5, D8)은 이관 설계를 따른다.
```

- [ ] **Step 3: bootstrap 이 .env 를 읽게 한다**

`pnpm bootstrap` 은 `tsx` 로 도는데 `tsx` 는 `.env` 를 로드하지 않는다(`drizzle-kit` 은 로드한다). 그래서 `.env` 가 채워져 있어도 `DATABASE_URL 이 설정되지 않았습니다.` 로 죽는다. 2026-08-19 에 실제로 겪었다.

`web/scripts/bootstrap.ts` 의 **첫 줄**에 추가한다(다른 import 보다 먼저여야 `getDb()` 가 값을 본다):

```typescript
// tsx 는 .env 를 로드하지 않는다(drizzle-kit 은 한다). 이 import 가 없으면 .env 가
// 채워져 있어도 getDb() 가 "DATABASE_URL 이 설정되지 않았습니다." 로 죽는다.
// 부수효과 import 라 다른 import 보다 먼저 와야 한다.
import "dotenv/config";
```

의존성을 추가한다:

```bash
cd web && pnpm add -D dotenv
```

- [ ] **Step 4: bootstrap 이 환경변수 없이 도는지 확인**

Run: `cd web && pnpm bootstrap`
Expected: `bootstrap 완료` (셸에 `DATABASE_URL` 을 export 하지 않은 상태에서). 총괄 관리자가 이미 있으면 아무것도 만들지 않고 통과하는 것이 정상이다.

- [ ] **Step 5: Commit**

```bash
git add docs/qa/2026-08-19-problem-bank-parity-checklist.md docs/superpowers/specs/2026-08-14-deployment.md web/scripts/bootstrap.ts web/package.json web/pnpm-lock.yaml
git commit -m "docs: author the problem-bank parity checklist and settle two carry-overs"
```

---

## Task 2: 문제·부품 DAO

**Files:**
- Create: `web/lib/db/problems.ts`, `web/lib/db/problems.test.ts`
- Create: `web/lib/db/problemParts.ts`, `web/lib/db/problemParts.test.ts`

**Interfaces:**
- Consumes: `DbConn`, `schema.problems/problemChoices/problemAnswers/problemBlanks`
- Produces:
  - `insertProblem(conn: DbConn, row: NewProblem): Promise<number>` — 생성된 id
  - `findProblemById(conn: DbConn, id: number): Promise<ProblemRow | null>`
  - `updateProblem(conn: DbConn, id: number, patch: ProblemPatch): Promise<void>`
  - `updateProblemStatus(conn: DbConn, id: number, status: "ACTIVE"|"ARCHIVED"): Promise<void>`
  - `updateDepartmentAndSourceNumber(conn: DbConn, id: number, departmentId: number, sourceNumber: number): Promise<void>`
  - `findMaxSourceNumber(conn: DbConn, departmentId: number): Promise<number | null>`
  - `insertChoices/insertAnswers/insertBlanks(conn, rows): Promise<void>`
  - `findChoicesByProblemId/findAnswersByProblemId/findBlanksByProblemId(conn, id)`
  - `deleteChoicesByProblemId/deleteAnswersByProblemId/deleteBlanksByProblemId(conn, id): Promise<void>`

- [ ] **Step 1: 실패하는 DAO 테스트 작성**

`web/lib/db/problems.test.ts`:

```typescript
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { migrateTestDb, testDb, truncateAll } from "../../test/db";
import { insertProblem, findProblemById, findMaxSourceNumber, updateDepartmentAndSourceNumber } from "./problems";
import { departments, users } from "./schema";

const db = testDb();
let deptA = 0, deptB = 0, userId = 0;

beforeAll(async () => { await migrateTestDb(); });
beforeEach(async () => {
  await truncateAll(db);
  [{ id: deptA }] = await db.insert(departments).values({ name: "가팀", code: "A", status: "ACTIVE" }).returning({ id: departments.id });
  [{ id: deptB }] = await db.insert(departments).values({ name: "나팀", code: "B", status: "ACTIVE" }).returning({ id: departments.id });
  [{ id: userId }] = await db.insert(users).values({
    employeeNo: "admin", name: "관리자", email: "a@b.c", passwordHash: "x",
    departmentId: deptA, role: "SUPER_ADMIN", status: "ACTIVE", mustChangePassword: false,
  }).returning({ id: users.id });
});

describe("problems DAO", () => {
  it("insert 한 값을 그대로 읽어 온다", async () => {
    const id = await insertProblem(db, {
      type: "OX", content: "본문", status: "ACTIVE",
      departmentId: deptA, sourceNumber: 7, createdBy: userId,
    });
    const row = await findProblemById(db, id);
    expect(row?.sourceNumber).toBe(7);
    expect(row?.departmentId).toBe(deptA);
    expect(row?.type).toBe("OX");
  });

  it("findMaxSourceNumber 는 보관된 문제도 센다", async () => {
    // spec D5: 번호는 재사용하지 않는다. 보관된 문제가 번호를 계속 점유한다.
    // 보관본에 더 높은 번호를 주어, 상태 필터가 끼어들면 실패하는 모양으로 고정한다.
    await insertProblem(db, { type: "OX", content: "활성", status: "ACTIVE", departmentId: deptA, sourceNumber: 5, createdBy: userId });
    await insertProblem(db, { type: "OX", content: "보관", status: "ARCHIVED", departmentId: deptA, sourceNumber: 9, createdBy: userId });
    expect(await findMaxSourceNumber(db, deptA)).toBe(9);
  });

  it("findMaxSourceNumber 는 다른 부서를 세지 않는다", async () => {
    await insertProblem(db, { type: "OX", content: "가", status: "ACTIVE", departmentId: deptA, sourceNumber: 100, createdBy: userId });
    expect(await findMaxSourceNumber(db, deptB)).toBeNull();
  });

  it("번호가 없는 행은 같은 부서에 여러 개 공존한다", async () => {
    // PostgreSQL 의 UNIQUE 는 NULL 을 서로 다른 값으로 본다. 기존 데이터가 이 상태다.
    await insertProblem(db, { type: "OX", content: "1", status: "ACTIVE", departmentId: deptA, sourceNumber: null, createdBy: userId });
    await insertProblem(db, { type: "OX", content: "2", status: "ACTIVE", departmentId: deptA, sourceNumber: null, createdBy: userId });
    expect(await findMaxSourceNumber(db, deptA)).toBeNull();
  });

  it("같은 부서에 같은 번호를 넣으면 23505 로 거부된다", async () => {
    await insertProblem(db, { type: "OX", content: "1", status: "ACTIVE", departmentId: deptA, sourceNumber: 3, createdBy: userId });
    await expect(
      insertProblem(db, { type: "OX", content: "2", status: "ACTIVE", departmentId: deptA, sourceNumber: 3, createdBy: userId }),
    ).rejects.toMatchObject({ code: "23505", constraint_name: "uq_problems_department_source_number" });
  });

  it("updateDepartmentAndSourceNumber 는 두 컬럼을 함께 바꾼다", async () => {
    const id = await insertProblem(db, { type: "OX", content: "x", status: "ACTIVE", departmentId: deptA, sourceNumber: 1, createdBy: userId });
    await updateDepartmentAndSourceNumber(db, id, deptB, 41);
    const row = await findProblemById(db, id);
    expect(row?.departmentId).toBe(deptB);
    expect(row?.sourceNumber).toBe(41);
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `cd web && pnpm vitest run lib/db/problems.test.ts`
Expected: FAIL — `Failed to resolve import "./problems"`

- [ ] **Step 3: `web/lib/db/problems.ts` 구현**

Drizzle 로 작성한다. `insertProblem` 은 `.returning({ id: problems.id })` 로 id 를 돌려준다. `findMaxSourceNumber` 는 `max(problems.sourceNumber)` 를 쓰고 **상태로 거르지 않는다**(spec D5 — 주석으로 이유를 남길 것). 23505 는 잡지 않고 그대로 던진다 — 서비스가 부서명을 손에 쥔 채 번역한다.

- [ ] **Step 4: 통과 확인**

Run: `cd web && pnpm vitest run lib/db/problems.test.ts`
Expected: PASS (6건)

- [ ] **Step 5: 부품 DAO 테스트 작성**

`web/lib/db/problemParts.test.ts` — 보기·정답·빈칸 각각에 대해 (a) `insertAll` 후 `findByProblemId` 가 넣은 순서대로(`displayOrder` 오름차순) 돌려주는지 (b) `deleteByProblemId` 후 빈 배열인지 확인한다. 보기는 `displayOrder` 가 **1부터** 부여되는지 단언한다.

- [ ] **Step 6: 실패 확인 → 구현 → 통과 확인**

Run: `cd web && pnpm vitest run lib/db/problemParts.test.ts`
Expected: 먼저 FAIL, 구현 후 PASS

- [ ] **Step 7: 전체 스위트 확인**

Run: `cd web && pnpm test`
Expected: 116 + 신규 통과, 실패 0

- [ ] **Step 8: Commit**

```bash
git add web/lib/db/problems.ts web/lib/db/problems.test.ts web/lib/db/problemParts.ts web/lib/db/problemParts.test.ts
git commit -m "feat: add problem and problem-part DAOs with round-trip tests"
```

---

## Task 3: 태그 DAO + 관리자 태그 API

**Files:**
- Create: `web/lib/db/tags.ts`, `web/lib/db/tags.test.ts`
- Create: `web/app/api/tags/route.ts`, `web/app/api/tags/route.test.ts` (`/api/admin/tags` 가 아니다 — `TagController` 는 `@RequestMapping("/api/tags")`)

**Interfaces:**
- Consumes: Task 2 의 `insertProblem`
- Produces:
  - `findAllTags(conn: DbConn): Promise<{id:number;name:string;createdAt:Date}[]>` — `TagMapper.xml findAll` 이 `id, name, created_at` 을 고른다(`Tag.java` 필드 3개)
  - `findInUseTags(conn: DbConn): Promise<{id:number;name:string;createdAt:Date}[]>` — 소비처 `/api/tags/in-use` 는 직원 풀이 화면 서브플랜에서 붙는다
  - `findOrCreateTagsByNames(conn: DbConn, names: string[]): Promise<number[]>`
  - `replaceProblemTags(conn: DbConn, problemId: number, tagIds: number[]): Promise<void>`
  - `findTagNamesByProblemId(conn: DbConn, problemId: number): Promise<string[]>`

- [ ] **Step 1: 실패하는 테스트 작성**

`web/lib/db/tags.test.ts` 의 핵심 3건:

```typescript
it("findOrCreateTagsByNames 는 있는 태그를 다시 만들지 않는다", async () => {
  const first = await findOrCreateTagsByNames(db, ["회계", "자금"]);
  const second = await findOrCreateTagsByNames(db, ["회계", "예산"]);
  expect(second[0]).toBe(first[0]);            // 회계는 같은 id
  expect(new Set([...first, ...second]).size).toBe(3); // 회계·자금·예산
});

it("replaceProblemTags 는 기존 연결을 지우고 새로 건다", async () => {
  const ids = await findOrCreateTagsByNames(db, ["가", "나"]);
  await replaceProblemTags(db, problemId, ids);
  const only = await findOrCreateTagsByNames(db, ["다"]);
  await replaceProblemTags(db, problemId, only);
  expect(await findTagNamesByProblemId(db, problemId)).toEqual(["다"]);
});

it("findInUseTags 는 문제에 연결된 태그만 돌려준다", async () => {
  const [used] = await findOrCreateTagsByNames(db, ["쓰임"]);
  await findOrCreateTagsByNames(db, ["안쓰임"]);
  await replaceProblemTags(db, problemId, [used]);
  expect((await findInUseTags(db)).map((t) => t.name)).toEqual(["쓰임"]);
});
```

- [ ] **Step 2: 실패 확인**

Run: `cd web && pnpm vitest run lib/db/tags.test.ts`
Expected: FAIL — 모듈 없음

- [ ] **Step 3: 구현**

`findOrCreateTagsByNames` 는 빈 배열을 받으면 DB 를 건드리지 않고 `[]` 를 돌려준다(엑셀에서 태그 없는 행이 흔하다). 삽입은 `ON CONFLICT (name) DO NOTHING` 후 전체를 다시 조회하는 방식으로 경합을 견딘다.

- [ ] **Step 4: 통과 확인**

Run: `cd web && pnpm vitest run lib/db/tags.test.ts`
Expected: PASS

- [ ] **Step 5: 라우트 테스트 작성**

`web/app/api/tags/route.test.ts`:

```typescript
it("인증된 사용자면 역할과 무관하게 태그 목록을 돌려준다", async () => {
  // TagController 에는 @RequireRole 이 없다 — 인증만 요구한다.
  const res = await GET();
  expect(res.status).toBe(200);
  const body = await res.json();
  expect(body.resultCode).toBe(200);
  expect(Array.isArray(body.data)).toBe(true);
});

it("세션이 없으면 980 이다", async () => {
  // 세션 없음을 만든 뒤
  const res = await GET();
  expect((await res.json()).resultCode).toBe(980);
});
```

- [ ] **Step 6: 실패 확인 → 라우트 구현 → 통과 확인**

```typescript
// web/app/api/tags/route.ts
import { getDb } from "@/lib/db/client";
import { handleRoute } from "@/lib/http/errors";
import { requireActor } from "@/lib/auth/currentUser";
import { findAllTags } from "@/lib/db/tags";

export const runtime = "nodejs";

export async function GET(): Promise<Response> {
  return handleRoute(async () => {
    // TagController 에는 @RequireRole 이 없다 — 역할을 넘기지 않으면 인증만 검사한다.
    await requireActor();
    return findAllTags(getDb());
  });
}
```

- [ ] **Step 7: Commit**

```bash
git add web/lib/db/tags.ts web/lib/db/tags.test.ts web/app/api/tags
git commit -m "feat: add tag DAO and the admin tag list endpoint"
```

---

## Task 4: 검증·정규화 순수 모듈

**이 서브플랜에서 파리티 위험이 가장 큰 지점이다.** 5유형 × 20여 개 문구가 여기 모여 있고, DB 없이 테스트할 수 있어 가장 빠르고 촘촘하게 고정할 수 있다.

**Files:**
- Create: `web/lib/problem/problemValidation.ts`, `web/lib/problem/problemValidation.test.ts`
- Create: `web/lib/problem/imageUrl.ts`, `web/lib/problem/imageUrl.test.ts`

**Interfaces:**
- Consumes: `BizError`, `ErrorCode`
- Produces:
  - **`ProblemCreateInput`** — 이 서브플랜 전체가 쓰는 요청 타입. Spring `ProblemCreateRequest` 와 1:1:
    ```typescript
    export interface ChoiceInput { text: string | null; correct: boolean }
    export interface BlankInput { blankKey: string | null; answerText: string | null }
    export interface ProblemCreateInput {
      type: "MCQ_SINGLE" | "MCQ_MULTI" | "OX" | "SHORT_ANSWER" | "FILL_BLANK";
      content: string | null;
      imageUrl?: string | null;
      referenceText?: string | null;
      explanation?: string | null;
      choices?: ChoiceInput[] | null;
      answers?: (string | null)[] | null;
      blanks?: BlankInput[] | null;
      blankRevealCount?: number | null;
      tags?: string[] | null;
      sourceNumber?: number | null;
    }
    ```
  - `normalizeProblemRequest(req: ProblemCreateInput): ProblemCreateInput` — 새 객체 반환(입력 불변)
  - `validateProblem(req: ProblemCreateInput): void` — 위반 시 `BizError(INPUT_VALUE_INVALID, 문구)`
  - `validateSourceNumber(n: number | null | undefined): void`
  - `normalizeTags(input: string[] | null | undefined): string[]`
  - `BLANK_MARKER_PATTERN: RegExp`
  - `checkImageUrl(url: string | null | undefined): "VALID" | "BAD_PREFIX" | "TOO_LONG"`, `IMAGE_URL_PREFIX`, `IMAGE_URL_MAX_LENGTH`

- [ ] **Step 1: imageUrl 테스트 작성**

`web/lib/problem/imageUrl.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { checkImageUrl, IMAGE_URL_PREFIX } from "./imageUrl";

describe("checkImageUrl", () => {
  it("비어 있으면 통과한다", () => {
    expect(checkImageUrl(null)).toBe("VALID");
    expect(checkImageUrl(undefined)).toBe("VALID");
    expect(checkImageUrl("   ")).toBe("VALID");
  });
  it("업로드 API 접두어면 통과한다", () => {
    expect(checkImageUrl(`${IMAGE_URL_PREFIX}abc.png`)).toBe("VALID");
  });
  it("외부 URL 은 거부한다", () => {
    expect(checkImageUrl("https://evil.example/x.png")).toBe("BAD_PREFIX");
    expect(checkImageUrl("//evil.example/x.png")).toBe("BAD_PREFIX");
    expect(checkImageUrl("/other/x.png")).toBe("BAD_PREFIX");
  });
  it("접두어가 맞아도 .. 가 있으면 거부한다", () => {
    // 접두어를 통과하고도 상위 경로를 가리킬 수 있다.
    expect(checkImageUrl(`${IMAGE_URL_PREFIX}../../etc/passwd`)).toBe("BAD_PREFIX");
  });
  it("500자를 넘으면 TOO_LONG", () => {
    expect(checkImageUrl(IMAGE_URL_PREFIX + "a".repeat(500))).toBe("TOO_LONG");
  });
});
```

- [ ] **Step 2: 실패 확인 → 구현 → 통과 확인**

Run: `cd web && pnpm vitest run lib/problem/imageUrl.test.ts`

- [ ] **Step 3: 검증 테스트 작성 — 유형별 전수**

`web/lib/problem/problemValidation.test.ts`. **정답지의 각 문구마다 한 건씩** 쓴다. 최소 골격:

```typescript
import { describe, expect, it } from "vitest";
import { normalizeProblemRequest, validateProblem, validateSourceNumber, normalizeTags } from "./problemValidation";

const base = { type: "MCQ_SINGLE" as const, content: "본문", sourceNumber: 1 };
const choice = (text: string, correct = false) => ({ text, correct });
const expectMessage = (fn: () => void, message: string) => {
  expect(fn).toThrowError(expect.objectContaining({ message }));
};

describe("validateProblem — 공통", () => {
  it("유형이 없으면 가장 먼저 막는다", () => {
    // 유형이 없으면 이후 분기가 아무 검증도 하지 않고 조용히 통과할 수 있다.
    expectMessage(() => validateProblem({ ...base, type: null as never, content: null as never }),
      "문제 유형을 선택하세요.");
  });
  it("내용이 비면 막는다", () => {
    expectMessage(() => validateProblem({ ...base, content: null as never }), "문제 내용을 입력하세요.");
  });
  it("이미지 경로가 외부 URL 이면 막는다", () => {
    expectMessage(() => validateProblem({ ...base, imageUrl: "https://evil/x.png", choices: [choice("가", true), choice("나")] }),
      "이미지는 이미지 업로드 API로 등록한 경로(/uploads/images/...)만 사용할 수 있습니다.");
  });
});

describe("validateProblem — 객관식", () => {
  it("보기가 1개면 막는다", () => {
    expectMessage(() => validateProblem({ ...base, choices: [choice("가", true)] }), "보기는 2개 이상 5개 이하이어야 합니다.");
  });
  it("보기가 6개면 막는다", () => {
    expectMessage(() => validateProblem({ ...base, choices: Array.from({ length: 6 }, (_, i) => choice(`보기${i}`, i === 0)) }),
      "보기는 2개 이상 5개 이하이어야 합니다.");
  });
  it("빈 보기를 막는다", () => {
    expectMessage(() => validateProblem({ ...base, choices: [choice("가", true), choice("")] }), "빈 보기는 입력할 수 없습니다.");
  });
  it("보기 500자 초과를 막는다", () => {
    expectMessage(() => validateProblem({ ...base, choices: [choice("가", true), choice("나".repeat(501))] }),
      "보기는 500자 이하여야 합니다.");
  });
  it("단일 정답인데 2개 고르면 막는다", () => {
    expectMessage(() => validateProblem({ ...base, choices: [choice("가", true), choice("나", true)] }), "정답 개수가 올바르지 않습니다.");
  });
  it("복수 정답인데 0개면 막는다", () => {
    expectMessage(() => validateProblem({ ...base, type: "MCQ_MULTI", choices: [choice("가"), choice("나")] }),
      "정답을 최소 1개 선택하세요.");
  });
  it("OX 는 보기가 정확히 2개여야 한다", () => {
    expectMessage(() => validateProblem({ ...base, type: "OX", choices: [choice("O", true), choice("X"), choice("?")] }),
      "OX 문제는 보기 2개(O/X)가 필요합니다.");
  });
});

describe("validateProblem — 빈칸", () => {
  const fb = (over: object) => ({ type: "FILL_BLANK" as const, content: "수도는 {{b1}}이다", sourceNumber: 1, blankRevealCount: 1, blanks: [{ blankKey: "b1", answerText: "서울" }], ...over });

  it("정상은 통과한다", () => { expect(() => validateProblem(fb({}))).not.toThrow(); });
  it("빈칸이 없으면 막는다", () => {
    expectMessage(() => validateProblem(fb({ blanks: [] })), "빈칸을 최소 1개 정의하세요.");
  });
  it("키가 중복되면 막는다", () => {
    expectMessage(() => validateProblem(fb({ content: "{{b1}} {{b1}}", blanks: [{ blankKey: "b1", answerText: "가" }, { blankKey: "b1", answerText: "나" }], blankRevealCount: 1 })),
      "빈칸 키가 중복되었습니다.");
  });
  it("본문에 없는 키를 막는다", () => {
    expectMessage(() => validateProblem(fb({ blanks: [{ blankKey: "b9", answerText: "가" }] })), "본문에 없는 빈칸 마커입니다: b9");
  });
  it("본문의 고아 마커를 막는다", () => {
    // 정답이 없는 {{b7}} 이 통과하면 학습자 화면에 날것으로 노출되고 채점도 안 된다.
    expectMessage(() => validateProblem(fb({ content: "{{b1}} 그리고 {{b7}}" })),
      "정답이 등록되지 않은 빈칸 마커가 본문에 있습니다: b7");
  });
  it("출제 개수가 빈칸 수를 넘으면 막는다", () => {
    expectMessage(() => validateProblem(fb({ blankRevealCount: 2 })), "출제할 빈칸 개수가 유효하지 않습니다.");
  });
  it("출제 개수가 0이면 막는다", () => {
    expectMessage(() => validateProblem(fb({ blankRevealCount: 0 })), "출제할 빈칸 개수가 유효하지 않습니다.");
  });
});

describe("validateSourceNumber", () => {
  it("없으면 막는다", () => { expectMessage(() => validateSourceNumber(null), "문항 번호를 입력하세요."); });
  it("0 이면 막는다", () => { expectMessage(() => validateSourceNumber(0), "문항 번호는 1 이상이어야 합니다."); });
  it("음수면 막는다", () => { expectMessage(() => validateSourceNumber(-3), "문항 번호는 1 이상이어야 합니다."); });
  it("1 은 통과한다", () => { expect(() => validateSourceNumber(1)).not.toThrow(); });
});

describe("normalizeTags", () => {
  it("trim·소문자화·중복제거를 한다", () => {
    expect(normalizeTags([" 회계 ", "회계", "ABC"])).toEqual(["회계", "abc"]);
  });
  it("21개면 막는다", () => {
    expectMessage(() => normalizeTags(Array.from({ length: 21 }, (_, i) => `t${i}`)),
      "태그는 문제당 20개, 태그명은 100자 이하여야 합니다.");
  });
  it("101자면 막는다", () => {
    expectMessage(() => normalizeTags(["a".repeat(101)]), "태그는 문제당 20개, 태그명은 100자 이하여야 합니다.");
  });
});

describe("normalizeProblemRequest", () => {
  it("공백만 있는 값을 null 로 만든다", () => {
    // 저장값에 패딩이 남으면 주관식 채점이 뒤집힌다.
    const out = normalizeProblemRequest({ ...base, content: "  본문  ", explanation: "   ", answers: ["  서울  "] });
    expect(out.content).toBe("본문");
    expect(out.explanation).toBeNull();
    expect(out.answers).toEqual(["서울"]);
  });
});
```

- [ ] **Step 4: 실패 확인**

Run: `cd web && pnpm vitest run lib/problem/problemValidation.test.ts`
Expected: FAIL — 모듈 없음

- [ ] **Step 5: 구현**

Global Constraints 의 순서를 그대로 옮긴다. `normalizeProblemRequest` 는 **입력을 변형하지 않고 새 객체를 돌려준다**(Java 는 제자리 변형이지만 TS 에서는 호출부가 원본을 다시 쓰는 사고를 막는 편이 낫다 — 정답지에 미세 이탈로 기록).

- [ ] **Step 6: 통과 확인**

Run: `cd web && pnpm vitest run lib/problem/problemValidation.test.ts`
Expected: PASS (30건 내외)

- [ ] **Step 7: Commit**

```bash
git add web/lib/problem/problemValidation.ts web/lib/problem/problemValidation.test.ts web/lib/problem/imageUrl.ts web/lib/problem/imageUrl.test.ts
git commit -m "feat: port problem validation and image-url rules as pure modules"
```

---

## Task 5: 문제 CRUD 서비스 + 라우트

**Files:**
- Create: `web/lib/problem/owningDepartment.ts`, `web/lib/problem/owningDepartment.test.ts`
- Create: `web/lib/problem/problemService.ts`, `web/lib/problem/problemService.test.ts`
- Create: `web/app/api/admin/problems/route.ts` (POST 만; GET 은 Task 6)
- Create: `web/app/api/admin/problems/[id]/route.ts`, `.../[id]/route.test.ts`

**Interfaces:**
- Consumes: Task 2 DAO, Task 3 태그 DAO, Task 4 검증
- Produces:
  - `resolveOwningDepartment(conn: DbConn, requested: number|null, actor: AuthUser): Promise<number>`
  - `createProblem(conn: DbConn, input: ProblemCreateInput, requestedDepartmentId: number|null, actor: AuthUser): Promise<void>`
  - `updateProblem(conn: DbConn, id: number, input: ProblemCreateInput, actor: AuthUser): Promise<void>`
  - `archiveProblem(conn: DbConn, id: number, actor: AuthUser): Promise<void>`
  - `getProblemDetail(conn: DbConn, id: number, actor: AuthUser): Promise<ProblemDetailResponse>`
  - `assertOwnership(problem: {departmentId: number}, actor: AuthUser): void`
  - **`saveTypeSpecificData(conn: DbConn, problemId: number, req: ProblemCreateInput): Promise<void>`** — 유형에 따라 보기/정답/빈칸을 넣는다. **Task 9(엑셀)가 재사용하므로 export 한다.**
  - **`translateDuplicateSourceNumber(error: unknown, departmentName: string, sourceNumber: number): unknown`** — 23505 + 제약 이름이 일치할 때만 `BizError` 로 바꾸고, 아니면 받은 예외를 그대로 돌려준다. **DB 를 건드리지 않는다.** Task 7·9 가 재사용하므로 export 한다.
  - `ProblemDetailResponse = {id,type,content,imageUrl,referenceText,explanation,blankRevealCount,status,departmentId,sourceNumber,choices,answers,blanks,tags}` — Spring `ProblemDetailResponse` 와 필드·순서 동일

- [ ] **Step 1: owningDepartment 테스트 작성**

```typescript
it("부서 관리자는 요청한 부서를 무시하고 자기 부서로 강제된다", async () => {
  // 화면의 disabled 는 실수 방지일 뿐이다. 파라미터 위조는 여기서 막는다.
  const actor = { userId: 1, role: "DEPT_ADMIN", departmentId: deptA } as AuthUser;
  expect(await resolveOwningDepartment(db, deptB, actor)).toBe(deptA);
});
it("총괄 관리자가 부서를 안 주면 막는다", async () => {
  await expect(resolveOwningDepartment(db, null, superAdmin)).rejects.toThrow("문제가 귀속될 부서를 선택하세요.");
});
it("없는 부서를 막는다", async () => {
  await expect(resolveOwningDepartment(db, 999999, superAdmin)).rejects.toThrow("존재하지 않는 부서입니다.");
});
it("비활성 부서를 막고 부서명을 문구에 넣는다", async () => {
  await expect(resolveOwningDepartment(db, inactiveDeptId, superAdmin)).rejects.toThrow("비활성 부서에는 문제를 등록할 수 없습니다: 폐지팀");
});
```

- [ ] **Step 2: 실패 확인 → 구현 → 통과 확인**

Run: `cd web && pnpm vitest run lib/problem/owningDepartment.test.ts`

- [ ] **Step 3: 서비스 테스트 작성 — 중복 번호가 핵심**

```typescript
it("중복 문항번호를 한국어로 안내한다", async () => {
  // 2026-08-14 Critical(QA-1) 재발 방지: 부서명 조회가 catch 안에 있으면
  // 트랜잭션 abort(25P02) 때문에 이 테스트가 BizError 대신 DB 예외로 실패한다.
  await createProblem(db, oxRequest({ sourceNumber: 5 }), deptA, superAdmin);
  await expect(createProblem(db, oxRequest({ sourceNumber: 5 }), deptA, superAdmin))
    .rejects.toThrow("가팀 5번은 이미 있습니다. 다른 번호를 입력하세요.");
});

it("수정 경로도 같은 문구를 낸다", async () => {
  await createProblem(db, oxRequest({ sourceNumber: 5 }), deptA, superAdmin);
  const id = await createAndReturnId(oxRequest({ sourceNumber: 6 }));
  await expect(updateProblem(db, id, oxRequest({ sourceNumber: 5 }), superAdmin))
    .rejects.toThrow("가팀 5번은 이미 있습니다. 다른 번호를 입력하세요.");
});

it("부서 관리자는 남의 부서 문제에 접근할 수 없다", async () => {
  const id = await createAndReturnId(oxRequest({}), deptB, superAdmin);
  await expect(getProblemDetail(db, id, deptAdminOfA)).rejects.toMatchObject({ errorCode: ErrorCode.ACCESS_AUTH_DENIED });
});

it("수정은 유형을 바꿀 수 없다", async () => {
  const id = await createAndReturnId(oxRequest({}));
  await expect(updateProblem(db, id, shortAnswerRequest({}), superAdmin)).rejects.toThrow("문제 유형은 수정할 수 없습니다.");
});

it("수정은 보기·정답·빈칸을 지우고 다시 넣는다", async () => {
  const id = await createAndReturnId(mcqRequest({ choices: [c("가", true), c("나")] }));
  await updateProblem(db, id, mcqRequest({ choices: [c("다", true), c("라"), c("마")] }), superAdmin);
  const detail = await getProblemDetail(db, id, superAdmin);
  expect(detail.choices.map((x) => x.choiceText)).toEqual(["다", "라", "마"]);
});

it("보관은 상태만 바꾼다", async () => {
  const id = await createAndReturnId(oxRequest({}));
  await archiveProblem(db, id, superAdmin);
  expect((await getProblemDetail(db, id, superAdmin)).status).toBe("ARCHIVED");
});

it("없는 문제는 안내 문구가 같다", async () => {
  await expect(archiveProblem(db, 999999, superAdmin)).rejects.toThrow("존재하지 않는 문제입니다.");
  await expect(getProblemDetail(db, 999999, superAdmin)).rejects.toThrow("존재하지 않는 문제입니다.");
});
```

- [ ] **Step 4: 실패 확인**

Run: `cd web && pnpm vitest run lib/problem/problemService.test.ts`
Expected: FAIL

- [ ] **Step 5: 서비스 구현**

`createProblem` 골격 — **부서명을 쓰기 전에 읽는 것**이 핵심이다:

```typescript
export async function createProblem(conn: DbConn, input: ProblemCreateInput, requestedDepartmentId: number | null, actor: AuthUser): Promise<void> {
  const req = normalizeProblemRequest(input);
  validateProblem(req);
  validateSourceNumber(req.sourceNumber);
  const owningDepartmentId = await resolveOwningDepartment(conn, requestedDepartmentId, actor);
  // 부서명은 쓰기 전에 읽어 둔다. INSERT 가 UNIQUE 를 위반하면 PostgreSQL 이 트랜잭션 전체를
  // abort 하므로(25P02), 그 뒤에 SELECT 하면 안내 문구를 만들려던 조회가 새 예외를 던진다.
  // 2026-08-14 에 Spring 에서 Critical 로 잡힌 결함이 정확히 이 모양이다. 되돌리지 말 것.
  // 기존 findDepartmentById 가 행 전체를 준다 — 부서명 전용 함수를 새로 만들지 않는다.
  const departmentName = (await findDepartmentById(conn, owningDepartmentId)).name;
  const tags = normalizeTags(req.tags);

  await conn.transaction(async (tx) => {
    let problemId: number;
    try {
      problemId = await insertProblem(tx, {
        type: req.type,
        content: req.content,
        imageUrl: req.imageUrl ?? null,
        referenceText: req.referenceText ?? null,
        explanation: req.explanation ?? null,
        // FILL_BLANK 가 아니면 반드시 null 이다. 유형을 바꿔 저장한 뒤 남은 값이
        // 풀이 화면의 빈칸 노출 개수로 잘못 쓰이는 것을 막는다(Spring 과 동일).
        blankRevealCount: req.type === "FILL_BLANK" ? req.blankRevealCount ?? null : null,
        status: "ACTIVE",
        departmentId: owningDepartmentId,
        sourceNumber: req.sourceNumber ?? null,
        createdBy: actor.userId,
      });
    } catch (error) {
      throw translateDuplicateSourceNumber(error, departmentName, req.sourceNumber!);
    }
    await saveTypeSpecificData(tx, problemId, req);
    await replaceProblemTags(tx, problemId, await findOrCreateTagsByNames(tx, tags));
    // recordAudit 의 두 번째 인자는 객체다 — 위치 인자로 부르면 컴파일되지 않는다.
    await recordAudit(tx, { actorId: actor.userId, action: "PROBLEM_CREATED", targetType: "PROBLEM", targetId: problemId, detail: { type: req.type } });
  });
}
```

`translateDuplicateSourceNumber` 는 **DB 를 건드리지 않는다**:

```typescript
export function translateDuplicateSourceNumber(error: unknown, departmentName: string, sourceNumber: number): unknown {
  const e = error as { code?: string; constraint_name?: string };
  if (e?.code !== "23505" || e.constraint_name !== "uq_problems_department_source_number") {
    return error; // 다른 UNIQUE 위반이면 번호 탓으로 돌리지 않는다
  }
  return new BizError(ErrorCode.INPUT_VALUE_INVALID, `${departmentName} ${sourceNumber}번은 이미 있습니다. 다른 번호를 입력하세요.`);
}
```

- [ ] **Step 6: 통과 확인**

Run: `cd web && pnpm vitest run lib/problem/problemService.test.ts`
Expected: PASS

- [ ] **Step 7: 판별력 검증 — 이 단계를 건너뛰지 마라**

`createProblem` 의 `findDepartmentById` 호출(부서명을 얻는 줄)을 `catch` 블록 안으로 옮기고 중복 테스트를 돌린다.
Expected: **실패**하며 `BizError` 가 아니라 25P08/25P02 계열 DB 예외가 나온다. 확인한 뒤 되돌린다.

이 확인이 통과하지 못하면 그 테스트는 QA-1 재발을 막지 못한다.

- [ ] **Step 8: 라우트 구현**

```typescript
// web/app/api/admin/problems/route.ts
export async function POST(request: Request): Promise<Response> {
  return handleRoute(async () => {
    const actor = await requireActor("SUPER_ADMIN", "DEPT_ADMIN");
    const body = await readJson(request);
    // parseNumericParam 이다 — 인자가 2개이고, 잘못된 값이면 1000 + "요청 값의 형식이 올바르지 않습니다: departmentId".
    const departmentId = parseNumericParam(new URL(request.url).searchParams.get("departmentId"), "departmentId");
    await createProblem(getDb(), body as ProblemCreateInput, departmentId, actor);
    return undefined; // ok()
  });
}
```

`[id]/route.ts` 는 `GET`(상세)·`PUT`(수정)·`DELETE`(보관) 세 개를 export 하고 모두 `requireActor("SUPER_ADMIN","DEPT_ADMIN")` 를 쓴다.

- [ ] **Step 9: 라우트 테스트 + 전체 스위트**

라우트 테스트는 (a) 역할 없는 사용자 → 990 (b) 정상 생성 → 200/`resultCode:200` (c) 검증 실패 → 400/1000 + 문구 세 건을 확인한다.

Run: `cd web && pnpm test`
Expected: 실패 0

- [ ] **Step 10: Commit**

```bash
git add web/lib/problem/owningDepartment.ts web/lib/problem/owningDepartment.test.ts web/lib/problem/problemService.ts web/lib/problem/problemService.test.ts web/app/api/admin/problems
git commit -m "feat: add problem create/update/archive/detail with duplicate-number translation"
```

---

## Task 6: 목록 조회

**Files:**
- Create: `web/lib/problem/problemListService.ts`, `web/lib/problem/problemListService.test.ts`
- Modify: `web/lib/db/problems.ts` (목록 SQL 은 DAO 에 둔다 — `ProblemMapper.xml findAll`(:91)·`countAll`(:110) 이식처. 선례: `web/lib/db/users.ts` 의 `listUsers` 가 같은 조인+필터+정렬 모양을 DAO 에서 한다. 서비스에 SQL 을 두면 Architecture 문단이 정한 층이 갈라진다. Task 2 가 만든 파일이지만 이 두 함수는 Task 6 의 필터 타입과 `parseDateParam` 에 의존하므로 여기서 추가한다)
- Modify: `web/lib/db/problems.test.ts` (위 두 함수의 DAO 테스트)
- Modify: `web/app/api/admin/problems/route.ts` (GET 추가)

**Interfaces:**
- Consumes: Task 2·5
- Produces:
  - `listProblems(conn: DbConn, filters): Promise<ProblemListItem[]>` — `web/lib/db/problems.ts`. `ProblemMapper.xml findAll`(:91) 이식: `LEFT JOIN problem_tags/tags` + `GROUP BY p.id, d.name` + `array_agg`, `ORDER BY p.created_at DESC, p.id DESC`, `LIMIT/OFFSET`
  - `countProblems(conn: DbConn, filters): Promise<number>` — `web/lib/db/problems.ts`. `ProblemMapper.xml countAll`(:110) 이식: **태그 조인 없이** `count(*)` — 조인을 두면 총건수가 태그 수만큼 부푼다. `listProblems` 와 반드시 같은 필터 조각을 쓴다
  - `listProblems(conn: DbConn, actor: AuthUser, filters): Promise<ProblemPageResponse>` — `web/lib/problem/problemListService.ts`. 역할 스코프·클램프·페이지 조립만 하고 SQL 은 위 두 DAO 에 위임한다. DAO 와 이름이 겹치므로 서비스에서는 `import { listProblems as selectProblemRows, countProblems } from "@/lib/db/problems"` 처럼 별칭으로 받는다
    - `filters = {departmentId: number|null, type: string|null, status: string|null, createdFrom: Date|null, createdTo: Date|null, tag: string|null, keyword: string|null, page: number, size: number}`
    - 반환 `{items, totalCount, page, size}`
  - **`parseDateParam(value: string|null|undefined, name: string): Date|null`** — `web/lib/http/params.ts` 에 추가한다. `parseNumericParam` 옆에 두어 두 파서가 같은 오류 형식을 쓰는 것이 눈에 보이게 한다.

- [ ] **Step 1: 테스트 작성**

```typescript
it("size 를 100 으로 클램프한다", async () => {
  // size=100000 을 그대로 쓰면 페이징이 없는 것과 같아진다.
  const res = await listProblems(db, superAdmin, { ...none, size: 100000 });
  expect(res.size).toBe(100);
});
it("size 가 0 이하면 20 이다", async () => {
  expect((await listProblems(db, superAdmin, { ...none, size: 0 })).size).toBe(20);
});
it("page 가 0 이하면 1 이다", async () => {
  expect((await listProblems(db, superAdmin, { ...none, page: 0 })).page).toBe(1);
});
it("부서 관리자는 요청한 departmentId 가 무시된다", async () => {
  const res = await listProblems(db, deptAdminOfA, { ...none, departmentId: deptB });
  expect(res.items.every((i) => i.departmentId === deptA)).toBe(true);
});
it("createdTo 는 그 날 전체를 포함한다", async () => {
  // < (createdTo + 1 day) 가 아니면 그날 등록분이 통째로 빠진다.
  const res = await listProblems(db, superAdmin, { ...none, createdTo: todayISO });
  expect(res.totalCount).toBeGreaterThan(0);
});
it("totalCount 가 태그 수만큼 부풀지 않는다", async () => {
  // countAll 에 태그 조인을 두면 태그 3개짜리 문제 1건이 3건으로 세어진다.
  await attachTags(problemId, ["가", "나", "다"]);
  expect((await listProblems(db, superAdmin, none)).totalCount).toBe(1);
});
it("keyword 는 본문 부분일치이고 대소문자를 가리지 않는다", async () => {
  const res = await listProblems(db, superAdmin, { ...none, keyword: "SWOT" });
  expect(res.items).toHaveLength(1);
});
it("tag 필터는 대소문자를 가리지 않는다", async () => {
  const res = await listProblems(db, superAdmin, { ...none, tag: "회계" });
  expect(res.items).toHaveLength(1);
});
it("잘못된 날짜 파라미터는 목록 전체를 실패시키지 않고 형식 오류로 안내한다", () => {
  // Spring 은 @DateTimeFormat 이 없으면 목록 조회 자체가 500 으로 죽었다(QA D1).
  expect(() => parseDateParam("어제", "createdFrom")).toThrowError(
    expect.objectContaining({ message: "요청 값의 형식이 올바르지 않습니다: createdFrom" }));
  expect(() => parseDateParam("2026-02-30", "createdFrom")).toThrowError(
    expect.objectContaining({ message: "요청 값의 형식이 올바르지 않습니다: createdFrom" }));
  expect(parseDateParam(null, "createdFrom")).toBeNull();
  expect(parseDateParam("", "createdFrom")).toBeNull();
});

it("created_at 이 같아도 순서가 흔들리지 않는다", async () => {
  // 엑셀 업로드는 created_at 이 같은 행을 무더기로 만든다. p.id 타이브레이커가 없으면
  // LIMIT/OFFSET 페이징에서 중복·누락이 난다.
  const first = await listProblems(db, superAdmin, { ...none, size: 2, page: 1 });
  const second = await listProblems(db, superAdmin, { ...none, size: 2, page: 2 });
  const ids = [...first.items, ...second.items].map((i) => i.id);
  expect(new Set(ids).size).toBe(ids.length);
});
```

- [ ] **Step 2: 실패 확인 → 구현 → 통과 확인**

`countAll` 은 태그 조인 없이, `findAll` 은 `LEFT JOIN problem_tags/tags` + `GROUP BY p.id, d.name` + `array_agg` 로 작성한다. `ORDER BY p.created_at DESC, p.id DESC` 를 잊지 말 것.

Run: `cd web && pnpm vitest run lib/problem/problemListService.test.ts`

- [ ] **Step 3: GET 라우트 추가 + 전체 스위트**

Run: `cd web && pnpm test`

- [ ] **Step 4: Commit**

```bash
git add web/lib/db/problems.ts web/lib/db/problems.test.ts web/lib/problem/problemListService.ts web/lib/problem/problemListService.test.ts web/app/api/admin/problems/route.ts
git commit -m "feat: add the problem list endpoint with nine filters and paging"
```

---

## Task 7: 부서 이동 + 다음 문항번호

**Files:**
- Create: `web/lib/problem/departmentMove.ts`, `web/lib/problem/departmentMove.test.ts`
- Create: `web/app/api/admin/problems/[id]/department/route.ts`
- Create: `web/app/api/admin/problems/next-source-number/route.ts`

**Interfaces:**
- Consumes: Task 2·5
- Produces:
  - `changeProblemDepartment(conn, id, departmentId, actor): Promise<number>` — 새 번호
  - `nextSourceNumber(conn, departmentId: number|null, actor): Promise<number>`

- [ ] **Step 1: 테스트 작성**

```typescript
it("새 부서의 마지막+1 로 재부여한다", async () => {
  await create({ dept: deptB, sourceNumber: 5 });
  const id = await create({ dept: deptA, sourceNumber: 5 });
  expect(await changeProblemDepartment(db, id, deptB, superAdmin)).toBe(6);
});
it("빈 부서로 옮기면 1 이다", async () => {
  const id = await create({ dept: deptA, sourceNumber: 9 });
  expect(await changeProblemDepartment(db, id, deptB, superAdmin)).toBe(1);
});
it("같은 부서로 옮기면 거절한다", async () => {
  // 막지 않으면 findMaxSourceNumber 가 자기 행까지 세어 번호가 1씩 밀린다.
  const id = await create({ dept: deptA, sourceNumber: 3 });
  await expect(changeProblemDepartment(db, id, deptA, superAdmin)).rejects.toThrow("이미 가팀 소속입니다.");
});
it("비활성 부서로는 옮길 수 없다", async () => {
  await expect(changeProblemDepartment(db, id, inactiveDeptId, superAdmin))
    .rejects.toThrow("비활성 부서로는 옮길 수 없습니다: 폐지팀");
});
it("nextSourceNumber 는 보관 문제도 세어 마지막+1 을 준다", async () => {
  await create({ dept: deptA, sourceNumber: 9, status: "ARCHIVED" });
  expect(await nextSourceNumber(db, deptA, superAdmin)).toBe(10);
});
it("nextSourceNumber 는 부서 관리자의 요청 부서를 무시한다", async () => {
  await create({ dept: deptA, sourceNumber: 4 });
  expect(await nextSourceNumber(db, deptB, deptAdminOfA)).toBe(5);
});
```

> **`이미 <부서명> 소속입니다.` 는 2026-08-14 최종 리뷰에서 Spring 에 추가된 가드다.** 파리티 대상이며 원본에도 있다.

- [ ] **Step 2: 실패 확인 → 구현 → 통과 확인**

가드 순서: 문제 존재 → 부서 지정 → 부서 존재 → 부서 활성 → **같은 부서 거절** → 번호 계산 → 쓰기 → 감사. 쓰기의 23505 도 `translateDuplicateSourceNumber(error, department.name, assigned)` 로 번역한다(동시 이동 경합).

- [ ] **Step 3: 라우트 2개 구현**

부서 이동은 **`requireActor("SUPER_ADMIN")`** 만 — 부서 관리자는 접근할 수 없다. 다음 번호는 `requireActor("SUPER_ADMIN","DEPT_ADMIN")`.

- [ ] **Step 4: 라우트 우선순위 실측**

Run: `cd web && pnpm build && pnpm dev` 로 띄운 뒤

```bash
curl -s -b cookies.txt "http://localhost:3000/api/admin/problems/next-source-number?departmentId=1"
```

Expected: 숫자가 담긴 정상 응답. `[id]` 라우트가 `next-source-number` 를 id 로 파싱해 "존재하지 않는 문제입니다." 가 나오면 **실패다** — 그 경우 라우트 배치를 조정한다.

- [ ] **Step 5: 전체 스위트 + Commit**

```bash
git add web/lib/problem/departmentMove.ts web/lib/problem/departmentMove.test.ts web/app/api/admin/problems/[id]/department web/app/api/admin/problems/next-source-number
git commit -m "feat: add department move with renumbering and the next-source-number endpoint"
```

---

## Task 8: 이미지 업로드 (Supabase Storage)

**Files:**
- Create: `web/lib/problem/problemImage.ts`, `web/lib/problem/problemImage.test.ts`
- Create: `web/app/api/admin/problems/images/route.ts`
- Modify: `web/lib/problem/imageUrl.ts` (접두어)
- Modify: `web/.env.example` 은 삭제됐으므로 **README 대신 정답지에 새 환경변수를 기록**

**Interfaces:**
- Consumes: `checkImageUrl`, `recordAudit`
- Produces: `storeProblemImage(file: {buffer: ArrayBuffer; fileName: string; contentType: string; size: number}, actor): Promise<string>` — 저장된 URL

- [ ] **Step 1: 사전 준비 — 버킷과 환경변수**

Supabase 대시보드에서 **비공개 버킷 `problem-images`** 를 만든다. 추가 환경변수 2개:

```
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
```

> **서비스 롤 키는 서버에서만 쓴다.** `NEXT_PUBLIC_` 접두어를 절대 붙이지 마라 — 붙이면 브라우저 번들에 들어가 누구나 스토리지 전체를 조작할 수 있다.

```bash
cd web && pnpm add @supabase/supabase-js
```

- [ ] **Step 2: 검증 테스트 작성 (스토리지는 목)**

```typescript
it("5MB 를 넘으면 막는다", async () => {
  await expect(storeProblemImage(fileOf({ size: 5 * 1024 * 1024 + 1 }), actor))
    .rejects.toThrow("이미지 크기는 5MB를 초과할 수 없습니다.");
});
it("svg 를 막는다", async () => {
  // SVG 는 인라인 <script> 를 담을 수 있어 저장형 XSS 가 된다.
  await expect(storeProblemImage(fileOf({ fileName: "x.svg", contentType: "image/svg+xml" }), actor))
    .rejects.toThrow("허용되지 않는 파일 형식입니다. png, jpg, jpeg, gif, webp 이미지만 업로드할 수 있습니다.");
});
it("확장자와 Content-Type 이 어긋나면 막는다", async () => {
  await expect(storeProblemImage(fileOf({ fileName: "x.png", contentType: "text/html" }), actor))
    .rejects.toThrow("허용되지 않는 파일 형식입니다. png, jpg, jpeg, gif, webp 이미지만 업로드할 수 있습니다.");
});
it("파일명을 UUID 로 바꾼다", async () => {
  const url = await storeProblemImage(fileOf({ fileName: "../../etc/passwd.png" }), actor);
  expect(url).toMatch(/^\/api\/problem-images\/[0-9a-f-]{36}\.png$/);
  expect(url).not.toContain("..");
});
it("반환한 URL 이 checkImageUrl 을 통과한다", async () => {
  // 업로드가 돌려준 값을 그대로 저장할 수 있어야 두 경로가 맞물린다.
  expect(checkImageUrl(await storeProblemImage(fileOf({}), actor))).toBe("VALID");
});
```

- [ ] **Step 3: 실패 확인 → 구현 → 통과 확인**

`IMAGE_URL_PREFIX` 를 `/api/problem-images/` 로 바꾼다. 비공개 버킷이므로 직접 URL 을 노출하지 않고, 조회는 서브플랜 5에서 서명 URL 또는 프록시 라우트로 붙인다 — **이 서브플랜에서는 업로드와 URL 형식만 확정한다**. 정답지에 이 경계를 적는다.

- [ ] **Step 4: 라우트 구현**

멀티파트 처리는 `app/api/admin/users/excel-upload/route.ts` 의 형태를 따른다(파싱 실패 → 200/1009, 역할 검사 순서).

- [ ] **Step 5: 전체 스위트 + Commit**

```bash
git add web/lib/problem/problemImage.ts web/lib/problem/problemImage.test.ts web/app/api/admin/problems/images web/lib/problem/imageUrl.ts web/package.json web/pnpm-lock.yaml
git commit -m "feat: store problem images in supabase storage"
```

---

## Task 9: 문제 엑셀 일괄 등록

**Files:**
- Create: `web/lib/problem/problemExcel.ts`, `web/lib/problem/problemExcel.test.ts`
- Create: `web/app/api/admin/problems/excel-upload/route.ts`, `.../route.test.ts`

**Interfaces:**
- Consumes: Task 2·3·4·5, `xlsx` 0.20.3
- Produces: `uploadProblemsExcel(db: Db, file: {buffer: ArrayBuffer; fileName: string}, requestedDepartmentId: number|null, actor: AuthUser): Promise<ExcelResult>`
  - `ExcelResult = {totalRows, successRows, failRows, errorDetail: string|null}`

> **`excel_upload_logs` 기록을 빠뜨리지 마라.** 행 처리를 마친 뒤 로그 1행을 넣고 그 id 로 감사를 남긴다. 넣는 필드는 Spring 과 동일하다:
> `uploadedBy=actor.userId` · **`departmentId=effectiveDepartmentId`**(resolver 가 정한 값 — 문제 행과 같은 값이어야 이력과 실제 귀속이 어긋나지 않는다) · `targetType="PROBLEM"`(계정 업로드는 다른 값을 쓴다) · `fileName` · `totalRows` · `successRows` · `failRows` · `errorDetail`(비면 `null`).
> 로그 insert 와 그 감사(`PROBLEM_EXCEL_UPLOADED`)는 **한 트랜잭션**으로 묶는다(서브플랜 3의 계정 엑셀과 같은 경계).

- [ ] **Step 1: 테스트 작성 — 행별 격리가 핵심**

```typescript
const HEADER = ["문제유형","문제내용","이미지","참조지문","보기1","보기2","보기3","보기4","보기5","정답","해설","태그","문항번호"];
const buildExcel = (rows: (string|number|null)[][]) => { /* XLSX.utils.aoa_to_sheet → write → ArrayBuffer */ };

it("한 행이 실패해도 나머지는 저장된다", async () => {
  // 653행 실적재의 근거다. 이게 깨지면 한 행 오타로 전체가 롤백된다.
  const res = await uploadProblemsExcel(db, buildExcel([
    ["MCQ_SINGLE","정상1","","","가","나","","","","1","","",1],
    ["MCQ_SINGLE","","","","가","나","","","","1","","",2],   // 내용 없음 → 실패
    ["MCQ_SINGLE","정상2","","","가","나","","","","1","","",3],
  ]), deptA, superAdmin);
  expect(res).toMatchObject({ totalRows: 3, successRows: 2, failRows: 1 });
  expect(res.errorDetail).toBe("행 3: 문제유형과 문제내용은 필수입니다.");
});

it("파일 안 번호 중복은 그 행만 실패한다", async () => {
  const res = await uploadProblemsExcel(db, buildExcel([
    ["OX","가","","","O","X","","","","1","","",11],
    ["OX","나","","","O","X","","","","1","","",11],
  ]), deptA, superAdmin);
  expect(res.failRows).toBe(1);
  expect(res.errorDetail).toBe("행 3: 파일 안에서 문항 번호가 중복됩니다: 11");
});

it("DB 중복은 일반 문구에 묻히지 않는다", async () => {
  // "문제 저장 중 오류가 발생했습니다." 로 나오면 실패다 — 원인이 번호라는 걸 알 수 없고,
  // 12개 파일을 부서만 바꿔 올리는 실적재에서 반드시 마주치는 상황이다.
  await createExisting({ dept: deptA, sourceNumber: 7 });
  const res = await uploadProblemsExcel(db, buildExcel([["OX","가","","","O","X","","","","1","","",7]]), deptA, superAdmin);
  expect(res.errorDetail).toBe("행 2: 문항 번호 7번은 이 부서에 이미 있습니다.");
});

it("번호가 없으면 그 행이 실패한다", async () => {
  const res = await uploadProblemsExcel(db, buildExcel([["OX","가","","","O","X","","","","1","","",null]]), deptA, superAdmin);
  expect(res.errorDetail).toBe("행 2: 문항 번호는 필수입니다.");
});

it("FILL_BLANK 는 거부한다", async () => {
  const res = await uploadProblemsExcel(db, buildExcel([["FILL_BLANK","가","","","","","","","","","","",1]]), deptA, superAdmin);
  expect(res.errorDetail).toBe("행 2: 빈칸 채우기는 엑셀 업로드를 지원하지 않습니다. 개별 입력을 이용하세요.");
});

it("이미지 열이 비어 있지 않으면 거부한다", async () => {
  const res = await uploadProblemsExcel(db, buildExcel([["OX","가","/x.png","","O","X","","","","1","","",1]]), deptA, superAdmin);
  expect(res.errorDetail).toContain("이미지는 엑셀로 등록할 수 없습니다.");
});

it("501행이면 처리 전에 전체를 거부한다", async () => {
  await expect(uploadProblemsExcel(db, buildExcel(rows(501)), deptA, superAdmin))
    .rejects.toThrow("한 번에 업로드할 수 있는 데이터 행은 최대 500건입니다. 파일을 나눠 업로드하세요.");
});

it("시트가 없으면 1013 이다", async () => {
  await expect(uploadProblemsExcel(db, emptyWorkbook(), deptA, superAdmin))
    .rejects.toThrow("엑셀 파일에 시트가 없습니다. 첫 번째 시트에 문제 목록을 담아 다시 올려 주세요.");
});

it("성공 행은 감사 로그를 남긴다", async () => {
  await uploadProblemsExcel(db, buildExcel([["OX","가","","","O","X","","","","1","","",1]]), deptA, superAdmin);
  const logs = await db.select().from(auditLogs).where(eq(auditLogs.action, "PROBLEM_CREATED_BY_EXCEL"));
  expect(logs).toHaveLength(1);
});

it("업로드 이력을 남기고 귀속 부서가 문제 행과 같다", async () => {
  // excel_upload_logs.department_id 가 실제 귀속과 어긋나면 이력을 믿을 수 없게 된다.
  await uploadProblemsExcel(db, buildExcel([
    ["OX","가","","","O","X","","","","1","","",1],
    ["OX","","","","O","X","","","","1","","",2],   // 실패 1건
  ]), deptA, superAdmin);
  const [log] = await db.select().from(excelUploadLogs);
  expect(log).toMatchObject({ targetType: "PROBLEM", departmentId: deptA, totalRows: 2, successRows: 1, failRows: 1 });
  expect(log.errorDetail).toBe("행 3: 문제유형과 문제내용은 필수입니다.");
});

it("부서 관리자가 올리면 이력의 부서도 본인 부서다", async () => {
  await uploadProblemsExcel(db, buildExcel([["OX","가","","","O","X","","","","1","","",1]]), deptB, deptAdminOfA);
  const [log] = await db.select().from(excelUploadLogs);
  expect(log.departmentId).toBe(deptA); // 요청한 deptB 가 아니다
});
```

- [ ] **Step 2: 실패 확인 → 구현 → 통과 확인**

행별 트랜잭션은 `accountExcel.ts` 의 형태를 그대로 따른다:

```typescript
for (const [index, row] of dataRows.entries()) {
  const rowNumber = index + 2; // 헤더 1행
  const parsed = validateRow(row, rowNumber, seenSourceNumbers);
  if (!parsed.ok) { failures.push(parsed); continue; }
  try {
    // 행마다 독립 트랜잭션 — 한 행의 실패가 이미 커밋된 행을 되돌리지 않는다.
    await db.transaction(async (tx) => {
      const id = await insertProblem(tx, parsed.problem);
      await saveTypeSpecificData(tx, id, parsed);
      await replaceProblemTags(tx, id, await findOrCreateTagsByNames(tx, parsed.tags));
      await recordAudit(tx, { actorId: actor.userId, action: "PROBLEM_CREATED_BY_EXCEL", targetType: "PROBLEM", targetId: id, detail: { type: parsed.problem.type } });
    });
    successRows++;
  } catch (error) {
    const translated = translateDuplicateSourceNumber(error, departmentName, parsed.problem.sourceNumber);
    failures.push({ rowNumber, reason: translated instanceof BizError
      ? `문항 번호 ${parsed.problem.sourceNumber}번은 이 부서에 이미 있습니다.`
      : "문제 저장 중 오류가 발생했습니다." });
  }
}
```

> 부서명은 **루프 시작 전에 한 번** 읽는다. 루프 안에서 읽으면 실패한 행의 abort 된 트랜잭션 위에서 조회하게 될 수 있다.

- [ ] **Step 3: 라우트 + 전체 스위트**

`maxDuration = 300`. 파일 상한 4MB.

Run: `cd web && pnpm test`

- [ ] **Step 4: Commit**

```bash
git add web/lib/problem/problemExcel.ts web/lib/problem/problemExcel.test.ts web/app/api/admin/problems/excel-upload
git commit -m "feat: add problem excel bulk upload with per-row isolation"
```

---

## Task 10: E2E 검증 + 정답지 대조

**Files:**
- Create: `docs/qa/2026-08-19-problem-bank-e2e-verification.md`

- [ ] **Step 1: 서버 기동**

```bash
cd web && pnpm build && pnpm start
```

- [ ] **Step 2: curl 로 10개 엔드포인트 전수 확인**

로그인해 쿠키를 받은 뒤 각 엔드포인트를 호출하고 **응답 본문을 그대로** 문서에 적는다. 최소 항목:

| # | 확인 | 기대 |
|---|---|---|
| 1 | 총괄로 생성 | 200 / `resultCode:200` |
| 2 | 부서관리자로 생성(부서 위조) | 자기 부서로 저장됨 |
| 3 | 중복 번호로 생성 | 400 / 1000 / `"<부서명> N번은 이미 있습니다. 다른 번호를 입력하세요."` — **`처리 중 오류가 발생하였습니다` 가 나오면 실패** |
| 4 | 목록 `size=100000` | `size:100` |
| 5 | 목록 `tag`·`keyword`·기간 필터 | 각각 기대 건수 |
| 6 | 부서관리자로 남의 부서 상세 | 403 / 990 |
| 7 | 부서관리자로 부서 이동 | 403 / 990 |
| 8 | 같은 부서로 이동 | 400 / `"이미 <부서명> 소속입니다."` |
| 9 | 다음 번호 | 숫자, `[id]` 라우트로 새지 않음 |
| 10 | 이미지 svg 업로드 | 1014 |
| 10-1 | 이미지 업로드, `file` 파트 자체가 없음(I11ⓐ/ⓑ 통합 — 승인된 이탈 ⑥) | 200 / 1009 / `"파일을 업로드할 수 없습니다."` |
| 10-2 | 이미지 업로드, `file` 파트는 있지만 0바이트(I11ⓒ, 그대로 이식·이탈 아님) | 400 / 1009 / `"필수 파일이 누락되었습니다."` — 10-1 과 문구가 다르다는 것 자체가 확인 대상(파트 부재와 0바이트를 같은 취급으로 뭉개면 안 된다) |
| 10-3 | 이미지 업로드, 5MB 초과 + 허용 안 되는 확장자·Content-Type 동시 위반(I4/I5 순서) | 400 / 1015 / `"이미지 크기는 5MB를 초과할 수 없습니다."` — 크기 검사(java:63-65)가 형식 검사(:130-142)보다 먼저다. 1014 형식 문구가 나오면 검사 순서가 뒤집힌 것 |
| 10-4 | 이미지 업로드 성공 후 감사 로그(I9) | curl 응답 URL 을 기록한 뒤 DB 직접 조회(`select * from audit_logs order by id desc limit 1`): action `PROBLEM_IMAGE_UPLOADED`, targetType `PROBLEM_IMAGE`, targetId `NULL`, detail `{"fileName":"<uuid.ext>"}` — `<uuid.ext>` 는 #10 응답 URL의 `IMAGE_URL_PREFIX` 이후 부분과 일치해야 한다 |
| 11 | 12컬럼 엑셀 업로드 | 전 행 `"문항 번호는 필수입니다."` |
| 12 | 13컬럼 엑셀 업로드 | 성공 |
| 13 | 같은 파일 재업로드 | 전 행 `"문항 번호 N번은 이 부서에 이미 있습니다."` |
| 14 | 태그 목록 | 200 |

- [ ] **Step 3: 업로드한 이미지 오브젝트 정리(스탠딩 룰링 — M5 전례를 따른다)**

**이미지를 지우는 API 는 없다.** `ProblemController.java` 에 이미지 삭제 매핑이 없고(9개 엔드포인트
전수 확인, `archive`(`DELETE /{id}`)도 `problems.status` 만 바꿀 뿐 `problemImageService` 를
호출하지 않는다), Spring 도 문제를 보관 처리할 때 이미지를 지우지 않는다. 그런데 위 #10·10-1~10-4
를 실측하려면 **적어도 이미지 하나는 실제로 성공 업로드**해야 감사 로그·URL 행을 잴 수 있고,
그 오브젝트는 업로드된 뒤 앱 안에는 지울 방법이 없다 — Ruling 12(`.superpowers/sdd/2026-08-19-
migration-problem-bank/progress.md`)가 Task 8 라우트 검증에 대해 세운 것과 같은 상황이고, 그
Ruling 12 자체가 근거로 든 전례가 M5(Task 9, 엑셀)다: 실물 722문항을 실제로 적재한 뒤 한
트랜잭션으로 삭제해 DB 를 검증 전과 정확히 같은 상태로 복원했다(`progress.md:485`). 여기서도
같은 방식을 따른다 — **업로드 → 오브젝트 키(#10-4 에서 기록한 `<uuid.ext>`) 기록 → Supabase
Storage API 또는 대시보드에서 그 키를 직접 삭제 → 버킷을 다시 조회해 이 검증에서 만든 오브젝트가
남아 있지 않은지 확인**. 이 결과(올린 키, 지운 키, 최종 빈 상태 확인)를 검증 문서에 그대로 남긴다
— 확인 없이 "지웠다"고만 적으면 안 된다.

- [ ] **Step 4: 정답지 대조**

Task 1 의 정답지를 한 줄씩 짚어 실측값과 대조하고, 어긋나는 항목은 고치거나 **승인된 이탈로 기록**한다. 대조하지 않은 행이 남아 있으면 안 된다.

- [ ] **Step 5: 전체 검증**

```bash
cd web && pnpm test && pnpm build
cd ../backend && ./gradlew cleanTest test   # 301 유지 — 이 서브플랜은 backend 를 건드리지 않는다
```

- [ ] **Step 6: Commit**

```bash
git add docs/qa/2026-08-19-problem-bank-e2e-verification.md
git commit -m "docs: record the problem-bank end-to-end verification results"
```

---

## Self-Review 결과

**Spec 커버리지** — 설계 문서가 서브플랜 4에 배정한 항목을 Task 에 대응시켰다.

| 설계의 배정 | Task |
|---|---|
| `ProblemController` 9개 엔드포인트 | 5(4개) · 6(1개) · 7(2개) · 8(1개) · 9(1개) |
| `TagController` 관리자 태그 | 3 |
| 5유형 · 빈칸 | 4 |
| 태그 | 3 |
| 이미지(Supabase Storage) | 8 |
| 문제 엑셀 | 9 |
| 페이지네이션 | 6 |
| 문항번호 | 2·5·7·9 |
| 파킹: xlsx 0.20.x | **이미 완료**(2026-08-19, 커밋 `91f53ce`) |
| 파킹: `Db`→`DbConn` 승격 | **추가 작업 없음** — `DbConn` 이 이미 `client.ts` 에 있고 서브플랜 3이 행별 트랜잭션에 쓰고 있다 |
| 파킹: 컷오버 이월분(엑셀 로그 tx, 타임아웃 정책) | 이 서브플랜 범위 밖 — 컷오버 유지 |
| 배포 스펙 superseded | 1 |
| `bootstrap.ts` `.env` | 1 |

**타입 일관성**
- `DbConn` 은 DAO·서비스 전 구간에서 쓰고, 라우트만 `getDb()`(=`Db`)를 넘긴다.
- `sourceNumber` 는 전 구간 `number | null`. 엑셀 파싱만 문자열을 받아 숫자로 바꾼다.
- `translateDuplicateSourceNumber` 는 Task 5 가 정의하고 7·9 가 재사용한다 — 시그니처 `(error: unknown, departmentName: string, sourceNumber: number) => unknown`.
- `checkImageUrl` 의 반환은 문자열 리터럴 유니온이며 Task 4 가 정의하고 5·8·9 가 쓴다.

**놓치기 쉬운 지점**
- `countAll` 에 태그 조인을 두면 총건수가 태그 수만큼 부푼다(Task 6).
- `ORDER BY` 에 `p.id` 타이브레이커가 없으면 엑셀 업로드 뒤 페이징이 흔들린다(Task 6).
- 부서명을 catch 안에서 조회하면 QA-1 이 재발한다(Task 5 Step 7 이 이걸 판별력으로 고정한다).
- `next-source-number` 가 `[id]` 로 새면 "존재하지 않는 문제입니다." 가 나온다(Task 7 Step 4).
- `normalizeTags` 는 `toLowerCase()` 를 쓴다. `toLocaleLowerCase()` 는 로케일에 따라 결과가 갈린다.
- 엑셀 부서명은 루프 **밖에서** 한 번 읽는다.

**미해결로 남기는 것**
- 비공개 버킷의 **조회 경로**(서명 URL vs 프록시 라우트)는 서브플랜 5에서 정한다. 이 서브플랜은 업로드와 URL 형식까지만 확정하고 그 경계를 정답지에 적는다.

**상세 검토에서 바로잡은 것 (2차, 8건)** — 초안이 `web/` 의 실제 시그니처와 어긋난 부분이다. 전부 실제 파일에서 확인했다.

| # | 초안 | 실제 | 영향 |
|---|---|---|---|
| 1 | `recordAudit(conn, actorId, action, …)` 위치 인자 | **두 번째 인자가 객체** `{actorId, action, targetType, targetId, detail}` | 컴파일 불가. 호출 예제 2곳 수정 |
| 2 | `numberParam(value)` | **`parseNumericParam(value, name)`** — 인자 2개 | 컴파일 불가 |
| 3 | `findDepartmentName(conn, id)` 를 새로 만든다고 가정 | `findDepartmentById(db, id)` 가 이미 행 전체를 준다 | 불필요한 중복 함수 |
| 4 | `saveTypeSpecificData`·`translateDuplicateSourceInput`·`ProblemCreateInput` 이 Produces 에 없음 | Task 4·5 Produces 에 시그니처와 타입 정의 추가 | 다른 Task 구현자가 이름을 알 수 없었다 |
| 5 | `excel_upload_logs` 기록이 감사 표에만 스쳐 지나감 | Task 9 Produces 에 필드 8개 명시 + 테스트 2건 추가 | **누락됐을 산출물** |
| 6 | 날짜 파라미터 파싱 미지정 | `parseDateParam` 을 Task 6 산출물로 추가 | Spring 은 여기서 목록 전체가 죽었다(QA D1) |
| 7 | insert 필드 목록이 `/* … */` | 10개 필드 전개 | `blankRevealCount` 는 FILL_BLANK 가 아니면 `null` 이라는 규칙이 숨어 있었다 |
| 8 | 23505 오류 속성 이름을 추측 | **실측**: `postgres.js` 는 `constraint_name` 을 준다(`constraint` 는 `undefined`) | 설계의 전제라 틀렸으면 전부 무너진다 |

**계획서 작성 중 실측으로 바로잡은 것 (1차, 2건)** — 초안에는 다음이 틀리거나 비어 있었다.
- 엑셀 업로드 감사 detail 에 `departmentId` 가 빠져 있었다. 실제 Spring 은 5개 필드를 남긴다.
- 이미지 감사 action 을 "Task 1 이 실측"으로 미뤄 뒀으나, 그대로 두면 계획서에 빈 칸이 남는다.
  `PROBLEM_IMAGE_UPLOADED` / `PROBLEM_IMAGE` / targetId `null` 로 채웠고, 감사 실패 시 파일을
  지우고 업로드 전체를 실패시키는 fail-closed 동작도 함께 기록했다.
