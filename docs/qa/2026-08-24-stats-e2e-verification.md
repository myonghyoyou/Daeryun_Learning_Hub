# 서브플랜 6(통계·대시보드) E2E 검증 결과

- 검증일: 2026-08-24
- 대상: `GET /api/admin/stats/problems` · `/{id}` · `GET /api/admin/dashboard` + `GET /api/departments`
- 환경: 포트 프로덕션 빌드(`pnpm build && pnpm start`, 3220), DB `probank_dev`(Spring 실측과 **동일 DB**)
- 정답지: `docs/qa/2026-08-24-stats-parity-checklist.md` (65행)
- 스위트: **714 통과 / 61 파일**, `pnpm build` 성공, backend 301 유지

> **이 검증의 성격.** 앞의 서브플랜들은 오류 문구를 대조했지만 여기는 **집계**다. 틀려도 예외가
> 안 나고 화면에 그럴듯한 숫자가 뜬다. 그래서 정답지의 "실측 기록" 절에 적어 둔 **Spring 이
> 같은 DB 에서 낸 값**을 기대값으로 쓰고 숫자를 하나씩 맞췄다.

---

## 0. 헤드라인 — Spring 표면 31개가 전부 이관됐다

컨트롤러 애노테이션과 `app/api/**/route.ts` 의 export 를 파싱해 대조했다.

```
Spring 31개 / 포트 32개
Spring 에만 있는 것: 없음 — 전부 이관됐다
포트에만 있는 것: GET /api/problem-images/<id>   (승인된 이탈 ㉱ — 비공개 버킷 프록시)
```

**이 대조는 서브플랜 6이 처음 돌렸다.** 착수 전 검토에서 이걸 돌려 `GET /api/departments` 가
통째로 빠진 것을 찾았다(Spring 31 vs 포트 28) — 다섯 서브플랜 동안 아무도 안 한 검사다.
**다음 사람이 다시 짜지 않도록 스크립트를 §4 에 남긴다.**

---

## 1. 정답지 65행 대조 결과

| 절 | 행 | 실측 | 단위 테스트 대체 | 도달 불가 | 소스 확인 |
|---|--:|--:|--:|--:|--:|
| R 권한·스코프 | 8 | 7 | 1 (R8) | – | – |
| L 목록 | 17 | 15 | 2 (L9·L10) | – | – |
| D 상세 | 16 | 13 | 2 (D12·D13) | 1 (D6) | – |
| B 대시보드 | 16 | 15 | 1 (B9) | – | – |
| X 경계 | 8 | 5 | 2 (X1·X2) | – | 1 (X7) |
| **합계** | **65** | **55** | **8** | **1** | **1** |

**미대조 0행 · 파리티 위반 0건.**

### 실측한 값 — 25 + 28 = **53/53 통과**

#### R. 권한 (세 엔드포인트 전부)

| 확인 | 결과 |
|---|---|
| EMPLOYEE → 통계 목록·상세·대시보드 | 셋 다 **403 / 990** |
| 비로그인 → 셋 다 | **401 / 980** |
| SUPER_ADMIN → 셋 다 | 200 |
| DEPT_ADMIN 이 `?departmentId=862` 위조 (R5·R6) | `totalProblems` **62 → 62** (변화 없음) |
| 남의 부서 상세 (dev01 → 문제 1) | **403 / 990** (R7) |

**서브플랜 5의 풀이 라우트와 정반대다** — 거긴 역할 제한이 없었다. `requireActor()` 무인자
관용구를 복사해 왔다면 EMPLOYEE 에게 통계가 열렸을 자리다.

#### L. 목록 클램프·정렬·파라미터

| 입력 | 결과 |
|---|---|
| (기본) · `?size=0` · `?page=0` · `?page=-5` · `?page=` · `?size=` | 전부 `page=1 size=20` |
| `?size=1000` | `size=100` (상한) |
| `?page=abc` / `?size=1.5` / `?departmentId=abc` | 400 / 1000 / **`요청 값의 형식이 올바르지 않습니다: <이름>`** |
| `?status=BOGUS` | **200 / 0건** — 검증하지 않는다 (L17) |
| `totalCount` | **70** — 시도 44건에 부풀지 않았다 (L11) |
| `items[i]` | 키 **10개**, `problemId`(`id` 아님) (L14) |
| 정렬 | 오름차순 확인, **null 61건이 전부 맨 뒤** (L6·L7·L8) |

