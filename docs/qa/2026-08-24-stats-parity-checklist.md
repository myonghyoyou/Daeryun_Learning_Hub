# 서브플랜 6(통계·대시보드) 파리티 정답지

> **이 문서가 계약이다.** 서브플랜 4·5에서 리뷰가 반복해 증명한 것: **정답지 행이 틀리면 검증이
> 틀린 것을 합격시킨다.** 여기 적힌 값은 `backend/` 소스를 직접 읽어 실측한 것이고 인용은
> `파일:줄` 이다. 구현자와 검증자는 행의 주장이 아니라 **인용된 Java·SQL 을 열어** 확인하라.

- 작성일: 2026-08-24
- 대상: `StatsController` 2 + `DashboardController` 1 = **3개 엔드포인트**
- 근거: `StatsServiceImpl.java`(131줄), `DashboardServiceImpl.java`(74줄), `StatsMapper.xml`(85줄),
  DTO 8종, `AttemptMapper.findRecentWrong`, `ProblemMapper.findRecent`
- 총 **65행** (R 8 · L 17 · D 16 · B 16 · X 8)
- **실측 상태**: 소스 정독 후 **Spring 인스턴스를 띄워 R·L·D·B 를 직접 호출해 대조했다.**
  초안이 틀린 곳은 없었고, 실측이 판별자 두 개를 실물 데이터에서 찾아냈다(X4·B3). 아래 "실측 기록" 참고

> **이 서브플랜의 성격이 앞의 둘과 다르다.** 4·5는 "요청 → 저장/조회"였지만 여기는 **집계**다.
> 틀려도 예외가 안 나고, 화면에 그럴듯한 숫자가 뜬다. 판별자는 **경계값**(0건·null·동률)과
> **범위**(활성만이냐 보관 포함이냐)에 몰려 있다.

---

## R. 권한·스코프

| # | 시나리오 | 기대 | 근거 |
|---|---|---|---|
| R1 | 두 컨트롤러 모두 **클래스 레벨 `@RequireRole({SUPER_ADMIN, DEPT_ADMIN})`** | EMPLOYEE 는 403 / 990 | `StatsController.java:14`, `DashboardController.java:14`. **서브플랜 5의 풀이 라우트와 정반대다** — 거긴 역할 제한이 없었다 |
| R2 | 메서드 레벨 재정의 | **없다.** 세 메서드 전부 클래스 규칙을 그대로 받는다 | 두 컨트롤러 전문 확인 |
| R3 | 비로그인 | 401 / 980 | 미들웨어 + `evaluateGate` (기존) |
| R4 | **`effectiveDepartmentId`** | SUPER_ADMIN → 요청한 `departmentId` 그대로(생략 시 전 부서). **DEPT_ADMIN → 요청값을 무시하고 자기 부서** | `StatsServiceImpl.java:69-71`. 주석이 "이 스코프는 UI 가 아니라 여기서 강제된다"고 못 박는다 |
| R5 | DEPT_ADMIN 이 `departmentId` 위조 | 무시된다 — 자기 부서 결과가 나온다. **오류가 아니다** | 같은 곳. 서브플랜 4 목록과 같은 규칙 |
| R6 | 대시보드도 같은 규칙 | `DashboardServiceImpl.java:46` 이 **같은 식을 다시 적는다** | `:44-45` 주석: `ProblemDao.findRecent` 는 원시 DAO 라 스스로 스코프를 강제하지 않으므로 계산해 넘긴다. **두 곳이 어긋나면 최근 문제 목록만 다른 부서를 보여 준다** |
| R7 | 상세 조회의 부서 검사 | SUPER_ADMIN 이 아니고 문제 부서 ≠ 내 부서 → **403 / 990** (`ACCESS_AUTH_DENIED`, 문구 없이 코드 기본값) | `StatsServiceImpl.java:104-106` |
| R8 | 상세 조회 순서 | **존재 확인이 먼저, 권한 검사가 나중.** 없는 문제 + 남의 부서 → `존재하지 않는 문제입니다.` | `:100-106`. 뒤집으면 남의 부서 문제의 **존재 여부가 새어 나간다** — 다만 Java 가 이 순서이므로 그대로 이식한다 |

---

## L. 문제별 통계 목록 — `GET /api/admin/stats/problems`

