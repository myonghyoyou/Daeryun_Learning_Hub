# Plan 3 QA 결함 수정 방안 분석

- **대상 결함:** [`2026-08-07-plan3-defects.md`](2026-08-07-plan3-defects.md)의 D1·D2·D3
- **대상 커밋:** `6c938b1` 기준 (분석 시점 HEAD `c2b94c4`)
- **작성일:** 2026-08-07
- **환경:** Spring Boot **2.7.3** / Java 8 / React 19 · Vite

## 요약

| 결함 | 권고 방식 | 코드 변경 규모 | 함께 필요한 것 |
|---|---|---|---|
| **D1** (Major) | `@DateTimeFormat(iso = ISO.DATE)` 2줄 + 전용 예외 핸들러 | 프로덕션 2개 파일 | **MockMvc 테스트 (필수)** |
| **D2** (Minor) | `getSessionStatus`에서 부서명 조회 | 프로덕션 3개 파일 | 단위 테스트 1건 |
| **D3** (Minor) | 문구 1곳 교체 | 프로덕션 1개 파일 | 없음 |

**D1과 D2·D3은 성격이 다르다.** D1은 기능이 죽어 있어 즉시 고쳐야 하고, D2·D3은 표기 문제라 Plan 4와 묶어도 무방하다. 다만 **D1의 진짜 교훈은 두 줄짜리 수정이 아니라 "컨트롤러 파라미터 바인딩 계층이 통째로 미검증"이라는 사실**이며, 이건 별도로 다뤄야 한다.

---

## D1. 등록일 필터 동작 불가 (Major)

### 현재 상태

`ProblemController.java:41-49`

```java
@GetMapping
public ResponseEntity<ResponseDto<?>> list(
        @RequestParam(required = false) Long departmentId,
        @RequestParam(required = false) String type,
        @RequestParam(required = false) String status,
        @RequestParam(required = false) java.time.LocalDate createdFrom,   // ← 바인딩 실패
        @RequestParam(required = false) java.time.LocalDate createdTo,     // ← 바인딩 실패
        @RequestParam(required = false) String tag,
        @RequestParam(required = false) String keyword,
        @LoginUser AuthUser actor) {
```

확인한 사실:

- 이 프로젝트에서 **`LocalDate` 타입 `@RequestParam`은 이 두 개가 전부**다. 다른 컨트롤러에는 없다.
- **`@DateTimeFormat` 사용 전례가 코드베이스에 하나도 없다.**
- `application.yml`에 `spring.mvc` 설정 자체가 없다.
- 프론트엔드는 `<input type="date">` 값을 그대로 보내므로 형식(`YYYY-MM-DD`)은 정상이다 — `problemListParams.js`는 sentinel 정규화만 하고 날짜는 손대지 않는다. **서버 바인딩만의 문제다.**

### 수정 방법 — 3가지 선택지

#### 방법 A (권고) — 파라미터에 `@DateTimeFormat` 명시

```java
import org.springframework.format.annotation.DateTimeFormat;
import java.time.LocalDate;

@RequestParam(required = false)
@DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate createdFrom,
@RequestParam(required = false)
@DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate createdTo,
```

- **장점:** 동작 이유가 선언부에 그대로 보인다. 이 코드베이스가 일관되게 택해 온 방식이다 — Plan 1 최종 리뷰에서 전역 Gradle 프로파일 스위치를 클래스별 `@ActiveProfiles`로 좁혔고, MyBatis 자동 매핑 대신 명시적 `resultMap`을 썼다. **암묵적 전역 설정보다 명시적 지역 선언을 선호하는 전례가 확립돼 있다.**
- **단점:** 앞으로 날짜 파라미터가 늘면 매번 붙여야 한다.

#### 방법 B — 전역 설정 한 줄

```yaml
spring:
  mvc:
    format:
      date: iso
```

- **장점:** 한 줄이고, 이후 추가되는 모든 `LocalDate` 파라미터가 자동으로 해결된다.
- **단점:** 컨트롤러만 읽는 사람은 왜 동작하는지 알 수 없다. Spring Boot 2.3+ 기능이라 2.7.3에서 사용 가능하지만, 이 프로젝트의 명시성 선호와 어긋난다.

#### 방법 C — 전역 `Converter` 또는 `@InitBinder`

A/B보다 코드가 늘고 얻는 게 없다. **권하지 않는다.**

