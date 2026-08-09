# Plan 3 QA 결함 수정 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Plan 3 QA에서 발견한 결함 3건(D1 등록일 필터 동작 불가, D2 Topbar 부서 ID 노출, D3 사용자 화면의 내부 용어 노출)을 고치고, D1이 189개 테스트를 통과한 근본 원인인 **컨트롤러 파라미터 바인딩 계층의 테스트 공백**을 메운다.

**Architecture:** 결함 3건은 서로 독립적이라 순서 의존이 없다. 다만 D1은 기능이 죽어 있으므로 먼저 처리한다. D1은 "고치기"보다 "**고치기 전에 실패하는 MockMvc 테스트를 먼저 세우기**"가 본질이다 — 기존 테스트가 서비스 계층만 직접 호출해 Spring MVC의 문자열→객체 변환 단계를 통째로 건너뛰고 있었기 때문이다. D2는 세션 응답에 부서명을 실어 보내는 방식으로 처리하고, 프론트는 그 값을 쓰기만 한다. D3은 렌더링 문구 한 줄 교체다.

**Tech Stack:** Java 8 / Spring Boot 2.7.3 / MyBatis / PostgreSQL, React 19 / Vite / Tailwind 4, 테스트는 JUnit 5 + MockMvc(백엔드) · Node 내장 러너(프론트, `node --test`)

**근거 문서:**
- 결함 상세: [`docs/qa/2026-08-07-plan3-defects.md`](../../qa/2026-08-07-plan3-defects.md)
- 수정 방안 분석: [`docs/qa/2026-08-07-plan3-defect-fix-analysis.md`](../../qa/2026-08-07-plan3-defect-fix-analysis.md)
- QA 실행 결과: [`docs/qa/2026-08-07-plan3-result.md`](../../qa/2026-08-07-plan3-result.md)

## Global Constraints

- **`@SpringBootTest`를 쓰는 테스트 클래스에는 반드시 `@ActiveProfiles("test")`를 붙인다.** 붙이지 않으면 `SuperAdminBootstrapRunner`(`@Profile("!test")`)가 기동하며 **실제 개발 DB에 관리자·부서 행을 기록한다.** Plan 1에서 실제로 발생했던 사고다.
- DB 테스트는 롤백해야 한다(`@Transactional`). 반복 실행해도 결과가 같아야 하고 행이 남으면 안 된다.
- **백엔드 기본 DB 접속 대상은 Docker Postgres(`localhost:5434`)다.** `DB_URL` 없이 `./gradlew test`로 실행된다. 다른 DB를 쓸 때만 `DB_URL`을 지정한다.
- 백엔드는 `resultCode` 기반 응답 규약을 쓴다. HTTP 상태가 아니라 본문의 `resultCode`로 분기한다. 특히 `PASSWORD_CHANGE_REQUIRED`(1012)는 **HTTP 200**으로 내려간다.
- 프론트엔드에는 jsdom이 없다. React 컴포넌트는 렌더링 테스트가 불가능하므로 **순수 로직을 alias 없는 `frontend/src/utils/*.js`로 뽑아 `.test.js`로 검증**한다. `@/` alias를 쓰는 파일은 `node --test`가 로드하지 못한다.
- 현재 테스트 기준선: **백엔드 189개 / 프론트엔드 170개, 프로덕션 빌드 성공.** 하나도 깨뜨리지 않는다.
- 커밋 메시지는 이 저장소의 기존 관례(`fix:`/`feat:`/`test:`/`docs:` 영문 Conventional Commits)를 따른다.

> ⚠️ **기준선 정정 (2026-08-09 실측):** 프론트엔드 170개는 그대로 통과하지만, **백엔드는 189개 중 3개가 실패한다.** 코드 문제가 아니라 **테스트 격리 결함**이다.
>
> `UserDaoTest`의 세 테스트(`existsSuperAdmin_falseThenTrue…`, `existsSuperAdmin_ignoresInactiveSuperAdmins`, `countActiveSuperAdminsExcluding_…`)가 셋업에서 `DELETE FROM users WHERE role = 'SUPER_ADMIN'`을 실행하는데, 그 관리자가 `audit_logs`에 행을 남긴 적이 있으면 FK 제약(`audit_logs_actor_id_fkey`)에 걸려 DELETE 자체가 터진다.
>
> ```
> DataIntegrityViolationException: SQL [DELETE FROM users WHERE role = 'SUPER_ADMIN'];
>   ERROR: update or delete on table "users" violates foreign key constraint
>          "audit_logs_actor_id_fkey" on table "audit_logs"
>   Detail: Key (id)=(1) is still referenced from table "audit_logs".
> ```
>
> `UserDaoTest:221-223`의 주석은 "부트스트랩이 남긴 SUPER_ADMIN 행"까지만 고려했고 **그 관리자가 감사 로그를 남기는 경우를 놓쳤다.** 즉 **관리자 화면으로 QA를 한 번이라도 한 DB에서는 이 3개가 영구히 실패한다.**
>
> 결과적으로 이 계획의 "하나도 깨뜨리지 않는다"는 **QA 데이터가 있는 DB에서는 달성 불가능**하다. 착수 전에 다음 중 하나를 정할 것:
> - (A) 테스트용 DB와 QA용 DB를 분리한다 (`DB_URL`로 테스트만 다른 DB를 가리킴)
> - (B) `UserDaoTest`의 셋업을 감사 로그까지 고려하도록 고친다 — 별도 결함(**D4 후보**)으로 기록하고 이 계획에 Task를 추가
>
> 어느 쪽이든 **Task 1~3의 GREEN 판정은 `--tests ProblemListQueryBindingTest`로 좁혀서 내리고**, 전체 스위트는 "기존 3개 실패 외 신규 실패 없음"으로 판정한다.

---

## File Structure