`?page=`·`?size=` 가 기본값으로 떨어지는 것은 **서브플랜 5의 `count` 와 다르다** — 거긴
필수 원시형이라 빈 문자열이 타입 불일치였다. 둘 다 Spring 실측으로 확인된 차이다.

#### D. 상세

| 확인 | 결과 |
|---|---|
| 없는 문제 | 400 / 1000 / **`존재하지 않는 문제입니다.`** — 서브플랜 5의 `존재하지 않거나 보관된 문제입니다.` 와 다르다 |
| 보관 문제(185) | **200**, `summary.status = ARCHIVED` (D2) |
| `/abc` | `요청 값의 형식이 올바르지 않습니다: id` |
| MCQ_SINGLE(1) | `choiceDistribution` 배열, `excludedAttempts` **3** |
| OX(19) | 배열, **2**. 분포가 `[1, 0]` — **아무도 안 고른 보기가 0회로 남는다**(D8) |
| SHORT_ANSWER(44) · FILL_BLANK(12) | 분포 **null**, `excludedAttempts` **0** (D7·D14) |
| 최상위 키 | 정확히 4개 |
| `recentWrongSamples[i]` | 정확히 `{submittedAnswer, submittedAt}` |

#### B. 대시보드 — Spring 값과 숫자까지 일치

| 지표 | Spring 실측 | 포트 |
|---|--:|--:|
| `totalProblems` (**활성만**) | 66 | **66** |
| `reviewNeededCount` | 3 | **3** |
| `totalAttempts` (**활성 + 보관**) | 44 | **44** |
| `totalCorrectAttempts` | 20 | **20** |
| `averageAccuracyRate` | 0.45454545454545453 | **동일** |
| `lowAccuracyProblems` | `[[184, ⅓], [1, 0.375], [44, 0.4]]` | **동일** |
| `recentProblems` | 5건, 보관 포함 | **동일** |

**두 가지가 이 표에서 증명된다.**

- **지표별 범위가 실제로 다르다.** 한 응답 안에서 `totalProblems` 66(활성만, 전체는 70)과
  `totalAttempts` 44(그중 1건은 ARCHIVED 문제의 시도)가 함께 나온다. 통일하면 화면 문구가
  거짓이 되고 **오류는 안 난다**.
- **`< 0.5` 경계가 실물 데이터로 확인된다.** 문제 6번은 ACTIVE·시도 8·정답 4로 **정확히 0.5**
  이고 다른 세 조건을 전부 만족하는데, `reviewNeededCount` 가 **4가 아니라 3**이다.
  `<=` 로 잘못 썼다면 이 하나가 조용히 늘었다.

그리고 **`problemId` vs `id` 비대칭**이 한 응답 안에서 확인됐다 — `lowAccuracyProblems[i]` 는
`problemId`, `recentProblems[i]` 는 `id` 를 쓴다(L14 vs B15). 화면도 둘 다 쓴다.

#### V. `GET /api/departments` — 서브플랜 5 누락분

| 확인 | 결과 |
|---|---|
| EMPLOYEE | **200** (역할 제한 없음) |
| 비로그인 | 401 / 980 |
| 응답 필드 | 정확히 `{id, name, code}` — `status`·`createdAt` 이 안 나간다 |
| 범위 | 활성 3건 (비활성 폐지팀 제외) |
| 대조: `/api/admin/departments` | **4건**, 키에 `status` 포함, EMPLOYEE 에게 **403/990** |

두 엔드포인트가 **다른 쿼리·다른 DTO·다른 권한**이라는 것이 나란히 확인됐다.

### 대체·도달 불가로 기록하는 행

