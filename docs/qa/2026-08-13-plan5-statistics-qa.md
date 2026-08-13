# Plan 5 통계 — Task 8 Design QA 결과

- 브랜치: `feat/statistics`
- 계획서: `docs/superpowers/plans/2026-07-28-05-statistics.md`
- 수행일: 2026-08-13
- 계정: `admin` / `QaAdmin1234!`(총괄), `dev_admin` / `QaPlan3!2026`(부서 관리자·개발팀), `emp001` / `QaPlan3!2026`(직원)
- 해상도: **1440×1000** — 뷰포트 높이를 1024로 지정해도 1000에서 고정됐다. 이 Task 의 항목은 폭·색·순서 측정이라 영향이 없어 그대로 진행하고 실측값을 적는다.
- 측정 방법: 브라우저는 `getComputedStyle`·`getBoundingClientRect` 로 실측, 서버 동작은 API 를 직접 호출해 확인. 눈대중 판정 없음.

---

## 1. 한 줄 결과

**서버 동작과 데이터 정합은 전부 통과했고, 결함은 나오지 않았다.** 화면 렌더링 일부(빈 상태·Pagination·막대 색·제외 안내 배너·콘솔)는 브라우저 세션이 중단돼 미검증으로 남았다 — 사유는 §7.

---

## 2. Step 2 — 총괄 관리자 대시보드 (통과)

| 확인 | 실측 |
|---|---|
| `/admin` 진입 | `/admin/dashboard` 로 리다이렉트 ✅ |
| metric 4개 + 적용 범위 문구 | 아래 표 ✅ |
| 숫자 정렬 | 네 값 모두 `font-size 28px` · `font-weight 800` · `font-variant-numeric: tabular-nums` ✅ |
| 7:5 배치 | `md:col-span-7` = **672px**, `md:col-span-5` = **476px** (12열 82.33px + gap 16px 기준 계산값 672.3 / 475.6) ✅ |
| Primary Action | 배경 `rgb(0,92,169)` 인 요소 **정확히 1개** — `문제 등록` → `/admin/problems/new` ✅ |
| 정답률 낮은 문제 링크 | `/admin/stats/235`, `/admin/stats/254` ✅ |
| 부서 필터 반응 | 전체 `12 / 2 / 63 / 52%` → 개발팀 `10 / 2 / 49 / 49%` ✅ |

지표별 적용 범위가 화면에 실제로 표기된다:

```
문제 수        12    활성 문제만
검토 필요 문제  2    활성 · 시도 5회 이상 · 정답률 50% 미만
전체 시도 수   63    보관 문제 포함
평균 정답률    52%   보관 포함 · 전체 정답 ÷ 전체 시도
```

> 이 네 문구는 리뷰가 spec ❌ 를 낸 뒤 고친 것이다. 처음에는 `평균 정답률` 이 계산식만 밝히고 범위를 밝히지 않아, 바로 옆 `전체 시도 수` 가 "보관 문제 포함"이라고 말하는데도 같은 범위인지 알 수 없었다.

**`검토 필요 문제` 값 2 와 "지금 손봐야 할 문제" 목록 2건이 일치한다.** 두 지표가 같은 판정 함수(`DashboardServiceImpl.needsReview()`)를 쓰는지 확인하는 항목이며, 계획 개정 전 초안은 이 둘이 어긋나는 상태를 자기 테스트로 고정하고 있었다.

---

## 3. Step 3 — 부서 관리자 대시보드 (통과) — 이 브랜치가 닫으려던 공백

Plan 1 이 만든 `/admin` 임시 랜딩을 Plan 2 가 `/admin/departments` 리다이렉트로 바꾸면서, **부서 관리자가 PC 로 로그인하면 총괄 전용 API(403) 화면에 안착하는 공백**이 생겼다. 그 공백이 실제로 닫혔는지가 이 Step 의 목적이다.

| 확인 | 실측 |
|---|---|
| 랜딩 | `dev_admin` 로그인 → `/admin/dashboard`, **403 없음** ✅ |
| 범위 문구 | "소속 부서 기준 · 누적 시도 데이터" ✅ |
| 부서 필터 | 대시보드에 `<select>` **0개** — 비활성이 아니라 아예 렌더되지 않는다 ✅ |
| `/api/admin/departments` 호출 | **0건** (네트워크 로그 전량 확인) ✅ |
| 메뉴 | 대시보드 · 문제 관리 · 문제 엑셀 일괄 등록 · 통계 — 부서 관리/계정 관리 없음 ✅ |
| 콘솔 | 오류 0건 ✅ |
| 지표 | `10 / 2 / 49 / 49%` — 총괄이 개발팀으로 필터했을 때와 동일 ✅ |