| 파일 | 책임 | Task |
|---|---|---|
| `backend/src/test/java/com/daeryun/probank/controller/ProblemListQueryBindingTest.java` | **신규.** 실제 서블릿 체인으로 `GET /api/admin/problems`의 쿼리 파라미터 바인딩을 검증 | 1, 2 |
| `backend/src/main/java/com/daeryun/probank/controller/ProblemController.java` | 날짜 파라미터에 `@DateTimeFormat` 부착 | 2 |
| `backend/src/main/java/com/daeryun/probank/exception/GlobalExceptionHandler.java` | `MethodArgumentTypeMismatchException` 전용 핸들러 추가 | 3 |
| `backend/src/main/java/com/daeryun/probank/dto/auth/SessionStatusResponse.java` | `departmentName` 필드 추가 | 4 |
| `backend/src/main/java/com/daeryun/probank/service/AuthServiceImpl.java` | `DepartmentDao` 주입 + `getSessionStatus`에서 부서명 조회 | 4 |
| `backend/src/test/java/com/daeryun/probank/service/AuthServiceImplTest.java` | 생성자 호출 갱신 + 부서명 테스트 | 4 |
| `frontend/src/utils/adminSession.js` | `departmentScopeLabel`이 `departmentName`을 쓰도록 수정 | 5 |
| `frontend/src/utils/adminSession.test.js` | 위 동작 고정 | 5 |
| `frontend/src/pages/admin/problems/ProblemFormPage.jsx` | 빈칸 안내 문구에서 내부 용어 제거 | 6 |

---

### Task 0: QA 데이터 최소 재구축 (신설 — 2026-08-09)

**이 Task는 코드를 고치지 않는다.** Task 7(QA 재실행)의 전제를 세운다.

**배경 — 원안의 전제가 틀렸다.** Task 7 Step 1은 *"QA 계정은 DB에 남아 있다: `admin`/`dev_admin`/`sales_admin`/`emp001`, 비밀번호 모두 `QaPlan3!2026`"* 이라고 적었으나, 2026-08-09 실측 결과 `localhost:5434/probank_dev`의 실제 상태는 다르다.

```
users      : admin, admin2, deptadmin, emp001, emp002, legacy01   ← Plan 1·2 QA 계정
departments: 8건
problems   : 0건                                                   ← 검증 대상이 아예 없다
```

`dev_admin`·`sales_admin`은 존재하지 않고 **문제가 0건**이다. §4 필터 조합 검증(4.3~4.5, 4.8~4.11)은 문제 데이터가 있어야 성립하므로 그대로는 Task 7을 수행할 수 없다.

**범위 결정: 필터 검증에 필요한 최소치만 만든다.** 653행 전체 투입은 하지 않는다 — 필터가 동작하는지 보는 데 필요한 것은 각 축(유형·상태·등록일·태그·키워드)에서 결과가 갈리는 데이터뿐이다.

- [x] **Step 1: 부서관리자 계정 확보**

`admin`으로 로그인해 `/admin/users`에서 부서관리자 2개를 만든다(부서 격리 검증용으로 서로 다른 부서). 임시 비밀번호는 MailHog(`http://localhost:8025`)에서 확인하고, 첫 로그인의 강제 변경까지 마쳐 둔다.

> `admin`의 비밀번호를 모르면 부트스트랩 기본값(`changeme1234`)을 먼저 시도하고, 그것도 아니면 `docs/qa/2026-08-04-plan1-2-qa-checklist.md` §0.3.4의 SQL로 복구한다.

- [x] **Step 2: 필터가 갈리도록 문제 투입**

부서관리자 A로 로그인해 `/admin/problems/excel-upload`에 최소 데이터를 올린다. 필요한 최소 조건:

| 축 | 필요한 것 |
|---|---|
| 유형 | `MCQ_SINGLE`·`MCQ_MULTI`·`OX`·`SHORT_ANSWER` 각 1건 이상 |
| 상태 | 그중 1건을 보관 처리해 `활성`/`보관` 양쪽이 존재 |
| 태그 | 서로 다른 태그 2종 이상 |
| 키워드 | 본문에 특정 단어가 있는 것과 없는 것 |
| 부서 | 부서관리자 B로도 1건 이상 등록해 부서 격리 확인 가능 |

[`docs/문제은행_엑셀/문제_01_공통.xlsx`](../../문제은행_엑셀/문제_01_공통.xlsx)에서 상위 몇 행만 잘라 쓰면 된다. 대략 **10~15건이면 충분**하다.

> 등록일 축(§4.8·§4.9)은 오늘 등록한 것만 있어도 검증된다 — 종료일에 오늘을 넣었을 때 포함되는지가 핵심이기 때문이다.

- [x] **Step 3: 만든 데이터를 Task 7이 참조할 수 있게 기록**

`docs/qa/2026-08-07-plan3-result.md`의 "준비한 QA 데이터" 절을 실제 값으로 갱신한다(계정 사번·비밀번호·부서·문제 건수·유형 분포). 다음 회차가 또 헛짚지 않게 하는 것이 목적이다.

---

### Task 1: 컨트롤러 쿼리 파라미터 바인딩 테스트 (RED 확인)

**이 Task는 코드를 고치지 않는다.** 결함을 드러내는 테스트만 세우고, 그것이 **현재 코드에서 실패하는 것을 확인**하는 것이 목적이다. Task 2에서 고친다.

**Files:**
- Create: `backend/src/test/java/com/daeryun/probank/controller/ProblemListQueryBindingTest.java`

**Interfaces:**
- Consumes: `GET /api/admin/problems`(Plan 3 Task 3), `SessionKeys.LOGIN_USER`·`AuthUser`(Plan 1 Task 4)
- Produces: 없음 (테스트 전용). Task 2가 이 테스트를 GREEN으로 만든다.

**배경:** 기존 `ProblemServiceImplTest`는 `ProblemService.list(...)`를 `LocalDate` 객체로 **직접 호출**한다. Spring MVC의 문자열→`LocalDate` 변환 단계를 지나가지 않으므로 바인딩 실패가 드러날 수 없었다. 전례로 `backend/src/test/java/com/daeryun/probank/filter/UploadedImageAccessIntegrationTest.java`가 같은 방식(`@SpringBootTest` + `@AutoConfigureMockMvc`)으로 서블릿 체인을 통과시킨다 — 그 파일을 먼저 읽고 구조를 맞출 것.

- [x] **Step 1: 테스트 클래스 작성**

`backend/src/test/java/com/daeryun/probank/controller/ProblemListQueryBindingTest.java`:

