# 관리 목록 스크롤·페이지네이션 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 관리 화면의 목록 카드가 창 하단에서 잘리는 문제를 앱 셸을 문서 스크롤 + sticky 헤더로 바꿔 없애고, 부서·계정·문제 목록에 페이지네이션을 넣는다.

**Architecture:** 두 문제는 원인이 다르다. 잘림은 `AppShell`이 `h-screen` + `overflow-hidden`으로 화면 높이에 고정돼 **문서가 아예 스크롤하지 않고 `main`만 내부 스크롤**하는 구조 때문이며, 행 수와 무관하다(8행짜리 부서 목록도 창 높이 800px에서 잘린다). 셸을 문서 스크롤로 되돌리고 Sidebar·Topbar에 `sticky`를 걸어 상단 고정 효과는 유지한다. 페이지네이션은 목록마다 성격이 달라 **문제 목록은 서버 페이징, 부서·계정 목록은 클라이언트 페이징**으로 나눈다 — 이유는 아래 "왜 나눠서 적용하는가" 참고.

**Tech Stack:** Java 8 / Spring Boot 2.7.3 / MyBatis / PostgreSQL, React 19 / Vite / Tailwind 4. 테스트는 JUnit 5 + Mockito + MockMvc(백엔드), Node 내장 러너 `node --test`(프론트엔드).

**근거:**
- 잘림 재현·측정: 창 높이 1024/900/800/720에서 `/admin/departments`(8행)·`/admin/users`(7행)·`/admin/problems`(119행)을 측정. **900 이하에서 세 화면 모두 `main.scrollHeight > clientHeight`** 이고 카드 하단 테두리가 잘린다. `html.scrollHeight == clientHeight`로 문서는 스크롤하지 않는다.
- 페이지네이션 필요성: [`docs/qa/2026-08-09-question-bank-upload-result.md`](../../qa/2026-08-09-question-bank-upload-result.md) F1 — 현재 119건이 한 화면에 전부 렌더링되고, 653문항 전량 투입 시 653행이 된다.
- 디자인 시스템 §7.1은 `220px sidebar`, `Topbar 분리`, `PageContent 최대 1440px·좌우 28px`만 규정하고 **스크롤 동작은 정의하지 않는다.** 지금 구조는 명세가 아니라 구현 선택이므로 바꿔도 명세 위반이 아니다.

## Global Constraints

- **`@SpringBootTest`를 쓰는 테스트 클래스에는 반드시 `@ActiveProfiles("test")`를 붙인다.**
- DB 통합 테스트는 `@Transactional`로 롤백한다.
- **`rtk gradlew`는 `--tests` 옵션에서 멈춘다.** `rtk proxy ./gradlew test --tests "..."` 형태로 실행한다.
- 프론트엔드에는 jsdom이 없다. **순수 로직을 alias 없는 `frontend/src/utils/*.js`로 뽑아 `.test.js`로 검증**한다. `@/` alias를 쓰는 파일은 `node --test`가 로드하지 못한다.
- **컴포넌트 렌더링·레이아웃은 단위 테스트로 덮이지 않는다.** 이번 작업의 절반(셸 레이아웃)이 그 영역이므로 Task 5의 브라우저 검증이 유일한 안전망이다 — 앞선 회차에서 훅 순서 위반과 CORS 거부를 빌드·184개 테스트가 모두 통과한 상태로 놓쳤다.
- 현재 기준선: **백엔드 204 / 프론트엔드 184 전부 통과, 프로덕션 빌드 성공.**
- 커밋 메시지는 `fix:`/`feat:`/`test:`/`docs:` 영문 Conventional Commits.

## 왜 페이지네이션을 나눠서 적용하는가

| 목록 | 방식 | 이유 |
|---|---|---|
| 문제 | **서버** | 653건이 확정된 규모다. 클라이언트 페이징은 렌더링만 줄이고 전송량·메모리는 그대로라 곧 다시 손대게 된다 |
| 부서 | **클라이언트** | `GET /api/admin/departments`는 목록 화면뿐 아니라 **계정 생성/수정 폼의 부서 Select, 엑셀 업로드 부서 Select, 부서 이동 Select의 데이터 소스**다. 서버 페이징하면 그 Select들이 첫 페이지 부서만 보게 된다 |
| 계정 | **클라이언트** | 현재 7건이고 부서와 같은 화면 구조를 공유한다. 규모가 커지면 서버 페이징으로 옮긴다 |

페이지 크기는 **20**으로 통일한다.

---

## File Structure

