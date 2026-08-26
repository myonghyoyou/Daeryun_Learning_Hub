# 서브플랜 7(화면 → Next App Router) 정답지

- 작성일: 2026-08-24
- 대상: `frontend/`(Vite SPA, 20화면·99파일·7,165줄) → `web/app/`(Next App Router)
- 기준선: **현재 Vite 화면 + 새 API(Next)** 의 조합. Spring 이 아니다
- 측정 대상: `frontend` dev(5173) → `web` (3000/3220) 프록시 구성

---

## 0. 이 정답지의 범위 — 왜 화면 내용을 다시 고정하지 않는가

서브플랜 2~6이 **업무 로직 파리티를 이미 고정했다** — 인증 · 사용자·부서 · 문제은행 ·
풀이 · 통계 각각 정답지 60~100행에 오류 문구와 발화 순서까지 못박혀 있고, 그 위에서
화면이 지금 동작한다.

서브플랜 7이 바꾸는 것은 **배관**이다:

| 바뀌는 것 | 파일 |
|---|--:|
| 경로 정의 + 접근 가드 | 5 |
| 진입점 · 스타일 설정 | 3 |
| 화면 이동 호출부(`<Link>` 25 · `navigate` 15) | 25 |
| **그대로 가는 것** — 화면 본문 20 · 공통 부품 24 · API 모듈 9 · 스토어·유틸·훅 | 70+ |

**그래서 이 정답지는 "배관이 끊겼을 때 보이는 것"에 집중한다.** 화면 본문이 바뀌지 않는데
그 안의 업무 규칙을 다시 65행 고정하면, 진짜 위험한 곳(가드·리다이렉트·세션 이벤트)에
쓸 주의력이 분산된다.

**단, 예외 셋은 화면 안까지 들어간다** — 배관 교체로 실제로 깨질 수 있기 때문이다.
쿼리 파라미터로 상태를 받는 화면(L), `sessionStorage` 로 화면 간 데이터를 넘기는
흐름(S4~S6), 그리고 React 밖에서 화면 이동을 호출하는 세션 이벤트(G6~G8).

---

## G. 전역 · 진입점

| 행 | 확인할 것 | 기대 (소스 근거) | 실측 |
|---|---|---|---|
| G1 | 문서 제목 | `문제 은행 Hub` — `index.html` | ✅ `문제 은행 Hub` |
| G2 | `<html lang>` | `ko` — `index.html` | ✅ `ko` |
| G3 | viewport 메타 | `width=device-width, initial-scale=1.0`. **N-3 게이트가 뷰포트 폭으로 판정하므로 이게 빠지면 모바일에서 관리자 차단이 무력화된다** | ✅ `width=device-width, initial-scale=1.0` |
| G4 | 배경·글꼴 | `body` 가 `--font-sans` · `--color-surface-page` · `--color-ink-strong` — `styles/index.css` | ✅ 배경 `rgb(246,249,252)` · 글자 `rgb(16,43,76)` · 글꼴 `"Noto Sans KR", "Apple SD Gothic Neo", "Malgun Gothic", sans-serif` |
| G5 | 디자인 토큰이 유틸리티를 생성하는가 | `tokens.css` 의 `@theme` 가 `--color-brand-dark` → `bg-brand-dark` 등을 만든다. **Tailwind 플러그인을 vite→postcss 로 바꾸면 여기가 조용히 죽는다** — 클래스는 남고 색만 사라진다. 빌드 산출 CSS 에서 `grep` 으로 생성 여부를 확인한다 | ✅ 로그인 버튼 배경 `rgb(0,92,169)` = `#005CA9` = `--color-brand-dark`, `text-ink-muted` → `rgb(117,132,154)`. 토큰 4종 모두 `:root` 에 존재 |
| G6 | 세션 만료(980) 리다이렉트 | `/login?reason=session-expired` 로 `replace` 이동 + 세션 스토어를 미인증으로. **이미 `/login` 이면 이동하지 않는다** — `sessionRedirects.js` | ⚠️ **부분 실패 — F3 참조.** `/login` 으로 이동하고 토스트는 뜨지만 **`?reason=session-expired` 가 유실돼 안내 배너가 뜨지 않는다** |
| G7 | 비밀번호 변경 필요(1012) 리다이렉트 | `/change-password` 로 `replace` 이동. **이미 그 경로면 이동하지 않는다** | ✅ 1012 응답 주입 → `/change-password`. **F3 과 대비된다** — 이 경로는 쿼리 파라미터에 의존하지 않아 정상 동작한다 |
| G8 | 리스너 등록이 정확히 1회 | `main.jsx` 모듈 최상위에서 등록해 StrictMode 이중 effect 와 무관. **Next 에서는 컴포넌트 안으로 들어가므로 이중 등록·미등록 둘 다 가능해진다** | ⚠️ **여전히 미측정 — 정직하게 남긴다.** `web/app/providers.tsx` 가 `useRef` 로 이중 등록을 막도록 짜여 있으나(Task 5), 이걸 의미 있게 테스트하려면 컴포넌트를 실제로 렌더해야 하는데 **이 프로젝트엔 컴포넌트 렌더 테스트가 전혀 없다**(순수 함수 테스트만 995개). 새 테스트 인프라(React Testing Library 류)를 도입하는 것은 서브플랜 7(배관 교체) 범위를 넘는 결정이라 Task 16 에서 임의로 추가하지 않았다. 이관 후 별도 항목으로 이월(§실측 기록 참고) |
| G9 | 토스트 | `react-toastify` 컨테이너가 살아 있고 위치·스타일 동일 | ✅ 동작 — 로그인 실패·세션 만료에서 토스트 확인 |
| G10 | 세션 조회 중복 제거 | 가드 여러 개가 동시에 마운트돼도 `GET /api/auth/session` 이 **1회** — `sessionStore.js`. 네트워크 탭에서 센다 | ✅ **1회** — 대시보드 1회 로드에서 `GET /api/auth/session` 1회. 대조: `GET /api/admin/dashboard` 는 **2회**(중복 제거 없음, StrictMode 이중 effect). 중복 제거가 실제로 동작한다 |
| G11 | stale 응답 폐기 | `generation` 카운터로 무효화 이전 fetch 응답을 버린다. 로그인 직후 이전 세대 응답이 `unauthenticated` 로 되돌리지 않는지 | ✅ **단위 테스트로 확정** — `web/store/sessionStore.test.js`(Task 16). 1세대 fetch 를 대기시킨 채 `refetchSession()` 으로 2세대를 시작 → 2세대가 먼저 응답 → 1세대가 뒤늦게 `employeeNo:"STALE"` 로 응답해도 스토어를 덮어쓰지 않음을 확인. 뮤테이션 테스트(가드 제거 시 실제로 실패)로 이빨 확인됨 |