```java
package com.daeryun.probank.controller;

import com.daeryun.probank.common.AuthUser;
import com.daeryun.probank.common.SessionKeys;
import com.daeryun.probank.domain.UserRole;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;

/**
 * ProblemServiceImplTest는 ProblemService.list(...)를 LocalDate 객체로 직접 호출한다.
 * 즉 Spring MVC의 문자열 → LocalDate 변환 단계를 통째로 건너뛰므로, 쿼리 파라미터
 * 바인딩이 깨져도 서비스 단위 테스트는 전부 통과한다. 실제로 그 공백 때문에
 * 등록일 필터가 동작하지 않는 결함(QA D1)이 189개 테스트를 지나갔다.
 * <p>
 * 이 테스트는 그보다 한 겹 위, <b>실제 서블릿 체인</b>에서 쿼리 파라미터가 문자열로
 * 들어왔을 때 컨트롤러 시그니처에 바인딩되는지를 확인한다.
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Transactional
class ProblemListQueryBindingTest {

    @Autowired
    private MockMvc mockMvc;

    private MockHttpSession superAdminSession() {
        MockHttpSession session = new MockHttpSession();
        session.setAttribute(SessionKeys.LOGIN_USER,
                new AuthUser(1L, "admin", "총괄관리자", UserRole.SUPER_ADMIN, 1L, false));
        return session;
    }

    @Test
    void 날짜_필터가_ISO_문자열로_들어와도_바인딩된다() throws Exception {
        mockMvc.perform(get("/api/admin/problems")
                        .param("createdFrom", "2026-08-01")
                        .param("createdTo", "2026-12-31")
                        .session(superAdminSession()))
                .andExpect(jsonPath("$.resultCode").value(200));
    }

    @Test
    void 날짜_필터_없이도_정상_조회된다() throws Exception {
        mockMvc.perform(get("/api/admin/problems").session(superAdminSession()))
                .andExpect(jsonPath("$.resultCode").value(200));
    }
}
```

- [x] **Step 2: 테스트를 실행해 첫 번째가 실패하는 것을 확인 (RED)**

Run: `cd backend && ./gradlew test --tests ProblemListQueryBindingTest`

Expected: **`날짜_필터가_ISO_문자열로_들어와도_바인딩된다`가 FAIL** — `resultCode`가 200이 아니라 `-1`로 나온다. 두 번째 테스트(`날짜_필터_없이도_정상_조회된다`)는 PASS해야 한다.

서버 로그에 아래가 찍히는 것도 확인한다. 이것이 결함의 정체다.

```
MethodArgumentTypeMismatchException: Failed to convert value of type 'java.lang.String'
  to required type 'java.time.LocalDate' ... Parse attempt failed for value [2026-08-01]
```

> ⚠️ **두 번째 테스트까지 실패한다면 멈추고 보고할 것.** 그건 날짜 바인딩이 아니라 테스트 설정(세션·프로파일·DB) 문제이며, 이 Task의 전제가 틀렸다는 뜻이다.

- [x] **Step 3: Commit**

```bash
git add backend/src/test/java/com/daeryun/probank/controller/ProblemListQueryBindingTest.java
git commit -m "test: pin problem list query parameter binding (currently failing)"
```

> 실패하는 테스트를 커밋하는 것이 의도적이다. Task 2의 수정이 무엇을 고쳤는지 커밋 이력에 남긴다. Task 2까지 한 번에 실행한다면 이 커밋은 생략하고 Task 2의 Step 4에서 함께 커밋해도 된다.

---

### Task 2: 등록일 필터 바인딩 수정 (D1)

**Files:**
- Modify: `backend/src/main/java/com/daeryun/probank/controller/ProblemController.java` (import 추가 + `list` 메서드의 날짜 파라미터 2개)

**Interfaces:**
- Consumes: Task 1의 `ProblemListQueryBindingTest`
- Produces: 동작하는 `createdFrom`·`createdTo` 쿼리 파라미터. 프론트엔드 `problemListParams.js`가 이미 `YYYY-MM-DD` 문자열을 보내고 있으므로 프론트 변경은 필요 없다.

**배경:** 이 프로젝트에서 `LocalDate` 타입 `@RequestParam`은 이 두 개가 전부이고 `@DateTimeFormat` 전례가 없다. 전역 설정(`spring.mvc.format.date: iso`)도 Spring Boot 2.7.3에서 가능하지만, 이 코드베이스는 일관되게 **명시적 지역 선언**을 택해 왔다(Plan 1 최종 리뷰에서 전역 Gradle 프로파일 스위치를 클래스별 `@ActiveProfiles`로 좁힌 전례, MyBatis 자동 매핑 대신 명시적 `resultMap`을 쓴 전례). 여기서도 명시적 방식을 쓴다.

- [x] **Step 1: import 추가**

`ProblemController.java` 상단의 import 블록에 두 줄을 추가한다. 기존 import는 그대로 둔다.

```java
import org.springframework.format.annotation.DateTimeFormat;

import java.time.LocalDate;
```

- [x] **Step 2: `list` 메서드의 날짜 파라미터 수정**

기존:

```java
            @RequestParam(required = false) java.time.LocalDate createdFrom,
            @RequestParam(required = false) java.time.LocalDate createdTo,
```

수정 후:

```java
            // Spring은 문자열 → LocalDate 변환 규칙을 알아서 정하지 않는다. 이 애너테이션이
            // 없으면 "2026-08-01" 같은 정상 입력도 MethodArgumentTypeMismatchException으로
            // 떨어져 목록 조회 전체가 실패한다(QA D1).
            @RequestParam(required = false)
            @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate createdFrom,
            @RequestParam(required = false)
            @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate createdTo,
```

- [x] **Step 3: 테스트를 실행해 통과 확인 (GREEN)**

Run: `cd backend && ./gradlew test --tests ProblemListQueryBindingTest`
Expected: **2개 모두 PASS**

- [x] **Step 4: 전체 스위트 실행**

Run: `cd backend && ./gradlew test`
Expected: `BUILD SUCCESSFUL`. 테스트 수는 **189 + 2 = 191**, 실패 0.

- [x] **Step 5: Commit**