| 파일 | 책임 | Task |
|---|---|---|
| `frontend/src/components/layout/AppShell.jsx` | 문서 스크롤로 전환 | 1 |
| `frontend/src/components/layout/SidebarNav.jsx` | `sticky top-0 h-screen` | 1 |
| `frontend/src/components/layout/Topbar.jsx` | `sticky top-0 z-*` | 1 |
| `frontend/src/utils/pagination.js` | **신규.** 페이지 슬라이스·페이지 수·범위 계산 순수 함수 | 2 |
| `frontend/src/utils/pagination.test.js` | **신규.** 위 함수 고정 | 2 |
| `frontend/src/components/ui/Pagination.jsx` | **신규.** 공용 페이지 이동 UI | 2 |
| `frontend/src/pages/admin/departments/DepartmentListPage.jsx` | 클라이언트 페이징 적용 | 3 |
| `frontend/src/pages/admin/users/UserListPage.jsx` | 클라이언트 페이징 적용 | 3 |
| `backend/.../mappers/probank/ProblemMapper.xml` | `LIMIT/OFFSET` + `countAll` | 4 |
| `backend/.../dao/ProblemDao.java` | 페이징 파라미터·카운트 | 4 |
| `backend/.../dto/problem/ProblemPageResponse.java` | **신규.** `{items, totalCount, page, size}` | 4 |
| `backend/.../service/ProblemService(.Impl).java` | 페이징 반환 | 4 |
| `backend/.../controller/ProblemController.java` | `page`·`size` 파라미터 | 4 |
| `frontend/src/api/problems.js` · `ProblemListPage.jsx` | 새 응답 형태 소비 | 4 |
| `docs/qa/2026-08-09-question-bank-upload-result.md` | F1 해소 기록 | 5 |

---

### Task 1: 앱 셸을 문서 스크롤 + sticky 로 바꾼다

**Files:**
- Modify: `frontend/src/components/layout/AppShell.jsx`
- Modify: `frontend/src/components/layout/SidebarNav.jsx`
- Modify: `frontend/src/components/layout/Topbar.jsx`

**Interfaces:**
- Consumes: 없음
- Produces: 문서가 스크롤하는 셸. Task 3·4의 화면이 이 위에 얹힌다.

**배경:** 현재 구조와 측정값이다.

```jsx
<div className="flex h-screen bg-surface-page">              // 화면 높이 고정
  {sidebar}
  <div className="flex flex-1 flex-col overflow-hidden">     // 넘치면 잘라냄
    {topbar}
    <main className="flex-1 overflow-y-auto">                // 여기만 스크롤
```

```
창 800px / 부서 관리(8행)
  html.scrollHeight 800 == clientHeight 800   ← 문서는 스크롤하지 않는다
  main.scrollHeight 858 > clientHeight 724    ← 134px 이 숨는다
  카드 bottom 902 > 뷰포트 800                 ← 하단 테두리가 잘린다
```

- [ ] **Step 1: AppShell 을 문서 스크롤로 바꾼다**

`AppShell.jsx` 전체를 아래로 교체한다.

```jsx
// 디자인 시스템 7.1 AppShell: 220px Sidebar + AppMain(Topbar + PageContent).
// PageContent는 최대 1440px, 좌우 28px 패딩을 사용한다.
//
// 스크롤은 문서가 담당한다. 이전에는 h-screen + overflow-hidden 으로 화면 높이에 고정하고
// main 만 내부 스크롤했는데, 그러면 창이 조금만 짧아도 목록 카드가 하단 테두리 없이 잘려
// 렌더링 오류처럼 보였다(8행짜리 부서 목록도 창 높이 800px 에서 잘렸다). Sidebar 와 Topbar 는
// sticky 로 화면에 남으므로 상단 고정 효과는 그대로다.
export default function AppShell({ sidebar, topbar, children }) {
  return (
    <div className="flex min-h-screen bg-surface-page">
      {sidebar}
      <div className="flex min-w-0 flex-1 flex-col">
        {topbar}
        <main className="flex-1">
          <div className="mx-auto max-w-[1440px] px-7 py-8">{children}</div>
        </main>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Sidebar 를 sticky 로 고정한다**

`SidebarNav.jsx:20-22`의 `<nav>` 클래스를 바꾼다. 현재는 `flex w-[220px] shrink-0 flex-col border-r border-line-default bg-surface-default` 다.

```jsx
      className="sticky top-0 flex h-screen w-[220px] shrink-0 flex-col border-r border-line-default bg-surface-default"
```

**추가하는 것은 `sticky top-0`과 `h-screen` 둘뿐이다.**

`h-screen`이 반드시 필요하다. 부모가 더 이상 높이를 고정하지 않으므로, 이게 없으면 사이드바 높이가 콘텐츠만큼만 되고 안쪽 메뉴 영역의 `flex-1`이 기준 높이를 잃는다.

> ⚠️ **`overflow-y-auto`를 `<nav>`에 추가하지 말 것.** 메뉴 영역(`SidebarNav.jsx:28`)이 이미 `flex-1 overflow-y-auto`다. 위에도 걸면 스크롤 컨테이너가 이중이 되어 휠 동작이 어긋난다.

- [ ] **Step 3: Topbar 를 sticky 로 고정한다**

`Topbar.jsx:8`의 `<header>` 클래스 맨 앞에 `sticky top-0 z-20`을 넣는다.

```jsx
    <header className="sticky top-0 z-20 flex h-[76px] shrink-0 items-center justify-between border-b border-line-default bg-surface-default px-7">