> **G5 는 이 프로젝트에서 네 번 터진 실패 유형이다.** `feat/solve-design-conformance` 기록에
> "코드는 그럴듯한데 CSS 가 안 나오거나 다른 값으로 폴백되는" 실패가 네 번 있었고 전부
> **빌드 산출 CSS 를 grep** 해서만 잡혔다. 눈으로 보고 판정하지 마라.

---

## N. 경로 · 접근 가드

### N-1. 경로 20개가 전부 살아 있는가

각 경로에 **주소창으로 직접 진입**(딥링크)해서 확인한다. SPA 는 서버가 전부 `index.html`
을 돌려주지만 **Next 는 경로마다 파일이 있어야 한다** — 빠뜨린 경로는 404 가 된다.

| 행 | 경로 | 화면 | 실측 |
|---|---|---|---|
| N1 | `/login` | LoginPage | ✅ `문제 은행 Hub 로그인` |
| N2 | `/` | Landing(리다이렉트 전용) | ✅ 리다이렉트 동작 — N31·N32·N33 참조 |
| N3 | `/change-password` | ChangePasswordPage | ✅ `비밀번호 변경` (`m7chk53850`) |
| N4 | `/admin` | → `/admin/dashboard` 로 `replace` | ✅ `/admin` → `/admin/dashboard` |
| N5 | `/admin/dashboard` | DashboardPage | ✅ `관리자 대시보드` |
| N6 | `/admin/departments` | DepartmentListPage | ✅ `부서 관리` |
| N7 | `/admin/users` | UserListPage | ✅ `계정 관리` |
| N8 | `/admin/users/excel-upload` | UserExcelUploadPage | ✅ `계정 일괄 등록` |
| N9 | `/admin/problems` | ProblemListPage | ✅ `문제 관리` |
| N10 | `/admin/problems/new` | ProblemFormPage(등록) | ✅ `문제 등록` |
| N11 | `/admin/problems/{id}/edit` | ProblemFormPage(수정) | ✅ `문제 수정` (`/admin/problems/1/edit`) |
| N12 | `/admin/problems/excel-upload` | ProblemExcelUploadPage | ✅ `문제 엑셀 일괄 등록` |
| N13 | `/admin/stats` | StatsListPage | ✅ `문제별 정답률 통계` |
| N14 | `/admin/stats/{id}` | StatsDetailPage | ✅ `총괄 생성 문제` — **h1 이 문제 내용이다**(고정 제목이 아니다) |
| N15 | `/solve` | SolveHomePage | ✅ `학습 홈` |
| N16 | `/solve/random` | RandomSetupPage | ✅ `랜덤으로 풀기` |
| N17 | `/solve/random/play` | RandomPlayPage | ✅ **`/solve/random` 으로 되돌려짐** — 딥링크 방어(S5) |
| N18 | `/solve/random/result` | RandomResultPage | ✅ **`/solve/random` 으로 되돌려짐** — 딥링크 방어(S6) |
| N19 | `/solve/problems` | SolveProblemListPage | ✅ `문제 풀이` |
| N20 | `/solve/history` | AttemptHistoryPage | ✅ `내 풀이 이력` — **`history` 를 문제 번호로 해석하지 않는다** |
| N21 | `/solve/{id}` | ProblemSolvePage | ✅ `/solve/1` → 객관식(단일) · `영업팀 2002번`. h1 없음 |

> **N21 과 N16~N20 의 충돌이 실제 위험이다.** `/solve/:id` 가 `/solve/random`·
> `/solve/problems`·`/solve/history` 와 같은 자리를 다툰다. react-router 는 정의 순서대로
> 정적 경로를 먼저 맞추고, **Next 도 정적 세그먼트를 동적보다 먼저** 고른다(서브플랜 4에서
> 확인된 동작). 그래도 **`/solve/history` 가 "history 라는 id 의 문제"로 해석되지 않는지**
> 반드시 실측한다 — 조용히 400 이 뜬다.

### N-2. 가드 동작

| 행 | 상황 | 기대 (소스 근거) | 실측 |
|---|---|---|---|
| N22 | 세션 확인 중 보호 경로 | **리다이렉트하지 않고** `세션 확인 중...` Loader — `PrivateRoute` | ✅ `세션 확인 중...` — **경로가 `/solve` 로 유지되고 바뀌지 않는다** |
| N23 | 미로그인 + 보호 경로 | `/login` 으로 이동 | ✅ `/solve` → `/login`. **되돌아갈 목적지를 URL 에 남기지 않는다**(`?redirect=` 없음) — 이것도 지금 동작이므로 고정한다 |
| N24 | 로그인 상태 + `/login` | `/` 로 `replace` — `PublicRoute` | ✅ `/login` → `/` → `/admin/dashboard` (admin, 1440px) |
| N25 | 세션 확인 중 + `/login` | Loader(리다이렉트 금지) | ✅ `세션 확인 중...` — 경로 `/login` 유지 |
| N26 | `mustChangePassword` + 아무 보호 경로 | `/change-password` 로 이동 | ✅ `/solve`·`/solve/problems`·`/admin`·`/admin/dashboard`·`/` **5개 전부** `/change-password` 로 |
| N27 | `mustChangePassword` + `/change-password` | **통과**(루프 금지) — `resolvePrivateRedirect` | ✅ 통과 — 루프 없음 |
| N28 | 세션 확인 중 + `/admin/**` | Loader. **리다이렉트하면 새로고침마다 관리자가 `/solve` 로 튕긴다** — `AdminRoute` 주석의 실제 회귀 | ✅ `세션 확인 중...` — 경로 `/admin/dashboard` 유지. 세션 응답 4초 지연에도 `/solve` 로 튕기지 않았다 |
| N29 | EMPLOYEE + `/admin/**` | `/solve` 로 이동 | ✅ `/admin`·`/admin/dashboard`·`/admin/users`·`/admin/stats/1` **4개 전부** `/solve` 로 |
| N30 | 세션 확인 중 + `/` | Loader. **리다이렉트하면 역할과 무관하게 항상 `/solve`** — `Landing` 주석의 실제 회귀 | ✅ `세션 확인 중...` — 경로 `/` 유지 |
| N31 | SUPER_ADMIN + `/` (PC) | `/admin` | ✅ `/admin/dashboard` |
| N32 | DEPT_ADMIN + `/` (PC) | `/admin` | ✅ `/admin/dashboard` (dev01, 1440px) |
| N33 | EMPLOYEE + `/` | `/solve` | ✅ `/solve` |