```bash
git add backend/src/main/java/com/daeryun/probank/controller/ProblemController.java
git commit -m "fix: bind ISO date query parameters on problem list API"
```

---

### Task 3: 잘못된 날짜 형식의 오류 응답 개선

**Files:**
- Modify: `backend/src/main/java/com/daeryun/probank/exception/GlobalExceptionHandler.java`
- Modify: `backend/src/test/java/com/daeryun/probank/controller/ProblemListQueryBindingTest.java` (테스트 1건 추가)

**Interfaces:**
- Consumes: `ErrorCode.INPUT_VALUE_INVALID`(1000), `ErrorResponse`(Plan 1 Task 3)
- Produces: 타입 불일치 파라미터에 대한 **`HTTP 400` + `resultCode 1000`** 응답. 프론트는 `resolveErrorMessage`로 이 메시지를 그대로 표시한다.

**배경:** 현재 `GlobalExceptionHandler`는 `BizException` / `MethodArgumentNotValidException`·`BindException` / `HttpMessageNotReadableException` / `MultipartException` / catch-all `Exception` 다섯 가지를 처리한다. **`MethodArgumentTypeMismatchException` 전용 핸들러가 없어** 사용자 입력 오류가 catch-all로 떨어지고, 그 결과 (1) 사용자는 `resultCode -1` "처리 중 오류가 발생하였습니다"만 보고 (2) 평범한 입력 오류에 ERROR 레벨 스택 트레이스가 쌓인다.

**HTTP 상태 결정 (2026-08-09):** 이 핸들러는 **HTTP 400을 반환한다.** 기존 `ErrorResponse` 반환 핸들러 3개(`handleValidationException`, `handleMessageNotReadableException`, catch-all)는 `ResponseEntity`를 쓰지 않아 **HTTP 200**으로 나가는데, 새 핸들러는 그 관행을 따르지 않고 `handleBizException`(400/401/403)과 같은 규약을 택한다.

이 결정이 안전한 근거는 프론트엔드가 **HTTP 상태를 아예 보지 않기 때문**이다.

```js
// frontend/src/api/client.js:45-55 — response.status 를 읽는 곳이 없다
const json = await response.json();
if (json.resultCode !== 200) throw new ApiError(json.resultCode, json.resultMsg, ...);
```

`fetch`는 4xx에도 reject하지 않고 본문 파싱도 그대로 되므로, 200→400 변경은 화면 동작에 영향이 없다. 다만 **본문에 `resultCode`가 반드시 실려야 한다**는 제약은 그대로다.

> 남은 불일치는 이 Task의 범위 밖이다. `ErrorResponse`를 반환하는 나머지 3개 핸들러는 여전히 HTTP 200이며, 특히 catch-all이 서버 오류를 200으로 내보내는 문제는 Plan 1·2 QA의 D2로 별도 기록돼 있다([2026-08-07-p1-result.md](../../qa/2026-08-07-p1-result.md)). 규약 전체 정리는 별도 안건으로 다룬다.

> ⚠️ Plan 1 최종 리뷰에서 이 클래스를 손볼 때 "HTTP 상태·응답 본문을 바꾸지 말라"는 제약이 있었다. 그것은 **로깅 추가 작업에 한정된 제약**이었고, 특정 예외에 전용 핸들러를 새로 다는 것은 성격이 다르다. 다만 이 케이스의 `resultCode`가 `-1` → `1000`으로 바뀐다는 점은 의도된 변경임을 인지할 것.

> 🔧 **계획 정정:** 아래 Step 1의 원안은 `$.code`를 단언했으나 **틀렸다.** `ErrorResponse`의 빌더 인자 이름은 `code`/`message`/`data`지만 실제 필드는 `resultCode`/`resultMsg`/`errorList`이고(`ErrorResponse.java:14-16`), Jackson은 필드명으로 직렬화한다. `$.resultCode`를 봐야 한다.

- [x] **Step 1: 실패하는 테스트 추가**

`ProblemListQueryBindingTest.java`에 메서드를 추가한다.

```java
    @Test
    void 잘못된_날짜_형식은_입력값_오류로_안내한다() throws Exception {
        mockMvc.perform(get("/api/admin/problems")
                        .param("createdFrom", "2026-13-99")
                        .session(superAdminSession()))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.resultCode").value(1000));
    }
```

> `ErrorResponse`의 JSON 필드는 `resultCode`/`resultMsg`/`errorList`다(빌더 인자 이름 `code`/`message`/`data`와 다르다 — `ErrorResponse.java:14-16` 확인). `status().isBadRequest()`를 함께 단언해 HTTP 상태 결정이 회귀하지 않게 고정한다.

- [x] **Step 2: 테스트를 실행해 실패 확인 (RED)**

Run: `cd backend && ./gradlew test --tests ProblemListQueryBindingTest`
Expected: **`잘못된_날짜_형식은_입력값_오류로_안내한다`가 FAIL** — 현재는 catch-all에 걸려 HTTP 200 + `resultCode -1`(`MSG_PROC_FAIL`)이 나온다. 상태 단언에서 먼저 깨진다.

- [x] **Step 3: 전용 핸들러 추가**

`GlobalExceptionHandler.java`의 import 블록에 추가:

```java
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;
```

`handleMessageNotReadableException` 메서드 **아래**에 다음을 추가한다(catch-all `handleUnexpectedException`보다 위에 두면 된다 — 스프링은 더 구체적인 예외 핸들러를 우선하므로 순서 자체가 동작을 바꾸지는 않지만, 읽는 사람을 위해 관련 핸들러끼리 모아 둔다):

```java
    /**
     * 쿼리 파라미터·경로 변수의 타입 변환 실패를 처리한다. 예: createdFrom=2026-13-99.
     * 전용 핸들러가 없으면 catch-all로 떨어져 사용자에게는 "처리 중 오류"만 보이고,
     * 평범한 입력 오류에 ERROR 스택 트레이스가 쌓인다(QA D1에서 실제로 그랬다).
     */
    @ExceptionHandler(MethodArgumentTypeMismatchException.class)
    public ResponseEntity<ErrorResponse> handleTypeMismatchException(MethodArgumentTypeMismatchException exception) {
        log.warn("요청 파라미터 타입이 올바르지 않습니다: name={}, value={}",
                exception.getName(), exception.getValue());
        return ResponseEntity.badRequest().body(ErrorResponse.builder()
                .code(ErrorCode.INPUT_VALUE_INVALID.getCode())
                .message("요청 값의 형식이 올바르지 않습니다: " + exception.getName())
                .data(null)
                .build());
    }
```