```

두 가지를 확인해 두었다.

- **배경이 이미 불투명하다** (`bg-surface-default`). sticky 요소가 반투명하면 아래 표 행이 비쳐 보이는데 그 문제가 없다.
- **모달은 `z-50`이다** (`Modal.jsx:58`의 `fixed inset-0 z-50`). `z-20`보다 위이므로 모달이 Topbar 에 가리지 않는다. Task 5 에서 눈으로도 확인한다.

- [ ] **Step 4: 브라우저로 확인한다**

프론트 dev 서버가 떠 있어야 한다. `admin` / `QaAdmin1234!` 로 로그인해 창 높이 **720·800·900·1024** 각각에서 `/admin/departments`·`/admin/users`·`/admin/problems`를 연다.

| 확인 | 기대 |
|---|---|
| 문서 스크롤 | `document.documentElement.scrollHeight > clientHeight` — 브라우저 기본 스크롤바가 창 오른쪽 끝에 생긴다 |
| 카드 잘림 | 끝까지 스크롤했을 때 목록 카드의 **하단 둥근 테두리가 보인다** |
| 사이드바 | 스크롤해도 화면에 남는다 |
| Topbar | 스크롤해도 화면 상단에 남고, 표 행이 그 아래로 지나간다 |
| 가로 스크롤 | 없다 (`scrollWidth == clientWidth`) |

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/layout/AppShell.jsx frontend/src/components/layout/SidebarNav.jsx frontend/src/components/layout/Topbar.jsx
git commit -m "fix: let the document scroll so admin list cards are not clipped"
```

---

### Task 2: 페이지네이션 순수 함수와 공용 UI

**Files:**
- Create: `frontend/src/utils/pagination.js`
- Create: `frontend/src/utils/pagination.test.js`
- Create: `frontend/src/components/ui/Pagination.jsx`

**Interfaces:**
- Consumes: 없음
- Produces:
  - `PAGE_SIZE` (= 20)
  - `pageCount(totalCount, size)` → `number` (0건이면 1)
  - `clampPage(page, totalCount, size)` → `number` (범위를 벗어나면 마지막/첫 페이지로)
  - `pageSlice(items, page, size)` → `Array` (클라이언트 페이징용)
  - `pageRange(page, totalCount, size)` → `{ from, to }` (1-기반 표시용, 0건이면 `{from:0,to:0}`)
  - `<Pagination page totalCount size onChange />`

  Task 3·4가 모두 이 이름들을 쓴다.

- [ ] **Step 1: 실패하는 테스트를 작성한다**

`frontend/src/utils/pagination.test.js`:

```javascript
import { test } from "node:test";
import assert from "node:assert/strict";
import { PAGE_SIZE, clampPage, pageCount, pageRange, pageSlice } from "./pagination.js";

test("page size is 20", () => {
  assert.equal(PAGE_SIZE, 20);
});

test("pageCount rounds up and never returns zero", () => {
  assert.equal(pageCount(0, 20), 1, "빈 목록도 1페이지로 센다");
  assert.equal(pageCount(1, 20), 1);
  assert.equal(pageCount(20, 20), 1);
  assert.equal(pageCount(21, 20), 2);
  assert.equal(pageCount(653, 20), 33);
});

test("pageSlice returns the requested page", () => {
  const items = Array.from({ length: 25 }, (_, i) => i + 1);
  assert.deepEqual(pageSlice(items, 1, 20)[0], 1);
  assert.equal(pageSlice(items, 1, 20).length, 20);
  assert.deepEqual(pageSlice(items, 2, 20), [21, 22, 23, 24, 25]);
});

// 마지막 페이지에서 항목을 지우면 페이지 수가 줄어 현재 페이지가 범위를 벗어난다.
// 그대로 두면 빈 화면이 보이므로 마지막 페이지로 당긴다.
test("clampPage pulls an out-of-range page back into range", () => {
  assert.equal(clampPage(5, 25, 20), 2);
  assert.equal(clampPage(0, 25, 20), 1);
  assert.equal(clampPage(-3, 25, 20), 1);
  assert.equal(clampPage(1, 0, 20), 1);
});

test("pageRange reports the 1-based item range on the current page", () => {
  assert.deepEqual(pageRange(1, 25, 20), { from: 1, to: 20 });
  assert.deepEqual(pageRange(2, 25, 20), { from: 21, to: 25 });
  assert.deepEqual(pageRange(1, 0, 20), { from: 0, to: 0 }, "빈 목록은 0으로 표기한다");
});
```

- [ ] **Step 2: 실패를 확인한다 (RED)**

Run: `cd frontend && node --test src/utils/pagination.test.js`
Expected: `ERR_MODULE_NOT_FOUND` — `pagination.js`가 없다.