| # | 시나리오 | 기대 | 근거 |
|---|---|---|---|
| L1 | 페이지 클램프 | `page = max(1, page)`. 0·음수 → 1 | `StatsServiceImpl.java:76` |
| L2 | 크기 클램프 | `size <= 0` → **20**, `size > 100` → **100** | `:77`. `:44-48` 주석이 이유를 적는다 — 음수 LIMIT 은 DB 오류, 상한 없으면 문제×시도 GROUP BY 가 무제한 |
| L3 | 기본값 | `page=1`, `size=20` (컨트롤러 `@RequestParam(defaultValue=...)`) | `StatsController.java:27-28` |
| L4 | **보관 문제도 집계에 들어간다** | `status` 필터를 안 주면 ARCHIVED 도 나온다 | `StatsMapper.xml:5-7` 주석: 보관 Modal 이 "기존 풀이 이력도 그대로 보존됩니다"라고 약속하므로 보관 순간 시도 수가 사라지면 약속을 어긴다 |
| L5 | `status` 필터 | `AND p.status = #{status}`. 빈 문자열은 **미적용** | `StatsMapper.xml:11` (`status != null and status != ''`) |
| L6 | **정렬 — 정답률 오름차순** | `correct/NULLIF(total,0) ASC NULLS LAST, p.id` | `StatsMapper.xml:32-36` |
| L7 | **미응시(시도 0건)는 맨 뒤** | `NULLIF` 가 0 을 NULL 로 만들고 `NULLS LAST` 가 뒤로 보낸다. **0% 가 아니라 "미응시"다** | 같은 곳 + `ProblemStatItem.java` javadoc |
| L8 | 동률 타이브레이커 | `p.id` — 없으면 페이지 경계에서 중복·누락 | `StatsMapper.xml:27-28` |
| L9 | **정렬이 SQL 과 Java 양쪽에 있다** | SQL 이 정렬하고, `LOWEST_ACCURACY_FIRST` 가 **같은 규칙을 Java 로 다시 적어** 이미 정렬된 페이지에 재적용한다(no-op) | `StatsServiceImpl.java:25-37, 80`. 주석: **"두 곳 중 한쪽만 고치면 페이지 안과 밖의 순서가 어긋난다. 반드시 함께 고쳐라."** |
| L10 | L9 를 왜 그대로 두는가 | 자바 비교자는 **의도를 단위 테스트로 고정**하는 역할이다. 페이징이 SQL 순서 위에서 잘리므로 자바에서만 정렬하면 **페이지 안에서만** 맞고 전체로는 틀린다 | 같은 주석. 포트도 두 곳을 유지할지 한 곳으로 줄일지 **계획서에서 정한다** |
| L11 | `totalCount` | `count(*) FROM problems p` — **`attempts` 조인 없음** | `StatsMapper.xml:49-55`. 주석: 조인한 채 `count(*)` 하면 시도 수만큼 부풀어 총건수가 틀린다 |
| L12 | `accuracyRate` 계산 | `totalAttempts == 0 ? null : correct/total` (Java `double` 나눗셈) | `ProblemStatItem.java` `from()` |
| L13 | 응답 형태 | `{items, totalCount, page, size}` | `ProblemStatPageResponse.java`. 주석: 문제 목록과 **같은 모양**을 유지해 화면이 같은 Pagination 을 쓴다 |
| L15 | **`?page=`·`?size=` (빈 문자열)** | **기본값이 적용된다** — `page=1`, `size=20`, 200 | 실측. **서브플랜 5의 `count` 와 다르다** — 거긴 `@RequestParam int count`(필수 원시형)라 빈 문자열이 **타입 불일치**였다. 여기는 `@RequestParam(defaultValue=...)` 라 값이 없으면 기본값으로 떨어진다. 포트의 `parseNumericParam` 이 빈 문자열을 `null` 로 주므로 `?? 1` / `?? 20` 이면 일치한다 |
| L16 | `?page=abc` · `?size=1.5` | 400 / 1000 / **`요청 값의 형식이 올바르지 않습니다: page`**(또는 `: size`) | 실측. `departmentId=abc` 도 `: departmentId`, 상세의 `/abc` 도 `: id` |
| L17 | **`?status=BOGUS`** (유효하지 않은 상태값) | **200 / 0건.** 검증하지 않고 그냥 안 맞을 뿐이다 | 실측. `p.status = 'BOGUS'` 가 아무것도 안 맞춘다. **오류로 만들면 파리티 위반** |
| L14 | `items[i]` 필드 | `problemId, content, type, status, departmentId, departmentName, totalAttempts, correctAttempts, accuracyRate, lastAttemptAt` — **10개** | `ProblemStatItem.java`. `id` 가 아니라 **`problemId`** 다 |