`ResponseEntity`로 감싸는 것이 400을 내는 방법이다. `@ResponseStatus`로도 되지만, 이 클래스는 `handleBizException`이 이미 `ResponseEntity`로 상태를 정하고 있어 그 쪽에 맞춘다.

- [x] **Step 4: 테스트를 실행해 통과 확인 (GREEN)**

Run: `cd backend && ./gradlew test --tests ProblemListQueryBindingTest`
Expected: **3개 모두 PASS**

- [x] **Step 5: 전체 스위트 실행**

Run: `cd backend && ./gradlew test`
Expected: `BUILD SUCCESSFUL`, 테스트 **192개**, 실패 0.

- [x] **Step 6: Commit**

```bash
git add backend/src/main/java/com/daeryun/probank/exception/GlobalExceptionHandler.java backend/src/test/java/com/daeryun/probank/controller/ProblemListQueryBindingTest.java
git commit -m "fix: return input-value error for malformed request parameters"
```

---

### Task 4: 세션 응답에 부서명 추가 (D2 백엔드)

**Files:**
- Modify: `backend/src/main/java/com/daeryun/probank/dto/auth/SessionStatusResponse.java`
- Modify: `backend/src/main/java/com/daeryun/probank/service/AuthServiceImpl.java`
- Modify: `backend/src/test/java/com/daeryun/probank/service/AuthServiceImplTest.java`

**Interfaces:**
- Consumes: `DepartmentDao.findById(Long) : Department`(Plan 2), `Department.getName()`
- Produces: `SessionStatusResponse`에 `String departmentName` 필드. `GET /api/auth/session` 응답에 포함된다. Task 5의 프론트엔드가 이 값을 쓴다.

**배경:** `AuthUser`는 `departmentId`만 갖고 있어 Topbar가 `부서 862번`처럼 내부 ID를 그대로 보여준다. **프론트엔드만으로는 해결할 수 없다** — `DepartmentController`가 `@RequireRole(UserRole.SUPER_ADMIN)`이라 부서관리자는 부서 목록 API를 호출할 수 없고, 영향받는 대상이 바로 부서관리자이기 때문이다.

대안으로 `AuthUser`에 `departmentName`을 담는 방법이 있으나, `new AuthUser(...)` 호출이 **26곳(프로덕션 1 + 테스트 10개 파일)** 이고 로그인·비밀번호 변경(세션 회전) 두 곳 모두에서 채워야 하며 부서명 변경 시 세션이 만료될 때까지 옛 이름이 남는다. 지금 필요한 것은 Topbar 한 곳의 표기이므로 **세션 조회 시점에 읽는 방식**을 택한다. 세션 조회는 zustand 전역 스토어가 중복 호출을 막아 페이지 로드당 1회 수준이다.

- [x] **Step 1: 실패하는 테스트 추가**

`AuthServiceImplTest.java`에 추가한다. `import` 블록에 필요한 것을 더한다.

```java
import com.daeryun.probank.dao.DepartmentDao;
import com.daeryun.probank.domain.Department;
```

테스트 메서드:

```java
    @Test
    void getSessionStatus_부서관리자에게_부서명을_함께_내려준다() {
        Department dept = new Department();
        dept.setId(862L);
        dept.setName("개발팀");
        Mockito.when(departmentDao.findById(862L)).thenReturn(dept);

        MockHttpServletRequest request = new MockHttpServletRequest();
        request.getSession(true).setAttribute(SessionKeys.LOGIN_USER,
                new AuthUser(7L, "dev_admin", "개발팀관리자", UserRole.DEPT_ADMIN, 862L, false));

        SessionStatusResponse response = authService.getSessionStatus(request);

        assertEquals("개발팀", response.getDepartmentName());
        assertEquals(Long.valueOf(862L), response.getDepartmentId());
    }

    @Test
    void getSessionStatus_부서가_없으면_부서명은_null이다() {
        MockHttpServletRequest request = new MockHttpServletRequest();
        request.getSession(true).setAttribute(SessionKeys.LOGIN_USER,
                new AuthUser(1L, "admin", "총괄관리자", UserRole.SUPER_ADMIN, null, false));

        SessionStatusResponse response = authService.getSessionStatus(request);

        assertNull(response.getDepartmentName());
        Mockito.verifyNoInteractions(departmentDao);
    }
```

> **fixture를 반드시 `DEPT_ADMIN`으로 둘 것.** 총괄관리자는 프론트에서 "전체 부서"로 고정 표기되므로, `SUPER_ADMIN`으로만 테스트하면 이 결함이 드러나지 않는다.

`setUp`도 함께 고친다(현재 `new AuthServiceImpl(userDao, passwordEncoder, 5, 15)`):

```java
    private DepartmentDao departmentDao;   // 필드 추가

    @BeforeEach
    void setUp() {
        userDao = Mockito.mock(UserDao.class);
        departmentDao = Mockito.mock(DepartmentDao.class);
        passwordEncoder = new BCryptPasswordEncoder();
        authService = new AuthServiceImpl(userDao, departmentDao, passwordEncoder, 5, 15);
    }
```

- [x] **Step 2: 테스트를 실행해 실패 확인 (RED)**

Run: `cd backend && ./gradlew test --tests AuthServiceImplTest`
Expected: **컴파일 실패** — `AuthServiceImpl` 생성자 인자 수가 맞지 않고 `SessionStatusResponse.getDepartmentName()`이 없다. 이것이 예상된 실패 형태다.

- [x] **Step 3: `SessionStatusResponse`에 필드 추가**

```java
@Data
@NoArgsConstructor
@AllArgsConstructor
public class SessionStatusResponse {

    @JsonProperty("isLoggedIn")
    private boolean loggedIn;
    private String employeeNo;
    private String name;
    private UserRole role;
    private Long departmentId;
    private String departmentName;
    private boolean mustChangePassword;

    public static SessionStatusResponse notLoggedIn() {
        return new SessionStatusResponse(false, null, null, null, null, null, false);
    }
}
```

