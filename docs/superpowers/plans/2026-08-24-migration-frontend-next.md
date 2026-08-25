# 서브플랜 7 — 화면을 Next App Router 로 이관

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to
> implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `frontend/`(Vite SPA, 20화면·99파일·7,165줄)를 `web/` 안의 Next App Router 로
옮겨 **하나의 배포**로 만들고, `frontend/`·`backend/` 를 제거한다.

**Architecture:** 파일 기반 라우팅으로 옮기고, `react-router-dom` 의 가드 4개를 App Router
레이아웃으로 대체한다. 화면 본문·공통 부품·API 모듈·스토어·유틸은 그대로 옮긴다.
**서버 컴포넌트 전환은 이 서브플랜의 범위가 아니다**(§0.2).

**Tech Stack:** Next 15 App Router · React 19 · Tailwind CSS 4(`@tailwindcss/postcss`) ·
zustand · react-toastify · @phosphor-icons/react · vitest

---

## Global Constraints

- **정답지가 계약이다.** `docs/qa/2026-08-24-frontend-next-parity-checklist.md` 94행 중
  92행이 실측값과 함께 고정돼 있다. 그 값과 다르면 파리티 위반이다.
- **가드는 클라이언트에 남긴다.** 관리자 접근 조건이 뷰포트 폭 ≥ 640px 이고 이를
  `window.innerWidth` + resize 리스너로 **실시간** 판정한다. 서버 컴포넌트는 이 값을 모른다.
  UA 로 대체하면 규칙이 뒤집힌다(N39).
- **색상·크기는 빌드 산출 CSS 에서 확인한다.** 이 프로젝트에서 "코드는 맞는데 CSS 가 안
  나오거나 다른 값으로 폴백되는" 실패가 **네 번** 있었고 전부 `grep` 으로만 잡혔다.
  눈으로 판정하지 마라.
- **`@/` 는 `web/` 루트를 가리킨다**(`web/tsconfig.json` 의 `paths` 가 이미 `"@/*": ["./*"]`).
  옮기는 디렉터리를 `web/` 루트에 두면 기존 `@/components/...` import 가 **그대로 동작한다.**
- **`.jsx` 를 `.tsx` 로 바꾸지 않는다.** `allowJs: true` 가 이미 켜져 있다. 44개 컴포넌트의
  타입 작성은 이 이관과 무관한 별개 작업이고, 섞으면 회귀 원인을 분리할 수 없다.
- **파일당 하나의 책임.** 화면 본문을 라우트 파일에 인라인하지 말고, 라우트 파일은 화면
  컴포넌트를 렌더하는 얇은 껍데기로 둔다(§1 의 이유).
- 테스트는 **한 러너(vitest)** 로 모은다. Task 2 완료 시점 실측 기대치는 **985개**(web 714 + 이관 271 — 브리프의 254 는 사전 집계 오차, Task 2 리뷰에서 정정됨)였고, 그 뒤 Task 5 가 죽어 있던 sessionRedirects 테스트 5개를 되살리고 Task 7 이 신규 3개를 더해 P2 종료 시점 **993개**, 통합 리뷰 수정으로 P2 마감 시점 **994개**다. **숫자를 고정값으로 대조하지 말고 매 태스크 검증 시 직전 값보다 줄지 않았는지(무회귀)로 판단한다** — P3·P4 가 화면마다 테스트를 추가하므로 이 값은 계속 늘어난다.
- 커밋은 태스크 단위. `docs/**`·`.claude/**` 는 사용자 승인 없이 스테이징하지 않는다.

---

## 0. 범위

### 0.1 바뀌는 것과 그대로 가는 것

| | 파일 수 | 처리 |
|---|--:|---|
| 경로·가드 5개 (`routes.jsx`·`PrivateRoute`·`PublicRoute`·`AdminRoute`·`Landing`) | 5 | **다시 짠다** — 파일 기반 라우팅 + 레이아웃 |
| `sessionRedirects.js`+테스트 (`routers/`, 가드 아니다) | 2 | **이동** — `routers/` 가 아니라 `apiClient/` 로(Task 4) |
| 진입점 (`main.jsx`, `index.html`) | 2 | **다시 짠다** — `app/layout.tsx` 로 흡수 |
| 스타일 설정 (`styles/index.css`) | 1 | **다시 짠다** — vite 플러그인 → postcss |
| 화면 본문 (`pages/` 20) | 20 | **옮긴다** — 이동 호출부 + `@/api/` 경로 교체 |
| 공통 부품 (`components/` 24) | 24 | **옮긴다** — 2개는 `next/link` 로, 1개는 `@/api/` 경로만 |
| 순수 모듈 (`utils/`·`hooks/`·`store/`·`api/`) | 40+ | **그대로 옮긴다** |
| 테스트 36개 | 36 | **그대로 옮긴다** — import 경로와 러너만 |

**`routers/` 는 7개 파일이다.** 5개(라우팅+가드)는 App Router 로 대체돼 삭제되고,
`sessionRedirects.js`+`.test.js` 2개는 **가드가 아니라 API 이벤트 리스너**라 `apiClient/`
로 이동한다 — Task 2 시점엔 아직 `api/` 만 존재해서 같이 옮길 수 없고, `pages/` 나
`components/` 처럼 나중 태스크로 미루면 Task 5·7 이 참조하는 파일이 없는 상태가 된다.
그래서 Task 4 를 이 이동 전담으로 둔다(§0.3 참조).

### 0.2 서버 컴포넌트 전환은 범위 밖이다

사용자가 고른 것은 "App Router 로 전면 이심"이고, 그 선택지 설명에 "인가가 서버로 이동"이
있었다. **그 부분은 실측으로 불가능함이 확인됐다**(정답지 N-3, 640px 게이트).

가드만이 아니다. 20화면 전부가 `apiClient` 로 쿠키를 실어 호출하고 `resultCode` 로 분기하며
zustand 로 상태를 공유한다. 서버 컴포넌트로 옮기면 **데이터 조회·오류 처리·승인된 이탈
17건의 표면이 동시에 바뀐다.** 그것은 이 서브플랜(배관 교체)이 아니라 별개의 이관이다.

**그래서 이렇게 한다: 파일 기반 라우팅으로 옮기고, 화면은 클라이언트 컴포넌트로 둔다.**
서버 컴포넌트 전환은 이관 완료 후 별도 항목으로 이월한다. 이 결정을 사용자에게 보고했고
정답지에도 기록돼 있다.

### 0.3 이 서브플랜에서 확정하는 세 가지 결정

| # | 항목 | 결정 |
|---|---|---|
| **㉢** | F1 — 없는 경로의 영어 개발자 오류 화면 | **한국어 안내로 교체한다.** `app/not-found.tsx` 에 제목 `요청한 페이지를 찾을 수 없습니다.` + 안내 `주소를 확인해 주세요.` + 링크 `학습 홈으로`. Next 는 `not-found.tsx` 가 기본 자리라 "그대로 재현"이 오히려 더 어렵다 |
| **㉣** | F4 — 뒤로가기 스크롤 복원 | **Next 기본값(복원)을 받아들인다.** 긴 목록에서 상세를 보고 돌아올 때 복원되는 편이 낫다. 다만 "저절로 바뀐 것"으로 남기지 않고 승인된 이탈로 기록하고, 정답지 X6 의 기대값을 **복원됨**으로 갱신한다 |
| **㉥** | F3 — 세션 만료 배너 유실 | **고친다. 원인은 이제 추정이 아니라 확정이다.** `resolvePrivateRedirect`(`utils/routing.js:30`)는 미인증일 때 **하드코딩된 `/login`**(파라미터 없음)을 반환한다. Task 5 의 `ProtectedLayout` 이 이 함수를 그대로 호출하므로, 세션 만료 시 그 레이아웃의 `redirectTo` 와 `Providers` 의 `registerSessionRedirects` 리스너가 **같은 상태 전이에서 각자 다른 URL 로 독립적으로 `router.replace` 를 부른다** — 어느 쪽이 나중에 실행되는지는 두 컴포넌트의 별개 `useEffect` 순서에 달렸고 보장되지 않는다. 재작성해도 없어지지 않는 구조적 경합이다(T4·T7) |

---

## 1. 파일 구조