| 행 | 사유 | 대체 |
|---|---|---|
| R8 | 존재 확인이 권한 검사보다 먼저인 것 — HTTP 로는 "없는 문제 + 남의 부서"를 한 번에 만들어야 하고, 그 조합의 응답이 단일 검사 결과와 구분되지 않는다 | `statsService.test.ts` 가 없는 id + 타부서 actor 로 고정 |
| L9·L10 | **승인된 이탈 ㉠ 으로 Java 의 서비스 재정렬을 뺐다.** 그 no-op 의 부재는 관측 불가다 | 정렬 규칙 셋을 `lib/db/stats.test.ts` 가 각각 고정(6행 정확 순서 · NULLIF · id 타이브레이커), `statsService.test.ts` 가 페이지 이어붙이기를 고정 |
| D6 | 집계 행이 없을 때의 합성 `summary`. `LEFT JOIN` 이라 항상 한 행이 나와 **HTTP 로 도달 불가** | — |
| D12 | `excludedAttempts` 가 **왜 필요한가**에 대한 서술 행. 동작이 아니다 | D11 이 값을 잰다 |
| D13 | `countAnalyzedAttempts` 의 SQL 형태. HTTP 로는 `excludedAttempts` 결과만 보인다 | DAO 테스트가 조인 조건과 `DISTINCT` 를 각각 고정 |
| B9 | `reviewNeededCount` = `needsReview` 통과 개수 | B8(같은 집합)이 관계를 고정 |
| X1·X2 | `null`(미응시) vs `0.0`(전부 오답). **현재 DB 에 0.0 인 문제가 없다** | 픽스처로 만들어 `stats.test.ts`·`statsService.test.ts`·`dashboardService.test.ts` 가 각각 고정 |
| X7 | `attempts` 47번(서브플랜 5가 남긴 고아 행)이 FILL_BLANK 라 분포 로직을 안 타고 `totalAttempts` 에는 포함된다 | 소스 확인 + FILL_BLANK 상세가 분포 null 인 것으로 관측 |

---

## 2. 이번 검증이 새로 찾은 것

### F1. `ORDER BY name` 의 결과는 **DB 콜레이션**이 정한다

`GET /api/departments` 가 `["본사", "개발팀", "영업팀"]` 을 냈다 — 한글 자모순이 아니다.

```
DB 콜레이션: en_US.utf8
ORDER BY name          -> 본사, 개발팀, 영업팀
ORDER BY name COLLATE "C" -> 개발팀, 본사, 영업팀
```

**파리티는 정확하다** — Spring 과 포트가 **같은 `ORDER BY name`** 을 같은 DB 에 던지므로
순서는 앱이 아니라 DB 것이다. 다만 이건 **커토버 항목**이다: 운영 Supabase 의 콜레이션이
다르면 부서 드롭다운과 **태그 목록**(`findAllTags`·`findInUseTags` 도 `ORDER BY name`) 순서가
함께 바뀐다. Spring 과 포트가 같이 바뀌므로 파리티 위반은 아니지만 **사용자에게 보이는 변화**다.
§3 의 D5 로 올린다.

---

## 3. 이관 전체 컷오버 통합 목록

> **여기가 유일한 목록이다.** 지금까지 컷오버 항목이 문서 5개에 흩어져 있었고 핸드오프 절은
> 서브플랜 4·5에만 있었다. 서브플랜 2·3의 항목은 정답지 표 안에만 있었다.
> **이 문서만 보고도 컷오버 담당자가 전부 찾을 수 있어야 한다.**

### A. 배포 전제조건 (없으면 기능이 죽는다)

| # | 항목 | 출처 | 해야 할 일 |
|---|---|---|---|
| A1 | **`SUPABASE_URL`·`SUPABASE_SERVICE_ROLE_KEY` 가 사용자용 GET 의 하드 의존** | 5 (C1) | 없으면 이미지 프록시가 **모든 문제 이미지에 500** 을 낸다. 환경변수 점검표에 넣어라 |
| A2 | **이미지 프록시가 같은 사이트 배포에 묶여 있다** | 5 (C2) | Spring 은 이미지를 `/api/**` 세션 필터 **밖**의 정적 리소스로 서빙했다. 포트는 `SameSite=lax` 쿠키 뒤에 있고 프론트는 저장된 경로를 **프론트 오리진 기준**으로 푼다. Next 와 정적 번들을 다른 호스트에 올리면 모든 `<img>` 가 404 고, API 오리진으로 고쳐도 Lax 쿠키가 교차 사이트 하위 리소스에 안 실려 401 이다. **같은 오리진에 올리거나 프론트가 이미지 URL 도 API 베이스로 풀게 고쳐라** |
| A3 | `SESSION_COOKIE_SECURE=true` · `*.vercel.app` 우선 | 배포 스펙 K2 | 사내 도메인은 나중에 붙여도 쿠키 설정이 안 바뀐다 |

### B. 실측이 필요한 것 (로컬에서 못 재는 것)