### N-3. 640px 창 폭 게이트 — **이 절이 서브플랜 7의 최대 위험이다**

관리자 접근 조건은 역할만이 아니라 **뷰포트 폭 ≥ 640px** 이다(`canAccessAdmin`).
값 640 은 WCAG 2.1 SC 1.4.4(200% 확대)를 위해 768 에서 낮춘 것이고, PRD 3.2 가
"창 크기 조절로 경계를 넘나드는 경우에도 차단"을 요구하므로 **초기 1회가 아니라 실시간
반응**이어야 한다.

| 행 | 상황 | 기대 | 실측 |
|---|---|---|---|
| N34 | SUPER_ADMIN, 폭 639px, `/` | `/solve` (관리자 아님) | ✅ `/solve` (`window.innerWidth` 639) |
| N35 | SUPER_ADMIN, 폭 640px, `/` | `/admin` (경계 포함) | ✅ `/admin/dashboard` (640) — **경계 포함 확인** |
| N36 | 관리자 화면에 있는 상태에서 창을 639px 로 **줄이면** | `/solve` 로 튕겨나온다 — resize 리스너 | ✅ **641 → 639 으로 줄이자 즉시 `/solve` 로 튕겼다.** 재진입 없이 실시간 반응 |
| N37 | 639px 에서 641px 로 **늘리면** | 관리자 화면 접근이 다시 열린다 | ✅ 639 → 1100 으로 넓히자 `/admin/dashboard` 접근 복구 |
| N38 | 1280px 화면 200% 확대(=640px) | **관리자 유지** — 이 값의 존재 이유 | ✅ N35 로 성립 — 1280px 의 200% 확대 = 640px, 그 값이 통과한다 |
| N39 | 판정 신호가 뷰포트 폭 하나인가 | User-Agent·`pointer` 미디어쿼리를 쓰지 않는다. **PC 브라우저를 좁힌 창은 차단 대상이다** | ✅ **증명됨** — 같은 브라우저·같은 UA 로 639 는 차단(N34), 640 은 통과(N35). 판정 신호가 UA 가 아니다 |

> **서버로 옮기면 N36~N39 가 전부 깨진다.** 서버 컴포넌트는 뷰포트 폭을 모르고, UA 로
> 대체하면 N39 가 반대로 뒤집힌다. **가드는 클라이언트에 남긴다** — 이 정답지가 그 결정의
> 근거다.

---

## X. 브라우저 동작 — SPA 와 Next 가 다른 지점

| 행 | 확인할 것 | 기대 | 실측 |
|---|---|---|---|
| X1 | 딥링크 새로고침 | 20개 경로 전부에서 F5 가 같은 화면을 돌려준다(N-1 이 겸함) | ✅ **Task 14 재확인(완성된 20화면 기준)** — 20개 경로 전부 주소창 직접 진입으로 확인 |
| X2 | 뒤로가기 | 화면 이동 후 뒤로가기가 이전 화면으로 | ✅ **Task 14 재확인** — `/admin/problems` → `/admin/stats` → 뒤로 → `/admin/problems`(`문제 관리`) |
| X3 | `replace` 이동은 뒤로가기로 돌아오지 않는다 | 로그인 성공 → `/`(replace) 후 뒤로가기가 **`/login` 으로 돌아가지 않는다**. `useLogout`·`ChangePassword`·랜덤 흐름도 동일 | ✅ **Task 14 재확인** — `/admin/problems`→`/admin/stats` 이동 후 로그아웃(replace)하면 `/admin/stats` 가 히스토리에서 대체된다. 뒤로가기가 대체된 `/admin/stats` 를 건너뛰고 그 이전 `/admin/problems` 로 감 — replace 의미론이 정확히 지켜짐 |
| X4 | 앞으로가기 | 뒤로 간 뒤 앞으로가 동작 | ✅ **Task 14 재확인** — 뒤로 → 앞으로 → `/admin/stats`(`문제별 정답률 통계`) 정확히 복귀 |
| X5 | 화면 이동 시 전체 새로고침이 일어나지 않는가 | 세션 스토어가 유지된다. **전체 새로고침되면 `GET /api/auth/session` 이 매번 다시 나가고 Loader 가 깜빡인다** — 네트워크 탭으로 센다 | ✅ **Task 14 재확인** — `/admin/problems`→`/admin/stats` 이동에서 문서 요청 **0건** |
| X6 | 스크롤 위치 | 새 화면 진입 시 최상단. **뒤로가기 시 이전 위치로 복원된다**(Task 14 에서 확정 — 결정 ㉣) | ✅ **Task 14 재측정(완성된 Next 앱 기준).** 새 화면 진입 = `scrollY 0`. `/admin/problems` 를 500px 스크롤 → `/admin/stats` 로 이동(0으로 리셋) → 뒤로가기 → **정확히 500px 로 복원됨.** 1차 초안(P2 시점, 화면이 아직 없던 때)의 우려(effect 로 데이터를 채우므로 복원 시점 콘텐츠 높이가 0일 수 있다)와 달리, 실제 관리자 목록처럼 비동기로 데이터를 채우는 화면에서도 정상 복원됐다. F4 결정 확정 — 승인된 이탈 ㉣ 로 기록 |
| X7 | 존재하지 않는 경로 | Next 로 이관하면서 한국어 안내로 교체(결정 ㉢, Task 6) | ✅ Task 6 에서 확정: `요청한 페이지를 찾을 수 없습니다.` / `주소를 확인해 주세요.` / `학습 홈으로`. **Task 14 재확인 시도 중 브라우저 도구 연결이 응답 없음 상태가 됨 — 코드는 Task 6 이후 무변경(not-found.tsx 미수정)이라 재측정 없이 이 값을 유지한다.** 필요하면 재접속 후 재확인 가능 |
| X8 | 콘솔 오류·경고 | 20개 화면 전부에서 **0건** | ✅ P2~P4 전 구간에 걸쳐 로그인·404·관리자 대시보드/부서/계정/문제/통계·풀이 화면 전부에서 오류·경고 **0건** 누적 확인(같은 세션 내 여러 시점) |