```
web/
├─ app/
│  ├─ layout.tsx              [수정] metadata·viewport·globals.css·Providers
│  ├─ not-found.tsx           [신규] ㉢
│  ├─ globals.css             [신규] @import "tailwindcss" + tokens
│  ├─ login/page.tsx          [신규] — (protected) 밖. PublicRoute 대체
│  └─ (protected)/            [신규] PrivateRoute 대체. 원본이 Landing·AdminRoute 를
│     │                       모두 이 안에 감쌌던 중첩을 그대로 재현한다(아래 참고)
│     ├─ layout.tsx           [신규] 세션 로딩·미인증→/login·강제변경→/change-password
│     ├─ page.tsx             [수정] Landing (현재 app/page.tsx 스텁 — 이 자리로 이동)
│     ├─ change-password/page.tsx [신규]
│     ├─ solve/
│     │  ├─ layout.tsx        [신규] SolveShell
│     │  └─ …7개 page.tsx
│     └─ admin/
│        ├─ layout.tsx        [신규] AdminRoute + AdminLayout — 640px 게이트
│        └─ …9개 page.tsx
│  └─ api/                    [무변경] 32개 라우트
├─ components/                [이동] frontend/src/components (24)
├─ screens/                   [이동] frontend/src/pages (20) — 라우트 파일과 분리
├─ hooks/                     [이동] frontend/src/hooks
├─ store/                     [이동] frontend/src/store
├─ utils/                     [이동] frontend/src/utils (36 + 테스트 36)
├─ apiClient/                 [이동] frontend/src/api + frontend/src/routers/sessionRedirects.{js,test.js}
├─ styles/tokens.css          [이동] frontend/src/styles/tokens.css
├─ lib/                       [무변경] 서버 전용
├─ postcss.config.mjs         [신규]
└─ next.config.mjs            [수정]
```

**`(protected)/` 는 route group 이라 URL 에 영향이 없다** — `/admin/dashboard` 는
`(protected)` 유무와 무관하게 같은 주소다. 이 그룹으로 묶는 이유는 오직 **레이아웃
중첩**이다. 1차 초안에서는 `page.tsx`(Landing)와 `admin/` 을 `(protected)/` **밖**에
뒀는데, 원본 `routes.jsx` 를 다시 보니 `PrivateRoute` 가 `Landing` 과 `AdminRoute` 를
**직접 감싼다**:

```
{ element: <PrivateRoute />, children: [
  { index: true, element: <Landing /> },
  { path: "/admin", element: <AdminRoute />, children: [...] },
  ...
]}
```

밖에 두면 `AdminLayout` 은 역할·창폭만 검사하고 **`mustChangePassword` 를 전혀 보지
않으므로**, 최초 로그인 상태인 부서관리자가 `/admin` 에 그대로 도달한다 — `PrivateRoute`
의 코드 주석이 정확히 이 시나리오를 "이전에는 가드가 인증 여부만 보고 mustChangePassword
를 무시해서... /admin 에 그대로 도달할 수 있었다"고 기록한 바로 그 버그다. 재작성이 이미
고쳐진 버그를 되살릴 뻔했다. `(protected)/` 아래로 넣으면 이 중첩이 그대로 재현되고,
Landing·AdminLayout 은 자기 코드에서 인증 상태를 다시 검사할 필요가 없어진다(Task 4·5).

**왜 `apiClient/` 인가.** `web/api/` 로 두면 `web/app/api/`(서버 라우트) 옆에 `web/api/`
(브라우저 fetch 래퍼)가 생긴다. 하나는 서버에서 DB·서비스 로직을 만지고 다른 하나는
브라우저에서 돈다 — **잘못 import 하면 서버 코드가 클라이언트 번들에 실린다.** 이름으로
구분한다. `web/lib/` 에 넣지 않는 이유도 같다(`lib/` 은 서버 전용이고 비밀값을 다룬다).

**왜 `screens/` 를 따로 두는가.** 화면 본문을 `page.tsx` 에 인라인하면 20개 파일이
"라우트 껍데기 + 300~865줄 본문"이 되어 이동한 코드와 새로 쓴 코드가 한 파일에 섞인다.
회귀가 나면 어느 쪽 탓인지 분리할 수 없다. `page.tsx` 는 3~6줄로 두고 본문은 옮긴 파일
그대로 유지한다.

---

## 2. 실행 구간

| 구간 | 태스크 | 내용 | 상태 |
|---|--:|---|---|
| **P1 기반** | 3 | 스타일·순수 모듈·공통 부품 이동. 화면은 아직 없다 | ☐ |
| **P2 가드·인증** | 4 | 가드 4개 → 레이아웃, 화면 3개, F3 수정, not-found | ☐ |
| **P3 풀이** | 3 | `/solve/**` 7화면 | ☐ |
| **P4 관리자** | 3 | `/admin/**` 9화면 | ☐ |
| **P5 마감** | 3 | X 절 검증 · `frontend/`·`backend/` 제거 · 검증 문서 | ☐ |

---

# P1 — 기반

## Task 1: Tailwind 를 postcss 로 옮기고 스타일을 살린다

**Files:**
- Create: `web/postcss.config.mjs`, `web/app/globals.css`
- Move: `frontend/src/styles/tokens.css` → `web/styles/tokens.css`
- Modify: `web/app/layout.tsx`, `web/package.json`

**Interfaces:**
- Produces: `@theme` 로 생성되는 토큰 유틸리티(`bg-brand-dark`, `text-ink-muted`, …).
  이후 모든 태스크가 이것에 의존한다.

- [ ] **Step 1: 의존성 추가**

```bash
cd web && pnpm add -D tailwindcss@^4.1.18 @tailwindcss/postcss@^4.1.18
pnpm add @phosphor-icons/react@^2.1.10 react-toastify@^11.0.5 zustand@^5.0.11
```

`@tailwindcss/vite` 는 넣지 않는다 — Next 는 postcss 를 쓴다.

- [ ] **Step 2: postcss 설정**

`web/postcss.config.mjs`:

```js
const config = { plugins: { "@tailwindcss/postcss": {} } };
export default config;
```

- [ ] **Step 3: tokens.css 이동 (내용 무변경)**

```bash
mkdir -p web/styles && git mv frontend/src/styles/tokens.css web/styles/tokens.css
```

**`@theme` 블록을 손대지 마라.** 이 파일이 `--color-brand-dark` → `bg-brand-dark` 를
생성하는 유일한 출처다.

- [ ] **Step 4: globals.css 작성**

`web/app/globals.css` — `frontend/src/styles/index.css` 와 **같은 내용**, 경로만 조정:

```css
@import "tailwindcss";
@import "../styles/tokens.css";

body {
  font-family: var(--font-sans);
  background-color: var(--color-surface-page);
  color: var(--color-ink-strong);
}
```

- [ ] **Step 5: root layout 에 metadata·viewport·스타일 연결**

`web/app/layout.tsx` 를 통째로 교체:

```tsx
import type { ReactNode } from "react";
import type { Metadata, Viewport } from "next";
import "./globals.css";

// 정답지 G1: 문서 제목은 "문제 은행 Hub" (index.html 실측값)
export const metadata: Metadata = { title: "문제 은행 Hub" };

// 정답지 G3: viewport 메타가 빠지면 모바일에서 640px 게이트가 무력화된다.
// Next 는 이 export 로 <meta name="viewport"> 를 만든다.
export const viewport: Viewport = { width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
```

- [ ] **Step 6: 토큰 유틸리티가 실제로 생성되는지 확인 — 눈으로 보지 마라**

임시 확인용 페이지를 만들어 클래스를 쓰게 하고(Tailwind 4 는 사용된 클래스만 생성한다),
빌드 산출 CSS 를 grep 한다.

`web/app/page.tsx` 를 임시로:

```tsx
export default function Home() {
  return (
    <main className="bg-brand-dark text-ink-muted rounded-sm">문제 은행 Hub</main>
  );
}
```

```bash
cd web && pnpm build
grep -o '#005CA9\|--color-brand-dark' .next/static/css/*.css | sort -u
```

**기대: `#005CA9` 가 산출 CSS 에 나타난다.** 나타나지 않으면 `@theme` 가 로드되지 않은
것이고, 그 상태로 다음 태스크에 가면 44개 부품의 색이 전부 폴백된다.

- [ ] **Step 7: 커밋**