> `notLoggedIn()`의 인자가 6개 → 7개로 는다. 빠뜨리면 컴파일되지 않으므로 자동으로 드러난다.

- [x] **Step 4: `AuthServiceImpl` 수정**

import 추가:

```java
import com.daeryun.probank.dao.DepartmentDao;
import com.daeryun.probank.domain.Department;
```

필드·생성자:

```java
    private final UserDao userDao;
    private final DepartmentDao departmentDao;
    private final PasswordEncoder passwordEncoder;
    private final int maxFailedAttempts;
    private final int lockoutMinutes;

    public AuthServiceImpl(
            UserDao userDao,
            DepartmentDao departmentDao,
            PasswordEncoder passwordEncoder,
            @Value("${app.auth.max-failed-attempts:5}") int maxFailedAttempts,
            @Value("${app.auth.lockout-minutes:15}") int lockoutMinutes) {
        this.userDao = userDao;
        this.departmentDao = departmentDao;
        this.passwordEncoder = passwordEncoder;
        this.maxFailedAttempts = maxFailedAttempts;
        this.lockoutMinutes = lockoutMinutes;
    }
```

`getSessionStatus` 교체:

```java
    @Override
    public SessionStatusResponse getSessionStatus(HttpServletRequest request) {
        HttpSession session = request.getSession(false);
        AuthUser authUser = session == null ? null : (AuthUser) session.getAttribute(SessionKeys.LOGIN_USER);
        if (authUser == null) {
            return SessionStatusResponse.notLoggedIn();
        }
        // AuthUser에는 departmentId만 있다. 부서명을 세션에 캐시하면 부서명이 바뀌어도
        // 세션이 만료될 때까지 옛 이름이 남고, new AuthUser(...) 호출부 26곳을 모두
        // 고쳐야 한다. 조회 시점에 읽는 편이 싸고 항상 최신이다 — 이 엔드포인트는
        // 프런트의 전역 세션 스토어가 중복 호출을 막고 있어 페이지 로드당 1회 수준이다.
        String departmentName = null;
        if (authUser.getDepartmentId() != null) {
            Department department = departmentDao.findById(authUser.getDepartmentId());
            departmentName = department == null ? null : department.getName();
        }
        return new SessionStatusResponse(
                true, authUser.getEmployeeNo(), authUser.getName(), authUser.getRole(),
                authUser.getDepartmentId(), departmentName, authUser.isMustChangePassword());
    }
```

- [x] **Step 5: 테스트를 실행해 통과 확인 (GREEN)**

Run: `cd backend && ./gradlew test --tests AuthServiceImplTest`
Expected: 기존 테스트 전부 + 신규 2개 PASS

- [x] **Step 6: 전체 스위트 실행**

Run: `cd backend && ./gradlew test`
Expected: `BUILD SUCCESSFUL`, **194개**, 실패 0.

> 다른 테스트가 `new AuthServiceImpl(...)`을 호출한다면 여기서 컴파일 오류로 드러난다. 확인된 호출부는 `AuthServiceImplTest` 한 곳뿐이지만, 오류가 나면 같은 방식으로 `departmentDao` mock을 넣어 고칠 것.

- [x] **Step 7: Commit**

```bash
git add backend/src/main/java/com/daeryun/probank/dto/auth/SessionStatusResponse.java backend/src/main/java/com/daeryun/probank/service/AuthServiceImpl.java backend/src/test/java/com/daeryun/probank/service/AuthServiceImplTest.java
git commit -m "feat: include department name in session status response"
```

---

### Task 5: Topbar 부서 표기 수정 (D2 프론트엔드)

**Files:**
- Modify: `frontend/src/utils/adminSession.js`
- Modify: `frontend/src/utils/adminSession.test.js`

**Interfaces:**
- Consumes: Task 4가 추가한 `session.departmentName`
- Produces: `departmentScopeLabel(session)`이 부서명을 반환한다. `AdminLayout.jsx`가 이미 이 함수를 쓰고 있으므로 컴포넌트 변경은 필요 없다.

**배경:** 현재 코드에는 Plan 2 작성자의 주석이 남아 있다 — *"부서 관리자용 부서명 표기는 Plan 3에서 부서 관리자 화면을 만들 때 함께 다룬다."* `부서 ${departmentId}번`은 의도된 임시 표기였고 Plan 3이 인계받았어야 할 항목이다. 주석도 함께 갱신한다.

- [x] **Step 1: 실패하는 테스트로 교체**

`adminSession.test.js`의 기존 테스트를 아래로 **교체**한다(현재는 `"부서 5번"`을 기대하고 있어 그대로 두면 새 동작과 충돌한다).

기존:

```js
test("departmentScopeLabel falls back to a department id for other roles", () => {
  assert.equal(departmentScopeLabel({ role: "DEPT_ADMIN", departmentId: 5 }), "부서 5번");
  assert.equal(departmentScopeLabel({ role: "DEPT_ADMIN", departmentId: null }), "-");
  assert.equal(departmentScopeLabel(null), "-");
});
```

교체 후:

```js
test("departmentScopeLabel shows the department name for a department admin", () => {
  assert.equal(
    departmentScopeLabel({ role: "DEPT_ADMIN", departmentId: 862, departmentName: "개발팀" }),
    "개발팀",
  );
});

test("departmentScopeLabel falls back to the id only when the name is missing", () => {
  // 세션 응답에 departmentName이 없던 시절의 캐시나, 부서가 지워진 예외적 상황 대비.
  assert.equal(departmentScopeLabel({ role: "DEPT_ADMIN", departmentId: 5 }), "부서 5번");
  assert.equal(departmentScopeLabel({ role: "DEPT_ADMIN", departmentId: null }), "-");
  assert.equal(departmentScopeLabel(null), "-");
});

test("departmentScopeLabel keeps 전체 부서 for SUPER_ADMIN even when a name is present", () => {
  assert.equal(
    departmentScopeLabel({ role: "SUPER_ADMIN", departmentId: 1, departmentName: "본사" }),
    "전체 부서",
  );
});
```