**→ 방법 A를 권고한다.** 날짜 파라미터가 3개 이상으로 늘어나면 그때 B로 옮기는 것이 자연스럽다.

### 함께 고쳐야 할 것 — 오류 응답 품질

현재 `GlobalExceptionHandler`가 처리하는 예외는 `BizException`, `MethodArgumentNotValidException`/`BindException`, `HttpMessageNotReadableException`, `MultipartException`, 그리고 catch-all `Exception` 다섯 가지다. **`MethodArgumentTypeMismatchException` 전용 핸들러가 없어** 이번 결함이 catch-all로 떨어졌고, 그 결과:

- 사용자는 `resultCode -1` "처리 중 오류가 발생하였습니다"만 본다 — 자기 입력 탓인지 서버 장애인지 알 수 없다
- **평범한 사용자 입력 오류에 ERROR 레벨 스택 트레이스가 로그에 쌓인다**

핸들러를 추가하면 잘못된 날짜 형식을 입력했을 때 `INPUT_VALUE_INVALID`(1000)와 함께 어떤 파라미터가 문제인지 안내할 수 있다. 프론트는 `resultCode`로 분기하고 `resolveErrorMessage`로 메시지를 띄우므로 화면에 그대로 반영된다.

> ⚠️ Plan 1 최종 리뷰에서 `GlobalExceptionHandler`를 손볼 때 "HTTP 상태·응답 본문을 바꾸지 말라"는 제약이 있었다. 그건 **로깅 추가 작업에 한정된 제약**이었고, 특정 예외에 전용 핸들러를 새로 다는 것은 성격이 다르다. 다만 이 케이스의 응답이 `-1` → `1000`으로 바뀐다는 점은 인지하고 진행할 것.

### 가장 중요한 부분 — 왜 189개 테스트가 못 잡았나

`ProblemServiceImplTest`는 `ProblemService.list(actor, deptId, type, status, createdFrom, createdTo, tag, keyword)`를 **`LocalDate` 객체로 직접 호출**한다. Spring MVC의 문자열→객체 변환 단계를 아예 지나가지 않으므로, 바인딩 실패가 드러날 방법이 없었다.

**즉 컨트롤러의 쿼리 파라미터 계층이 통째로 미검증이다.** 같은 계열의 결함(파라미터 이름 오타, 타입 불일치, `required` 설정 실수)이 앞으로도 그대로 통과한다.

다행히 전례가 이미 있다 — `UploadedImageAccessIntegrationTest`가 `@SpringBootTest` + `@AutoConfigureMockMvc` + `@ActiveProfiles("test")`로 **실제 서블릿 체인**을 통과시킨다. 그 파일의 주석이 의도를 잘 설명해 둔다.

> "SessionCheckFilterTest는 `shouldNotFilter`의 판단만 단위로 고정한다. 이 테스트는 그보다 한 겹 위, 즉 **실제 서블릿 체인에서** … 단위 테스트는 통과해도 실제 요청은 그대로 파일을 내려주기 때문이다."

같은 모양으로 `ProblemController`의 목록 조회를 덮는 테스트를 추가한다.

```java
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")          // ← 빠뜨리면 부트스트랩 러너가 개발 DB에 행을 쓴다
class ProblemListQueryBindingTest {

    @Test
    void 날짜_필터가_문자열로_들어와도_바인딩된다() throws Exception {
        mockMvc.perform(get("/api/admin/problems")
                        .param("createdFrom", "2026-08-01")
                        .param("createdTo", "2026-12-31")
                        .session(adminSession()))
                .andExpect(jsonPath("$.resultCode").value(200));   // 현재는 -1 이 나온다
    }

    @Test
    void 잘못된_날짜_형식은_INPUT_VALUE_INVALID_로_안내한다() throws Exception { ... }
}
```

**이 테스트는 수정 전에 먼저 실패하는 것을 확인하고 넣어야 한다.** 그래야 진짜로 결함을 잡는 테스트임이 증명된다.

### 작업 순서

