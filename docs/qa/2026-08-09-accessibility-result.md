# QA 실행 결과 — 접근성 회차 (Plan 3 §11)

- **대상 체크리스트:** [`2026-08-07-plan3-qa-checklist.md`](2026-08-07-plan3-qa-checklist.md) §11 (P2 디자인 시스템/접근성) 12항목
- **기준 문서:** [`2026-07-29-blue-bento-design-system.md`](../superpowers/specs/2026-07-29-blue-bento-design-system.md)
- **대상 커밋:** `679ba34` (master, Plan 3 QA 결함 수정분 병합 후)
- **실행일:** 2026-08-09
- **실행 방식:** Vibescraper(실제 Chrome 원격 제어) + DOM/CSSOM 직접 조회 + 소스 정적 스캔
- **환경:** 프론트 `localhost:5173`, 백엔드 `localhost:8080`, DB `localhost:5434`, 계정 `admin`(SUPER_ADMIN)
- **브라우저 배율:** `devicePixelRatio=1`, `visualViewport.scale=1` — 확대 항목(11.11)은 뷰포트 폭 축소로 재현했다

> 이 회차를 별도로 연 이유: Plan 3 QA 결과 문서가 *"§11 접근성은 하나도 실행하지 못했다"* 고 스스로 적었고, Plan 1·2 체크리스트의 P2 접근성 항목도 미실행 상태였다. **두 Plan 연속으로 한 번도 검증되지 않은 영역이다.**

## 결과 요약

| 구분 | 수 |
|---|---|
| 실행 항목 | **12 / 12** |
| 통과 | 10 |
| **실패** | **2** |