---

## L. 쿼리 파라미터로 상태를 받는 화면

배관 교체로 실제로 끊기는 지점이다. Next 에서 쿼리 파라미터를 읽으면 **Suspense 경계와
동적 렌더링** 제약이 붙는다.

| 행 | 확인할 것 | 기대 (소스 근거) | 실측 |
|---|---|---|---|
| L1 | `/login?reason=session-expired` | 세션 만료 안내가 뜬다 — `LoginPage` 가 `useSearchParams` 로 읽는다 | ✅ `세션이 만료되었습니다. 다시 로그인해 주세요.` |
| L2 | `/login` (파라미터 없음) | 안내가 뜨지 않는다 | ✅ 안내 없음 |
| L3 | 90분 유휴 후 자동 도달 | G6 이 만든 URL 로 실제로 안내가 뜬다. **이 흐름은 과거에 통째로 죽어 있었다** — `sessionRedirects.js` 주석: "`?reason=session-expired` 배너도 도달 불가능한 죽은 코드였다" | ⚠️ **F3 — 도달하지 못한다.** 980 응답 후 `/login` 에 파라미터가 없어 배너가 안 뜬다 |
| L4 | `PrivateRoute` 의 현재 경로 판정 | `useLocation().pathname` → Next `usePathname()`. N27(루프 금지)이 이 값에 달렸다 | ✅ N27 로 증명 — `/change-password` 자신은 통과하고 다른 보호 경로 5개는 전부 되돌려진다. 경로 판정이 동작한다 |

---

## A. 인증 화면 2개

| 행 | 화면 | 확인할 것 | 실측 |
|---|---|---|---|
| A1 | LoginPage | 사번·비밀번호 입력, 비밀번호 표시 토글, 필드별 오류 표시 | ✅ `h1` = `문제 은행 Hub 로그인`, 입력 2개(`autocomplete="username"` placeholder `사번을 입력하세요` label `사번` / `autocomplete="current-password"` placeholder `비밀번호를 입력하세요` label `비밀번호`), 버튼 2개(`aria-label="비밀번호 표시"`, `type=submit` `로그인`). **`autocomplete` 두 값은 재작성에서 조용히 사라지기 쉽다** |
| A1-1 | LoginPage | 로그인 실패 문구 | ✅ `사번 또는 비밀번호가 올바르지 않습니다.` — 인라인 + 토스트 **양쪽에 동시 표시**. 사번 존재 여부를 드러내지 않는다 |
| A2 | LoginPage | 로그인 성공 → `refetchSession()` 후 이동. **이게 빠지면 캐시된 `unauthenticated` 때문에 즉시 `/login` 으로 되튕긴다** — `sessionStore.js` 주석의 실제 결함 | ✅ 로그인 직후 `/admin/dashboard` 도달 — `/login` 으로 되튕기지 않는다(admin·dev01·emp01 3계정에서 확인) |
| A3 | LoginPage | `mustChangePassword` 인 계정은 `/change-password` 로 | ✅ `m7chk53850` 로그인 → `/change-password`(`비밀번호 변경`). 안내 `최초 로그인 시 비밀번호를 변경해야 합니다.` · 도움말 `비밀번호는 8자 이상이어야 합니다.` |
| A4 | ChangePasswordPage | 변경 성공 → `/`(replace). **`refetchSession()` 순서가 중요하다** — 주석 참조 | ✅ 변경 성공 → `/` → **`/solve`(학습 홈)**. `/change-password` 로 되튕기지 않았다 — 세션 갱신이 이동보다 먼저 일어난다. 입력 2개 모두 `autocomplete="new-password"`, label `새 비밀번호`·`새 비밀번호 확인`, 버튼 `변경하기`. **측정 후 표본을 원상복구했다**(비밀번호·`must_change_password=t`) |
| A5 | 로그아웃 | `useLogout` → `/login`(replace) + 스토어 갱신. **갱신이 빠지면 가드가 전혀 반응하지 않는다** | ✅ 로그아웃 → `/login` |

---

## M. 관리자 화면 9개

각 행은 "화면이 뜨고 · 데이터가 실리고 · 이동이 동작하는가"만 본다. 업무 규칙은
서브플랜 3·4·6 정답지가 고정했다.