---

## D. 문제별 통계 상세 — `GET /api/admin/stats/problems/{id}`

| # | 시나리오 | 기대 | 근거 |
|---|---|---|---|
| D1 | 없는 문제 | 400 / 1000 / **`존재하지 않는 문제입니다.`** | `StatsServiceImpl.java:100-103`. **서브플랜 5의 `존재하지 않거나 보관된 문제입니다.` 와 다른 문구다** — 여기는 보관 문제도 조회 대상이다 |
| D2 | 보관된 문제 | **조회된다.** 상태 필터가 없다 | 같은 곳. L4 와 같은 원리 |
| D3 | 남의 부서 (DEPT_ADMIN) | 403 / 990 | `:104-106` |
| D4 | 응답 형태 | `{summary, choiceDistribution, excludedAttempts, recentWrongSamples}` — 4개 | `ProblemStatDetailResponse.java` |
| D5 | `summary` | `ProblemStatItem` 과 같은 10필드 | `:109-112` |
| D6 | **집계 행이 없을 때의 `summary`** | `findProblemStat` 이 null 이면 `problem` 에서 합성한다 — `departmentName` **null**, `totalAttempts` 0, `correctAttempts` 0, `accuracyRate` **null**, `lastAttemptAt` null | `:111-112`. 실제로는 `LEFT JOIN` 이라 항상 한 행이 나오므로 **도달하기 어렵다** |
| D7 | `choiceDistribution` — 대상 유형 | MCQ_SINGLE · MCQ_MULTI · OX 만. **SHORT_ANSWER·FILL_BLANK 는 `null`** | `:39-40, 116` (`CHOICE_TYPES`) |
| D8 | **아무도 안 고른 보기도 0회로 남는다** | `problem_choices` 전체를 돌면서 분포에 없으면 `0` | `:120-124`. 주석: 빠지면 "아무도 안 고른 보기"를 볼 수 없다 |
| D9 | `choiceDistribution[i]` 필드 | `{choiceId, choiceText, selectedCount}` | `ChoiceDistributionItem.java` |
| D10 | 분포의 순서 | `problemChoiceDao.findByProblemId` 순서 = `display_order` 오름차순 | `ProblemChoiceMapper` |
| D11 | **`excludedAttempts`** | `max(0, totalAttempts - countAnalyzedAttempts(problemId))` | `:125` |
| D12 | `excludedAttempts` 가 왜 필요한가 | 문제를 수정하면 선택지가 **새 ID 로 다시 만들어져** 이전 기록이 현재 보기와 매칭되지 않는다. 이 값이 없으면 **"분포 합계 ≠ 시도 수"가 버그처럼 보인다** | `ProblemStatDetailResponse.java` javadoc |
| D13 | `countAnalyzedAttempts` SQL | `count(DISTINCT ac.attempt_id)` — `attempt_choices` 를 `problem_choices` 에 **`c.problem_id = a.problem_id` 로 조인**해 현재 보기와 맞는 것만 센다 | `AttemptChoiceMapper.xml` |
| D14 | 선택지 없는 유형의 `excludedAttempts` | **0** (분기 밖이라 초기값 유지) | `:115, 116` |
| D15 | **`recentWrongSamples`** | 오답만, `submitted_at DESC, id DESC`, **최대 5건** | `AttemptMapper.xml:23`, `StatsServiceImpl.java:42, 128` |
| D16 | `recentWrongSamples[i]` 필드 | `{submittedAnswer, submittedAt}` — 2개 | `RecentWrongSample.java`. javadoc: 제출 시점에 이미 사람이 읽는 형태로 저장되므로 변환 필드가 필요 없다 |

---

## B. 대시보드 요약 — `GET /api/admin/dashboard`

> **이 절의 핵심은 "지표마다 적용 범위가 다르다"는 것이다.** `DashboardSummaryResponse.java`
> javadoc 이 표로 적어 놨고, 화면이 그 차이를 문구로 밝혀야 한다고 못 박는다.