```bash
git add web/postcss.config.mjs web/app/globals.css web/styles/tokens.css \
        web/app/layout.tsx web/app/page.tsx web/package.json web/pnpm-lock.yaml
git commit -m "[ADD] Next 에 Tailwind postcss 와 디자인 토큰 연결"
```

---

## Task 2: 순수 모듈과 테스트 36개를 옮기고 러너를 합친다

**Files:**
- Move: `frontend/src/utils/` → `web/utils/`, `frontend/src/hooks/` → `web/hooks/`,
  `frontend/src/store/` → `web/store/`, `frontend/src/api/` → `web/apiClient/`
- Modify: `web/vitest.config.ts`

**Interfaces:**
- Consumes: 없음 (순수 모듈)
- Produces: `@/utils/*`, `@/hooks/*`, `@/store/sessionStore.js`, `@/apiClient/*`.
  **`@/api/*` 로 쓰던 import 는 전부 `@/apiClient/*` 로 바뀐다** — 이 태스크가 유일한
  변경 지점이고 이후 태스크는 새 경로만 쓴다.

- [ ] **Step 1: 이동**

```bash
cd c:/projects/daeryun-learning-hub
git mv frontend/src/utils web/utils
git mv frontend/src/hooks web/hooks
git mv frontend/src/store web/store
git mv frontend/src/api   web/apiClient
```

- [ ] **Step 2: `@/api/` → `@/apiClient/` 일괄 치환**

```bash
grep -rl '@/api/' web/utils web/hooks web/store web/apiClient \
  | xargs sed -i 's#@/api/#@/apiClient/#g'
grep -rn '@/api/' web/utils web/hooks web/store web/apiClient   # 기대: 0건
```

- [ ] **Step 3: `useLogout.js` 를 변환한다 — 옮기는 모듈 중 유일하게 react-router 를 쓴다**

`utils/`·`store/`·`apiClient/` 에는 react-router 참조가 **없다.** `hooks/` 중
**`useLogout.js` 하나만** `useNavigate` 를 쓴다. 확인:

```bash
cd web && grep -rln "react-router" utils hooks store apiClient
# 기대: hooks/useLogout.js 한 줄만
```

이것을 변환하지 않고 옮기면 `web` 에 `react-router-dom` 이 없어 **빌드가 깨진다.**

```js
"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "react-toastify";
import { logout } from "@/apiClient/auth.js";
import { refetchSession } from "@/store/sessionStore.js";
import { resolveErrorMessage } from "@/apiClient/client.js";

export function useLogout() {
  const router = useRouter();
  const [loggingOut, setLoggingOut] = useState(false);

  async function handleLogout() {
    setLoggingOut(true);
    try {
      await logout();
      await refetchSession();          // 순서를 바꾸지 마라 — 아래 주의 참조
      router.replace("/login");
    } catch (error) {
      toast.error(resolveErrorMessage(error, "로그아웃에 실패했습니다."));
    } finally {
      setLoggingOut(false);
    }
  }

  return { handleLogout, loggingOut };
}
```

> **`await refetchSession()` 이 이동보다 먼저다.** 원본 주석이 이유를 적어 놨다 —
> 캐시된 `"authenticated"` 가 남으면 가드가 반응하지 않아 화면이 그대로 유지된다.
> 정답지 A5(로그아웃 → `/login`)가 이 순서에 달렸다. **성공 문구는 없다** —
> 실패 시에만 `로그아웃에 실패했습니다.` 토스트가 뜬다. 성공 토스트를 새로 넣지 마라.

- [ ] **Step 4: vitest 가 `.js`/`.jsx` 테스트를 집게 한다**

`web/vitest.config.ts` 의 `include` 만 수정:

```ts
    include: ["**/*.test.ts", "**/*.test.js", "**/*.test.jsx"],
```

`environment: "node"` 를 **바꾸지 않는다.** 36개 테스트 전부 순수 함수 테스트이고
컴포넌트 테스트가 없다. jsdom 을 켜면 web 의 DB 통합 테스트 714개가 느려질 뿐이다.

- [ ] **Step 5: `test` import 만 바꾼다 — 단정문은 건드리지 않는다**

36개 파일 전부가 정확히 같은 두 줄로 시작한다:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
```

**`node:assert` 를 그대로 둔다.** 단정문이 실제로 **10종 463개**다 —
`equal` 246 · `deepEqual` 102 · `strictEqual` 54 · `ok` 22 · `deepStrictEqual` 17 ·
`match` 10 · `rejects` 6 · `notEqual` 3 · `throws` 2 · `notStrictEqual` 1.
이것을 `expect` 로 기계 치환하면 **의미가 조용히 약해지는 지점이 생긴다**:
`assert/strict` 의 `deepEqual` 은 프로토타입까지 비교하는데 `toEqual` 은 클래스를 보지
않는다(`toStrictEqual` 이 맞다). 463개 중 하나만 약해져도 그 테스트는 통과하면서
판별력을 잃는다 — **이 프로젝트에서 반복 확인된 실패 유형이다.**

`node:assert` 는 vitest 안에서 그대로 동작한다. 단정 실패는 예외이고 vitest 는 예외를
실패로 보고한다. 잃는 것은 vitest 의 예쁜 diff 뿐이다.

```bash
cd web
grep -rl 'from "node:test"' utils hooks store apiClient   | xargs sed -i 's#import { test } from "node:test";#import { test } from "vitest";#'
grep -rn "node:test" utils hooks store apiClient    # 기대: 0건
grep -rc "node:assert" utils hooks store apiClient | grep -c ":1$"   # 기대: 36
```

> **`node:assert` 를 남기는 것이 임시방편처럼 보이지만 아니다.** 이 36개 파일은 순수 함수
> 테스트이고 vitest 고유 기능(`vi.mock`·스냅샷)을 쓸 이유가 없다. 나중에 필요한 파일만
> 그때 바꾸면 된다. 지금 463개를 건드리는 것은 이관과 무관한 위험이다.

- [ ] **Step 6: 실행해서 개수를 확인한다**

```bash
cd web && pnpm test 2>&1 | tail -5
```

**기대: `Tests 968 passed` (web 714 + frontend 254).** 254 보다 적으면 치환 과정에서
테스트가 조용히 사라진 것이다 — 파일 수(61 + 36 = 97)도 함께 확인한다.

- [ ] **Step 7: 커밋**

```bash
git add -A web/utils web/hooks web/store web/apiClient web/vitest.config.ts
git commit -m "[MOD] 순수 모듈과 테스트 36개를 web 으로 이동하고 러너 통합"
```

---

## Task 3: 공통 부품 24개를 옮긴다

**Files:**
- Move: `frontend/src/components/` → `web/components/`
- Modify: `web/components/layout/SidebarNav.jsx`,
  `web/components/solve/RecommendedSetCard.jsx`

**Interfaces:**
- Consumes: `@/utils/*`, `@/hooks/*` (Task 2)
- Produces: `@/components/ui/*`(14), `@/components/admin/*`(3),
  `@/components/layout/*`(3), `@/components/solve/*`(4)

- [ ] **Step 1: 이동 + `@/api/` 치환**

```bash
git mv frontend/src/components web/components
grep -rl '@/api/' web/components | xargs sed -i 's#@/api/#@/apiClient/#g'
grep -rn '@/api/' web/components   # 기대: 0건
```

**Task 2 의 치환은 그 시점에 존재하던 4개 디렉터리만 훑었다.** `components/` 는 아직
`frontend/src/` 에 있었으므로 빠졌다 — `ProblemSolveCard.jsx` 하나가 `@/api/*` 를 쓴다.
여기서 잡지 않으면 `@/api/` 가 더 이상 없어 **빌드가 깨진다.**

- [ ] **Step 2: react-router 를 쓰는 2개만 교체**

`SidebarNav.jsx` — `NavLink` 는 Next 에 없다. **`end` 속성의 의미를 반드시 옮겨야 한다.**

`NavLink` 는 기본적으로 **접두사 매칭**이고, `end: true` 면 정확히 일치할 때만 활성이다.
`adminNav.js` 가 이 규칙을 의도적으로 쓴다:

| 항목 | `end` | 활성 조건 |
|---|---|---|
| `/admin/users` · `/admin/problems` | `true` | **정확히 일치만.** 없으면 `/admin/users/excel-upload` 에서 "계정 관리"까지 켜진다(주석에 기록된 실제 결함) |
| `/admin/stats` | 없음 | **접두사.** `/admin/stats/184` 에서도 "통계"가 켜져 있어야 한다 |
| `/admin/dashboard` 등 | 없음 | 접두사지만 하위 경로가 없어 결과가 같다 |

`pathname === to` 로만 비교하면 **통계 강조가 상세 화면에서 꺼진다.**
react-router 의 접두사 매칭은 세그먼트 단위이므로(`/admin/stats` 는 `/admin/statsfoo` 에
매칭되지 않는다) `startsWith(to + "/")` 가 정확한 등가물이다.

기존 `menuLinkClass(isActive)` 는 모듈 최상위 함수다 — **그대로 쓴다.**

```jsx
"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowSquareOut } from "@phosphor-icons/react";

const menuLinkClass = (isActive) => /* 기존 코드 그대로 — 한 글자도 바꾸지 않는다 */;