| 행 | 화면 | 호출 API | 이동 경로 | 실측 |
|---|---|---|---|---|
| M1 | AdminLayout | – | 사이드바 `<NavLink>` 2곳의 현재 항목 강조 | ✅ 현재 항목에 `aria-current="page"`. **역할별 메뉴가 다르다** — SUPER_ADMIN 7개(대시보드·부서 관리·계정 관리·계정 일괄 등록·문제 관리·문제 엑셀 일괄 등록·통계) / DEPT_ADMIN 4개(부서·계정 3개가 없다) + `학습 화면으로 이동` |
| M2 | DashboardPage | dashboard, departments | 최근 문제 → 문제 수정, 낮은 정답률 → 통계 상세 | ✅ SUPER_ADMIN `전체 부서 기준` 문제 66 · 검토 필요 3 · 시도 44 / DEPT_ADMIN `소속 부서 기준` 문제 62 · 검토 필요 2 · 시도 36 · 평균 47%. **서브플랜 6 API 실측과 일치.** 낮은 정답률 항목이 `/admin/stats/184`·`/admin/stats/44` 로 연결 — 같은 문제 번호. 부서 필터는 SUPER_ADMIN 에만 있고 비활성 `폐지팀` 을 포함한다(`/api/admin/departments` 사용) |
| M3 | DepartmentListPage | departments | 활성/비활성 토글 모달 | ✅ `부서 관리` — 표 4행(본사 HQ 활성 / 개발팀 DEV 활성 / 영업팀 SALES 활성 / **폐지팀 GONE 비활성**), 행별 `수정`·`비활성화`(비활성 행은 `활성화`) |
| M4 | UserListPage | users, departments | 임시비밀번호 화면 표시(승인된 이탈 D5) | ✅ `계정 관리` — 표 헤더 `사번/이름/회사 이메일/부서/역할/상태/최근 로그인/관리`. 생성 양식의 부서 선택은 **활성 3개만**(`폐지팀` 없음), 역할 3개(`총괄 관리자`·`부서 관리자`·`직원`) |
| M5 | UserExcelUploadPage | users | 결과 다운로드(승인된 이탈 D7) | ✅ `계정 일괄 등록` — 템플릿 안내 컬럼 `사번/이름/회사이메일/부서코드/역할`, 예시 행 `E1001 홍길동 hong@company.com DEV EMPLOYEE` |
| M6 | ProblemListPage | problems | 등록·수정·엑셀 업로드로 이동, 페이지네이션 | ✅ `문제 관리` — **`전체 70건`**(API `totalCount 70` 과 일치). 유형 필터 5종, 상태 필터 `활성`·`보관됨`, `상세 필터` 토글 |
| M7 | ProblemFormPage(865줄, 최대) | problems, departments | 이미지 업로드 미리보기 · 빈칸 지정 · 취소 시 `/admin/problems` | ✅ `문제 등록` — 유형 5종 · 귀속 부서(활성 3개) · `보기 (최대 5개)` · `정답을 1개만 선택하세요.` · `보기 추가`. 안내 `선택한 부서 명의로 등록됩니다.` |
| M8 | ProblemExcelUploadPage | problems, departments | 업로드 결과 표시 | ✅ `문제 엑셀 일괄 등록` — 템플릿 안내에 `최소 2개, 최대 5개`·`중간 칸을 비운 채 뒤 칸을 채울 수는 없습니다`·`태그는 콤마로 구분` 명시 |
| M9 | StatsListPage / StatsDetailPage | stats, departments | 목록 → 상세(`/admin/stats/{id}`) | ✅ 목록 `문제별 정답률 통계` `전체 70건 · 검토 필요 판정 기준은 시도 5회 이상 · 정답률 50% 미만입니다.` / 상세 `총괄 생성 문제` 총 시도 8 · 정답 3 · **정답률 38%**(API 0.375) · **`시도 3건은 이 분포에 반영되지 않았습니다.`**(API `excludedAttempts: 3`) — API 실측과 완전 일치 |

> **M7 의 이미지 미리보기가 승인된 이탈 ㉱와 만나는 지점이다.** `<img src>` 가 저장된
> `/api/problem-images/{key}` 를 **상대 경로로** 렌더링한다. 단일 배포이므로 그대로
> 동작해야 하지만, 이것이 A2 컷오버 항목의 실물 확인이다 — 여기서 이미지가 뜨면 배포
> 형태가 옳다.

---

## S. 풀이 화면 7개

| 행 | 화면 | 확인할 것 | 실측 |
|---|---|---|---|
| S1 | SolveHomePage | 추천 세트·학습 루틴 카드에서 각 경로로 이동 | ✅ `학습 홈` — `랜덤으로 풀기`·`골라서 풀기` 카드 |
| S2 | SolveProblemListPage | 목록 · 필터 · 행 클릭 → `/solve/{id}` | ✅ `문제 풀이` — 검색·태그 필터(전체 태그·공통·지리·재삽입 등) |
| S3 | ProblemSolvePage | 5개 유형 풀이 · 채점 결과 · 이미지 표시 | ✅ `/solve/1` 객관식(단일) · `영업팀 2002번` · 보기 2개 · `제출` · `답안을 입력하면 제출할 수 있습니다.` |
| S4 | RandomSetupPage | 문제 수(5·10·20·50) · 부서 선택 → `sessionStorage` 에 세트 저장 후 `/solve/random/play` | ✅ 5문제 선택 → `sessionStorage['solve-random-session']` 생성 → `/solve/random/play` 에서 `1 / 5` |
| S5 | RandomPlayPage | `sessionStorage` 에서 세트를 읽는다. **없으면 `/solve/random` 으로 replace** — 딥링크 방어 | ✅ 세트 없이 직접 진입 → `/solve/random` |
| S6 | RandomResultPage | 세트가 없으면 `/solve/random`, 미완료면 `/solve/random/play` 로 replace | ✅ 세트 없이 직접 진입 → `/solve/random` |
| S7 | AttemptHistoryPage | 이력 목록 · 긴 답안 펼치기 | ✅ `내 풀이 이력` — 표 헤더 `문제 / 제출 답안 / 결과 / 일시`, 일시가 한국어 로케일(`2026. 8. 24. 오전 9:19:07`) |
| S8 | 랜덤 흐름 전체 | 설정 → 풀이 → 결과를 완주. **화면 간 데이터가 `sessionStorage` 라 Next 에서도 그대로 동작해야 한다** | ✅ 5문제 완주 → `/solve/random/result` 의 `결과 요약` · `5문제 중 3개 정답` · 문제별 `정답`/`오답` 목록. 제출 후 상단이 `학습 홈으로` → `그만하고 결과 보기` 로 바뀐다 |
| S9 | 새로고침 내구성 | 랜덤 풀이 중 F5 → 세션이 유지되는가(현재 동작을 실측해 기준으로 삼는다) | ✅ **세트가 유지된다** — 새로고침 후에도 같은 문제·`1 / 5`. 몰랐던 동작을 확정했다(Q1 해소) |