| # | 시나리오 | 기대 | 근거 |
|---|---|---|---|
| B1 | 응답 형태 | `{totalProblems, reviewNeededCount, totalAttempts, totalCorrectAttempts, averageAccuracyRate, lowAccuracyProblems, recentProblems}` — 7개 | `DashboardSummaryResponse.java` |
| B2 | **`totalProblems`** | **활성만** — `count(*) WHERE status='ACTIVE'` | `StatsMapper.xml:69-74` |
| B3 | **`totalAttempts`** | **활성 + 보관** — `allStats` 전체 합 | `DashboardServiceImpl.java:50` |
| B4 | **`totalCorrectAttempts`** | 활성 + 보관 | `:51` |
| B5 | **`averageAccuracyRate`** | 활성 + 보관. **시도가 0건이면 `null`** (0.0 이 아니다) | `:52` |
| B6 | 평균 계산 방식 | `totalCorrect / totalAttempts` — **문제별 정답률의 평균이 아니다** | 같은 곳. 문제별 평균을 쓰면 시도가 적은 문제가 과대 대표된다 |
| B7 | **`needsReview` 정의** | `status == ACTIVE` **그리고** `totalAttempts >= 5` **그리고** `accuracyRate != null` **그리고** `accuracyRate < 0.5` | `:35-40` |
| B8 | `needsReview` 가 왜 한 함수인가 | 검토 필요 **건수**와 정답률 낮은 **목록**이 같은 함수를 안 쓰면 "검토 필요 0건인데 목록은 0% 로 가득 찬 화면"이 만들어진다 | `:31-34` 주석 |
| B9 | `reviewNeededCount` | `needsReview` 를 통과한 것의 **개수** | `:54-56, 67` |
| B10 | **`lowAccuracyProblems`** | `reviewNeededCount` 와 **같은 조건**, 최대 **5건** | `:59-61` |
| B11 | `lowAccuracyProblems` 정렬 | **재정렬하지 않는다** — `allStats` 가 이미 정답률 오름차순이다 | `:58` 주석 |
| B12 | `lowAccuracyProblems[i]` | `ProblemStatItem` 10필드 | `:71` |
| B13 | **`recentProblems`** | `ProblemMapper.findRecent` — `created_at DESC, p.id DESC`, **최대 5건** | `ProblemMapper.xml:117`, `DashboardServiceImpl.java:21, 63` |
| B14 | `recentProblems` 의 상태 필터 | **없다.** 보관 문제도 나온다 | `ProblemMapper.xml:117` 의 `<where>` 에 `status` 조건 없음 |
| B15 | `recentProblems[i]` 필드 | `{id, type, content, status, departmentId, departmentName, createdAt, tags}` — 8개. **`ProblemListItem` 이지 `ProblemStatItem` 이 아니다** | `ProblemListItem.java` |
| B16 | `recentProblems` 의 부서 스코프 | `DashboardServiceImpl.java:46` 이 계산한 값으로 걸린다 — R6 참고 | 같은 곳 |

---

## X. 경계·함정

| # | 시나리오 | 기대 | 근거 |
|---|---|---|---|
| X1 | 시도 0건인 문제 | `totalAttempts` 0, `correctAttempts` 0, `accuracyRate` **null**, `lastAttemptAt` **null**. 목록에서는 **맨 뒤** | L7·L12 |
| X2 | 정답률 0% (시도는 있고 전부 오답) | `accuracyRate` = **0.0** — null 과 **다르다**. 목록에서 **맨 앞** | L6·L7. 이 둘을 구분하지 못하면 "미응시"와 "전부 틀림"이 섞인다. **현재 DB 에 해당 문제가 없어 실측 못 했다** — 구현 시 픽스처로 만들 것 |
| X3 | `needsReview` 의 시도 경계 | 시도 **4회는 제외**, **5회는 포함**(`>= 5`) | B7. **현재 DB 에 시도 4·5회짜리 문제가 없어 실측 못 했다**(3·6·8·8·10회뿐) — 픽스처로 만들 것 |
| X4 | `needsReview` 의 정답률 경계 | **정확히 0.5 는 제외**(`< 0.5`). 0.49 는 포함 | B7. **실측 확인** — 문제 6번이 ACTIVE·시도 8회·정답 4회로 **정확히 0.5** 인데 `reviewNeededCount` 가 4가 아니라 **3** 이고 `lowAccuracyProblems` 에도 없다. 실물 데이터에 판별자가 있다 |
| X5 | 보관 문제는 `needsReview` 에서 빠진다 | `status == ACTIVE` 조건 | B7. **그런데 `totalAttempts` 합계에는 들어간다**(B3) — 범위가 다르다 |
| X6 | `attempt_choices` 가 0행인 시도 | 분포에는 안 잡히고 `excludedAttempts` 로 센다 | D11·D13. **서브플랜 5 가 남긴 사실**: 선택지 0개인 시도가 계약상 존재한다(E2E 문서 C9) |
| X7 | **`attempts` 47번(고아 행)** | FILL_BLANK 라 `choiceDistribution` 이 null 이고 분포 로직을 안 탄다. `totalAttempts` 에는 **포함**된다 | 서브플랜 5 E2E 문서 C8. "모든 FILL_BLANK 시도는 자식이 1행 이상" 같은 단언을 세우면 여기서 깨진다 |
| X8 | `lastAttemptAt` 의 타임스탬프 | `timestamp without time zone`. 포트는 `parseUtcTimestamp`(`web/lib/db/raw.ts`)를 써야 Drizzle 컨벤션(UTC `+0000`)과 맞는다 | 서브플랜 5 E2E 문서 C3 — **민감한 것은 Node 프로세스 TZ 가 아니라 DB 세션 TZ 다** |