| # | 항목 | 출처 | 해야 할 일 |
|---|---|---|---|
| B1 | **요청 본문 상한 두 종을 같은 세션에 잰다** | 4 | 플랫폼 자체 상한과 Next 의 `middlewareClientMaxBodySize`(기본 10 MiB, **초과 시 거부가 아니라 잘라낸다**). 한쪽이 다른 쪽을 가린다 |
| B2 | **4~5MB 이미지 구간** | 4 (I4) | 로컬에 플랫폼 본문 상한이 없어 이 구간이 검증 불가다. `이미지 크기는 5MB를 초과할 수 없습니다.` 가 사용자에게 도달하는지 확인 |
| B3 | **DB 세션 TZ** | 5 (C3) → 6 Task 0 확정 | `current_setting('TimeZone')` 을 확인하라. **서버 TZ 가 아니다** — Drizzle 은 항상 `+0000` 으로 파싱한다 |
| B4 | 전 문제 메모리 적재 성능 | 6 (이탈 ㉡) | 대시보드가 전 문제 통계를 메모리로 올린다. 722문항 규모의 실측 응답 시간 |
| B5 | **DB 콜레이션** | 6 (F1, 신규) | `ORDER BY name` 결과가 콜레이션에 달렸다. 부서·태그 목록 순서가 함께 바뀐다 |

### C. 승인된 이탈 (파리티 위반으로 보고하지 마라)

| # | 항목 | 출처 |
|---|---|---|
| C1 | 로그인 본문 파싱이 400(Spring 200) | 2 (M1) |
| C2 | **세션 강제 무효화 불가** — JWT 무상태 | 2 (S3) |
| C3 | 엑셀 파일 상한 20MB → 4MB, 1009 → 1015 | 3 (④) |
| C4 | SheetJS `blankrows:false` 로 행 번호 어긋남 | 3 (⑤) |
| C5 | 임시비밀번호 화면 표시(메일 제거) · 일괄 등록 결과 다운로드 | 3 (D6·D7) |
| C6 | 이미지 저장 로컬 디스크 → Supabase Storage | 4 (①) |
| C7 | `IMAGE_URL_PREFIX` 변경 | 4 (②) |
| C8 | **공백 판정이 JS 기준** — Java 는 NBSP·전각공백을 그대로 저장한다 | 4 (⑧) |
| C9 | `count` 누락 시 `-1` → 1000 | 5 (㉮) |
| C10 | 채점을 트랜잭션으로 묶고 **자식 답안도 500자로 자른다** | 5 (㉯) |
| C11 | 목록·이력 페이지네이션 없음 | 5 (㉰) |
| C12 | 비공개 버킷 이미지를 **프록시 라우트**로 | 5 (㉱) |
| C13 | 숫자 파라미터 변환이 `Number()` 기준 | 5 (㉲) |
| C14 | `blankAnswers` 의 `null` 원소가 400/1000 | 5 (㉳) |
| C15 | **정렬을 SQL 한 곳에만 둔다** (Java 의 no-op 재정렬 제거) | 6 (㉠) |
| C16 | 전 문제 메모리 적재 그대로 이식 | 6 (㉡) |
| C17 | 타임스탬프 UTC + `Z` 직렬화 | 3 (⑦) → 6 Task 0 **확정** |

### D. 이월된 결함·한계

| # | 항목 | 출처 | 성질 |
|---|---|---|---|
| D1 | **대량 업로드 타임아웃 시 `successAccounts` 유실** | 3 | 운영 리스크 |
| D2 | `excel_upload_logs.file_name varchar(255)` 초과 → 행은 커밋되고 로그만 실패해 `-1` 이 샌다 | 4 | Spring 도 같은 모양 |
| D3 | 테스트 하니스 가드가 **DB 이름만** 검사한다(호스트·자격증명 미검사) | 4 | 방어 심화 |
| D4 | `drizzle.config.ts` 가 **ambient 환경변수로 대상을 고른다** | 4 | 커토버 후 `.env` 가 운영을 가리키면 `drizzle:migrate` 대상도 그게 된다 |
| D5 | 비-multipart 본문이 역할 검사보다 먼저 1009 를 낸다 | 5 | 형제 라우트 3개가 일관돼서 이월 |
| D6 | **상세를 반복 호출하면 제출 없이 정답을 모을 수 있다** | 5 (Q12-1) | Java 도 같아 파리티. 막으려면 무엇을 보여 줬는지 저장하는 새 상태가 필요 |
| D7 | 미들웨어의 **1012 분기가 조용하다** — `mustChangePassword` 는 200 + JSON | 5 (C7) | 이미지 프록시에서는 성공 상태를 단 깨진 이미지 |
| D8 | **`attempts` 47번은 일부러 남긴 Spring 시대 고아 행** | 5 (C8) | "모든 FILL_BLANK 시도는 자식이 1행 이상" 단언은 여기서 깨지고 **포트 버그처럼 읽힌다** |
| D9 | **선택지 0개인 시도가 계약상 존재한다** | 5 (C9) | `INNER JOIN attempt_choices` 집계는 조용히 누락한다 |
| D10 | C8(공백 판정)의 **태그 쪽 파급** | 4 (⑧) | 태그는 이름으로 중복 제거되므로 운영 데이터를 Spring 에서 이관하면 **태그 중복**으로 나타난다 |

