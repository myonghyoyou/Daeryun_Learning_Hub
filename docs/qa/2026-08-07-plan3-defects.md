# Plan 3 QA 결함 목록

- **대상 커밋:** `6c938b1` (master, Plan 3 병합분)
- **검출일:** 2026-08-07
- **검출 방식:** API 직접 호출(curl) + Vibescraper(실제 Chrome 원격 제어) + psql 직접 조회
- **환경:** 프론트 `localhost:5173`, 백엔드 `localhost:8080`, DB `localhost:5434/probank_dev`, MailHog `localhost:1025`, 뷰포트 1440×1024

| ID | 심각도 | 요약 | 상태 |
|---|---|---|---|
| [D1](#d1) | **Major** | 등록일 필터가 전면 동작 불가 — 걸면 목록 자체가 오류로 막힘 | **수정 완료 (2026-08-09)** |
| [D2](#d2) | Minor | Topbar에 부서명 대신 내부 DB ID가 노출됨 | **수정 완료 (2026-08-09)** |
| [D3](#d3) | Minor | 사용자 화면 안내문에 내부 용어 "Plan 4"가 노출됨 | **수정 완료 (2026-08-09)** |
| [D4](#d4) | Major(개발) | QA를 한 번이라도 한 DB에서는 백엔드 테스트 3건이 영구 실패 | **수정 완료 (2026-08-09)** |
| [D5](#d5) | **Major** | 브라우저 200% 확대 시 관리 화면에서 `/solve`로 튕겨나간다 | 신규 (2026-08-09 접근성 회차) |
| [D6](#d6) | Minor | 문제 목록 "수정" 링크·정답 라디오에 포커스 표시가 없다 | 신규 (2026-08-09 접근성 회차) |

> 아래 두 건은 체크리스트의 "알려진 미해결"에 이미 기록된 항목이며, 이번 QA에서 **재현을 확인**했다. 신규 결함이 아니므로 별도 번호를 부여하지 않는다.
> - 부서관리자가 로그인하면 `/admin/departments`로 랜딩해 "접근 권한이 없습니다" 화면을 만난다 (Plan 5에서 관리자 대시보드 추가 시 해소 예정)
> - 이미 보관된 문제 행에도 "보관" 버튼이 계속 표시된다 (눌러도 무해)

---

<a id="d1"></a>
## D1. (Major) 등록일 필터를 사용하면 목록 조회가 통째로 실패한다

| 항목 | 내용 |
|---|---|
| 심각도 | **Major** |
| 화면·API | `/admin/problems` 상세 필터, `GET /api/admin/problems?createdFrom=&createdTo=` |
| 재현 절차 | 1. 관리자로 로그인해 `/admin/problems` 진입<br>2. "상세 필터" 펼치기<br>3. "등록일 시작"에 `2026-08-01` 입력<br>4. "조회" 클릭 |
| 기대 | 해당 기간에 등록된 문제 목록이 표시된다 |
| 실제 | 목록이 사라지고 **"처리 중 오류가 발생하였습니다." + "다시 시도" 화면**이 뜬다. "다시 시도"를 눌러도 같은 오류가 반복되며, **필터를 지우기 전까지 목록을 볼 수 없다** |
| 영향 | 플랜의 Approved Amendments가 명시한 6개 필터 중 **등록일 시작·종료 2개가 완전히 사용 불가**다. 게다가 단순히 "필터가 안 먹는" 수준이 아니라 목록 화면 자체가 오류 상태로 전환되어, 사용자는 초기화 전까지 아무 문제도 조회할 수 없다 |

### 원인

`ProblemController.java:44-45`

```java
@RequestParam(required = false) java.time.LocalDate createdFrom,
@RequestParam(required = false) java.time.LocalDate createdTo,
```

`@DateTimeFormat` 애너테이션이 없다. Spring이 쿼리 문자열 `2026-08-01`을 `LocalDate`로 변환하지 못해 `MethodArgumentTypeMismatchException`이 발생하고, `GlobalExceptionHandler`의 catch-all에 걸려 `resultCode -1`이 반환된다.

서버 로그:

```
org.springframework.web.method.annotation.MethodArgumentTypeMismatchException:
  Failed to convert value of type 'java.lang.String' to required type 'java.time.LocalDate';
  nested exception is java.lang.IllegalArgumentException: Parse attempt failed for value [2026-08-01]
```

API 직접 호출로도 동일하게 재현된다.

```bash
# 필터 없음 → 정상
curl -b cookie 'http://localhost:8080/api/admin/problems'
# → 8건

# 날짜 필터 → 실패
curl -b cookie 'http://localhost:8080/api/admin/problems?createdFrom=2026-08-01'
# → {"resultCode":-1,"resultMsg":"처리 중 오류가 발생하였습니다."}
```

프론트엔드는 `<input type="date">`의 값을 그대로 보내므로 형식(`YYYY-MM-DD`)에는 문제가 없다. **서버의 바인딩 설정 누락이다.**

### 왜 자동 테스트가 잡지 못했나

`ProblemServiceImplTest`는 `ProblemService.list(...)`를 **`LocalDate` 객체로 직접 호출**한다. Spring의 요청 파라미터 바인딩 단계를 전혀 거치지 않으므로, 문자열→`LocalDate` 변환 실패가 드러날 수 없다. 컨트롤러의 쿼리 파라미터를 실제로 통과시키는 MockMvc 테스트가 없다.

### 제안

```java
@RequestParam(required = false)
@DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate createdFrom,
```

두 파라미터에 `@DateTimeFormat(iso = ISO.DATE)`를 붙인다. 함께 다음도 권한다.

- **MockMvc 테스트 추가** — 쿼리 파라미터를 문자열로 넘겨 바인딩까지 확인한다. 지금 구조로는 이 계층이 통째로 미검증이다.
- 잘못된 날짜 형식이 들어왔을 때 `INPUT_VALUE_INVALID`로 안내하도록 `MethodArgumentTypeMismatchException` 핸들러를 추가한다. 현재는 catch-all에 걸려 "처리 중 오류"로 뭉뚱그려진다.

---

<a id="d2"></a>
## D2. (Minor) Topbar에 부서명 대신 내부 DB ID가 표시된다

| 항목 | 내용 |
|---|---|
| 심각도 | Minor |
| 화면·API | 관리자 Shell Topbar (전 관리자 화면 공통), `GET /api/auth/session` |
| 재현 절차 | 1. 부서관리자 계정(`dev_admin`, 개발팀)으로 로그인<br>2. 임의의 관리자 화면 우상단 프로필 영역 확인 |
| 기대 | `부서 관리자 · 개발팀` |
| 실제 | **`부서 관리자 · 부서 862번`** — 부서 ID가 그대로 노출된다 |
| 영향 | 사용자에게 내부 식별자를 보여준다. 부서관리자는 자기 부서명을 확인할 수 없고, 862가 무엇인지 알 방법이 없다. 총괄관리자는 `전체 부서`로 정상 표시되므로 **부서관리자에게만** 나타난다 |

### 원인

`SessionStatusResponse`가 `departmentId`만 담고 `departmentName`을 담지 않는다. Topbar는 받은 값으로 표시할 수밖에 없다.

```
employeeNo · name · role · departmentId · mustChangePassword
```

같은 문제가 문제 목록 표에는 없다 — `ProblemListItem`은 `departmentName`을 함께 내려주기 때문에 "개발팀"으로 올바르게 표시된다. 즉 **세션 응답만 부서명을 빠뜨렸다.**

### 제안

`SessionStatusResponse`에 `departmentName`을 추가하고 Topbar가 그 값을 쓰도록 한다. Plan 1/2 산출물이지만 부서관리자 계정으로 화면을 본 적이 없어 지금까지 드러나지 않았다.

---

<a id="d3"></a>
## D3. (Minor) 사용자 화면 안내문에 내부 개발 용어 "Plan 4"가 노출된다

| 항목 | 내용 |
|---|---|
| 심각도 | Minor |
| 화면 | `/admin/problems/new`, `/admin/problems/:id/edit` — 문제 유형을 "빈칸 채우기"로 선택했을 때 |
| 재현 절차 | 1. `/admin/problems/new` 진입<br>2. 문제 유형을 "빈칸 채우기"로 변경<br>3. "빈칸 후보" 영역의 안내 문구 확인 |
| 기대 | 사용자가 이해할 수 있는 표현 |
| 실제 | **"실제 출제 시 무작위로 노출할 빈칸은 Plan 4에서 정합니다 — 여기서는 후보와 노출 개수만 저장합니다."** |
| 영향 | "Plan 4"는 내부 구현 계획 문서의 이름이다. 이 시스템을 쓰는 부서관리자는 그것이 무엇인지 알 수 없다. 기능 오작동은 아니지만 제품 밖 정보가 화면에 남아 있는 상태다 |

### 제안

사용자 관점의 표현으로 바꾼다. 예: *"실제 출제 시에는 등록한 빈칸 후보 중 위에서 지정한 개수만큼 무작위로 노출됩니다. 여기서는 후보와 개수만 저장합니다."*

같은 계열의 문구가 다른 화면에도 있는지 함께 훑어볼 것을 권한다.

---

<a id="d4"></a>
## D4. (Major — 개발 환경) QA를 한 번이라도 한 DB에서는 백엔드 테스트 3건이 영구히 실패한다

| 항목 | 내용 |
|---|---|
| 심각도 | **Major (제품 아님 — 개발 환경)** |
| 대상 | `backend/src/test/java/com/daeryun/probank/dao/UserDaoTest.java` |
| 검출일 | 2026-08-09 (D1~D3 수정 착수 전 기준선 확인 중) |
| 재현 절차 | 1. 관리자 화면으로 부서·계정을 한 번이라도 생성한다(= `audit_logs`에 행이 생긴다)<br>2. `cd backend && ./gradlew test` |
| 기대 | 189개 전부 통과 |
| 실제 | `existsSuperAdmin_falseThenTrueAfterInsertingSuperAdmin`, `existsSuperAdmin_ignoresInactiveSuperAdmins`, `countActiveSuperAdminsExcluding_countsOnlyOtherActiveSuperAdmins` **3건 실패** |

```
DataIntegrityViolationException: SQL [DELETE FROM users WHERE role = 'SUPER_ADMIN'];
  ERROR: update or delete on table "users" violates foreign key constraint
         "audit_logs_actor_id_fkey" on table "audit_logs"
  Detail: Key (id)=(1) is still referenced from table "audit_logs".
```

### 원인

세 테스트는 "총괄 관리자가 하나도 없다"는 전제를 만들려고 셋업에서 `DELETE FROM users WHERE role = 'SUPER_ADMIN'`을 실행했다. `UserDaoTest:221-223`의 주석을 보면 작성자는 **부트스트랩 러너가 남긴 SUPER_ADMIN 행**까지는 고려했으나, **그 관리자가 감사 로그를 남기는 경우**를 놓쳤다.

`users(id)`를 참조하는 테이블은 네 개다.

| 테이블 | 컬럼 |
|---|---|
| `problems` | `created_by` |
| `attempts` | `user_id` |
| `excel_upload_logs` | `uploaded_by` |
| `audit_logs` | `actor_id` |

지금은 `audit_logs`가 먼저 걸리지만, QA 데이터로 문제를 등록하면 `problems.created_by`도 같은 이유로 걸린다. **DELETE 방식 자체가 참조 테이블이 늘어날 때마다 깨진다.**

이 결함의 실질적 피해는 "기준선을 신뢰할 수 없다"는 것이다. Plan 3 QA 결함 수정 계획은 *"백엔드 189개 통과를 하나도 깨뜨리지 않는다"*를 제약으로 걸었는데, QA를 수행한 DB에서는 그 기준선이 애초에 성립하지 않았다.

### 수정

지우지 않고 **강등**한다.

```java
private void demoteAllSuperAdmins() {
    jdbcTemplate.update("UPDATE users SET role = 'EMPLOYEE' WHERE role = 'SUPER_ADMIN'");
}
```

`existsSuperAdmin`과 `countActiveSuperAdminsExcluding`은 `role`과 `status`만 보므로(`UserMapper.xml:17-24`) 강등으로 전제가 충족되고, 외래키를 전혀 건드리지 않아 참조 테이블이 늘어나도 깨지지 않는다. `@Transactional` 롤백 범위 안이라 개발 DB의 실제 데이터는 그대로다.

---

<a id="d5"></a>
## D5. (Major) 브라우저 200% 확대 시 관리 화면에서 튕겨나간다

| 항목 | 내용 |
|---|---|
| 심각도 | **Major** |
| 화면 | 관리자 화면 전체 (`/admin/*`) |
| 검출일 | 2026-08-09 (접근성 회차, §11.11) |
| 재현 절차 | 1. 1440×1024 화면에서 관리자로 로그인해 `/admin/problems` 진입<br>2. 브라우저를 **200%로 확대**(Ctrl + `+` 3회) |
| 기대 | 레이아웃이 유지되고 관리 화면을 계속 쓸 수 있다 (WCAG 2.1 SC 1.4.4) |
| 실제 | **`/solve`로 리다이렉트되어 관리 화면을 벗어난다** |

| 확대율 | CSS 뷰포트 | 결과 |
|---|---|---|
| 100% / 150% / 175% | 1440 / 960 / 823px | 정상 |
| **200%** | **720px** | **`/solve` 이탈** |

### 원인 — 설계 충돌

PRD 섹션 3.2·7이 *"모바일 뷰포트에서는 관리자 화면 접근 자체를 차단"* 하도록 요구하고, 판별 기준을 **뷰포트 너비 768px**로 정했다. 브라우저 확대는 CSS 뷰포트 너비를 줄이므로 **확대 사용자와 모바일 기기가 구분되지 않는다.** 가드의 오작동이 아니라 전제가 확대 사용자를 삼킨 것이다.

넓은 모니터(2560px)에서는 200%가 CSS 1280px라 드러나지 않는다. 체크리스트 기준 해상도인 1440×1024에서 재현된다.

### 판단 필요 (제품 결정)

1. 임계값을 낮춘다(예: 640px) — 확대는 살지만 PRD의 모바일 차단 폭이 좁아진다
2. `pointer: coarse` 같은 기기 특성을 함께 본다 — 구분은 되나 판별 규칙이 복잡해진다
3. 현 동작을 의도로 확정하고 접근성 부채로 문서화한다

---

<a id="d6"></a>
## D6. (Minor) 일부 인터랙티브 요소에 포커스 표시가 없다

| 항목 | 내용 |
|---|---|
| 심각도 | Minor |
| 화면 | `/admin/problems`(목록), `/admin/problems/new`(등록 폼) |
| 검출일 | 2026-08-09 (접근성 회차, §11.6) |
| 기대 | 모든 인터랙티브 요소에 3px Aqua 아웃라인(2px offset) |
| 실제 | 목록의 **"수정" 링크 13개**와 등록 폼의 **정답 라디오 2개**가 브라우저 기본 포커스 링에 의존 |

전수 조사 결과 Plan 1·2 화면(`/admin/departments` 0/28, `/admin/users` 0/29)은 누락이 없고 **Plan 3 화면에서만** 나온다.

```
"수정" 링크 — focus-visible 유틸리티 없음
  inline-flex h-8 items-center rounded-sm border border-line-strong px-3 …

같은 행 "보관" 버튼 — 정상
  … focus-visible:outline focus-visible:outline-[3px]
    focus-visible:outline-offset-2 focus-visible:outline-brand
```

### 정정 (2026-08-09 재확인)

최초 보고에 "사이드바 링크의 아웃라인 색상이 Aqua가 아니다"를 함께 적었으나 **측정 오류였다.** `Tab` 직후 즉시 읽어 전이 중간값을 잡은 것으로, 300ms 대기 후 다시 읽으면 Aqua(`rgb(0,180,227)`)가 정상 적용된다. Tailwind v4의 `transition-colors`가 `outline-color`를 포함하기 때문이다. **사이드바는 명세를 지키고 있다.**

### 실제 누락 지점 (소스 확인)

| 위치 | 대상 |
|---|---|
| `ProblemListPage.jsx:226` | 표 행 "수정" 링크 |
| `ProblemFormPage.jsx:422` | 정답 선택 radio/checkbox (보기 수만큼) |
| `ProblemFormPage.jsx:313` | "목록으로" 링크 (권한 없는 문제 접근 화면) |

세 번째는 403 분기에서만 렌더링되어 **브라우저 전수 조사에서는 잡히지 않았고 소스 검토로 찾았다.**

상세는 [`2026-08-09-accessibility-result.md`](2026-08-09-accessibility-result.md) 참고.

---

## 결함 아님으로 판정한 항목

QA 중 결함으로 의심했으나 확인 결과 제품 문제가 아니었던 것들이다. 재조사 낭비를 막기 위해 남긴다.

| 현상 | 판정 |
|---|---|
| 로그인 후 강제 비밀번호 변경 화면이 뜨지 않음 | **결함 아님.** 브라우저에 이전 로그인의 세션 쿠키가 남아 있었다. 로그아웃 후 재시도하니 `/change-password`로 정상 이동했다 |
| 계정 생성이 "처리 중 오류"로 실패 | **환경 문제.** 내가 띄운 백엔드가 포트 8080 충돌로 기동 실패했고, 이전 백엔드(메일 설정 없음)가 요청을 받고 있었다. 다만 이 현상 자체는 Plan 1·2 QA의 D1(메일 실패가 일반 오류로 뭉뚱그려짐)이 그대로 재현된 것이다 |
| API 요청이 `1000 잘못된 파라미터`로 실패 | **QA 도구 문제.** Windows 셸에서 한글이 포함된 JSON을 `curl -d`로 보낼 때 인코딩이 깨졌다. 파일로 보내니 정상 처리됐다 |
| 보기 필드명 `choiceText`가 먹지 않음 | **QA 오류.** API DTO의 필드명은 `text`다(`ChoiceInput`). DB 컬럼명 `choice_text`와 다른 것은 정상적인 내부 매핑이다 |