- [ ] **Step 3: 구현한다**

`frontend/src/utils/pagination.js`:

```javascript
/**
 * 목록 페이지네이션 계산. 화면(React)과 분리해 두는 이유는 이 프로젝트에 jsdom 이 없어
 * 컴포넌트 렌더링을 테스트할 수 없기 때문이다 — 계산만이라도 단위 테스트로 고정한다.
 *
 * 부서·계정 목록은 pageSlice 로 클라이언트에서 자르고, 문제 목록은 서버가 이미 잘라 주므로
 * pageCount/pageRange 만 쓴다.
 */
export const PAGE_SIZE = 20;

export function pageCount(totalCount, size = PAGE_SIZE) {
  return Math.max(1, Math.ceil((totalCount || 0) / size));
}

/** 범위를 벗어난 페이지 번호를 유효 범위로 당긴다(항목 삭제로 페이지가 줄어든 경우). */
export function clampPage(page, totalCount, size = PAGE_SIZE) {
  const last = pageCount(totalCount, size);
  if (!Number.isFinite(page) || page < 1) {
    return 1;
  }
  return Math.min(page, last);
}

export function pageSlice(items, page, size = PAGE_SIZE) {
  const start = (clampPage(page, items.length, size) - 1) * size;
  return items.slice(start, start + size);
}

/** "N–M / 전체 T건" 표기에 쓰는 1-기반 범위. 빈 목록은 0–0. */
export function pageRange(page, totalCount, size = PAGE_SIZE) {
  if (!totalCount) {
    return { from: 0, to: 0 };
  }
  const current = clampPage(page, totalCount, size);
  const from = (current - 1) * size + 1;
  return { from, to: Math.min(current * size, totalCount) };
}
```

- [ ] **Step 4: 통과를 확인한다 (GREEN)**

Run: `cd frontend && node --test src/utils/pagination.test.js`
Expected: 5건 전부 통과.

- [ ] **Step 5: 공용 UI 컴포넌트를 만든다**

`frontend/src/components/ui/Pagination.jsx`:

```jsx
import { CaretLeft, CaretRight } from "@phosphor-icons/react";
import { buttonClass } from "@/utils/buttonClass.js";
import { PAGE_SIZE, pageCount, pageRange } from "@/utils/pagination.js";

/**
 * 목록 하단 페이지 이동. 페이지가 1개뿐이면 아무것도 그리지 않는다 — 8행짜리 목록에
 * 의미 없는 컨트롤이 남지 않게 한다.
 */
export default function Pagination({ page, totalCount, size = PAGE_SIZE, onChange }) {
  const last = pageCount(totalCount, size);
  if (last <= 1) {
    return null;
  }
  const { from, to } = pageRange(page, totalCount, size);
  return (
    <nav className="mt-4 flex items-center justify-between" aria-label="페이지 이동">
      <p className="text-body-small text-ink-muted">
        {from}–{to} / 전체 {totalCount}건
      </p>
      <div className="flex items-center gap-2">
        <button
          type="button"
          className={buttonClass({ variant: "secondary", size: "sm" })}
          disabled={page <= 1}
          onClick={() => onChange(page - 1)}
        >
          <CaretLeft size={14} aria-hidden="true" />
          이전
        </button>
        <span className="text-body-small text-ink-default" aria-current="page">
          {page} / {last}
        </span>
        <button
          type="button"
          className={buttonClass({ variant: "secondary", size: "sm" })}
          disabled={page >= last}
          onClick={() => onChange(page + 1)}
        >
          다음
          <CaretRight size={14} aria-hidden="true" />
        </button>
      </div>
    </nav>
  );
}
```

> `buttonClass`를 쓰는 이유: `<button disabled>`에 `Button` 컴포넌트를 쓰면 `loading` 처리와 겹치고, QA D6에서 확인했듯 스타일 문자열을 손으로 복제하면 포커스 링을 빠뜨린다.

- [ ] **Step 6: 전체 테스트와 빌드**

Run: `cd frontend && npm test`
Expected: 184 → 189 통과.