### E. 컷오버 작업 자체

| # | 항목 | 출처 |
|---|---|---|
| E1 | Supabase Postgres(서울) 프로젝트 생성 · 마이그레이션 적용 · `pnpm bootstrap` | 배포 스펙 K1·K3 |
| E2 | Vercel 프로젝트 생성(Root=`web/`, `icn1`) · 환경변수 주입 | K2·K3 |
| E3 | **722문항 적재** — 엑셀 12개 + 수동 69문항. `docs/문제은행_엑셀/README.md` 의 경고를 먼저 읽어라(부서 오선택은 되돌릴 수 없다) | 4 |
| E4 | `backend/`·`frontend/` 제거 커밋 | 이관 설계 7단계 |
| E5 | 스모크 테스트 | 이관 설계 7단계 |

---

## 4. 엔드포인트 개수 대조 스크립트

다섯 서브플랜 동안 아무도 안 돌린 검사다. **다시 짜지 마라.**

```python
# python - <<'PY'  (저장소 루트에서)
import io, re, os, glob
spring = []
for f in sorted(glob.glob("backend/src/main/java/com/daeryun/probank/controller/*.java")):
    s = io.open(f, encoding="utf-8").read()
    base = re.search(r'@RequestMapping\("([^"]+)"\)', s)
    base = base.group(1) if base else ""
    for m in re.finditer(r'@(Get|Post|Put|Delete)Mapping(?:\("([^"]*)"\))?', s):
        spring.append((m.group(1).upper(), (base + (m.group(2) or "")) or base))
port = []
for f in sorted(glob.glob("web/app/api/**/route.ts", recursive=True)):
    s = io.open(f, encoding="utf-8").read()
    path = "/" + os.path.relpath(f, "web/app").replace("\\", "/").rsplit("/route.ts", 1)[0]
    for m in re.finditer(r'export async function (GET|POST|PUT|DELETE|PATCH)\b', s):
        port.append((m.group(1), path))
norm = lambda p: re.sub(r"\[[^\]]+\]", "<id>", re.sub(r"\{[^}]+\}", "<id>", p)).rstrip("/")
sp = {(v, norm(p)) for v, p in spring}; po = {(v, norm(p)) for v, p in port}
print("Spring", len(spring), "/ 포트", len(port))
print("Spring 에만:", sorted(sp - po) or "없음")
print("포트에만:", sorted(po - sp) or "없음")
PY
```

**서브플랜마다 검증 태스크에서 이걸 돌려라.** 정답지를 컨트롤러를 읽어 만들면 배정표에만
적힌 엔드포인트를 놓친다 — 실제로 서브플랜 5에서 그렇게 놓쳤다.

---

## 5. 검증 중 만든 데이터

**없다.** 이 서브플랜은 읽기 전용 엔드포인트 셋이라 기존 픽스처(문제 70 · 시도 44 · 부서 4 ·
계정 4)로 전부 측정했다. 기존 데이터는 수정하지 않았다.

단, **정답지가 요구한 `accuracyRate = 0.0` 픽스처는 단위 테스트에서만 만든다** — 현재 DB 에
그런 문제가 없어 Spring 으로는 잴 수 없었고, 운영 데이터를 오염시키지 않기 위해 E2E 에서도
만들지 않았다(X2 를 단위 테스트 대체로 기록한 이유다).