호출된 API 전량:
```
200 /api/auth/login
200 /api/auth/session
200 /api/admin/dashboard   (×2 — React 19 StrictMode 의 개발 모드 이중 effect)
```

---

## 4. Step 4 — 통계 목록

### 4.1 정렬 (통과)

부서 관리자 화면 12행 실측 순서:

```
0% · 0% · 25% · 45% · 50% · 60% · 67% · 67% · 75% · 100% · 미응시 · 미응시
```

정답률 오름차순, 미응시 맨 뒤 ✅

### 4.2 페이지를 넘어가는 정렬 (통과) — 단위 테스트가 잡을 수 없는 항목

정렬 규칙이 SQL(`StatsMapper.accuracyOrder`)과 자바(`StatsServiceImpl.LOWEST_ACCURACY_FIRST`) **두 곳**에 적혀 있다. 한쪽만 바뀌면 페이지 안에서는 맞고 페이지를 넘으면 틀린 상태가 되는데, 단위 테스트는 자바 쪽만 본다.

화면 기본 페이지 크기가 20이라 문제 14건으로는 2페이지가 생기지 않아, **같은 서버 코드 경로를 `size=5` 로 호출해 경계 3곳**을 검사했다.

| page | problemId | accuracyRate |
|---|---|---|
| 1 | 228 | 0.0 |
| 1 | 235 | 0.0 |
| 1 | 485 | 0.25 |
| 1 | 254 | 0.4545 |
| 1 | 484 | 0.5 |
| 2 | 230 | 0.5556 |
| 2 | 233 | 0.6 |
| 2 | 229 | 0.6667 |
| 2 | 232 | 0.6667 |
| 2 | 234 | 0.75 |
| 3 | 231 | 0.8 |
| 3 | 236 | 1.0 |
| 3 | 227 | null |
| 3 | 255 | null |

- 1→2 경계: 0.5 → 0.5556 ✅
- 2→3 경계: 0.75 → 0.8 ✅
- 미응시 두 건이 맨 뒤, id 순(227 → 255) ✅
- 동률도 id 로 끊긴다: 0.0 → 228·235, 0.6667 → 229·232 ✅

### 4.3 표시·필터 (통과)

| 확인 | 실측 |
|---|---|
| 빈칸 마커 | `예산의 3요소는 ____, ____, ____ 이다.` — `{{b1}}` 노출 없음 ✅ |
| 숫자 열 | 시도·정답률 열이 `text-align: right` + `tabular-nums` ✅ |
| 본문 잘림 | `text-overflow: ellipsis` / `overflow: hidden` ✅ |
| **본문 툴팁** | `<td>` 에 `title="수정된 OX 문제 본문"` 도달 ✅ — `TableCell` 이 나머지 props 를 버려 **이 prop 은 이 Task 전까지 아무 일도 하지 않았다**(`ProblemListPage.jsx:230` 도 같은 상태였다) |
| 상태 배지 | 활성 `rgb(8,124,89)`(success-text) / 보관됨 `rgb(117,132,154)`(ink-muted) ✅ |
| 부서 필터 | 부서 관리자 화면에 `<select>` 1개(상태 필터)뿐 ✅ |
| 부서 스코프 | `dev_admin` 12행 전부 개발팀 ✅ |

상태 필터 (총괄, API 실측):

| status | totalCount | 반환된 행의 상태 |
|---|---|---|
| (없음) | 14 | ACTIVE, ARCHIVED |
| ACTIVE | 12 | ACTIVE |
| ARCHIVED | 2 | ARCHIVED |

**보관 문제를 집계에 포함한다는 결정이 화면에서 관측된다** — 대시보드 `문제 수` 12(활성만)와 목록 `totalCount` 14(보관 포함)의 차이가 그것이다.

빈 결과: `page=99` → 행 0건, `totalCount` 는 14 유지(필터 적용 전체 건수이지 페이지 건수가 아니다) ✅

---

## 5. Step 5 — 통계 상세 (서버 부분 통과)

### 객관식 문제 230 (MCQ_MULTI)

```
summary: 총 시도 9 · 정답 5 · 정답률 0.5556 · 최근 2026-08-13 오전 11:09:30
분포:  Java 6 · Python 4 · HTTP 1 · TCP 0
excludedAttempts: 3
최근 오답: "" | "Java, Python, HTTP" | "Java" | "Java"
```

- **한 번도 선택되지 않은 보기(TCP)가 0회로 나온다** ✅ — 빠지면 "아무도 안 고른 보기"라는 신호 자체가 사라진다
- 최근 오답이 `[58, 59]` 가 아니라 사람이 읽는 텍스트다 ✅ (빈 문자열 하나는 아무 보기도 고르지 않은 제출)