---

## U. 공통 부품 · 디자인 토큰

부품 24개는 순수 React 라 그대로 가지만, **스타일 생성이 끊기면 전부 동시에 무너진다**
(G5). 대표 표본만 확인한다.

| 행 | 확인할 것 | 실측 |
|---|---|---|
| U1 | Button 3개 변형의 배경색이 토큰 값과 일치 | ✅ 버튼 4종 — primary `rgb(0,92,169)`/흰글자, secondary 흰배경/`rgb(0,92,169)`, danger `rgb(201,65,85)`/흰글자, ghost 투명/`rgb(82,102,125)`. 라운드 **6px**, 높이 **38px**(표 안 소형 32px) |
| U2 | Surface 의 그림자·라운드가 토큰 값과 일치 | ✅ Surface — 배경 `rgb(255,255,255)`, 라운드 **10px**, 테두리 `rgb(227,234,242)` |
| U3 | StatusBadge · SourceBadge · TagChip 색상 | ✅ **채운 알약이 아니라 점 + 글자다.** 점 6×6px, 간격 6px. 활성 = 점·글자 모두 `rgb(8,124,89)` / 보관됨 = 글자 `rgb(117,132,154)`·점 `rgb(154,170,189)`(점이 더 밝다). 태그 셀 `rgb(82,102,125)` 12px |
| U4 | 포커스 링(`focus-visible:outline-brand-aqua`)이 보이고 잘리지 않는다 | ✅ 포커스 링 `rgb(0,180,227)` = `#00B4E3` = `--color-brand-aqua`, **3px solid, offset 2px** |
| U5 | Modal — **포커스 트랩이 아니다.** 열릴 때 내부로 이동, 닫힐 때 트리거로 반환. ESC·배경 클릭·X 는 `dismissible` 이 true 일 때만 닫는다(저장 중에는 전부 막아 경쟁 상태를 차단) | ✅ `role="dialog"` · `aria-modal="true"` · 열자마자 `activeElement` 가 dialog. 문구 `부서 비활성화` / `본사 부서를 비활성화합니다. 이 부서는 비활성 상태로 전환되며, 필요하면 다시 활성화할 수 있습니다.` / `취소` / `비활성화 확정`. **ESC 는 소스 확인** — 측정 도구가 이 탭에 키 입력을 전달하지 못했다(아래 측정 한계 참조) |
| U6 | Loader / EmptyState / ListStateSurface 문구 | ✅ Loader `세션 확인 중...` |
| U7 | DataTable · Pagination 동작 | ✅ DataTable — `th` 글자 크기 **11px**, 행 높이 `h-12`, 셀 좌우 여백 16px |
| U8 | 모바일 390×844 에서 가로 스크롤 없음(풀이 화면 4개) | ✅ 390×844 에서 `/solve`·`/solve/problems`·`/solve/history`·`/solve/1` **4개 전부 가로 넘침 없음** |

---

## 발견한 결함

### F1. 없는 경로에서 영어 개발자 오류 화면이 노출된다

`/no-such-page-xyz` 로 들어가면 react-router 기본 오류 화면이 그대로 뜬다:

```
Unexpected Application Error!
404 Not Found
💿 Hey developer 👋
You can provide a way better UX than this when your app throws errors by
providing your own ErrorBoundary or errorElement prop on your route.
```

**한국어 사내 시스템에서 최종 사용자에게 영어 개발자 안내가 노출된다.** 원인은
`routes.jsx` 에 catch-all 경로도 `errorElement` 도 없는 것이다.

**이관 때 고친다 — 단, 승인된 이탈로 기록한다.** Next 는 `not-found.tsx` 로 이 자리를
채우므로 "그대로 옮기기"가 오히려 더 어렵다. 조용히 바꾸면 나중에 파리티 위반으로
읽히므로, 이 행(X7)의 기대값을 **"현재 동작 재현"이 아니라 "한국어 안내로 교체"** 로
확정한다. 새 문구는 계획서에서 정한다.

---

### F2. 부서관리자가 총괄 전용 화면에 직접 들어갈 수 있다

`AdminRoute` 는 `canAccessAdmin`(역할이 SUPER_ADMIN **또는** DEPT_ADMIN)만 보므로,
**화면 단위 권한 검사가 없다.** 메뉴에서 감췄을 뿐 경로는 열려 있다.

`dev01`(DEPT_ADMIN)로 실측:

| 경로 | 결과 |
|---|---|
| `/admin/departments` | 화면 **전부 렌더** — `부서 생성` 양식까지. 데이터만 막혀 `접근 권한이 없습니다.` **3회** 표시 |
| `/admin/users` | 화면 전부 렌더 — `계정 생성` 양식(역할 선택에 `총괄 관리자` 포함)까지. `접근 권한이 없습니다.` 3회 |
| `/admin/users/excel-upload` | **오류가 아예 없다** — 진입 시 데이터를 안 불러오므로 업로드 양식이 정상처럼 열린다. 제출할 때 비로소 막힌다 |

**서버는 정확히 막고 있다**(서브플랜 3 정답지가 403/990 을 고정했다) — 보안 구멍이 아니라
UX 결함이다. 쓸 수 없는 생성 양식을 보여 주고 오류를 세 번 낸다.

**이관 시 판단**: 그대로 재현한다. 화면별 권한 규칙을 새로 만드는 것은 서브플랜 7의 범위
(배관 교체)를 넘고, 고치면 서버 응답이 아니라 **화면 동작**이 바뀌어 파리티 비교의 기준선이
흔들린다. 별도 항목으로 이월한다.