---

## 이탈 후보 (계획서 작성 시 승인 필요)

| # | 항목 | Spring | 제안 | 근거 |
|---|---|---|---|---|
| ㉠ | 정렬이 SQL·Java 두 곳에 있다(L9·L10) | 둘 다 유지 | **SQL 만 남기고 Java 재정렬은 뺀다** | Java 쪽은 no-op 이고 "의도를 테스트로 고정"하는 역할인데, 포트는 그 의도를 **DAO 단위 테스트로 직접 고정**할 수 있다. 두 곳을 유지하면 원저자 경고대로 어긋날 위험만 남는다. **반대 의견**: no-op 이라도 지우는 건 동작 변경이 아니라 구조 변경이라 파리티 논의 밖이다 |
| ㉡ | `listAllProblemStats` 가 **전 문제를 메모리로 올린다**(B3~B10) | 페이징 없이 전체 조회 후 Java 에서 합산·필터 | **그대로 이식** | 722문항 규모에서 감당 가능하고, 집계를 SQL 로 옮기면 B7 의 4중 조건이 SQL 과 Java 로 흩어져 B8 이 경고한 "두 지표가 어긋나는" 위험이 생긴다. 성능은 컷오버 후 실측 |

---

## 검증되지 않은 것 (계획서 착수 전에 처리할 것)

- **이 문서는 아직 Spring 인스턴스로 실측하지 않았다.** 서브플랜 5에서 소스만 읽고 쓴 초안의
  **2행이 틀렸고**(E5·P2 의 문구에 파라미터 이름이 붙었다) 실측이 새 행 4개를 만들었다.
  특히 이 서브플랜은 **집계**라 눈으로 읽은 SQL 이 실제로 무엇을 세는지 확인이 필요하다 —
  최소한 L6·L7·X1·X2(정렬과 null 대 0.0), B5(0건일 때 null), D11(`excludedAttempts`)은
  실제 데이터로 재야 한다.
- 프론트엔드가 세 엔드포인트를 어떻게 호출하는지 URL 은 확인했다(`api/stats.js:8,12`,
  `api/dashboard.js:5`) — 정답지의 경로와 일치한다. **응답 필드를 어떻게 쓰는지는 아직 안 봤다**;
  계획서 작성 시 `pages/admin/stats` 와 대시보드 화면을 확인할 것.

---

## 실측 기록 (2026-08-24)

초안을 소스만 읽고 쓴 뒤 **`./gradlew bootRun` 으로 Spring 을 띄워(8080, DB 는 로컬
`probank_dev` 동일) R·L·D·B 를 직접 호출해 대조했다.** 서브플랜 5에서 같은 단계가 초안 2행의
오류를 잡았고, 이 서브플랜은 **집계**라 눈으로 읽은 SQL 이 실제로 무엇을 세는지 더 불확실했다.

**초안이 틀린 곳은 없었다.** 62행 중 실측한 것은 전부 일치했다.

**실측 당시 DB**: 문제 70(활성 66) · 시도 44(그중 ARCHIVED 문제 것 1) · 시도 있는 문제 9.

### 실물 데이터에 판별자가 이미 있다 — 둘 다 놓치기 쉬운 경계다

**X4 (정답률 경계).** 문제 6번: ACTIVE · 시도 8 · 정답 4 → **정확히 0.5**. `needsReview` 의
다른 세 조건을 전부 만족하는데 `< 0.5` 에서만 걸린다. 실측 `reviewNeededCount` 는 **3**
(4가 아니다)이고 `lowAccuracyProblems` 에도 없다. **`<=` 로 잘못 쓰면 이 하나가 늘어난다.**