| ID | 심각도 | 요약 |
|---|---|---|
| [D5](2026-08-07-plan3-defects.md#d5) | **Major** | 브라우저 200% 확대 시 관리 화면에서 튕겨나간다 |
| [D6](2026-08-07-plan3-defects.md#d6) | Minor | 문제 목록 "수정" 링크와 정답 라디오에 포커스 표시가 없다 |

---

## 항목별 결과

| # | 항목 | 결과 | 확인 내용 |
|---|---|---|---|
| 11.1 | PC 기준 레이아웃 | ✅ | 1440×1024에서 `/admin/problems`·`/new`·`/excel-upload`·`/departments`·`/users` 5개 화면 모두 `scrollWidth == clientWidth == 1440` (가로 스크롤 없음) |
| 11.2 | 모바일 차단 | ✅ | 390×844에서 `/admin/problems` → `/solve` |
| 11.3 | 모바일 경계값 | ✅ | 767px → `/solve`, 768px → `/admin/problems` 유지. 경계가 정확히 768px |
| 11.4 | 토큰 사용 | ✅ | `frontend/src` 전체에서 임의 Tailwind 팔레트 색상(`text-gray-500` 등) 사용 파일은 `components/ui/Loader.jsx` **한 곳뿐**이며, 이는 Plan 1 코드의 기존 인지 항목이다. **Plan 3 화면에는 없다** |
| 11.5 | 키보드 순회 | ✅ | Tab만으로 사이드바 6개 → 로그아웃 → 문제 등록 → 검색·유형·상태·조회·상세 필터 → 표 행 액션 순. 체크리스트가 요구한 순서와 일치하고 배경으로 새지 않음 |
| 11.6 | 포커스 표시 | ❌ | **D6** — 아래 별도 절 |
| 11.7 | 폼 라벨 연결 | ✅ | 등록 폼의 표시된 입력 9개 전부 라벨 연결(`label[for]` 6 · 감싸는 `<label>` 2 · `aria-label` 1). 연결 없는 입력 0건 |
| 11.8 | 오류 안내 | ✅ | 빈 폼 제출 시 `problem-content-error` 인라인 표시 + 해당 필드에 `aria-invalid="true"`·`aria-describedby` 연결 + `role="alert"`/`aria-live="polite"` 토스트로 스크린리더 안내 |
| 11.9 | 표 헤더 | ✅ | 문제 목록 `<th scope="col">` 6개 전부. 표에 `aria-label="문제 목록"` |
| 11.10 | 색상 단독 의존 금지 | ✅ | 상태 배지가 "활성"/"보관됨" **텍스트를 포함**하고, 색 점은 `aria-hidden="true"`로 접근성 트리에서 제외 |
| 11.11 | 확대 200% | ❌ | **D5** — 아래 별도 절 |
| 11.12 | 1200px 미만 | ✅ | 768·900·1024·1199px 모두 `scrollWidth == clientWidth` (가로 스크롤 없음) |

### 부수 확인 — 디자인 시스템 Shell 치수

Plan 1·2 체크리스트 §9.1과 같은 항목이라 함께 측정했다. **전부 명세와 일치한다.**

| 요소 | 명세 | 실측 |
|---|---|---|
| Sidebar 폭 | 220px | **220px** |
| Topbar 높이 | 76px | **76px** |
| PageContent 좌우 여백 | 28px | **28px** (`px-7`) |
| PageContent 최대 폭 | 1440px | **1440px** (`max-w-[1440px]`) |

---

## D5. (Major) 브라우저 200% 확대 시 관리 화면에서 튕겨나간다

1440px 디스플레이에서 브라우저를 200%로 확대하면 CSS 뷰포트가 720px가 되어 **768px 모바일 차단 가드에 걸리고, 관리자가 `/solve`로 리다이렉트된다.** 저시력 사용자는 관리 화면을 아예 쓸 수 없다.

| 확대율 | CSS 뷰포트 | 결과 |
|---|---|---|
| 100% | 1440px | `/admin/problems` ✅ |
| 150% | 960px | `/admin/problems` ✅ |
| 175% | 823px | `/admin/problems` ✅ |
| **200%** | **720px** | **`/solve` ❌ 관리 화면 이탈** |

WCAG 2.1 SC 1.4.4(Resize text)는 200%까지 콘텐츠가 사용 가능할 것을 요구한다. 이 화면은 그 지점에서 콘텐츠가 아니라 **경로 자체가 바뀐다.**

### 성격 — 설계 충돌이지 단순 버그가 아니다

PRD 섹션 3.2와 7은 *"모바일 뷰포트에서는 관리자 화면 접근 자체를 차단"* 을 명시적으로 요구하고, 그 판별을 **뷰포트 너비**로 하도록 정했다. 확대와 작은 화면은 뷰포트 너비만으로는 구분되지 않는다. 따라서 이건 가드가 오작동한 것이 아니라 **"작은 뷰포트 = 모바일 기기"라는 전제가 확대 사용자를 삼킨 것**이다.

넓은 모니터에서는 드러나지 않는다는 점도 기록해 둔다 — 2560px 디스플레이에서 200%는 CSS 1280px라 통과한다. **체크리스트가 기준으로 삼은 1440×1024에서 재현된다.**

### 판단 필요

수정 방향은 제품 결정이 필요하다.

1. 임계값을 낮춘다(예: 640px) — 확대를 살리되 PRD의 모바일 차단 폭이 좁아진다
2. `pointer: coarse` 등 기기 특성 미디어 쿼리를 함께 본다 — 확대와 실제 모바일을 구분할 수 있으나 판별 규칙이 복잡해진다
3. 현 동작을 의도로 확정하고 문서화한다 — 접근성 부채를 명시적으로 수용

---

## D6. (Minor) 일부 인터랙티브 요소에 포커스 표시가 없다

디자인 시스템은 모든 인터랙티브 요소에 **3px Aqua 아웃라인(2px offset)** 을 요구한다. 화면별로 포커스 유틸리티 클래스 보유 여부를 전수 조사했다.

| 화면 | 포커스 스타일 없는 요소 | 대상 |
|---|---|---|
| `/admin/problems` | **13 / 39** | "수정" 링크 (표 행마다 1개) |
| `/admin/problems/new` | **2 / 21** | 정답 선택 라디오 2개 |
| `/admin/departments` | 0 / 28 | — |
| `/admin/users` | 0 / 29 | — |

**Plan 1·2 화면은 깨끗하고 Plan 3 화면에서만 나온다.** 해당 요소들은 브라우저 기본 포커스 링(`outline-style: auto`)에 의존하는데, 이는 디자인 시스템 명세와 다르고 배경색에 따라 잘 보이지 않을 수 있다.

```
문제 목록 "수정" 링크 클래스 (focus-visible 유틸리티 없음)
  inline-flex h-8 items-center rounded-sm border border-line-strong px-3
  text-[11px] font-semibold text-action-secondary-text hover:bg-surface-subtle

같은 행 "보관" 버튼 (정상)
  … focus-visible:outline focus-visible:outline-[3px]
    focus-visible:outline-offset-2 focus-visible:outline-brand
```

### 함께 관찰된 것 — 사이드바 링크의 아웃라인 색상

사이드바 링크는 `focus-visible:outline-brand-aqua` 클래스를 갖고 있고 해당 CSS 규칙(`outline-color: var(--color-brand-aqua)`)도 스타일시트에 존재하며 `--color-brand-aqua`(#00B4E3)도 정의돼 있다. 그런데 키보드 포커스 시 **실제 계산된 `outline-color`가 Aqua가 아니라 글자색(currentColor)** 이다.

| 요소 | `:focus-visible` 매치 | 계산된 outline-color |
|---|---|---|
| 사이드바 "부서 관리" | true | `rgb(117,132,154)` = 글자색 ❌ |
| 검색 input | true | `rgb(0,180,227)` = Aqua ✅ |
| 로그아웃 버튼 | true | `rgb(0,180,227)` = Aqua ✅ |

폭(3px 선언)과 offset(2px)은 정상 적용된다. **색상만 적용되지 않는 이유는 이번 회차에서 규명하지 못했다** — 캐스케이드 문제로 보이나 확인이 필요하다. 아웃라인 자체는 보이므로 D6 본체보다 경미하다.

---

## 남은 것

이번 회차는 Plan 3 §11만 다뤘다. Plan 1·2 체크리스트의 P2 항목 중 다음은 이번에 간접적으로 확인됐다.

| Plan 1·2 §9 항목 | 이번 회차 대응 |
|---|---|
| 9.1 Shell 치수 | ✅ 실측 일치 (위 표) |
| 9.7 키보드 순회 | ✅ 11.5와 동일 확인 |
| 9.8 포커스 표시 | ⚠️ Plan 1·2 화면(`/departments`·`/users`)은 누락 0건 |
| 9.9 표 헤더 | ✅ 11.9와 동일 확인 (계정 목록도 `<th scope>` 확인됨) |
| 9.10 색상 단독 의존 | ✅ 11.10과 동일 확인 |
| 9.11 확대 200% | ❌ **D5와 동일 — Plan 1·2 화면도 같이 튕긴다** |

미확인으로 남은 Plan 1·2 P2 항목: 9.2(Sidebar 밀도 수치), 9.3(활성 메뉴 인디케이터), 9.4(Topbar 프로필 구성), 9.5·9.6(메뉴 링크 유효성), 9.12(desktop-compact).