### F3. 세션 만료 안내 배너가 여전히 도달 불가능하다

`sessionRedirects.js` 는 **바로 이 문제를 고치려고 작성된 모듈**이다. 주석에 이렇게 적혀
있다 — "`?reason=session-expired` 배너도 도달 불가능한 죽은 코드였다".

**그런데 아직도 도달하지 못한다.** `resultCode 980` 응답을 주입해 실측한 결과:

```
목적지 URL : http://localhost:5173/login
location.search : ""          ← ?reason=session-expired 가 유실됐다
안내 배너 : 렌더되지 않음
토스트 : 표시됨
```

L1 에서 확인했듯 배너는 `?reason=session-expired` 가 있을 때만 뜨고, 그때는 부제목과
`사번` 입력 **사이**에 렌더된다. 만료 흐름에서는 그 자리에 아무것도 없고 메시지는 카드
밖(토스트 영역)에만 나타난다.

**원인(추정 — 코드 구조에서 유추, 별도 검증 필요)**: `markSessionExpired()` 가 스토어를
미인증으로 바꾸는 순간, 아직 마운트돼 있던 `PrivateRoute` 가 `resolvePrivateRedirect` →
`"/login"`(파라미터 없음)을 계산해 `<Navigate>` 를 렌더한다. 리스너의
`router.navigate('/login?reason=session-expired')` 와 **경합해서 가드 쪽이 이긴다.**

**이관 시 판단**: 서브플랜 7에서 고친다. 가드를 다시 짜는 것이 이 서브플랜의 본업이고,
이 결함이 바로 **가드와 리다이렉트의 경합**에서 나온다. 다만 원인 추정이 맞는지 먼저
확인한 뒤 고친다 — 추정으로 고치면 다른 것이 깨진다.

### F4. 뒤로가기 스크롤 복원이 이관만으로 달라진다 — 확정(승인된 이탈 ㉣)

**1차 측정(2026-08-24, 화면이 아직 없던 시점)**: `/admin/problems` 에서 400px 스크롤 →
`/admin/stats` 이동(`scrollY 0`) → 뒤로가기 → **`scrollY 0`.** 당시 앱(옛 Vite SPA)은
**스크롤을 복원하지 않았다.**

**Next App Router 는 뒤로가기 스크롤 복원이 기본 동작이다.** 즉 배관을 갈아 끼우는 것만으로
이 동작이 **저절로 바뀐다** — 아무도 그렇게 하기로 결정하지 않았는데. F1~F3 과 성질이
다르다. 이건 **결함이 아니라 프레임워크 기본값 차이**이고, 그래서 더 위험하다. 코드에
흔적이 없어 리뷰에서 안 보이고, 실측하지 않으면 아무도 모른다.

**Task 14 재측정(2026-08-26, 화면 20개 전부 갖춰진 완성 앱 기준)**: 같은 절차(`/admin/problems`
500px 스크롤 → `/admin/stats` 이동 → 뒤로가기) → **정확히 500px 로 복원됨.** 1차 측정
시점의 우려(대부분 화면이 effect 로 데이터를 나중에 채우므로 복원 시점 콘텐츠 높이가
0일 수 있다)는 기우였다 — `/admin/problems` 자체가 비동기로 목록을 채우는 화면인데도
정상 복원됐다.

**결정: 승인된 이탈 ㉣ 로 확정한다.** Next 의 기본값(복원)을 받아들인다 — 긴 목록에서
상세를 보고 돌아올 때 복원되는 편이 사용자에게 낫고, 실측으로 실제 부작용이 없음이
확인됐다. 정답지 X6 의 기대값을 "복원됨"으로 갱신했다.

---

## 실측 기록

> 브라우저 측정 전이다. 측정은 `vibescraper` MCP 로 하고, **`getComputedStyle` ·
> `getBoundingClientRect` 로 값을 뽑아 판정한다** — 눈대중으로 하지 않는다.
> 색상·크기가 걸린 행(G4·G5·U1~U4)은 **빌드 산출 CSS 를 grep** 해서 클래스 생성까지
> 확인한다.

### 1차 (로그인 불필요 항목) — 2026-08-24

구성: `frontend` dev 5173 → Vite 프록시 → **새 API(Next) 8080**. Spring 은 띄우지 않았다.
즉 측정된 화면은 전부 **새 API 위에서** 동작한 것이다.

| 행 | 결과 |
|---|---|
| G1·G2·G3·G4·G5 | ✅ 5/5 |
| N23 | ✅ |
| X7 | ⚠️ F1 결함 확인 |
| L1·L2 | ✅ 2/2 |
| A1·A1-1 | ✅ 2/2 |

**연결 확인**: 로그인 실패 경로가 화면 → 프록시 → 새 API 까지 완주했다
(`사번 또는 비밀번호가 올바르지 않습니다.` 인라인 + 토스트 동시 표시).

### 2차 (로그인 필요 항목) — 2026-08-24 완료

계정 비밀번호를 **`test1234`** 로 재설정해 진행했다(사용자 승인). 프로젝트 자체의
`bcryptjs` 로 해시를 만들고 적용 전 `compare()` 로 검증했으며, 일회용 스크립트는 삭제했다.
대상 5계정 전부 갱신·검증 OK. `m7chk53850` 의 `must_change_password=t` 는 보존했고,
A4 측정으로 소모한 뒤 원상복구했다.

| 절 | 측정 | 결과 |
|---|---|---|
| G 전역·진입 | 10 / 11 | G6 ⚠️(F3) · G7·G9·G10 ✅ · **G11 은 Task 16 에서 단위 테스트로 확정** · **G8 만 정직하게 미측정으로 남음**(컴포넌트 렌더 테스트 인프라 부재, Q4) |
| N 경로·가드 | 39 / 39 | **전부 ✅** — 경로 21개 · 가드 12개 · 640px 게이트 6개 |
| X 브라우저 | 8 / 8 | X7 ⚠️(F1) · X6 ⚠️(F4) · 나머지 ✅ |
| L 쿼리 파라미터 | 4 / 4 | L3 ⚠️(F3) · 나머지 ✅ |
| A 인증 | 6 / 6 | **전부 ✅** |
| M 관리자 화면 | 9 / 9 | **전부 ✅** |
| S 풀이 화면 | 9 / 9 | **전부 ✅** |
| U 공통 부품 | 8 / 8 | U5 는 기대값 자체를 정정했다(포커스 트랩 아님) |
| **합계** | **93 / 94** | 미측정 1(**G8** — Task 16 에서 G11 을 단위 테스트로 확정해 해소, A4 는 그 전에 완료) |