- [x] **Step 2: 테스트를 실행해 실패 확인 (RED)**

Run: `cd frontend && npm test`
Expected: **`departmentScopeLabel shows the department name for a department admin`가 FAIL** — 현재 구현은 `"부서 862번"`을 반환한다.

- [x] **Step 3: 구현 수정**

`adminSession.js`의 `departmentScopeLabel`을 주석까지 함께 교체한다.

```js
/**
 * 관리자 Topbar의 부서 범위 표기.
 * 총괄 관리자는 특정 부서에 매이지 않으므로 "전체 부서"로 고정 표시한다.
 * 부서 관리자는 GET /api/auth/session이 함께 내려주는 departmentName을 쓴다 —
 * 부서 목록 API(GET /api/admin/departments)는 SUPER_ADMIN 전용이라 부서 관리자가
 * 직접 id → 이름을 조회할 수 없기 때문이다.
 * departmentName이 없을 때만 id로 물러난다(예: 세션 응답이 갱신되기 전의 캐시).
 */
export function departmentScopeLabel(session) {
  if (session?.role === "SUPER_ADMIN") {
    return "전체 부서";
  }
  if (session?.departmentName) {
    return session.departmentName;
  }
  return session?.departmentId ? `부서 ${session.departmentId}번` : "-";
}
```

- [x] **Step 4: 테스트를 실행해 통과 확인 (GREEN)**

Run: `cd frontend && npm test`
Expected: 전부 PASS. 테스트 수는 **170 + 2 = 172**(기존 1개를 3개로 나눴으므로 순증 2).

- [x] **Step 5: 빌드 확인**

Run: `cd frontend && npm run build`
Expected: 성공

- [x] **Step 6: Commit**

```bash
git add frontend/src/utils/adminSession.js frontend/src/utils/adminSession.test.js
git commit -m "fix: show department name instead of id in admin topbar"
```

---

### Task 6: 빈칸 안내 문구에서 내부 용어 제거 (D3)

**Files:**
- Modify: `frontend/src/pages/admin/problems/ProblemFormPage.jsx` (빈칸 후보 안내 문단)

**Interfaces:**
- Consumes: 없음
- Produces: 없음 (표시 문구만 변경)

**배경:** `grep`으로 `Plan [0-9]`를 훑으면 12곳이 나오지만 **11곳은 코드 주석이라 사용자에게 보이지 않는다**(개발자용 설명이므로 그대로 둔다). 화면에 렌더링되는 것은 이 한 곳뿐이다. `ProblemExcelUploadPage.jsx`의 "Plan 3에서 …"도 검색에 걸리지만 `{/* … */}` JSX 주석 안이라 렌더링되지 않는다 — **건드리지 말 것.**

- [x] **Step 1: 문구 교체**

`ProblemFormPage.jsx`에서 아래 문단을 찾는다(빈칸 후보 라벨 바로 아래, `text-body-small text-ink-muted` 클래스를 가진 `<p>`).

기존:

```jsx
              <p className="mt-1 text-body-small text-ink-muted">
                각 키는 위 문제 내용에 <code className="rounded-xs bg-surface-subtle px-1">{"{{키}}"}</code>{" "}
                형태로 반드시 등장해야 합니다. 실제 출제 시 무작위로 노출할 빈칸은 Plan 4에서 정합니다 — 여기서는
                후보와 노출 개수만 저장합니다.
              </p>
```

수정 후:

```jsx
              <p className="mt-1 text-body-small text-ink-muted">
                각 키는 위 문제 내용에 <code className="rounded-xs bg-surface-subtle px-1">{"{{키}}"}</code>{" "}
                형태로 반드시 등장해야 합니다. 여기에 등록한 빈칸 후보 중 아래에서 지정한 개수만큼만 실제 출제 시
                무작위로 노출됩니다.
              </p>
```

> 바뀐 핵심은 **일정 정보("Plan 4에서 정합니다")를 빼고 사용자가 알아야 할 동작만 남긴 것**이다. `<code>` 부분과 클래스는 그대로 둔다.

- [x] **Step 2: 화면에 내부 용어가 남아 있지 않은지 확인**

Run:

```bash
cd frontend && grep -rn 'Plan [0-9]' src --include=*.jsx | grep -v '^\s*\*' | grep -v '{/\*'
```

Expected: **결과 없음.** 결과가 나온다면 그것도 렌더링되는 텍스트인지 확인한다(주석이면 무시).

- [x] **Step 3: 테스트·빌드 확인**

Run: `cd frontend && npm test && npm run build`
Expected: 테스트 172개 PASS, 빌드 성공

- [x] **Step 4: Commit**

```bash
git add frontend/src/pages/admin/problems/ProblemFormPage.jsx
git commit -m "fix: remove internal planning jargon from fill-blank guidance"
```

---

### Task 7: 수정 검증 — QA 재실행

**Files:**
- Modify: `docs/qa/2026-08-07-plan3-result.md` (재검증 결과 추가)

**Interfaces:**
- Consumes: Task 2~6의 수정분
- Produces: 갱신된 QA 결과 문서

**배경:** D1 때문에 §4의 필터 조합 검증(4.3~4.5, 4.10, 4.11)을 중단했고, **§4.9(등록일 종료일 포함)는 검증 자체가 불가능했다.** 서버 SQL은 `created_at < createdTo + INTERVAL '1 day'`로 되어 있어 논리상 종료일이 포함되지만 실제로 확인된 적이 없다. 수정만 하고 재검증하지 않으면 그 상태가 그대로 남는다.

- [x] **Step 1: 환경 기동**

```bash
docker compose up -d
docker run -d --name probank-mailhog -p 1025:1025 -p 8025:8025 mailhog/mailhog   # 이미 떠 있으면 생략

cd backend && MAIL_HOST=localhost MAIL_PORT=1025 MAIL_SMTP_AUTH=false MAIL_SMTP_STARTTLS=false \
  ./gradlew bootRun --args='--spring.profiles.active=dev'
```

> ⚠️ **기동 전 8080 점유를 확인할 것.** 이전 백엔드가 남아 있으면 새 프로세스가 `PortInUseException`으로 조용히 죽고, 메일 설정이 없는 옛 프로세스가 요청을 받는다. QA 중 실제로 겪은 함정이다. 기동 로그에서 `Started ProbankApplication`을 눈으로 확인한다.