// NavLink 의 매칭 규칙을 그대로 옮긴다. end:true = 정확히 일치, 그 외 = 세그먼트 접두사.
function isActivePath(pathname, to, end) {
  return end ? pathname === to : pathname === to || pathname.startsWith(to + "/");
}

export default function SidebarNav({ groups }) {
  const pathname = usePathname();
  return (
    <nav className="sticky top-0 flex h-screen w-[220px] shrink-0 flex-col border-r border-line-default bg-surface-default"
         aria-label="관리자 메뉴">
      {/* 헤더·그룹 구조는 기존 그대로 */}
      {/* ... */}
              <Link
                href={item.to}
                aria-current={isActivePath(pathname, item.to, item.end) ? "page" : undefined}
                className={menuLinkClass(isActivePath(pathname, item.to, item.end))}
              >
                {item.icon && <item.icon size={18} aria-hidden="true" />}
                {item.label}
              </Link>
      {/* ... */}
      {/* 하단 "학습 화면으로 이동" 도 NavLink 였다 — 같은 방식으로 Link 로 바꾼다 */}
    </nav>
  );
}
```

> **`aria-current="page"` 를 반드시 남긴다.** `NavLink` 는 활성일 때 이것을 자동으로 붙였고,
> **정답지 M1 이 그 값을 실측으로 고정했다.** `Link` 는 붙여 주지 않으므로 직접 써야 한다.
>
> **`adminNav.test.js`(113줄)가 `end` 규칙을 자동 검사한다** — 그 테스트는 그대로 통과해야
> 한다. `adminNav.js` 는 수정하지 않는다.

`RecommendedSetCard.jsx` — `<Link to=…>` → `<Link href=…>`.

- [ ] **Step 3: `"use client"` 를 붙일 대상을 고른다**

훅(`useState`·`useEffect`·`useId`·`useRef`)이나 이벤트 핸들러를 쓰는 부품에만 붙인다.
`Surface`·`EmptyState`·`StatusBadge` 같은 순수 표현 부품에는 붙이지 않는다 — 붙이면
서버 렌더링 이득 없이 번들만 커진다.

```bash
cd web/components && grep -rl "useState\|useEffect\|useRef\|useId\|onClick\|onChange" . | sort
```

이 목록의 각 파일 첫 줄에 `"use client";` 를 넣는다.

- [ ] **Step 4: 타입체크·빌드**

```bash
cd web && pnpm build 2>&1 | tail -20
```

- [ ] **Step 5: 커밋**

```bash
git add -A web/components && git commit -m "[MOD] 공통 부품 24개를 web 으로 이동"
```

---

# P2 — 가드 · 인증

## Task 4: `sessionRedirects.js` 를 옮기고 F3 의 경합을 문서로 확정한다

**Files:**
- Move: `frontend/src/routers/sessionRedirects.js` → `web/apiClient/sessionRedirects.js`,
  `frontend/src/routers/sessionRedirects.test.js` → `web/apiClient/sessionRedirects.test.js`

**Interfaces:**
- Produces: `@/apiClient/sessionRedirects.js` 의 `registerSessionRedirects`·
  `SESSION_EXPIRED_PATH`·`CHANGE_PASSWORD_PATH`. Task 5 의 `Providers` 가 이걸 가져다 쓴다.

**1차 초안은 이 태스크를 "가설을 mock 테스트로 검증"으로 잡았었다.** 그 스니펫은
`triggerSessionExpired()` 라는 존재하지 않는 함수를 불렀고(플레이스홀더), 게다가
`sessionRedirects.test.js` 자체가 이미 `registerSessionRedirects` 가
`navigate(SESSION_EXPIRED_PATH, {replace:true})` 를 정확히 호출한다는 것을 증명하고
있어(`fakeRouter`+`stubFetch` 로 5개 케이스 고정) **중복이었다.**

**더 결정적으로**: mock 라우터로는 애초에 이 버그를 재현할 수 없다. F3 은 **두 컴포넌트의
`useEffect` 실행 순서 경합**이고, 그 경합은 Task 5 가 실제로 짜는 `ProtectedLayout` 과
`Providers` 사이에서 일어난다 — 아직 짜지 않은 코드를 mock 으로 미리 시험할 수 없다.
**대신 이미 짜여 있는 Task 5 의 스니펫을 읽어서 확정한다:**

- [ ] **Step 1: 이동**

```bash
git mv frontend/src/routers/sessionRedirects.js web/apiClient/sessionRedirects.js
git mv frontend/src/routers/sessionRedirects.test.js web/apiClient/sessionRedirects.test.js
```

`sessionRedirects.js` 안의 `import { setOnSessionExpired, setOnPasswordChangeRequired }
from "../api/client.js";` 를 `from "./client.js"` 로 고친다(`api/` 가 아니라 이제
`apiClient/` 안에 나란히 있다). 테스트 파일의 `import { apiGet } from "../api/client.js";`
도 `./client.js` 로.

- [ ] **Step 2: 이동만으로 5개 테스트가 그대로 통과하는지 확인**

```bash
cd web && npx vitest run apiClient/sessionRedirects.test.js
```

이 테스트가 증명하는 것은 **`registerSessionRedirects` 자체는 정상**이라는 것이다 —
`router.navigate(SESSION_EXPIRED_PATH, {replace:true})` 를 정확히 호출한다. 그래서 F3 의
원인은 이 함수 안이 아니다.

- [ ] **Step 3: 경합의 정확한 위치를 코드로 확정한다 (문서화만, 새 코드 없음)**

`utils/routing.js:30` 의 `resolvePrivateRedirect` 를 읽는다:

```js
if (status !== "authenticated") {
  return "/login";        // 하드코딩 — reason 파라미터가 없다
}
```

Task 5 의 `ProtectedLayout` 은 이 함수를 그대로 호출해 `redirectTo` 를 얻고
`router.replace(redirectTo)` 를 부른다. `Providers` 는 별개로
`registerSessionRedirects` 의 리스너가 `router.replace("/login?reason=session-expired")`
를 부른다. **세션 만료라는 하나의 상태 전이가 두 컴포넌트의 두 `useEffect` 를 각자
독립적으로 건드리고, 어느 쪽이 나중에 실행되는지는 React 가 보장하지 않는다.** 나중에
실행된 쪽이 URL 을 덮어쓴다 — 그게 `ProtectedLayout` 쪽이면 파라미터가 사라진다.

**이것은 이 계획서가 이미 설계한 두 컴포넌트를 읽어서 나온 결론이다.** 추정이 아니라
Task 5 를 구현하면 실제로 이 경합이 존재한다.

- [ ] **Step 4: 커밋**

```bash
git add web/apiClient/sessionRedirects.js web/apiClient/sessionRedirects.test.js
git commit -m "[MOD] sessionRedirects 를 apiClient 로 이동 (routers/ 는 가드 전용이 아니었다)"
```

---

## Task 5: 가드 4개를 레이아웃으로 옮긴다

**Files:**
- Create: `web/app/(protected)/layout.tsx`, `web/app/(protected)/admin/layout.tsx`,
  `web/app/(protected)/page.tsx`, `web/app/providers.tsx`
- Modify: `web/app/layout.tsx`
- Delete: `web/app/page.tsx`(Task 1 의 임시 확인용 스텁 — `(protected)/page.tsx` 가 대신한다)
- Move: `frontend/src/pages/` → `web/screens/`

**Interfaces:**
- Consumes: `@/hooks/useSessionStatus.js`, `@/hooks/useDeviceType.js`,
  `@/utils/routing.js`(`resolvePrivateRedirect`·`canAccessAdmin`·`resolveLandingPath`)
- Produces: 보호 경로 레이아웃. 이후 P3·P4 의 모든 화면이 이 아래에 놓인다.

**`utils/routing.js` 를 수정하지 않는다.** 순수 함수 4개는 이미
`web/utils/routing.test.js`(79줄)로 고정돼 있고 가드의 판단 로직 전부가 거기 있다.
레이아웃은 그 함수를 **호출만** 한다.

- [ ] **Step 1: 화면 본문 이동 + `@/api/` 치환**

```bash
git mv frontend/src/pages web/screens
cd web
grep -rl '@/pages/' screens components app | xargs sed -i 's#@/pages/#@/screens/#g'
grep -rl '@/api/'   screens                | xargs sed -i 's#@/api/#@/apiClient/#g'
grep -rn '@/api/' screens   # 기대: 0건
```

**20개 화면 중 16개가 `@/api/*` 를 쓴다.** Task 2 는 그 시점에 존재하던 4개 디렉터리만
훑었으므로 여기서 잡지 않으면 옛 경로가 남아 **빌드가 깨진다** — 사실상 전체 화면이
안 뜬다.

- [ ] **Step 2: Providers (토스트 + 세션 리스너)**

`main.jsx` 가 모듈 최상위에서 하던 일을 클라이언트 컴포넌트로 옮긴다.
**정답지 G8 이 "정확히 1회 등록"을 요구한다** — `useRef` 가드를 쓴다(StrictMode 이중
effect 대비).

```tsx
"use client";
import { useEffect, useRef } from "react";
import { ToastContainer } from "react-toastify";
import { useRouter } from "next/navigation";
import { registerSessionRedirects } from "@/apiClient/sessionRedirects.js";
import { markSessionExpired } from "@/store/sessionStore.js";

export default function Providers({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const registered = useRef(false);
  useEffect(() => {
    // main.jsx 는 모듈 최상위라 1회가 보장됐다. 컴포넌트 안으로 들어오면
    // StrictMode 가 effect 를 두 번 실행하므로 ref 로 막는다(정답지 G8).
    if (registered.current) return;
    registered.current = true;
    registerSessionRedirects({
      router: {
        navigate: (to: string, opts?: { replace?: boolean }) =>
          opts?.replace ? router.replace(to) : router.push(to),
        state: { location: { pathname: window.location.pathname } },
      },
      markSessionExpired,
    });
  }, [router]);
  return (
    <>
      {children}
      <ToastContainer />
    </>
  );
}
```

- [ ] **Step 3: root layout 에 Providers 연결**

Task 1 의 `layout.tsx` 에서 `<body>{children}</body>` 를
`<body><Providers>{children}</Providers></body>` 로 바꾼다.

- [ ] **Step 4: 보호 경로 레이아웃 — PrivateRoute 대체**

`web/app/(protected)/layout.tsx`:

```tsx
"use client";
import { useRouter, usePathname } from "next/navigation";
import { useEffect } from "react";
import Loader from "@/components/ui/Loader.jsx";
import { useSessionStatus } from "@/hooks/useSessionStatus.js";
import { resolvePrivateRedirect } from "@/utils/routing.js";

export default function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const { status, session } = useSessionStatus();
  const pathname = usePathname();
  const router = useRouter();
  const redirectTo = resolvePrivateRedirect({ status, session, pathname });

  // react-router 는 <Navigate> 를 렌더해 이동했다. Next 에는 그 컴포넌트가 없으므로
  // effect 에서 replace 한다. 렌더 중에 router.replace 를 부르면 React 가 경고한다.
  useEffect(() => {
    if (redirectTo) router.replace(redirectTo);
  }, [redirectTo, router]);

  // 정답지 N22: status === "loading" 이면 리다이렉트하지 않고 Loader 만 보여준다.
  // 문구는 실측값 "세션 확인 중..." 을 그대로 쓴다.
  if (status === "loading") return <Loader visible message="세션 확인 중..." />;
  if (redirectTo) return <Loader visible message="세션 확인 중..." />;
  return <>{children}</>;
}
```

> **`redirectTo` 일 때도 Loader 를 반환하는 이유**: 그러지 않으면 replace 가 완료되기
> 전 한 프레임 동안 보호 화면이 그려진다. `<Navigate>` 는 즉시 전환이라 그 틈이 없었다.

- [ ] **Step 5: 관리자 레이아웃 — AdminRoute + AdminLayout 합치기**

`web/app/(protected)/admin/layout.tsx` 는 두 가지를 한다: 640px 게이트(AdminRoute)와 셸(AdminLayout). `AdminLayout.jsx` 의 `<Outlet/>` 이 `{children}` 이 된다.

**`(protected)/` 아래에 둔다 — 밖에 두지 않는다.** §1 에서 확정한 이유: 이 레이아웃은 역할·창폭만 검사하고 `mustChangePassword` 를 보지 않는다. `(protected)/layout.tsx` 가 먼저 그 검사를 하고 통과시켜야만 여기 도달한다 — 원본 `PrivateRoute` > `AdminRoute` 중첩과 같다. **밖에 두면 최초 로그인 상태인 부서관리자가 `/admin` 에 그대로 도달한다.**

```tsx
"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import Loader from "@/components/ui/Loader.jsx";
import AppShell from "@/components/layout/AppShell.jsx";
import SidebarNav from "@/components/layout/SidebarNav.jsx";
import Topbar from "@/components/layout/Topbar.jsx";
import { useSessionStatus } from "@/hooks/useSessionStatus.js";
import { useDeviceType } from "@/hooks/useDeviceType.js";
import { useLogout } from "@/hooks/useLogout.js";
import { canAccessAdmin } from "@/utils/routing.js";
import { roleLabel, departmentScopeLabel } from "@/utils/adminSession.js";
import { buildNavGroups } from "@/utils/adminNav.js";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { status, session } = useSessionStatus();
  const device = useDeviceType();          // window.innerWidth + resize (정답지 N36)
  const { handleLogout, loggingOut } = useLogout();
  const router = useRouter();
  const blocked = status !== "loading" && !canAccessAdmin({ device, role: session?.role });

  useEffect(() => {
    if (blocked) router.replace("/solve");
  }, [blocked, router]);

  if (status === "loading") return <Loader visible message="세션 확인 중..." />;
  if (blocked) return <Loader visible message="세션 확인 중..." />;

  return (
    <AppShell
      sidebar={<SidebarNav groups={buildNavGroups(session?.role)} />}
      topbar={<Topbar roleLabel={roleLabel(session?.role)} scopeLabel={departmentScopeLabel(session)}
                      sessionStatus={status} onLogout={handleLogout} loggingOut={loggingOut} />}
    >
      {children}
    </AppShell>
  );
}
```

> **`useDeviceType` 은 `window.innerWidth` 를 초기 state 로 읽는다.** 클라이언트
> 컴포넌트라도 Next 는 서버에서 한 번 렌더하므로 **`window` 가 없어 터진다.**
> 이 훅을 `typeof window === "undefined" ? "pc" : classifyDevice(window.innerWidth)` 로
> 고치지 마라 — 그러면 서버 렌더 결과가 pc 로 고정돼 하이드레이션 불일치가 난다.
> **해결: `admin/layout.tsx` 를 `next/dynamic` 의 `ssr: false` 로 감싸거나,
> `useDeviceType` 이 첫 렌더에서 `null` 을 돌려주고 effect 에서 측정하게 한다.**
> 후자를 쓴다 — 훅 하나만 바뀌고 `utils/device.js`(테스트 35줄)는 그대로다.
> `device === null` 이면 `status === "loading"` 과 같이 Loader 를 보여준다.

- [ ] **Step 6: `useDeviceType` 을 SSR 안전하게**

```js
import { useEffect, useState } from "react";
import { classifyDevice } from "@/utils/device.js";

// 서버 렌더에는 window 가 없다. 첫 렌더에서 null 을 돌려주고 마운트 후 측정한다.
// null 은 "아직 모른다"는 뜻이고, 호출부는 이를 로딩과 같이 다뤄야 한다 —
// pc 로 가정하면 좁은 창의 관리자가 한 프레임 동안 관리자 화면을 보게 된다.
export function useDeviceType() {
  const [device, setDevice] = useState(null);
  useEffect(() => {
    const read = () => setDevice(classifyDevice(window.innerWidth));
    read();
    window.addEventListener("resize", read);
    return () => window.removeEventListener("resize", read);
  }, []);
  return device;
}
```

`canAccessAdmin({ device: null, role })` 는 `false` 를 돌려주므로(`device === "pc"` 비교),
`blocked` 판정에 `device !== null` 조건을 함께 넣어야 한다. Step 5 의 `blocked` 를:

```tsx
  const blocked = status !== "loading" && device !== null &&
                  !canAccessAdmin({ device, role: session?.role });
  if (status === "loading" || device === null) return <Loader visible message="세션 확인 중..." />;
```

- [ ] **Step 7: Landing — `app/(protected)/page.tsx`**

`(protected)/layout.tsx` 아래이므로 **이 컴포넌트가 렌더될 때는 이미
`status === "authenticated"` 이고 `mustChangePassword` 도 아니다** — 그 검사는 감싸는
레이아웃이 끝냈다. 그래서 원본 `Landing.jsx` 와 마찬가지로 Landing 자신은 `device`+`role`
분기만 한다. 인증 상태를 다시 검사하는 코드를 넣지 않는다 — 넣으면 §1 에서 지적한
1차 초안의 결함(밖에 두고 직접 인증을 검사하려다 실제로는 검사하지 않은 것)을 형태만
바꿔 반복하는 것이다.

```tsx
"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import Loader from "@/components/ui/Loader.jsx";
import { useSessionStatus } from "@/hooks/useSessionStatus.js";
import { useDeviceType } from "@/hooks/useDeviceType.js";
import { resolveLandingPath } from "@/utils/routing.js";

export default function Landing() {
  const { session } = useSessionStatus();   // status 는 안 쓴다 — 레이아웃이 이미 확정했다
  const device = useDeviceType();
  const router = useRouter();
  useEffect(() => {
    if (device !== null) router.replace(resolveLandingPath({ device, role: session?.role }));
  }, [device, session, router]);
  return <Loader visible message="세션 확인 중..." />;   // 정답지 N30
}
```

- [ ] **Step 8: 빌드·커밋**

```bash
cd web && pnpm build && pnpm test 2>&1 | tail -3
git add -A web/app web/screens web/hooks/useDeviceType.js
git commit -m "[ADD] 가드 4개를 App Router 레이아웃으로 이관"
```

---

## Task 6: 인증 화면 3개와 not-found

**Files:**
- Create: `web/app/login/page.tsx`, `web/app/(protected)/change-password/page.tsx`,
  `web/app/not-found.tsx`
- Modify: `web/screens/auth/LoginPage.jsx`, `web/screens/auth/ChangePasswordPage.jsx`

**Interfaces:**
- Consumes: Task 5 의 레이아웃
- Produces: 없음 (말단 화면)

- [ ] **Step 1: `/login` — PublicRoute 를 이 페이지에 내장한다**

경로가 하나뿐이라 레이아웃을 따로 만들지 않는다.

```tsx
"use client";
import { Suspense } from "react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import Loader from "@/components/ui/Loader.jsx";
import LoginScreen from "@/screens/auth/LoginPage.jsx";
import { useSessionStatus } from "@/hooks/useSessionStatus.js";

function LoginGate() {
  const { status } = useSessionStatus();
  const router = useRouter();
  useEffect(() => { if (status === "authenticated") router.replace("/"); }, [status, router]);
  if (status === "loading") return <Loader visible message="세션 확인 중..." />;   // N25
  if (status === "authenticated") return <Loader visible message="세션 확인 중..." />; // N24
  return <LoginScreen />;
}

// LoginPage 가 useSearchParams 로 ?reason=session-expired 를 읽는다(정답지 L1).
// App Router 에서 useSearchParams 는 Suspense 경계를 요구한다 — 없으면 빌드가 실패한다.
export default function Page() {
  return (
    <Suspense fallback={<Loader visible message="세션 확인 중..." />}>
      <LoginGate />
    </Suspense>
  );
}
```

- [ ] **Step 2: `LoginPage.jsx` 의 이동 호출부 교체**

| 현재 | 교체 |
|---|---|
| `import { useNavigate, useSearchParams } from "react-router-dom"` | `import { useRouter, useSearchParams } from "next/navigation"` |
| `const navigate = useNavigate()` | `const router = useRouter()` |
| `const [searchParams] = useSearchParams()` | `const searchParams = useSearchParams()` |
| `navigate("/change-password", { replace: true })` | `router.replace("/change-password")` |
| `navigate("/", { replace: true })` | `router.replace("/")` |

**`refetchSession()` 을 `router.replace()` 보다 먼저 호출하는 순서를 바꾸지 마라.**
정답지 A2 가 이 순서를 고정한다 — 뒤바뀌면 캐시된 `unauthenticated` 때문에 로그인 직후
`/login` 으로 되튕긴다(소스 주석에 기록된 실제 결함).

- [ ] **Step 3: `/change-password`**

`web/app/(protected)/change-password/page.tsx`:

```tsx
"use client";
import ChangePasswordScreen from "@/screens/auth/ChangePasswordPage.jsx";
export default function Page() { return <ChangePasswordScreen />; }
```

`ChangePasswordPage.jsx` 의 `navigate("/", { replace: true })` → `router.replace("/")`.
**`refetchSession()` 순서 주의는 Step 2 와 동일하다**(정답지 A4).

- [ ] **Step 4: not-found (결정 ㉢)**

`web/app/not-found.tsx`:

```tsx
import Link from "next/link";

// 정답지 F1: 지금은 react-router 의 영어 개발자 화면이 노출된다
// ("Unexpected Application Error! / 💿 Hey developer 👋").
// 한국어 사내 시스템에 맞지 않아 승인된 이탈 ㉢ 으로 교체한다.
export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-3 px-5 text-center">
      <h1 className="text-section-title font-bold text-ink-strong">
        요청한 페이지를 찾을 수 없습니다.
      </h1>
      <p className="text-body-small text-ink-muted">주소를 확인해 주세요.</p>
      <Link href="/solve" className="text-body-small font-medium text-brand-dark underline">
        학습 홈으로
      </Link>
    </main>
  );
}
```

- [ ] **Step 5: 정답지 G·N-2·N-3·L·A 절을 실측으로 재현한다**

```bash
cd web && pnpm build && pnpm start -p 3220 &
```

정답지의 실측값과 대조한다. **최소한 이 여섯 개는 반드시 확인한다:**

| 확인 | 기대(정답지 실측값) |
|---|---|
| 제목 · `lang` · viewport 메타 | `문제 은행 Hub` · `ko` · `width=device-width, initial-scale=1.0` |
| 로그인 버튼 배경 | `rgb(0, 92, 169)` |
| 포커스 링 | `rgb(0, 180, 227)` 3px solid offset 2px |
| 640px 게이트 | 639 → `/solve`, 640 → `/admin/dashboard`, 관리자 화면에서 줄이면 즉시 튕김 |
| `/login?reason=session-expired` | 배너 `세션이 만료되었습니다. 다시 로그인해 주세요.` 가 부제목과 `사번` 입력 **사이**에 |
| 없는 경로 | `요청한 페이지를 찾을 수 없습니다.` (영어 화면이 아니다) |

> **측정 방법**: `getComputedStyle`·`getBoundingClientRect` 로 값을 뽑는다. 이 탭에서는
> **좌표 클릭과 키 입력이 전달되지 않으므로 `locator.dispatchEvent('click')` 과
> `page.fill` 만 쓴다**(정답지 "측정 한계" 절). `page.click` 이 조용히 실패해 기능 결함처럼
> 보이는 함정이 있다.

- [ ] **Step 6: 커밋**

```bash
git add -A web/app web/screens/auth
git commit -m "[ADD] 인증 화면 3개와 한국어 404 페이지"
```

---

## Task 7: F3 수정 — 세션 만료 배너를 도달하게 한다

Task 4 에서 확정한 경합(`ProtectedLayout` 의 하드코딩된 `/login` vs `Providers` 의
`/login?reason=session-expired`)을 없앤다:

- [ ] **Step 1: 만료 상태를 스토어에 남긴다**

URL 파라미터가 경합에서 유실되므로, **파라미터에 의존하지 않게 만든다.**
`sessionStore` 에 `expired: boolean` 을 추가하고 `markSessionExpired()` 가 세운다.
`LoginPage` 는 `?reason=session-expired` **또는** `expired` 를 보고 배너를 띄운다.

```js
export function markSessionExpired() {
  useSessionStore.setState({
    status: "unauthenticated", session: null, fetchPromise: null,
    expired: true,                       // 파라미터가 유실돼도 배너가 뜨게 하는 근거
    generation: useSessionStore.getState().generation + 1,
  });
}
```

**`?reason=session-expired` 지원을 없애지 마라.** 정답지 L1 이 그 URL 로 직접 진입했을 때의
동작을 고정하고 있다. 둘 다 지원한다.

- [ ] **Step 2: 배너가 한 번만 뜨게 한다**

`expired` 는 로그인 성공 시(`refetchSession`) 초기화한다. 그러지 않으면 로그아웃 후
로그인 화면에 만료 안내가 계속 뜬다.

- [ ] **Step 3: 회귀 테스트**

`markSessionExpired()` → `expired === true`, `refetchSession()` → `expired === false`.

- [ ] **Step 4: 실측 재현**

980 응답을 주입해 `/login` 도달 후 **배너가 부제목과 `사번` 입력 사이에 렌더되는지**
확인한다. 토스트만 뜨면 고쳐지지 않은 것이다.

- [ ] **Step 5: 커밋**

```bash
git commit -m "[FIX] 세션 만료 안내가 URL 파라미터 유실에도 표시되게 수정"
```

---

# P3 — 풀이 화면 7개

## Task 8: `/solve` 레이아웃과 홈·목록·이력

**Files:**
- Create: `web/app/(protected)/solve/layout.tsx`,
  `.../solve/page.tsx`, `.../solve/problems/page.tsx`, `.../solve/history/page.tsx`
- Modify: `web/screens/solve/SolveShell.jsx`, `SolveHomePage.jsx`,
  `SolveProblemListPage.jsx`, `AttemptHistoryPage.jsx`

- [ ] **Step 1: `SolveShell` 을 레이아웃으로**

`SolveShell.jsx` 는 이미 `{children}` 을 받는 래퍼다. `app/(protected)/solve/layout.tsx`
가 그것을 그대로 쓴다. `<Link to="/solve">` → `<Link href="/solve">`.

```tsx
"use client";
import SolveShell from "@/screens/solve/SolveShell.jsx";
export default function Layout({ children }: { children: React.ReactNode }) {
  return <SolveShell>{children}</SolveShell>;
}
```

**각 화면에서 `<SolveShell>` 래퍼를 제거한다** — 레이아웃이 이미 감싸므로 남기면 헤더가
두 번 그려진다.

- [ ] **Step 2~4: 화면 3개** — `<Link to>` → `<Link href>`, `useNavigate` → `useRouter`
- [ ] **Step 5: 실측** — 정답지 S1·S2·S7 + N15·N19·N20
- [ ] **Step 6: 커밋**

## Task 9: 문제 상세 `/solve/[id]`

- [ ] **Step 1**: `useParams()` → `next/navigation` 의 `useParams()`.
  **`params.id` 는 문자열이다** — react-router 도 같았으므로 변환 로직을 바꾸지 마라.
- [ ] **Step 2: 정적/동적 경로 우선순위 확인** — 정답지 N20 이 못박은 것:
  `/solve/history` 가 `[id]` 로 잡히면 안 된다. **App Router 는 정적 세그먼트를 먼저
  고르지만 실측으로 확인한다** — 조용히 400 이 뜬다.
- [ ] **Step 3: 실측** — N21·S3 · **N20 재확인**
- [ ] **Step 4: 커밋**

## Task 10: 랜덤 풀이 3화면

- [ ] **Step 1~3**: `random/page.tsx`, `random/play/page.tsx`, `random/result/page.tsx`
- [ ] **Step 4: `sessionStorage` 딥링크 방어 유지** — 정답지 S5·S6 이
  "세트가 없으면 `/solve/random` 으로 replace" 를 고정한다. `sessionStorage` 접근은
  `useEffect` 안에서만 한다(서버 렌더에 `sessionStorage` 가 없다).
- [ ] **Step 5: 실측** — S4·S5·S6·S8·S9 + N16·N17·N18.
  **S8(5문제 완주 → `결과 요약` · `5문제 중 N개 정답`)까지 반드시 확인한다**
- [ ] **Step 6: 커밋**

---

# P4 — 관리자 화면 9개

## Task 11: 대시보드 · 부서 · 계정 (4화면)

- [ ] `(protected)/admin/page.tsx` — `/admin` → `/admin/dashboard` `replace`(정답지 N4)
- [ ] `(protected)/admin/{dashboard,departments,users,users/excel-upload}`
- [ ] **F2 를 그대로 재현한다** — 부서관리자가 `/admin/departments`·`/admin/users` 에
  들어가면 화면이 전부 그려지고 데이터만 막힌다. 화면별 권한 검사를 **새로 넣지 마라**
  (§0.2 범위 밖이고, 넣으면 파리티 기준선이 흔들린다)
- [ ] 실측 — M1·M2·M3·M4·M5 + N5~N8

## Task 12: 문제 관리 3화면

- [ ] `(protected)/admin/problems/{page,new/page,[id]/edit/page,excel-upload/page}.tsx`
- [ ] **`ProblemFormPage.jsx`(865줄)는 등록·수정 두 라우트가 공유한다.**
  react-router 는 같은 element 를 두 경로에 걸었다. Next 에서는 두 `page.tsx` 가
  같은 컴포넌트를 렌더하고, `useParams()` 의 `id` 유무로 모드를 가른다 —
  **현재 동작과 같다**(정답지 N10 `문제 등록` / N11 `문제 수정`)
- [ ] **이미지 미리보기가 A2 컷오버 항목의 실물 확인이다** — `<img src>` 가 저장된
  `/api/problem-images/{key}` 를 상대 경로로 렌더한다. 단일 배포이므로 그대로 떠야 한다
- [ ] 실측 — M6·M7·M8 + N9~N12

## Task 13: 통계 2화면

- [ ] `(protected)/admin/stats/{page,[id]/page}.tsx`
- [ ] 실측 — M9 + N13·N14. **`stats/[id]` 의 `h1` 은 고정 제목이 아니라 문제 내용이다**
  (정답지 N14: `총괄 생성 문제`)

---

# P5 — 마감

## Task 14: 브라우저 동작(X 절)과 스크롤 결정 ㉣

- [ ] **Step 1: X 절 8행 실측** — 딥링크 20경로 · 뒤로/앞으로 · replace 후 뒤로 ·
  문서 요청 0건 · 콘솔 0건
- [ ] **Step 2: 스크롤 복원을 확인하고 결정 ㉣ 를 확정한다**

정답지 X6 은 **현재 복원하지 않음**(400 → 0)을 실측했다. Next 는 복원이 기본이다.
측정해서 실제로 복원되는지 확인하고, 정답지 X6 의 기대값을 **복원됨**으로 갱신한다.

**복원되지 않으면 그것도 기록한다** — "Next 가 복원한다"는 것은 문서상의 기대이고,
이 앱은 화면 대부분이 effect 로 데이터를 나중에 채우므로 복원 시점에 콘텐츠 높이가
0일 수 있다. **측정이 문서를 이긴다.**

- [ ] **Step 3: 정답지 F4 절과 X6 행 갱신**
- [ ] **Step 4: 커밋**

## Task 15: `frontend/`·`backend/` 제거

- [ ] **Step 1: 남은 참조 확인**

```bash
cd c:/projects/daeryun-learning-hub
grep -rn "frontend/" --include="*.json" --include="*.md" --include="*.yml" \
  --include="*.mjs" --include="*.ts" . | grep -v node_modules | grep -v "^./docs"
```

- [ ] **Step 2: `frontend/src` 가 비었는지 확인** — 옮기지 않은 파일이 남아 있으면
  그것은 **누락**이다. `App.jsx`·`main.jsx`·`routers/`·`index.html`·`vite.config.js` 만
  남아야 하고, 그것들은 대체됐으므로 삭제한다

```bash
find frontend/src -type f | sort
```

- [ ] **Step 3: 삭제**

```bash
git rm -r frontend backend
```

- [ ] **Step 4: `docker-compose.yml`·`README.md`·루트 스크립트 갱신**
- [ ] **Step 5: 전체 검증**

```bash
cd web && pnpm test && pnpm build
```

**기대: 직전 태스크 값(P2 종료 시점 994) 이상 · 빌드 성공.** 고정 숫자로 대조하지 말고 무회귀로 판단한다(위 Global Constraints 참고). backend 삭제로 Spring 테스트 301개는 사라진다 — 그것이 이 태스크의 목적이고 web 쪽 테스트 수와는 무관하다.

- [ ] **Step 6: 커밋**

```bash
git commit -m "[CHORE] Spring 백엔드와 Vite 프론트엔드 제거"
```

## Task 16: E2E 검증 문서와 컷오버 목록 갱신

- [ ] **Step 1**: `docs/qa/2026-08-24-frontend-next-e2e-verification.md` 작성 —
  정답지 94행 전부의 재현 결과(미측정 2행은 단위 테스트 대체로 기록)
- [ ] **Step 2**: 엔드포인트 개수 대조 스크립트를 다시 돌린다
  (`docs/qa/2026-08-24-stats-e2e-verification.md` §4 에 있다). **화면 이관이
  `app/api/**` 를 건드리지 않았음을 숫자로 확인한다** — 32개 유지
- [ ] **Step 3**: 컷오버 통합 목록(`…stats-e2e-verification.md` §3)을 갱신한다
  - **A2 를 삭제한다** — 단일 배포가 되어 이 위험이 사라졌다. 이 서브플랜의 목적이었다
  - **㉢·㉣·㉥ 을 승인된 이탈 표에 추가한다**(C18·C19·C20)
  - **F2 를 이월 결함에 추가한다**(D11 — 부서관리자가 총괄 전용 화면에 진입)
  - **서버 컴포넌트 전환을 이월 항목에 추가한다**(§0.2)
- [ ] **Step 4**: 커밋 (사용자 승인 후)

---

## 3. 자기 검토

**정답지 94행이 어느 태스크에서 확인되는가**

| 절 | 행 | 태스크 |
|---|--:|---|
| G 전역·진입 | 11 | T1(G1~G5) · T5(G8·G9) · T6(G6·G7·G10) · T7(G6 수정) |
| N 경로·가드 | 39 | T6(N1~N3·N22~N39) · T8~T10(N15~N21) · T11~T13(N4~N14) |
| X 브라우저 | 8 | T14 |
| L 쿼리 파라미터 | 4 | T6(L1·L2·L4) · T7(L3) |
| A 인증 | 6 | T6 |
| M 관리자 | 9 | T11·T12·T13 |
| S 풀이 | 9 | T8·T9·T10 |
| U 공통 부품 | 8 | T3 이동 후 T6 에서 실측(U1~U4·U7), T14 에서 U8 |

**빠진 행 없음.** G11(stale 응답 폐기)과 G8 은 정답지가 "관측 가능한 증상이 없다"로
단위 테스트 대체를 명시했고, T5 Step 2 가 G8 의 `useRef` 가드를, T2 가 `sessionStore`
테스트를 담당한다.

**타입·이름 일관성**

- `resolvePrivateRedirect`·`canAccessAdmin`·`resolveLandingPath` — `utils/routing.js`
  의 실제 export 명. 수정하지 않는다
- `useDeviceType()` 의 반환이 `"pc" | "mobile"` → **`"pc" | "mobile" | null`** 로 바뀐다.
  호출부는 `admin/layout.tsx` 와 `app/page.tsx` 둘뿐이고 양쪽 모두 이 계획에서
  `null` 처리를 명시했다. `utils/device.js` 의 `classifyDevice` 는 무변경
- `@/api/*` → `@/apiClient/*` 는 T2 에서 일괄 치환하고 이후 태스크는 새 경로만 쓴다

**위험이 가장 큰 곳 셋**

1. **T1 Step 6** — 토큰 유틸리티가 생성되지 않으면 44개 부품의 색이 전부 폴백된다.
   빌드 CSS grep 이 유일한 방어다
2. **T5 Step 5·6** — `useDeviceType` 의 SSR 처리. `pc` 로 가정하면 좁은 창의 관리자가
   한 프레임 관리자 화면을 보고, 하이드레이션 불일치도 난다
3. **T9 Step 2** — `/solve/history` 가 `[id]` 로 잡히면 조용히 400 이 뜬다.
   문서를 믿지 말고 실측한다

**계획서 자체 검증에서 고친 것 셋** (착수 전에 코드로 확인한 결과)

| # | 처음 쓴 것 | 실제 | 고친 방식 |
|---|---|---|---|
| 1 | 단정문 4종을 `expect` 로 치환 | **10종 463개** | `node:assert` 를 그대로 두고 `test` import 만 바꾼다. 463개 치환은 의미가 조용히 약해지는 위험이 크다 |
| 2 | `SidebarNav` 를 `pathname === to` 로 | `NavLink` 의 **`end` 규칙**(접두사 vs 정확히 일치) | `isActivePath(pathname, to, end)` 로 규칙을 그대로 옮긴다. 안 하면 `/admin/stats/184` 에서 "통계" 강조가 꺼진다 |
| 3 | `hooks/` 를 그냥 옮긴다 | `useLogout.js` 가 **`useNavigate` 를 쓴다** | T2 Step 3 에서 변환한다. 안 하면 빌드가 깨진다 |

이 셋은 전부 **계획서가 단정한 것을 코드로 확인해서** 나왔다. 실행 중 리뷰가 아니라
착수 전 검증에서 잡힌 것이므로, 구현자는 이 표의 내용이 이미 본문에 반영돼 있다고 보면 된다.

**2차 검토(푸시 전 재검토)에서 고친 것 다섯** — 1차 검토가 놓친 것들. 전부 본문에 이미
반영돼 있다.

| # | 처음 쓴 것 | 실제 | 고친 방식 |
|---|---|---|---|
| 4 | `page.tsx`(Landing)·`admin/layout.tsx` 를 `(protected)/` 밖에 | 원본 `routes.jsx` 는 `PrivateRoute` 가 `Landing`·`AdminRoute` 를 **직접 감싼다** | 둘 다 `(protected)/` 안으로. 밖에 두면 **`mustChangePassword` 검사가 admin 라우트에 아예 적용되지 않아**, 이미 고쳤다고 코드 주석에 기록된 버그가 재발한다 |
| 5 | `@/api/` → `@/apiClient/` 치환을 Task 2 한 곳에서 끝냈다고 가정 | Task 2 시점엔 `components/`·`pages/` 가 아직 안 옮겨져 있어 **16+1 파일이 누락** | Task 3(부품 1개)·Task 5(화면 16개) 각각에 같은 sed 추가. 안 하면 빌드가 즉시 깨진다 |
| 6 | `sessionRedirects.js` 가 이미 `apiClient/` 에 있다고 가정 | 실제로는 `routers/` 에 있고 **어떤 태스크도 옮기지 않았다** | Task 4 를 이 이동 전담으로 재구성 |
| 7 | Task 4 = mock 라우터로 F3 가설을 검증하는 테스트(`triggerSessionExpired()` 는 존재하지 않는 함수였다) | 이미 있는 `sessionRedirects.test.js` 가 같은 것을 이미 증명하고, mock 으론 애초에 이 경합을 재현할 수 없다 | Task 4 를 "이동 + Task 5 스니펫을 읽어 경합을 코드로 확정"으로 교체. `resolvePrivateRedirect` 가 하드코딩 `/login` 을 반환하는 것을 직접 확인해 **추정을 확정으로 바꿨다** |
| 8 | §0.1 표 "3개만 next/link 로 교체" | 실제 2개(`SidebarNav`·`RecommendedSetCard`) | 표 수정 |

**#4 가 이번 재검토의 핵심이다.** 나머지는 빌드 실패나 문서 불일치로 즉시 드러나지만,
#4 는 **조용히 통과한다** — 부서관리자 계정으로 강제 변경 화면을 스킵해도 아무 오류가
안 난다. 정답지가 실측한 N26(`mustChangePassword` + 아무 보호 경로 → `/change-password`)
을 화면별로 다시 재현하지 않으면 놓쳤을 결함이다.