1. MockMvc 테스트를 먼저 작성해 **현재 코드에서 실패하는 것을 확인**한다 (RED)
2. `@DateTimeFormat` 2줄 추가 → 테스트 통과 확인 (GREEN)
3. `MethodArgumentTypeMismatchException` 핸들러 추가 + 잘못된 형식 테스트 추가
4. 브라우저에서 §4.8·§4.9를 실제로 재확인한다 — **특히 §4.9(종료일 포함)는 이번 QA에서 검증 자체가 불가능했다.** 서버 SQL은 `created_at < createdTo + INTERVAL '1 day'`로 되어 있어 논리상 포함이 맞지만, 실제로 확인된 적이 없다
5. §4의 나머지 필터 조합(4.3·4.4·4.10·4.11)을 재실행한다 — 이번에 D1 때문에 중단했다

---

## D2. Topbar에 부서 ID 노출 (Minor)

### 이건 Plan 3이 넘겨받았어야 할 항목이다

`frontend/src/utils/adminSession.js`에 Plan 2 작성자가 남긴 주석이 있다.

```js
/**
 * 관리자 Topbar의 부서 범위 표기.
 * 세션에는 departmentId만 있고 부서 이름이 없다(useSessionStatus 참고). 이 Plan의
 * 관리자 화면은 SUPER_ADMIN 전용이므로, 총괄 관리자는 Topbar 라벨을 위해 별도
 * 부서 API를 호출하지 않고 "전체 부서"로 고정 표시한다. 부서 관리자용 부서명
 * 표기는 Plan 3에서 부서 관리자 화면을 만들 때 함께 다룬다.     ← 여기
 */
export function departmentScopeLabel(session) {
  if (session?.role === "SUPER_ADMIN") return "전체 부서";
  return session?.departmentId ? `부서 ${session.departmentId}번` : "-";
}
```

`부서 ${departmentId}번`은 **의도된 임시 표기**였고, Plan 3이 부서관리자용 화면을 만들면서 처리하기로 되어 있었는데 누락됐다. 새로 발견한 설계 실수가 아니라 **인계 항목 미이행**이다.

### 프론트엔드만으로는 해결할 수 없다

가장 먼저 떠오르는 "프론트에서 부서 목록을 받아 id→name으로 매핑" 방식은 **불가능하다.**

`DepartmentController.java:16`이 `@RequireRole(UserRole.SUPER_ADMIN)`이다. 즉 **부서관리자는 부서 목록 API를 호출할 수 없다** — 그리고 이 결함의 영향을 받는 대상이 정확히 부서관리자다. (이번 QA에서 부서관리자 로그인 시 콘솔에 찍힌 403 두 건이 이것이다.)

부서 목록 API의 권한을 낮추는 것은 결함 하나 고치자고 권한 경계를 넓히는 일이라 **권하지 않는다.**

### 수정 방법 — 2가지 선택지

#### 방법 A (권고) — `getSessionStatus`에서 부서명을 조회한다

```java
// SessionStatusResponse 에 departmentName 필드 추가
// AuthServiceImpl.getSessionStatus 에서
Department dept = authUser.getDepartmentId() == null ? null
        : departmentDao.findById(authUser.getDepartmentId());
return new SessionStatusResponse(true, ..., dept == null ? null : dept.getName(), ...);
```

변경 범위:

| 파일 | 변경 |
|---|---|
| `SessionStatusResponse` | 필드 1개 추가 (`notLoggedIn()` 인자도 맞춰야 함) |
| `AuthServiceImpl` | 생성자에 `DepartmentDao` 추가(현재 4인자 → 5인자) + `getSessionStatus` 수정 |
| `AuthServiceImplTest` | 생성자 호출 1곳 수정 + `DepartmentDao` mock 추가 |
| `adminSession.js` | `departmentScopeLabel`이 `session.departmentName`을 쓰도록 수정 + 주석 갱신 |

- **`DepartmentDao.findById(Long)`가 이미 존재한다** — DAO 추가 작업 없음
- **장점:** 변경 범위가 작고, 부서명이 바뀌어도 항상 최신값이다
- **단점:** `GET /api/auth/session` 호출마다 DB 조회 1회가 는다. 다만 Plan 1의 zustand 전역 세션 스토어가 중복 호출을 막고 있어 실질적으로 **페이지 로드당 1회** 수준이다

#### 방법 B — `AuthUser`에 `departmentName`을 담아 세션에 캐시한다