**B3 (지표별 범위).** `totalAttempts` = **44** = `attempts` 전체이고, 그중 **1건은 ARCHIVED
문제의 시도**다. 같은 응답의 `totalProblems` 는 **66**(활성만, 전체는 70). 한 응답 안에서
**두 지표의 범위가 실제로 다르다는 것이 숫자로 보인다.**

### 실측한 값 (계획서·구현이 기대값으로 쓸 것)

| 항목 | 값 |
|---|---|
| 권한 | EMPLOYEE **403/990**, DEPT_ADMIN·SUPER_ADMIN 200, 비로그인 **401/980** |
| 클램프 | `size=0`→20, `size=1000`→**100**, `page=0`·`page=-5`→1 |
| `totalCount` | **70** — 시도 44건에 부풀지 않았다(L11) |
| 정렬 | `0.3333(id 12) · 0.3333(id 19) · 0.3333(id 184) · 0.375 · 0.4 · 0.5 … null · null` — **동률은 id 오름차순, null 은 맨 뒤** |
| `items[i]` 키 | 정확히 10개, **`problemId`**(`id` 아님) |
| 상세 — 없는 문제 | 400 / 1000 / **`존재하지 않는 문제입니다.`** (서브플랜 5의 문구와 다르다) |
| 상세 — 보관 문제(185) | **200**, `summary.status = ARCHIVED` |
| 상세 — 남의 부서(dev01) | **403 / 990** |
| `choiceDistribution` | MCQ_SINGLE·OX 는 배열, **SHORT_ANSWER·FILL_BLANK 는 `null`** |
| D8 (안 고른 보기) | OX 19번이 `{O:1, X:**0**}` — 0회 보기가 실제로 남아 있다 |
| `excludedAttempts` | 문제 1번 **3** (시도 8 − 분석 5), 선택지 없는 유형은 **0** |
| `recentWrongSamples` | 최대 **5**건, 키는 정확히 `{submittedAnswer, submittedAt}` |
| 대시보드 키 | 정확히 7개 |
| 대시보드 값 | `totalProblems 66 · reviewNeededCount 3 · totalAttempts 44 · totalCorrectAttempts 20 · averageAccuracyRate 0.45454545454545453` |
| `averageAccuracyRate` | **20/44** — 문제별 정답률의 평균이 아니다(B6 확인) |
| `lowAccuracyProblems` | 3건, `[184, 0.333], [1, 0.375], [44, 0.4]` — **정답률 오름차순, `reviewNeededCount` 와 같은 집합** |
| `recentProblems` | 5건, 키 8개(**`id`**, `problemId` 아님), **첫 항목이 ARCHIVED** → B14 확인 |
| R5·R6 (스코프 강제) | dev01 이 `?departmentId=862` 을 위조해도 `totalProblems` 가 **62 로 동일** |

**L14 와 B15 의 비대칭이 실물로 확인됐다** — 같은 응답 안에서 통계 항목은 `problemId` 를,
최근 문제 항목은 `id` 를 쓴다. DB 행을 그대로 spread 하면 어느 한쪽이 어긋난다.

### 실측하지 못한 것 (구현 시 픽스처로 만들 것)

- **X2** — 정답률이 정확히 `0.0` 인 문제가 현재 DB 에 없다. `null`(미응시)과 `0.0`(전부 오답)을
  구분하지 못하는 구현을 잡으려면 이 픽스처가 필요하다.
- **X3** — 시도가 정확히 4회·5회인 문제가 없다(3·6·8·8·10회뿐). `>= 5` 를 `> 5` 로 잘못 쓴 것을
  잡을 수 없다.
- **D6** — 집계 행이 없을 때의 합성 `summary`. `LEFT JOIN` 이라 항상 한 행이 나오므로 HTTP 로는
  도달할 수 없다. 단위 테스트로 고정하거나 도달 불가로 기록할 것.

### 프론트 호출부

`api/stats.js:8,12` 와 `api/dashboard.js:5` 의 URL 3개가 이 문서와 일치한다. 서브플랜 4 M2 에서
계획서가 URL 을 틀리게 적어 프론트가 404 를 삼킨 사고가 있었으므로 확인했다.
**응답 필드를 화면이 어떻게 쓰는지는 계획서 작성 시 확인한다.**