Run: `cd frontend && rtk proxy npm run build`
Expected: 빌드 성공.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/utils/pagination.js frontend/src/utils/pagination.test.js frontend/src/components/ui/Pagination.jsx
git commit -m "feat: add pagination helpers and the shared pagination control"
```

---

### Task 3: 부서·계정 목록 클라이언트 페이징

**Files:**
- Modify: `frontend/src/pages/admin/departments/DepartmentListPage.jsx`
- Modify: `frontend/src/pages/admin/users/UserListPage.jsx`

**Interfaces:**
- Consumes: Task 2의 `PAGE_SIZE`·`clampPage`·`pageSlice`, `<Pagination />`
- Produces: 없음 (최종 화면).

**배경:** 두 화면 모두 전체 목록을 받아 `useMemo`로 필터링한다(`filteredDepartments`, `filteredUsers`). 그 결과를 표에 넘기기 직전에 자르면 된다.

**API 응답 형태는 건드리지 않는다.** `GET /api/admin/departments`는 계정 폼·엑셀 업로드·부서 이동의 부서 Select 데이터 소스이기도 해서, 서버가 잘라 주면 그 Select들이 첫 페이지 부서만 보게 된다.

- [ ] **Step 1: 부서 목록에 페이징을 넣는다**

`DepartmentListPage.jsx`에 import를 추가한다.

```javascript
import Pagination from "@/components/ui/Pagination.jsx";
import { PAGE_SIZE, clampPage, pageSlice } from "@/utils/pagination.js";
```

`filteredDepartments`를 만드는 `useMemo` 아래에 추가한다.

```javascript
  const [page, setPage] = useState(1);

  // 필터를 바꾸면 결과 수가 달라져 현재 페이지가 범위를 벗어날 수 있다. 그대로 두면 빈 표가
  // 보이므로 유효 범위로 당긴다.
  const currentPage = clampPage(page, filteredDepartments.length, PAGE_SIZE);
  const pagedDepartments = useMemo(
    () => pageSlice(filteredDepartments, currentPage, PAGE_SIZE),
    [filteredDepartments, currentPage],
  );