별도 터미널에서 `cd frontend && npm run dev`.

> 🔧 **계획 정정 (2026-08-09):** 원안은 *"QA 계정은 DB에 남아 있다: `admin`/`dev_admin`/`sales_admin`/`emp001`, 비밀번호 모두 `QaPlan3!2026`"* 이라고 적었으나 **실제 DB에는 그 계정들이 없고 문제도 0건이다.** 신설된 **Task 0**에서 만든 계정·데이터를 쓴다. Task 0을 건너뛰면 §4 재검증이 불가능하다.

- [x] **Step 2: D1 재검증 — 등록일 필터**

`dev_admin`으로 로그인해 `/admin/problems` → "상세 필터"에서 아래를 확인한다.

| # | 절차 | 기대 |
|---|---|---|
| 4.8 | 등록일 시작에 문제 등록일(오늘) 입력 후 조회 | 목록이 표시된다. **오류 화면이 뜨지 않는다** |
| 4.9 | 등록일 종료에 **오늘 날짜** 입력 후 조회 | **오늘 등록한 문제가 포함된다** (0건이면 종료일 미포함 결함) |
| — | 시작·종료를 모두 비우고 조회 | 전체 목록 |
| — | 잘못된 값(예: 브라우저가 허용하면 `2026-13-99`)을 API로 직접 호출 | `resultCode 1000`과 형식 안내 메시지 |

- [x] **Step 3: §4 나머지 필터 조합 재검증**

| # | 절차 | 기대 |
|---|---|---|
| 4.3 | 유형 필터를 5개 값으로 각각 조회 | 해당 유형만 |
| 4.4 | 상태 `활성` / `보관됨` 각각 | 해당 상태만 |
| 4.10 | 유형 + 상태 + 키워드 동시 | AND 조건 |
| 4.11 | 초기화 버튼 | 모든 입력이 비워지고 전체 목록 |

- [x] **Step 4: D2 재검증 — Topbar 부서 표기**

`dev_admin`(개발팀)으로 로그인해 관리자 화면 우상단을 확인한다.

기대: **`부서 관리자 · 개발팀`** (`부서 862번`이 아님)

`admin`으로도 확인한다. 기대: `총괄 관리자 · 전체 부서` (변화 없음)

- [x] **Step 5: D3 재검증 — 빈칸 안내 문구**

`/admin/problems/new` → 문제 유형을 "빈칸 채우기"로 변경 → 빈칸 후보 영역의 안내 문구를 확인한다.

기대: **"Plan"이라는 단어가 없다.** 등록한 후보 중 지정 개수만큼 노출된다는 설명만 있다.

- [x] **Step 6: 결과를 QA 문서에 반영**

`docs/qa/2026-08-07-plan3-result.md` 하단에 `## 수정 후 재검증 (<실행일>)` 섹션을 추가한다(실행일은 `date +%Y-%m-%d` 결과를 쓴다). 담을 내용:

- D1·D2·D3 각각의 재검증 결과 — 통과/실패와 실제로 본 화면·응답
- §4.8~4.11 재실행 결과 — **특히 §4.9(등록일 종료일 포함)는 이번이 첫 검증**임을 명시
- 새로 발견한 것이 있으면 `docs/qa/2026-08-07-plan3-defects.md`에 D4부터 이어서 추가

기존 §4 항목의 판정도 갱신한다 — 결과 요약 표의 "실패 3"과 §4.8·§4.9의 "실패 → D1" 표기가 낡은 값이 된다.

- [x] **Step 7: 환경 정리**

백엔드·프론트를 중지한다. **gradle 래퍼를 끊어도 JVM이 남으므로 포트 점유를 반드시 확인할 것** — 남아 있으면 다음 기동이 조용히 실패한다.

```powershell
foreach ($port in 8080,5173) {
  Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue |
    Select-Object -ExpandProperty OwningProcess -Unique |
    ForEach-Object { Stop-Process -Id $_ -Force }
}
Start-Sleep -Seconds 2
foreach ($port in 8080,5173) {
  if (Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue) {
    Write-Output "$port 여전히 점유"
  } else { Write-Output "$port 해제됨" }
}
```

MailHog는 남겨 두어도 무방하다(`docker rm -f probank-mailhog`로 정리 가능).

- [x] **Step 8: Commit**

```bash
git add docs/qa/2026-08-07-plan3-result.md
git commit -m "docs: record Plan 3 defect fix verification"
```

---

## 범위 밖 — 이번 계획에서 다루지 않는 것

의도적으로 제외했다. 필요하면 별도 계획으로 다룬다.

| 항목 | 사유 |
|---|---|
| 전역 날짜 포맷 설정(`spring.mvc.format.date: iso`) | 날짜 파라미터가 2개뿐이라 명시적 애너테이션이 낫다. 3개 이상으로 늘면 그때 전환 |
| `AuthUser`에 `departmentName` 캐시 | 호출부 26곳 수정 + 이중 갱신 리스크. Plan 4·5에서 부서명 수요가 실제로 늘면 재검토 |
| `DepartmentController`의 권한 완화 | 결함 하나 고치자고 권한 경계를 넓히지 않는다 |
| 코드 주석의 `Plan N` 표기 | 개발자용 설명이며 사용자에게 보이지 않는다 |
| §11 접근성 12항목 | QA에서 하나도 실행하지 못했다. 별도 QA 회차가 필요하며 코드 수정 계획과 성격이 다르다 |
| 보관 복원 경로, 404 전용 에러코드, 페이지네이션·인덱스 | Plan 3 문서의 "미해결 — 판단 필요"에 기록된 항목. Plan 4에서 다룬다 |

## 완료 기준

- [x] 백엔드 테스트 **194개** 통과, 실패 0
- [x] 프론트엔드 테스트 **172개** 통과, 실패 0
- [x] `npm run build` 성공
- [x] Task 7의 재검증에서 D1·D2·D3이 모두 해소됨을 브라우저로 확인
- [x] **§4.9(등록일 종료일 포함)가 처음으로 검증됨**
- [x] QA 결과 문서에 재검증 기록이 남음