### 주관식 문제 235 (SHORT_ANSWER)

`choiceDistribution` = **null**, `excludedAttempts` = 0 ✅ — 분포 영역이 아예 렌더되지 않는다.

### 부서 스코프 (통과)

| 시도 | 결과 |
|---|---|
| `dev_admin`(개발팀)이 영업팀 문제 230 상세를 직접 호출 | **403** ✅ |
| `dev_admin`이 `departmentId=863`(영업팀)으로 목록 위조 요청 | 개발팀 행만 반환 ✅ |

---

## 6. Step 8 — 회귀 (통과)

5개 유형을 한 문제씩 실제로 제출했다. Task 1 이 `SolveServiceImpl.submit()` 을 건드렸기 때문에 필요한 확인이다.

| 문제 | 유형 | 결과 |
|---|---|---|
| 233 | MCQ_SINGLE | 200 / correct=True |
| 234 | OX | 200 / correct=True |
| 231 | SHORT_ANSWER | 200 / correct=False |
| 229 | FILL_BLANK | 200 / correct=False |
| 230 | MCQ_MULTI | 200 / correct=True |

**`attempt_choices` 34 → 38 (+4)** — 다중선택 2행(Java·Python), OX 1행, 단일선택 1행. 주관식·빈칸은 0행. 정확히 기대대로다.

```
attempt 120 / problem 230 / choice 59 / Python
attempt 120 / problem 230 / choice 58 / Java
attempt 117 / problem 234 / choice 67 / O
attempt 116 / problem 233 / choice 95 / A
```

풀이 이력 66건 중 **옛 `[id]` 형식 0건.** 최신 6건: `Java, Python` · `서울` · `QA 회귀 검증 답안` · `O` · `A` · `인천`

---

## 7. 미검증으로 남은 항목

브라우저(Playwriter) 대상 탭이 QA 도중 사용자 본인이 쓰는 다른 사이트로 바뀌었다. 그 페이지를 조작하지 않기 위해 즉시 중단했고, 아래 항목은 **화면 렌더링을 눈으로 확인해야만 판정할 수 있어** 남겨 둔다.

| Step | 미검증 항목 | 왜 API 로 대신할 수 없나 |
|---|---|---|
| 4 | 빈 상태 UI(`ListStateSurface` 의 안내와 다음 행동) | 서버는 0건을 정상 반환한다(확인됨). 그 0건을 화면이 어떻게 그리는지가 항목이다 |
| 4 | `Pagination` 컴포넌트 렌더 | 문제 14건 < 페이지 20건이라 컴포넌트가 `null` 을 반환한다(설계대로). 21건 이상을 만들어야 화면에 나타난다 |
| 5 | 분포 막대 색 `bg-progress-bg` | `getComputedStyle` 로 실제 칠해진 색을 봐야 한다 |
| 6 | 분포 제외 안내 배너 | `excludedAttempts=3` 은 확인됐다(§5). 그 값이 배너로 렌더되는지는 화면 항목이다 |
| 7 | 키보드 포커스 링 | 클래스는 다른 화면과 동일한 토큰이고 빌드 CSS 에 존재함이 확인됐으나, 실제 표시는 화면 항목이다 |
| 8 | 브라우저 콘솔 오류 | Step 2·3 구간에서는 0건을 확인했다. 상세·목록 조작 구간이 남았다 |

**모바일 접근 차단**은 미검증이 아니다 — `frontend/src/utils/routing.test.js` 가 `canAccessAdmin({device:"mobile", role:"SUPER_ADMIN"}) === false` 와 `resolveLandingPath(...) === "/solve"` 를 단위 테스트로 고정하고 있다. 브라우저 확인은 확인 사살 성격이다.

재개하려면 `http://localhost:5173` 탭에서 Playwriter 확장 아이콘을 눌러 활성화하면 된다.

---

## 8. 검증 명령 결과

```
backend : ./gradlew test        -> 256 tests / 0 failures / 0 errors  (기존 236 + 20)
frontend: npm test              -> 267 tests / 0 failures             (기존 254 + 13)
frontend: npm run build         -> 성공 (chunk 500kB 경고 1건, 기존 보류 항목)
```

빌드 CSS 클래스 생성도 확인했다 — `bg-warning-bg` · `text-warning-text` · `bg-progress-bg` · `tabular-nums` · `text-display` 전부 존재. Tailwind 는 찾지 못한 클래스를 조용히 생략하므로, 이 저장소에서 다섯 번 물렸던 함정이다.

---

## 9. QA 로 늘어난 데이터

이번 회귀 검증으로 `attempts` 5행, `attempt_choices` 4행이 늘었다. 정상이며 이력·통계 화면 검증에도 쓰인다. 별도 정리는 필요 없다.