```

`DataTable` 안의 행 렌더링(`DepartmentListPage.jsx:233`)에서 소스만 바꾼다.

```jsx
          {pagedDepartments.map((department) => (
```

**`ListStateSurface`의 `isEmpty`(`:218`)는 `filteredDepartments.length === 0`을 그대로 둔다.** 페이지에 항목이 없는 것과 목록 자체가 비어 있는 것은 다르다 — `pagedDepartments`로 바꾸면 마지막 페이지를 지웠을 때 "등록된 부서가 없습니다"가 잘못 뜬다.

표(`ListStateSurface` 또는 `DataTable`) 바로 아래에 추가한다.

```jsx
      <Pagination
        page={currentPage}
        totalCount={filteredDepartments.length}
        onChange={setPage}
      />
```

- [ ] **Step 2: 계정 목록에 같은 방식을 적용한다**

`UserListPage.jsx`에 같은 import를 넣고, `filteredUsers` 아래에 같은 형태로 `page`·`currentPage`·`pagedUsers`를 만든 뒤 표 데이터와 `<Pagination />`을 연결한다. 변수 이름만 다르고 구조는 동일하다.

```javascript
  const [page, setPage] = useState(1);
  const currentPage = clampPage(page, filteredUsers.length, PAGE_SIZE);
  const pagedUsers = useMemo(
    () => pageSlice(filteredUsers, currentPage, PAGE_SIZE),
    [filteredUsers, currentPage],
  );
```

- [ ] **Step 3: 테스트와 빌드**

Run: `cd frontend && npm test`
Expected: 189 통과 (이 Task 는 배선이라 신규 테스트가 없다 — 계산은 Task 2에서 고정했다).

Run: `cd frontend && rtk proxy npm run build`
Expected: 빌드 성공.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/admin/departments/DepartmentListPage.jsx frontend/src/pages/admin/users/UserListPage.jsx
git commit -m "feat: paginate the department and account lists on the client"
```

---

### Task 4: 문제 목록 서버 페이징

**Files:**
- Modify: `backend/src/main/resources/mappers/probank/ProblemMapper.xml`
- Modify: `backend/src/main/java/com/daeryun/probank/dao/ProblemDao.java`
- Create: `backend/src/main/java/com/daeryun/probank/dto/problem/ProblemPageResponse.java`
- Modify: `backend/src/main/java/com/daeryun/probank/service/ProblemService.java` · `ProblemServiceImpl.java`
- Modify: `backend/src/main/java/com/daeryun/probank/controller/ProblemController.java`
- Modify: `backend/src/test/java/com/daeryun/probank/service/ProblemServiceImplTest.java`
- Modify: `backend/src/test/java/com/daeryun/probank/dao/ProblemDaoTest.java`
- Modify: `frontend/src/api/problems.js` · `frontend/src/pages/admin/problems/ProblemListPage.jsx`

**Interfaces:**
- Consumes: `ProblemDao.findAll(...)`(Plan 3 Task 1)
- Produces:
  - `ProblemDao.findAll(..., int limit, int offset)` · `ProblemDao.countAll(...)`
  - `ProblemService.list(...)` → `ProblemPageResponse { List<ProblemListItem> items; long totalCount; int page; int size; }`
  - `GET /api/admin/problems?page=&size=` — 응답 `data`가 배열에서 객체로 바뀐다

**배경:** 이 Task는 **응답 형태를 바꾸는 파괴적 변경**이다. `data`가 배열에서 객체가 되므로 프론트엔드를 같은 커밋에서 함께 고쳐야 한다. 기존 테스트 중 `service.list(...)`의 반환을 `List`로 받는 것들도 전부 바뀐다.

`page`·`size`는 **선택 파라미터로 두고 기본값 1·20을 서버가 채운다.** 그래야 기존 호출(파라미터 없음)이 500으로 깨지지 않고 첫 페이지를 돌려준다.

- [ ] **Step 1: 실패하는 DAO 테스트를 추가한다**

`ProblemDaoTest.java`에 추가한다. 이 클래스는 실제 DB를 쓰고 `@Transactional`로 롤백한다.

```java
    @Test
    void findAll_appliesLimitAndOffset() {
        Department department = createDepartment();
        User author = createAuthor(department.getId());
        for (int i = 0; i < 3; i++) {
            createProblem(department.getId(), author.getId(), "페이징 " + i);
        }

        List<ProblemListItem> firstPage = problemDao.findAll(department.getId(), null, null, null, null, null, null, 2, 0);
        List<ProblemListItem> secondPage = problemDao.findAll(department.getId(), null, null, null, null, null, null, 2, 2);

        assertEquals(2, firstPage.size());
        assertEquals(1, secondPage.size());
        assertEquals(3L, problemDao.countAll(department.getId(), null, null, null, null, null, null));
    }
```

> 헬퍼 이름은 `ProblemDaoTest`에 이미 있는 것을 그대로 썼다: `createDepartment()`, `createAuthor(Long departmentId)`, `createProblem(Long departmentId, Long createdBy, String content)`. 새로 만들지 않는다.

- [ ] **Step 2: 실패를 확인한다 (RED)**

Run: `cd backend && rtk proxy ./gradlew test --tests "com.daeryun.probank.dao.ProblemDaoTest" --console=plain`
Expected: **컴파일 실패** — `findAll`이 9인자를 받지 않고 `countAll`이 없다.

- [ ] **Step 3: 매퍼와 DAO 를 고친다**

**(a) 필터 조건을 `<sql>`로 뽑는다.** `findAll`의 `<where>` 블록(`ProblemMapper.xml:44-52`)을 그대로 잘라 낸다.

```xml
    <sql id="problemFilter">
        <where>
            <if test="departmentId != null">AND p.department_id = #{departmentId}</if>
            <if test="type != null">AND p.type = #{type}</if>
            <if test="status != null">AND p.status = #{status}</if>
            <if test="createdFrom != null">AND p.created_at &gt;= #{createdFrom}</if>
            <if test="createdTo != null">AND p.created_at &lt; (#{createdTo} + INTERVAL '1 day')</if>
            <if test="tag != null and tag != ''">AND EXISTS (SELECT 1 FROM problem_tags fpt JOIN tags ft ON ft.id = fpt.tag_id WHERE fpt.problem_id = p.id AND lower(ft.name) = lower(#{tag}))</if>
            <if test="keyword != null and keyword != ''">AND p.content ILIKE CONCAT('%', #{keyword}, '%')</if>
        </where>
    </sql>
```

`findAll`의 `<where>` 자리에 `<include refid="problemFilter"/>`를 넣는다. **조건이 두 벌로 갈라지면 목록과 총건수가 다른 기준으로 계산돼 마지막 페이지가 비는 버그가 난다.**

**(b) 정렬을 결정적으로 만들고 LIMIT/OFFSET 을 붙인다.**

```xml
        GROUP BY p.id, d.name
        ORDER BY p.created_at DESC, p.id DESC
        LIMIT #{limit} OFFSET #{offset}
```

> ⚠️ **`p.id DESC` 타이브레이커가 반드시 필요하다.** `created_at`만으로는 전순서가 아니다. 엑셀 업로드는 짧은 시간에 수십~수백 행을 넣으므로 같은 타임스탬프가 생길 수 있고, **정렬이 결정적이지 않으면 LIMIT/OFFSET 페이징에서 어떤 문제는 두 페이지에 나오고 어떤 문제는 어느 페이지에도 안 나온다.** PK 를 마지막 정렬 키로 두면 전순서가 보장된다.

**(c) `countAll` 을 추가한다.**

```xml
    <select id="countAll" resultType="long">
        SELECT count(*)
        FROM problems p
        JOIN departments d ON d.id = p.department_id
        <include refid="problemFilter"/>
    </select>
```

> **태그 LEFT JOIN 을 넣지 않는 것이 핵심이다.** 필터 조건은 `p.*` 와 상관 서브쿼리(EXISTS)만 참조하므로 태그 조인이 필요 없다. 조인을 빼면 문제 1건당 정확히 1행이라 `count(*)` 가 그대로 정답이다(`departments` 는 `NOT NULL` FK 에 대한 1:1 조인이라 행 수를 바꾸지 않는다). 반대로 `findAll` 처럼 태그를 LEFT JOIN 한 채 `count(*)` 를 쓰면 태그 개수만큼 부풀어 **총건수가 틀린다** — 그때는 `count(DISTINCT p.id)` 가 필요하다. 조인을 빼는 쪽이 더 단순하고 빠르다.

**(d) DAO 시그니처.** `findAll` 에 `@Param("limit") int limit, @Param("offset") int offset` 을 추가하고, `countAll` 을 **동일한 7개 필터 파라미터**로 선언한다(반환 `long`).

- [ ] **Step 4: 통과를 확인한다 (GREEN)**

Run: `cd backend && rtk proxy ./gradlew test --tests "com.daeryun.probank.dao.ProblemDaoTest" --console=plain`
Expected: `BUILD SUCCESSFUL`

- [ ] **Step 5: 응답 DTO 와 서비스를 바꾼다**

`ProblemPageResponse.java`:

```java
package com.daeryun.probank.dto.problem;

import lombok.AllArgsConstructor;
import lombok.Data;

import java.util.List;

/** 문제 목록 한 페이지. totalCount 는 필터를 적용한 전체 건수다(페이지 건수가 아니다). */
@Data
@AllArgsConstructor
public class ProblemPageResponse {
    private List<ProblemListItem> items;
    private long totalCount;
    private int page;
    private int size;
}
```

`ProblemService.list(...)`의 반환을 `ProblemPageResponse`로 바꾸고 `int page, int size` 파라미터를 추가한다. `ProblemServiceImpl`은 기존 부서 스코프 규칙(`SUPER_ADMIN`만 요청 `departmentId` 사용)을 그대로 두고, 마지막에 `countAll`과 `findAll`을 함께 호출해 감싼다.

```java
        int safeSize = size <= 0 ? 20 : Math.min(size, 100);
        int safePage = Math.max(page, 1);
        long total = problemDao.countAll(effectiveDepartmentId, type, status, createdFrom, createdTo, tag, keyword);
        List<ProblemListItem> items = problemDao.findAll(effectiveDepartmentId, type, status, createdFrom,
                createdTo, tag, keyword, safeSize, (safePage - 1) * safeSize);
        return new ProblemPageResponse(items, total, safePage, safeSize);
```

> `size` 상한 100은 방어다. 클라이언트가 `size=100000`을 보내면 페이징이 없는 것과 같아진다.

- [ ] **Step 6: 컨트롤러에 파라미터를 추가한다**

```java
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "20") int size,
```

`problemService.list(...)` 호출에 `page, size`를 넘긴다.

- [ ] **Step 7: 기존 서비스 테스트를 새 반환 타입에 맞춘다**

`ProblemServiceImplTest`에서 `service.list(...)`의 반환을 쓰는 테스트를 모두 고친다. `problemDao.countAll(...)` 스텁도 필요하다(스텁하지 않으면 `0L`이 돌아온다 — 부서 스코프 검증에는 영향이 없다).

```java
        Mockito.when(problemDao.countAll(Mockito.any(), Mockito.any(), Mockito.any(), Mockito.any(),
                Mockito.any(), Mockito.any(), Mockito.any())).thenReturn(0L);
```

**부서 스코프 검증(`SUPER_ADMIN`만 요청 `departmentId` 사용)은 반드시 유지한다.** Plan 3 QA §2가 10/10 통과시킨 규칙이라 여기서 깨지면 안 된다.

- [ ] **Step 8: 백엔드 전체 스위트**

Run: `cd backend && rtk proxy ./gradlew test --console=plain`
Expected: `BUILD SUCCESSFUL`, 204 → 205.

- [ ] **Step 9: 프론트엔드를 새 응답에 맞춘다**

`frontend/src/api/problems.js`:

```javascript
export function listProblems(params = {}) {
  const query = new URLSearchParams(
    Object.entries(params).filter(([, value]) => value !== undefined && value !== "")
  ).toString();
  return apiGet(`/api/admin/problems${query ? `?${query}` : ""}`);
}
```

호출부가 `params`에 `page`·`size`를 담아 보내므로 이 함수는 그대로 둔다.

`ProblemListPage.jsx`:

```javascript
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

  async function refresh(nextFilters = filters, nextPage = page) {
    setLoading(true);
    setLoadError(null);
    try {
      const result = await listProblems({
        ...buildProblemListParams(nextFilters),
        page: nextPage,
        size: PAGE_SIZE,
      });
      setProblems(result.items);
      setTotalCount(result.totalCount);
      setPage(result.page);
    } catch (error) {
      const message = resolveErrorMessage(error, "문제 목록을 불러오지 못했습니다.");
      setLoadError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }
```

- 조회·초기화는 `refresh(filters, 1)`로 **1페이지부터** 다시 부른다. 필터를 바꾸고 3페이지에 머무르면 빈 화면이 된다.
- 보관 처리 후 `refresh()`는 현재 페이지를 유지한다.
- "전체 N건" 표기는 `totalCount`를 쓴다.
- 표 아래에 `<Pagination page={page} totalCount={totalCount} onChange={(next) => refresh(filters, next)} />`를 둔다.

- [ ] **Step 10: 프론트엔드 테스트와 빌드**

Run: `cd frontend && npm test`
Expected: 189 통과.

Run: `cd frontend && rtk proxy npm run build`
Expected: 빌드 성공.

- [ ] **Step 11: Commit**

```bash
git add backend/src/main/resources/mappers/probank/ProblemMapper.xml backend/src/main/java/com/daeryun/probank/dao/ProblemDao.java backend/src/main/java/com/daeryun/probank/dto/problem/ProblemPageResponse.java backend/src/main/java/com/daeryun/probank/service/ProblemService.java backend/src/main/java/com/daeryun/probank/service/ProblemServiceImpl.java backend/src/main/java/com/daeryun/probank/controller/ProblemController.java backend/src/test frontend/src/pages/admin/problems/ProblemListPage.jsx
git commit -m "feat: paginate the problem list on the server"
```

---

### Task 5: 브라우저 검증

**Files:**
- Modify: `docs/qa/2026-08-09-question-bank-upload-result.md` (F1 해소 기록)

**Interfaces:**
- Consumes: Task 1~4
- Produces: 갱신된 QA 문서

**배경:** 이번 작업의 절반(셸 레이아웃)은 단위 테스트로 덮이지 않는다. 앞선 회차에서 **프로덕션 빌드와 184개 테스트가 모두 통과한 상태로 훅 순서 위반과 CORS 거부를 놓쳤다.** 이 Task 를 건너뛰면 같은 일이 반복된다.

백엔드를 재기동해야 Task 4의 변경이 반영된다.

- [ ] **Step 1: 잘림 해소 확인**

창 높이 **720·800·900·1024** × 화면 3종(`/admin/departments`·`/admin/users`·`/admin/problems`)에서 확인한다.

| 확인 | 기대 |
|---|---|
| `document.documentElement.scrollHeight > clientHeight` | 문서가 스크롤한다 |
| 끝까지 스크롤 후 카드 하단 | 둥근 테두리가 보이고 잘리지 않는다 |
| Sidebar·Topbar | 스크롤해도 화면에 남는다 |
| 가로 스크롤 | 없다 |

- [ ] **Step 2: 페이지네이션 동작 확인**

| 확인 | 기대 |
|---|---|
| 문제 목록 | 20건만 표시, "1–20 / 전체 119건", 페이지 `1 / 6` |
| 다음/이전 | 페이지가 바뀌고 첫 페이지에서 "이전", 마지막에서 "다음"이 disabled |
| 필터 후 조회 | **1페이지부터** 다시 시작 |
| 1→2→3페이지 이동 | 중복·누락 없이 이어진다. `SELECT id FROM problems ORDER BY created_at DESC, id DESC` 결과와 화면 순서를 대조한다 |
| 부서·계정 목록 | 8건·7건이라 페이지가 1개 → **컨트롤이 아예 보이지 않는다** |
| 빈 결과 | "조건에 맞는 …이 없습니다" 안내가 그대로 나오고 컨트롤이 없다 |

- [ ] **Step 3: 모달이 Topbar 에 가리지 않는지 확인**

부서 목록에서 "수정"을 눌러 모달을 연다. Topbar 에 `z-20`을 걸었으므로 모달이 그보다 위에 와야 한다.

기대: 모달과 배경 오버레이가 Topbar 를 덮는다.

- [ ] **Step 4: 결과를 문서에 반영한다**

`docs/qa/2026-08-09-question-bank-upload-result.md`의 F1 항목을 해소로 갱신하고, 잘림 문제와 그 원인·수정을 함께 기록한다.

- [ ] **Step 5: Commit**

```bash
git add docs/qa/2026-08-09-question-bank-upload-result.md
git commit -m "docs: verify the admin list scroll fix and pagination"
```

---

## 완료 기준

- [ ] 창 높이 720~1024 어디서도 세 목록 화면의 카드가 잘리지 않는다
- [ ] Sidebar·Topbar 가 스크롤 중에도 화면에 남는다
- [ ] 문제 목록이 20건 단위로 페이징되고 총건수가 정확하다
- [ ] 필터를 바꾸면 1페이지부터 다시 조회한다
- [ ] 부서·계정 목록은 페이지가 1개일 때 컨트롤을 그리지 않는다
- [ ] **부서 Select(계정 폼·엑셀 업로드·부서 이동)가 여전히 전체 부서를 보여 준다** — 부서 목록 API 를 서버 페이징하지 않은 이유
- [ ] **페이지를 오가도 같은 문제가 두 번 나오거나 빠지지 않는다** — `ORDER BY p.created_at DESC, p.id DESC` 타이브레이커 확인
- [ ] 마지막 페이지에서 항목을 보관 처리해도 빈 표가 아니라 유효한 페이지가 보인다 (`clampPage`)
- [ ] 백엔드 204 → **205**, 프론트엔드 184 → **189** 전부 통과, 빌드 성공