- **장점:** 조회 없이 어디서든 부서명을 쓸 수 있다. Plan 4·5가 부서명을 자주 쓴다면 유리하다
- **단점이 크다:**
  - **`new AuthUser(...)` 호출이 26곳(프로덕션 1 + 테스트 10개 파일)** 이라 생성자 변경 시 전부 손봐야 한다
  - 로그인 시점(`AuthServiceImpl:62`)과 **비밀번호 변경 시 세션 회전 시점(`:111`)** 두 곳 모두에서 이름을 채워야 한다. 한 곳만 고치면 비밀번호 변경 후 부서명이 사라진다
  - 부서명이 변경돼도 세션이 만료될 때까지 옛 이름이 남는다

**→ 방법 A를 권고한다.** 지금 필요한 것은 Topbar 한 곳의 표기이고, B의 26개 호출부 수정과 이중 갱신 리스크를 감수할 근거가 없다. Plan 4·5에서 부서명 수요가 실제로 늘면 그때 B로 옮기면 된다.

### 검증

`AuthServiceImplTest`에 부서관리자 세션의 `getSessionStatus`가 `departmentName`을 담아 오는지 확인하는 테스트를 추가한다. 이번 QA에서 확인했듯 **총괄관리자로만 보면 이 결함이 드러나지 않으므로**, 테스트 fixture는 반드시 `DEPT_ADMIN`이어야 한다.

---

## D3. 사용자 화면에 내부 용어 "Plan 4" 노출 (Minor)

### 실제 범위는 한 곳뿐이다

`grep`으로 `Plan [0-9]`를 훑으면 12곳이 나오지만, **11곳은 코드 주석이라 사용자에게 보이지 않는다.** 개발자를 위한 설명이므로 그대로 두는 것이 옳다.

**화면에 렌더링되는 것은 `ProblemFormPage.jsx:503` 한 곳뿐이다.**

```jsx
<p className="mt-1 text-body-small text-ink-muted">
  각 키는 위 문제 내용에 <code>{"{{키}}"}</code> 형태로 반드시 등장해야 합니다.
  실제 출제 시 무작위로 노출할 빈칸은 Plan 4에서 정합니다 — 여기서는          ← 이 부분
  후보와 노출 개수만 저장합니다.
</p>
```

> 참고로 `ProblemExcelUploadPage.jsx:85`의 "Plan 3에서 …" 도 검색에 걸리지만 `{/* … */}` JSX 주석 안이라 렌더링되지 않는다.

### 수정 방법

문구를 사용자 관점으로 바꾼다.

```jsx
각 키는 위 문제 내용에 <code>{"{{키}}"}</code> 형태로 반드시 등장해야 합니다.
등록한 빈칸 후보 중 위에서 지정한 개수만큼만 실제 출제 시 무작위로 노출됩니다.
```

"Plan 4에서 정합니다"라는 **일정 정보**를 빼고, 사용자가 알아야 할 **동작**만 남기는 것이 핵심이다.

### 재발 방지

지금은 한 곳이지만, 화면 문구에 내부 용어가 섞이는 것은 반복되기 쉽다. Plan 4 착수 시 다음을 한 번 훑을 것을 권한다.

- `Plan [0-9]`, `Task [0-9]`, `TODO`, `FIXME`가 **JSX 텍스트 노드**에 있는지 (주석은 무관)
- 이는 기계적으로 확인 가능하므로, 필요하면 간단한 lint 규칙이나 CI grep으로 고정할 수 있다

---

## 권고 진행 순서

| 순서 | 작업 | 근거 |
|---|---|---|
| 1 | **D1 수정 + MockMvc 테스트** | 기능이 죽어 있고, 필터를 걸면 목록 전체가 막힌다 |
| 2 | **§4 재실행** (4.3~4.5, 4.8~4.11) | D1 때문에 중단했던 필터 조합 검증 |
| 3 | D2 수정 | Plan 3이 인계받았어야 할 항목. Plan 4 착수 전 정리 권장 |
| 4 | D3 문구 교체 | 한 줄 |
| 5 | 컨트롤러 바인딩 테스트 확충 | D1이 189개 테스트를 통과한 근본 원인. **1번보다 오래 남는 가치** |

**1·2번은 함께 처리하는 것이 좋다.** 수정만 하고 재검증하지 않으면 §4.9(종료일 포함)는 여전히 한 번도 확인되지 않은 상태로 남는다.

D2·D3은 Plan 4 착수와 묶어도 무방하나, D2는 부서관리자가 **매 화면에서** 보게 되는 표기라 체감 빈도가 높다는 점은 감안할 것.