**API 실측과 화면이 맞물린 곳** — 서브플랜 6의 숫자가 화면에 그대로 나타났다:

| 화면 | 값 | 대응 API 실측 |
|---|---|---|
| 대시보드(SUPER_ADMIN) | 문제 66 · 검토 필요 3 · 시도 44 | 동일 |
| 대시보드(DEPT_ADMIN) | 문제 62 · 검토 필요 2 · 시도 36 · 47% | 동일(dev01 스코프 62) |
| 낮은 정답률 링크 | `/admin/stats/184` · `/admin/stats/44` | `lowAccuracyProblems` 의 문제 번호 |
| 문제 관리 · 통계 목록 | `전체 70건` | `totalCount 70` |
| 통계 상세(문제 1) | 총 시도 8 · 정답 3 · **38%** · **`시도 3건은 이 분포에 반영되지 않았습니다.`** | 0.375 · `excludedAttempts: 3` |

### 만든 데이터

랜덤 세트 완주(S8)로 **시도 5건**이 쌓였다. 정상이며 이력 화면 검증에도 쓰인다.
계정·부서·문제는 만들지 않았다.

### (참고) 1차 시점의 막힘 기록

**당시 막힌 이유: 이 환경의 계정 비밀번호를 몰랐다.** DB 에 계정 5개가 있으나
(`admin`/SUPER_ADMIN, `dev01`·`sal01`/DEPT_ADMIN, `emp01`/EMPLOYEE,
`m7chk53850`/EMPLOYEE·`must_change_password=t`) `admin` 의 `must_change_password` 가
이미 `f` 이므로 **부트스트랩 이후 비밀번호가 변경됐고** `.env` 의
`BOOTSTRAP_ADMIN_PASSWORD` 로는 들어갈 수 없다. 추측·대입은 하지 않는다.

`docs/qa/2026-08-04-plan1-2-qa-checklist.md` 의 계정 표는 **다른 환경 것**이다(사번이
`dev_admin`·`emp001` 로 다르다). 그 문서 §0.3 자체가 "표가 실제 DB 와 어긋나 있었다"를
기록하고 있다.

(해소됨 — 사용자가 비밀번호 재설정을 승인했다.)

> **`m7chk53850` 은 그대로 둔다.** `must_change_password=t` 인 유일한 계정이라
> **N26·N27·G7·A4 를 실측할 수 있는 단 하나의 표본**이다. 지우면 그 4행이 측정 불가가 된다.

---

## 측정 한계 — 다음 사람이 반복하지 않도록

이 세션의 브라우저는 **사용자의 실제 Chrome 탭**에 붙은 것이다(Playwriter 확장). 그 탭에서는:

| 방법 | 동작 |
|---|---|
| `page.fill(...)` | ✅ 통한다 |
| `locator.dispatchEvent('click')` | ✅ 통한다 — **화면 이동·라디오 선택·제출 전부 이걸로 측정했다** |
| `page.click(selector)` / `page.mouse.click(x,y)` | ❌ 좌표가 어긋나 이벤트가 대상에 닿지 않는다 |
| `page.keyboard.press('Escape')` | ❌ 전달되지 않았다 |

`page.setViewportSize` 를 여러 번 호출한 뒤부터 좌표 기반 입력이 어긋났다. **처음부터
`dispatchEvent` 로 조작하라.** `page.click` 이 조용히 실패하면 "기능이 안 된다"로 오독하게
된다 — 실제로 이 세션에서 사이드바 이동이 안 되는 것처럼 보였고, F2 를 찾다가 그게 도구
문제임을 확인했다.

**라우트 지연·응답 주입은 한 번만 걸고 즉시 `unroute` 한다.** 과거 세션에서 반복 주입이
`ERR_INSUFFICIENT_RESOURCES` 로 브라우저 연결을 끊었다. 이번에는 3회 주입(세션 지연 1 ·
980 · 1012) 모두 직후 해제해 문제가 없었다.

---

## 미결 항목

| # | 항목 | 왜 지금 못 정하는가 |
|---|---|---|
| Q1 | X6 스크롤 복원 · S9 새로고침 내구성 | **현재 동작을 모른다.** 기대값을 소스에서 추측해 적으면 정답지가 틀린 것을 인증한다(이 프로젝트에서 반복 확인된 실패). 실측 후 그 값을 기준으로 확정한다 |
| Q2 | `node --test` 로 도는 프론트 테스트의 이관 | 러너를 vitest 로 합칠지, 별도로 둘지. 계획서에서 정한다 |
| Q4 | **G8**(세션 리스너가 정확히 1회 등록) | Task 16 에서 실제로 확인해 보니 **G11 은 단위 테스트로 고정할 수 있었지만**(deferred promise 로 응답 순서를 직접 통제 — `sessionStore.test.js`), **G8 은 컴포넌트 렌더링이 필요해 이 프로젝트의 테스트 관례(순수 함수만 테스트)를 벗어난다.** 새 테스트 인프라 도입은 서브플랜 7 범위 밖이라 유보하고 이월한다. 증상 자체는 여전히 무해하다 — 중복 등록되어도 리다이렉트가 두 번 나갈 뿐 최종 화면은 같다 |
| ~~Q5~~ | ~~A4~~ | **해소** — 측정 후 표본을 원상복구했다 |
| Q3 | `vite ^8.0.0-beta.13` | 베타 번들러로 운영 빌드를 만들고 있었다. 이관하면 사라지므로 **이 자체가 이관의 부수 이득**이다. 기록만 한다 |
