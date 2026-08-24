# 서브플랜 5(직원 풀이) E2E 검증 + 정답지 대조

- 실행일: **2026-08-24**
- 대상 브랜치: `feat/migration-solve-m4`
- 대상 서버: `next start` 프로덕션 빌드, `http://localhost:3220` (Task 7 시작 시점에 이미 기동돼 있던 인스턴스를 그대로 사용)
- 대상 DB: `probank_dev` (docker `probank-postgres`, 포트 5434, 세션 TZ `Etc/UTC`)
- 대상 엔드포인트 6개
  - `GET /api/problems` · `GET /api/problems/random` · `GET /api/problems/{id}`
  - `POST /api/problems/{id}/attempts` · `GET /api/attempts/me` · `GET /api/tags/in-use`
- 정답지: `docs/qa/2026-08-21-solve-parity-checklist.md` (**87행**)
- 계정: `admin`(SUPER_ADMIN·본사3) · `dev01`(DEPT_ADMIN·개발팀4) · `sal01`(DEPT_ADMIN·영업팀5) · `emp01`(EMPLOYEE·개발팀4)

**측정 방법.** 셸 파이프를 거치면 한글 JSON 이 깨지므로 모든 호출은 Node 22 의 `fetch` 로 직접
수행해 응답을 파일에 적재한 뒤 읽었다. 아래 본문의 응답은 **관측값 그대로**이며 HTTP 상태 ·
`resultCode` · `resultMsg` 를 함께 적는다. DB 대조는 읽기 전용 `psql` 로만 했다.

---

## 0. 요약

| | |
|---|---|
| 정답지 87행 | **87행 전부 대조 완료. 미대조 0행** |
| E2E 실측으로 확인 | **76행** (그중 3행 `P1`·`P10-1`·`T11` 은 **승인된 이탈이 그대로 나오는 것**을 확인) |
| 대체 표기 | **11행** — 이탈로 대체 3(T8·T8-1·T8-2) · 도달 불가 2(Q9·T9) · 관측 불가 5(S7·H2·Q10·H4·H6) · 해당 없음 1(U6) |
| 파리티 위반 | **0건** |
| 제품 요구(정답 비노출) | 5개 유형 상세·목록 응답 전부에서 `correct`·`isCorrect`·`explanation` **0회**. 키 집합도 Java DTO 와 정확히 일치 |
| 발견 | **F1** — 타임스탬프 직렬화 형식(`submittedAt`/`createdAt`). 서브플랜 5 고유가 아니라 이관 전반의 성질이다. 컷오버 이월 권고 |
| 전체 검증 | web `pnpm test` 53파일/609테스트 · `pnpm build` 성공, backend **301** 유지 — 4절 |

---

## 1. Step 2 — 브리프의 확인 항목 전수

### 항목 1 — EMPLOYEE 로 목록·랜덤·상세·제출·이력·태그 전부 (E1)

`emp01`(EMPLOYEE) 로 6개를 모두 호출해 **전부 200**. 역할 제한이 없다는 것이 계약이므로
`admin`(SUPER_ADMIN)·`dev01`·`sal01`(DEPT_ADMIN) 로도 반복해 전부 200 을 확인했다.

| 호출 | emp01 | admin | dev01 | sal01 |
|---|---|---|---|---|
| `GET /api/problems` | 200 / 배열 65건 | 200 | 200 | 200 |
| `GET /api/problems/random?count=3` | 200 / 배열 3건 | 200 | 200 | 200 |
| `GET /api/problems/{id}` | 200 / 객체 | 200 | 200 | 200 |
| `POST /api/problems/19/attempts` | 200 / 채점 객체 | 200 | — | — |
| `GET /api/attempts/me` | 200 / 배열 | 200 | 200 | 200 |
| `GET /api/tags/in-use` | 200 / 배열 8건 | 200 | 200 | 200 |

`emp01` 의 상세 응답 원문:

```json
{"resultCode":200,"resultMsg":"정상 처리되었습니다.","data":{"id":1,"type":"MCQ_SINGLE","content":"총괄 생성 문제","imageUrl":null,"referenceText":null,"choices":[{"id":1,"text":"가"},{"id":2,"text":"나"}],"blanksToAnswer":null,"revealedBlanks":null,"departmentName":"영업팀","sourceNumber":2002}}
```

### 항목 2 — 비로그인 (E2)

6개 전부 **401 / 980**, 본문 동일:

```json
{"resultCode":980,"resultMsg":"세션 정보가 없습니다."}
```

(추가) **E3** — `mustChangePassword=true` 사용자(`m7chk53850`, 관리자 API 로 생성)로 로그인해
5개 GET 을 호출하면 전부 **HTTP 200 / 1012**:

```json
{"resultCode":1012,"resultMsg":"비밀번호 변경이 필요합니다."}
```

### 항목 3 — 5개 유형 상세에 정답이 없다 (Q 절의 핵심)

응답 전체를 재귀 순회해 키를 모아 `correct`·`isCorrect`·`explanation` 을 찾았다. **5개 유형 모두 0회.**
동시에 **키 집합이 Java DTO 와 같은지**도 쟀다 — 문자열 3개 denylist 만으로는 이름만 바꾼 유출을 못 잡는다.

| 유형 | 문제 id | 최상위 키 집합(관측) | 금지 키 |
|---|---|---|---|
| MCQ_SINGLE | 1 | `id,type,content,imageUrl,referenceText,choices,blanksToAnswer,revealedBlanks,departmentName,sourceNumber` | 없음 |
| MCQ_MULTI | 6 | 위와 동일 | 없음 |
| OX | 19 | 위와 동일 | 없음 |
| SHORT_ANSWER | 44 | 위와 동일 (`choices`·`blanksToAnswer`·`revealedBlanks` 전부 `null`) | 없음 |
| FILL_BLANK | 12 · 184 | 위와 동일 | 없음 |

- `ProblemSolveDetailResponse.java` 필드 10개와 **이름·개수 모두 일치**.
- `choices[]` 키 집합 = 정확히 `{id, text}` — `ChoiceOption.java` 와 같다(`choiceText` 가 아니다, Q3).
- `revealedBlanks[]` 키 집합 = 정확히 `{blankKey, answerText}` — `RevealedBlank.java` 와 같다.
- 목록 키 집합 = 정확히 `{id,type,content,tags,departmentName,sourceNumber}` — `ProblemSolveListItem.java` 와 같다.
- **Q6 예외**: `revealedBlanks[].answerText` 는 **설계상 정답이다**(안 물어보는 칸을 채워 보여 준다). 유출이 아니다.

FILL_BLANK 상세 원문(문제 184, 빈칸 3개·revealCount 1):

```json
{"resultCode":200,"resultMsg":"정상 처리되었습니다.","data":{"id":184,"type":"FILL_BLANK","content":"M7 검증용 빈칸 문제: 수도는 {{a}}, 제2도시는 {{b}}, 대구는 {{c}} 이다.","imageUrl":null,"referenceText":null,"choices":null,"blanksToAnswer":["c"],"revealedBlanks":[{"blankKey":"a","answerText":"서울"},{"blankKey":"b","answerText":"부산"}],"departmentName":"개발팀","sourceNumber":90001}}
```

### 항목 4 — FILL_BLANK 상세 5회 호출 → 무작위가 실제로 동작 (Q5·Q8)

기존 픽스처의 유일한 FILL_BLANK(문제 12)는 `blankRevealCount(2) == 빈칸 수(2)` 라 조합이
하나뿐이어서 판별력이 없다. 그래서 **빈칸 3개·revealCount 1** 문제(184)를 새로 만들어 5회 호출했다.

| 회차 | `blanksToAnswer` | `revealedBlanks` |
|---|---|---|
| 1 | `["c"]` | `[{a,서울},{b,부산}]` |
| 2 | `["a"]` | `[{b,부산},{c,광역시}]` |
| 3 | `["a"]` | `[{b,부산},{c,광역시}]` |
| 4 | `["a"]` | `[{b,부산},{c,광역시}]` |
| 5 | `["a"]` | `[{b,부산},{c,광역시}]` |

→ **조합 2가지 이상**(`c`, `a`). 문제 12 로도 5회 호출해 `["a","b"]`/`["b","a"]` **두 가지 순서**가
나오는 것을 확인했다(셔플이 실제로 돌고 있다는 별도 증거).

**Q12-1(파리티, 막지 않는다)**: 위 5회의 `revealedBlanks` 합집합이 `{a,b,c}` — 제출 없이 상세를
반복 호출하는 것만으로 세 정답이 전부 모인다. Java 도 같다(`SolveServiceImpl.java:70-77`).
막으려면 "무엇을 보여 줬는지" 저장하는 새 상태가 필요하다 — **컷오버 이월**.

### 항목 5 — 전부 묻는 빈칸 문제 → `revealedBlanks` 가 `[]` (Q6-1)

문제 12(빈칸 2개, revealCount 2): `"blanksToAnswer":["a","b"],"revealedBlanks":[]`.
`null` 이 아니라 **빈 배열**이며 SHORT_ANSWER 의 `null`(Q4)과 구분된다.

### 항목 6 — `random` 의 `count` 누락 (승인된 이탈 ㉮)

```
GET /api/problems/random     → HTTP 400
{"resultCode":1000,"resultMsg":"잘못된 파라미터를 입력했습니다."}
```

`-1` 이 아니다. Spring 은 `200 / -1 / 처리 중 오류가 발생하였습니다.` 였다(정답지 P1 실측).

### 항목 7 — `random?count=0` · `51`

둘 다 `HTTP 400 / 1000 / 문제 수는 1 이상 50 이하여야 합니다.` (`count=999999` 도 같은 문구.)
경계 `count=1`·`count=50` 은 200 이고 각각 1건·50건(P5).

### 항목 8 — 단답 `보정 계수` vs `  보정계수  ` (G7-1)

문제 44(허용 정답 `보정계수`):

| 제출 | 응답 | `attempts.submitted_answer`(저장값) |
|---|---|---|
| `보정계수` | `{"correct":true,…}` | `보정계수` |
| `  보정계수  ` | **`{"correct":true,…}`** | **`  보정계수  `** (앞뒤 공백 그대로, T2-1) |
| `보정 계수` | **`{"correct":false,…}`** | `보정 계수` |
| `null` | `{"correct":false,…}` | `NULL` |

**공백은 접힐 뿐 사라지지 않는다.** 구현이 공백을 삭제했다면 세 번째 줄이 정답으로 뒤집혔을 것이다.
문제 46(허용 정답 `메탄`·`CH4`)으로 `ch4` 제출 → `correct:true` — 소문자 변환과 `anyMatch` 도 확인(G6·G7·G8).

### 항목 9 — MCQ 를 `[10,9]` 순서로 제출 (T3)

```
POST /api/problems/6/attempts  {"selectedChoiceIds":[10,9]}
→ 200 {"correct":true,"explanation":null,"blankResults":null}
```

DB(시도 56): `submitted_answer = '가, 나'`, `attempt_choices` = `(9,'가'),(10,'나')`.
**제출 순서가 아니라 문제에 정의된 순서**로 저장된다 — 제출 순서였다면 `나, 가` 였을 것이다.

### 항목 10 — 빈칸 답 600자 제출 (승인된 이탈 ㉯)

```
POST /api/problems/184/attempts  {"blankAnswers":[{"blankKey":"a","submittedAnswer":"가"×600}]}
→ HTTP 200
{"resultCode":200,"resultMsg":"정상 처리되었습니다.",
 "data":{"correct":false,"explanation":null,
         "blankResults":[{"blankKey":"a","submittedAnswer":"…600자 원문 그대로…","correct":false,"correctAnswer":"서울"}]}}
```

DB(시도 53): `attempts.submitted_answer` 길이 **500**, `attempt_blank_answers` **1행**
(`blank_key='a'`, 길이 **500**, `is_correct=false`).

**Spring 과의 대비(정답지 T8-1 실측):** 같은 입력에 `200 / -1 / 처리 중 오류가 발생하였습니다.` 가
나오고 `attempts` 행만 커밋돼 남았다. 이 DB 의 **시도 47** 이 그 산출물이다 — `attempts` 1행,
`attempt_blank_answers` **0행**의 고아 시도.

```
시도 47 (Spring 잔재) : attempts 1행 / attempt_blank_answers 0행 / 사용자에게는 -1
시도 53 (포트)        : attempts 1행 / attempt_blank_answers 1행(500자) / 사용자에게는 200 + 채점 결과
```

### 항목 11 — 남의 부서 문제 상세 (E4)

`emp01`(개발팀4)이 **영업팀(5)** 소속 문제 1을 조회 → **200**, `departmentName:"영업팀"`.
판별력을 위해 관리자 라우트와 대조했다:

| 호출 | 결과 |
|---|---|
| `dev01`(개발팀) → `GET /api/problems/1`(풀이 상세, 영업팀 문제) | **200** / `departmentName: 영업팀` |
| `dev01`(개발팀) → `GET /api/admin/problems/1`(관리자 상세) | **403** / `{"resultCode":990,"resultMsg":"접근 권한이 없습니다."}` |

풀이 상세에는 부서 스코프가 **없다**(`SolveServiceImpl.getDetail` 은 `actor` 인자 자체가 없다).
관리자 상세와 정반대라는 점까지 확인된다.

### 항목 12 — 이력: 본인 것만, `correct` 에 true 가 실제로 있다 (H1·H4·H5)

- `admin` 이력 20건 중 `correct:true` **7건** — H4 가 경고한 함정(별칭이 없으면 전부 false)이
  실제로 열려 있지 않다는 관측 증거.
- `emp01` 은 최초 시점에 **1건**(방금 제출한 것)만 보였다 — 같은 DB 의 admin 시도 19건은 안 보인다(H1).
- 키 집합 = 정확히 7개: `problemId, problemContent, submittedAnswer, correct, submittedAt, departmentName, sourceNumber` (`AttemptHistoryItem.java` 와 동일, H5).

```json
{"problemId":185,"problemContent":"M7 보관 대상 문제","submittedAnswer":"가","correct":true,"submittedAt":"2026-08-24T00:22:51.199Z","departmentName":"개발팀","sourceNumber":90002}
```

정렬은 `submittedAt` 내림차순이며 24건 전부 단조 감소했다(H2). `?page=2&size=1` 을 붙여도 24건
전체가 그대로 나온다 — 페이지네이션이 없다(H3).

### 항목 13 — 보관된 문제의 이력 (H7 · S2)

문제 185 를 만들고 `emp01` 이 제출한 뒤 관리자 API 로 보관(`DELETE /api/admin/problems/185`)했다.

| 확인 | 결과 |
|---|---|
| `GET /api/attempts/me` 에 문제 185 | **나온다** (보관 전과 같은 1행, H7) |
| `GET /api/problems` 에 문제 185 | **없다** (총건수 67 → 66, S2) |
| `GET /api/problems/185` | **400** / `존재하지 않거나 보관된 문제입니다.` (Q1) |
| `GET /api/tags/in-use` 에 `m7보관태그` | **없다** (U1) |
| `GET /api/tags`(관리자) 에 `m7보관태그` | **있다** (U4 — 두 쿼리가 다르다는 판별자) |

### 항목 14 — 이미지 프록시

**이번 세션에서 다시 재지 않았다.** 실 버킷 검증은 Task 6 이후 별도로 수행됐고 결과는 **15/15 통과**다:
업로드 → 프록시 경유 수신 **바이트 일치** → 쿠키 없이 401 → 적대적 키 4종 거부 → 익명 공개 URL
400 차단 → 삭제 후 **버킷 빔** 확인. 라우트 단위 근거는 `web/app/api/problem-images/[key]/route.test.ts`
(6 케이스, 뮤테이션 5종 확인)와 `.superpowers/sdd/2026-08-21-migration-solve/task-6-report.md`.

이번 검증이 이 영역에서 잰 것은 **Q12(저장값 그대로 내보내기)** 뿐이다:

| 문제 | 응답 `imageUrl` |
|---|---|
| 15 | `/api/problem-images/7d512a3e-d0c4-4625-8749-bac615419527.png` (버킷에서 삭제된 오브젝트를 가리키는 그 행) |
| 17 | `/api/problem-images/a.png` |

두 값 모두 DB `problems.image_url` 과 **문자 그대로 같다** — 상세 응답이 가공하지 않는다.

### 항목 15 — 제출 라우트의 메시지 순서(E5-1) 네 줄 전부

**이 구간에서 가장 재배치에 취약한 계약이다.** 네 줄 전부 측정했고 **네 줄 다 일치**한다.

| # | 요청 | HTTP | 본문(원문) |
|---|---|---|---|
| 1 | `POST /api/problems/abc/attempts` + 깨진 본문 `{ this is not json` | **400** | `{"resultCode":1000,"resultMsg":"요청 값의 형식이 올바르지 않습니다: id"}` |
| 2 | `POST /api/problems/999999/attempts` + 깨진 본문 | **200** | `{"resultCode":1000,"resultMsg":"잘못된 파라미터를 입력했습니다."}` |
| 3 | `POST /api/problems/999999/attempts` + 정상 본문 | **400** | `{"resultCode":1000,"resultMsg":"존재하지 않거나 보관된 문제입니다."}` |
| 4 | `POST /api/problems/abc/attempts` + 정상 본문 | **400** | `{"resultCode":1000,"resultMsg":"요청 값의 형식이 올바르지 않습니다: id"}` |

두 번째 줄(200/1000)이 곧 **본문 읽기가 문제 조회보다 먼저**라는 증거다. 라우트가 본문을
`submitAttempt` 안으로 밀어 넣거나 조회 뒤로 미루면 이 줄이 3번 줄로 뒤집힌다
(`web/app/api/problems/[id]/attempts/route.ts:24-33`: 경로변수 → `readJsonStrict` → `submitAttempt`).

**E6** 도 같은 라우트에서 함께 쟀다 — 네 가지 입력 모두 **HTTP 200 / 1000 / `errorList` 키 없음**:

| 본문 | 결과 |
|---|---|
| `{ this is not json` | 200 / 1000 / `잘못된 파라미터를 입력했습니다.` |
| `[1,2,3]`(최상위 배열) | 동일 |
| (빈 본문) | 동일 |
| `{"selectedChoiceIds":"abc"}`(배열 자리에 문자열) | 동일 |
| `{"selectedChoiceIds":[230],"unknownField":1}` | **200 / 정상 채점** — 모르는 필드는 무시(Jackson 파리티) |

### 항목 16 — `blankAnswers: [null]` (승인된 이탈 ㉳)

```
POST /api/problems/184/attempts  {"blankAnswers":[null]}
→ HTTP 400
{"resultCode":1000,"resultMsg":"제출한 빈칸 개수가 올바르지 않습니다."}
```

Java 는 여기서 NPE → `200 / -1` 이다. **파리티 위반이 아니라 승인된 이탈 ㉳ 의 정상 동작이다.**

### 항목 17 — 채점 응답의 키 집합 (G13·G14)

```json
{"resultCode":200,"resultMsg":"정상 처리되었습니다.","data":{"correct":true,"explanation":null,"blankResults":[{"blankKey":"a","submittedAnswer":"서울","correct":true,"correctAnswer":"서울"}]}}
```

- `data` 키 집합 = 정확히 `correct` · `explanation` · `blankResults` (`AttemptResult.java` 3필드).
- `blankResults[i]` 키 집합 = 정확히 `blankKey` · `submittedAnswer` · `correct` · `correctAnswer` (`BlankAnswerResult.java` 4필드).
- FILL_BLANK 가 아니면 `blankResults` 는 `null`(MCQ·OX·SHORT_ANSWER 전부 확인).
- 해설이 있는 문제(35)로 제출하면 `"explanation":"대통령령(X), 시·도 고시(O)"` — **채점 후에만** 나온다(Q11).

### 항목 18 — 태그 응답의 키 집합 (U3)

```json
{"resultCode":200,"resultMsg":"정상 처리되었습니다.","data":[{"id":7,"name":"공통","createdAt":"2026-08-21T00:15:14.876Z"},{"id":5,"name":"지리","createdAt":"2026-08-21T00:08:44.353Z"},{"id":6,"name":"재삽입","createdAt":"2026-08-21T00:08:44.525Z"},{"id":1,"name":"alpha","createdAt":"2026-08-21T00:08:43.664Z"},{"id":2,"name":"beta","createdAt":"2026-08-21T00:08:43.664Z"},{"id":3,"name":"keep","createdAt":"2026-08-21T00:08:44.171Z"},{"id":50,"name":"racetag1787271636062","createdAt":"2026-08-21T00:20:36.085Z"},{"id":4,"name":"trimtag","createdAt":"2026-08-21T00:08:44.207Z"}]}
```

키 집합은 정확히 `id` · `name` · `createdAt` (`Tag.java` 3필드). 정렬은 `name` 오름차순
(DB 콜레이션 `en_US.utf8` 기준으로 한글이 먼저 온다), 중복 없음(U2).

### 항목 19 — 이력의 `submittedAt` 문자열 (관측값 그대로)

**추정하지 않고 관측한 문자열을 그대로 적는다.**

| DB(`timestamp without time zone`) | API 응답 문자열 |
|---|---|
| `2026-08-24 00:19:07.650198` | `"2026-08-24T00:19:07.650Z"` |
| `2026-08-21 11:20:19.907937` | `"2026-08-21T11:20:19.907Z"` |
| `2026-08-21 10:53:40.313046` | `"2026-08-21T10:53:40.313Z"` |

측정 시점의 시계: 호스트 로컬 `Mon Aug 24 09:20:45 2026`(KST, `Asia/Seoul`), 호스트 UTC
`Mon Aug 24 00:20:45 UTC 2026`, DB `now()` = `2026-08-24 00:20:45.574614+00`,
`current_setting('TimeZone')` = `Etc/UTC`. 즉 **DB 는 UTC 벽시계로 저장**하고 있고 포트는 그 값을
같은 벽시계 + `Z` 접미사(밀리초 절삭)로 내보낸다. → **발견 F1**(3절).

### 항목 15′ — `/api/problems/random?count=1` (경로 주의 ②)

```
GET /api/problems/random?count=1 → 200
data[0] = {"id":10,"type":"MCQ_SINGLE","content":"이탈6 대상","departmentName":"개발팀","sourceNumber":9234,"tags":["keep"]}
```

랜덤 세트가 나온다. `존재하지 않거나 보관된 문제입니다.` 가 나왔다면 `random` 이 `[id]` 로 샌 것이다 — 새지 않았다.

### 항목 16′ — `?count=` · `?count=1.5` (P9·P10)

둘 다 **400 / 1000 / `요청 값의 형식이 올바르지 않습니다: count`** — **누락(㉮)의 문구와 다르다.**

| 입력 | HTTP | resultMsg |
|---|---|---|
| (파라미터 없음) | 400 | `잘못된 파라미터를 입력했습니다.` |
| `?count=` | 400 | `요청 값의 형식이 올바르지 않습니다: count` |
| `?count=abc` | 400 | `요청 값의 형식이 올바르지 않습니다: count` |
| `?count=1.5` | 400 | `요청 값의 형식이 올바르지 않습니다: count` |

### 항목 17′ — `?count=1&departmentId=99999` (P11)

**200 / 0건.** 없는 부서는 오류가 아니다. 비대칭도 함께 확인:

| 입력 | 결과 |
|---|---|
| `departmentId=99999` | 200 / **0건** |
| `departmentId=`(빈 문자열) | 200 / 1건 — **필터 미적용** |
| `departmentId=abc` | 400 / 1000 / `요청 값의 형식이 올바르지 않습니다: departmentId` |
| `departmentId=5` | 200 / 영업팀 문제만(1·14·16·17 범위) |

---

## 2. Step 3 — 정답지 87행 대조

표기 규칙:

- **✅ 파리티 확인** — 이 세션에서 E2E 로 실측해 정답지 값과 일치
- **㉮/㉲/㉳ 이탈 확인** — 승인된 이탈이 의도대로 나오는 것을 실측. **파리티 확인이 아니다**
- **⚠ 이탈로 대체** — 포트가 **일부러 다르게 동작한다.** Spring 동작은 구조상 재현 불가
- **▣ 도달 불가 — 단위 테스트로 고정**
- **◻ 관측 불가** — 사유와 대체 근거를 적는다
- **– 해당 없음**

### E. 권한·공통 (7행)

| # | 상태 | 실측 근거 |
|---|---|---|
| E1 | ✅ | 항목 1 — EMPLOYEE·DEPT_ADMIN(2명)·SUPER_ADMIN 전부 6개 200 |
| E2 | ✅ | 항목 2 — 6개 전부 401/980 |
| E3 | ✅ | 항목 2 추가 — `mustChangePassword` 사용자로 5개 GET 전부 200/1012 |
| E4 | ✅ | 항목 11 — 남의 부서 상세 200, 관리자 상세는 같은 사용자에게 403 |
| E5 | ✅ | `GET /api/problems/abc` → 400/1000/`요청 값의 형식이 올바르지 않습니다: id`. `1.5` 도 동일 |
| E5-1 | ✅ | 항목 15 — 네 줄 전부 일치(200/1000 줄 포함) |
| E6 | ✅ | 항목 15 하단 — 깨진 본문·최상위 배열·빈 본문·타입 불일치 4종 모두 200/1000/`errorList` 없음 |

### S. 풀이 목록 (11행)

| # | 상태 | 실측 근거 |
|---|---|---|
| S1 | ✅ | 배열 65건(보관 전) 그대로. `?page=2&size=5` 를 붙여도 동일 — 페이지네이션 없음 |
| S2 | ✅ | 보관 문제 4·13·22 부재. 항목 13 에서 185 를 보관하자 67→66 |
| S3 | ✅ | `keyword=phishing` 1건 / `keyword=PHISHING` 1건(같은 id 65) — 대소문자 무시 |
| S4 | ✅ | `tag=alpha` 1건 · `tag=ALPHA` 1건 · `tag=alph` **0건**(부분 일치 아님) |
| S5 | ✅ | `keyword=` · `tag=` → 65건(필터 미적용) |
| S5-1 | ✅ | `keyword=<공백3>` → **0건**, `tag=<공백1>` → **0건**. 빈 문자열(S5)과 갈린다 |
| S6 | ✅ | id 1 → `tags:["alpha","beta"]`(이름 오름차순). 태그 없는 행 9건은 `"tags":[]` — null 아님 |
| S7 | ◻ | 정렬 자체는 실측(`created_at` DESC, 117→116→114→115→113 이 실제 `created_at` 내림차순과 일치). **타이브레이커 부재는 관측 불가** — 페이지네이션이 없고 데이터에 완전 동시각 행이 없다(114/115 는 25µs 차). 코드로 고정: `lib/db/solveProblems.ts:49`, 테스트 `S7: created_at 내림차순이다` |
| S8 | ✅ | 키 집합 정확히 6개, 정답 관련 필드 없음 |
| S9 | ✅ | 개발팀 소속 `emp01` 목록에 영업팀 문제(id 1·14·16·17) 포함 |
| S10 | ✅ | 태그 2개인 id 1 이 목록에 **1행**으로만 나온다 |

### P. 랜덤 세트 (12행)

| # | 상태 | 실측 근거 |
|---|---|---|
| P1 | ㉮ | 항목 6 — 400/1000/`잘못된 파라미터를 입력했습니다.` (Spring 은 200/-1). **승인된 이탈 ㉮** |
| P2 | ✅ | `count=abc` → 400/1000/`요청 값의 형식이 올바르지 않습니다: count` |
| P3 | ✅ | `count=0` → `문제 수는 1 이상 50 이하여야 합니다.` |
| P4 | ✅ | `count=51`·`999999` → 같은 문구 |
| P5 | ✅ | `count=1` → 1건, `count=50` → 50건 |
| P6 | ✅ | `count=50&departmentId=5` → **4건**(영업팀 활성 4건), 오류 아님 |
| P7 | ✅ | 같은 호출이 영업팀 문제만 반환(1·14·16·17) |
| P8 | ✅ | `count=50&keyword=…&tag=…` → **50건** — keyword·tag 필터가 없다. 응답 키 집합은 목록과 동일 |
| P9 | ✅ | `?count=` → 400/1000/`요청 값의 형식이 올바르지 않습니다: count` (P1 과 다른 문구) |
| P10 | ✅ | `?count=1.5` → 같은 문구 |
| P10-1 | ㉲ | 실측: `1e2`→400/`문제 수는 1 이상 50 이하여야 합니다.`(Spring 은 타입 불일치 거부) · `<공백1>`→같은 문구(Number(" ")=0) · `1 0`→400/`…: count`(Spring 은 200/10건) · `0x10`→**200/16건**(Spring 과 일치) · `+5`→**200/5건**(일치). **승인된 이탈 ㉲**, 컷오버 목록 유지 |
| P11 | ✅ | 항목 17′ — 99999→0건 · 빈 문자열→미적용 · `abc`→400/`…: departmentId` |

### Q. 풀이 상세 (14행)

| # | 상태 | 실측 근거 |
|---|---|---|
| Q1 | ✅ | 없는 id(999999)와 보관(4·13·22·185) 모두 400/1000/**같은 문구** |
| Q2 | ✅ | MCQ_SINGLE·MCQ_MULTI·OX 의 `choices` 에 정답 플래그 없음 |
| Q3 | ✅ | 필드명이 **`text`** (`choiceText` 아님) — 키 집합 `{id,text}` |
| Q4 | ✅ | SHORT_ANSWER(44) 는 `choices`·`blanksToAnswer`·`revealedBlanks` 전부 `null` |
| Q5 | ✅ | 항목 4 — revealCount 만큼(1개) 키 배열 |
| Q6 | ✅ | 항목 4 — 안 물어보는 칸이 `{blankKey,answerText}` 로 나온다(설계 의도, 유출 아님) |
| Q6-1 | ✅ | 항목 5 — 전부 묻는 문제(12)는 `[]`, null 아님 |
| Q7 | ✅ | FILL_BLANK 의 `choices` 는 `null` |
| Q8 | ✅ | 5회 호출에 조합 2가지(184) + 순서 2가지(12) — 셔플이 동작 |
| Q9 | ▣ | `blankRevealCount > 빈칸 수`는 생성 검증(`출제할 빈칸 개수가 유효하지 않습니다.`)이 막아 **도달 불가**. 단위 테스트 `Q9: count 가 빈칸 수보다 크면 전체를 돌려준다 — 오류가 아니다`(`lib/solve/solveQueryService.test.ts`)로 고정 |
| Q10 | ◻ | 관측 가능한 절반은 실측(부서명이 붙는다: 영업팀 문제 → `"departmentName":"영업팀"`). **부서가 없어 null 이 되는 분기는 관측 불가** — `problems.department_id` 가 `NOT NULL`(+FK)이라 만들 수 없다. 단위 테스트 `Q10: 부서명은 별도 조회다` 로 고정 |
| Q11 | ✅ | 5개 유형 상세에 `explanation` 키 자체가 없고, 채점 응답에서만 나온다(문제 35) |
| Q12 | ✅ | 항목 14 — 저장값 그대로 |
| Q12-1 | ✅ | 항목 4 — 5회 호출로 `{a,b,c}` 전부 수집됨. Java 와 같은 한계(파리티). **컷오버 이월** |

### G. 채점 (15행)

| # | 상태 | 실측 근거 |
|---|---|---|
| G1 | ✅ | 보관(4)·없는 id 제출 → 400/1000/`존재하지 않거나 보관된 문제입니다.` (Q1 과 같은 문구) |
| G2 | ✅ | 문제 6 `[10,9]`→true, `[9]`→false, 문제 1 `[1]`→true, 문제 19 `[32]`→true |
| G3 | ✅ | `selectedChoiceIds:null` → false, `attempt_choices` 0행(시도 59) |
| G4 | ✅ | `[9,10,9]` → true, `attempt_choices` **2행**(시도 57) — 중복이 접힌다 |
| G5 | ✅ | 남의 문제 choiceId `[1]` 제출(문제 6) → false, `attempt_choices` **0행**(시도 60) |
| G6 | ✅ | 문제 46: `메탄`·`CH4`·`ch4` 전부 true — 허용 정답 중 하나만 맞으면 정답 |
| G7 | ✅ | `null` 제출 → false(빈 문자열 취급), `  보정계수  ` → true |
| G7-1 | ✅ | 항목 8 — `보정 계수`(오답) / `  보정계수  `(정답) 판별자 통과 |
| G8 | ✅ | `ch4` 가 `CH4` 와 일치 — JS `toLowerCase()` 경로. 코드: `lib/solve/grading.ts:26` |
| G9 | ✅ | 문제 12 에 `[{a},{a}]` → 400/1000/`제출한 빈칸 개수가 올바르지 않습니다.` |
| G10 | ✅ | 문제 12 에 `[{a},{zzz}]`(개수는 맞음) → **같은 문구** |
| G11 | ✅ | 개수 불일치 4종(0개·1개·2개 초과·필드 누락) 전부 **같은 문구** |
| G12 | ✅ | 한 칸만 틀려도 `correct:false`(부분 점수 없음) |
| G13 | ✅ | 항목 17 — `blankResults[i]` 4필드, 채점 후 `correctAnswer` 공개 |
| G14 | ✅ | 항목 17 — 응답 3키, 비-FILL_BLANK 는 `blankResults:null` |

### T. 시도 저장 (14행)

| # | 상태 | 실측 근거 |
|---|---|---|
| T1 | ✅ | 시도 50~72 전부 `user_id`·`problem_id`·`submitted_answer`·`is_correct` 가 제출과 일치 |
| T2 | ✅ | 단답 600자 제출(시도 68) → `submitted_answer` 길이 **500**, HTTP 200 |
| T2-1 | ✅ | 시도 65 = `  보정계수  `(공백 포함 원문), 시도 67 = `NULL` |
| T3 | ✅ | 항목 9 — `[10,9]` 제출에 `가, 나` 저장 |
| T4 | ✅ | 시도 54(제출 `null`)·55(제출 `"   "`) 둘 다 `submitted_answer='(미입력)'` |
| T5 | ✅ | 시도 59·60 → `attempt_choices` 0행(SQL 오류 없이 통과) |
| T6 | ✅ | `attempt_choices.choice_text` 에 저장 시점 문구가 들어간다(시도 56 = `가`,`나`). 스냅샷 불변성은 별도 테이블 구조가 보증하고 단위 테스트 `T6: … 저장 시점 스냅샷이다` 가 고정 |
| T7 | ✅ | FILL_BLANK 제출에만 `attempt_blank_answers` 가 생긴다(시도 50~55). MCQ·단답 시도에는 0행 |
| T8 | ⚠ **이탈로 대체** | 포트는 `db.transaction` 으로 부모·자식을 한 트랜잭션에 묶는다(`lib/solve/attemptService.ts:104-120`). **Spring 의 비트랜잭션 커밋은 구조상 재현 불가.** 롤백은 단위 테스트 `㉯: 자식 insert 가 실패하면 attempts 도 남지 않는다` 가 고정 |
| T8-1 | ⚠ **이탈로 대체** | 항목 10 — 같은 입력에 포트는 **200 + 정상 채점 + 자식 500자 저장**. Spring 의 `200/-1`+고아 행은 재현하지 않는다(그 산출물인 시도 47 을 대조 증거로 남김) |
| T8-2 | ⚠ **이탈로 대체** | T8-1 의 피해(재제출로 인한 시도 중복·통계 이중 계수)는 원인이 사라져 발생하지 않는다. 재현 대상이 아니다 |
| T9 | ▣ | 빈 컬렉션 insert 는 DAO 가 조기 반환해 SQL 을 만들지 않는다(`lib/db/attempts.ts:15,22`). 정상 경로로 유도 불가 — 단위 테스트 `T5/T7: 빈 배열이면 DB 를 건드리지 않는다` 로 고정 |
| T10 | ✅ | `[9,10,9]` 제출(시도 57)에 `attempt_choices` 2행 — `(attempt_id, choice_id)` 유일 제약 위반 없음 |
| T11 | ㉳ | 항목 16 — `blankAnswers:[null]` → 400/1000/`제출한 빈칸 개수가 올바르지 않습니다.` **승인된 이탈 ㉳** (Java 는 NPE→200/-1). 파리티 위반이 아니다 |

### H. 내 이력 (8행)

| # | 상태 | 실측 근거 |
|---|---|---|
| H1 | ✅ | `emp01` 이력에 admin 시도 19건이 안 보인다(항목 12) |
| H2 | ◻ | 정렬은 실측(24건 `submittedAt` 단조 감소). **타이브레이커 부재는 관측 불가** — 동일 타임스탬프 행을 만들 수단이 없다(`now()` 가 마이크로초 단위로 갈린다). 코드 `lib/db/attempts.ts:45` + 단위 테스트 `H2: submitted_at 내림차순` |
| H4 | ◻ | MyBatis `AS correct` 별칭 메커니즘에 포트 대응물이 없다(Drizzle 은 select 키가 곧 별칭). **관측 가능한 결과만** 잴 수 있고 그것이 항목 12 다 — `correct:true` 가 20건 중 7건 실제로 나온다 |
| H3 | ✅ | `?page=2&size=1` 에도 24건 전체 |
| H5 | ✅ | 키 집합 정확히 7개, `AttemptHistoryItem.java` 와 동일 |
| H6 | ◻ | INNER vs LEFT 는 **관측 불가** — 문제는 보관만 되고 삭제되지 않는다(정답지 본문이 그렇게 적고 있고, 보관 라우트도 `status` 만 바꾼다). **스키마의 FK 가 보증한다**(`problems.department_id`·`attempts.problem_id` 모두 NOT NULL). **단위 테스트는 이걸 고정하지 못한다** — 최종 리뷰가 `innerJoin` 두 곳을 `leftJoin` 으로 바꿔도 10/10 이 통과함을 확인했다. FK 가 NOT NULL 인 한 두 조인이 같은 행을 내므로 원리상 구분할 수 없다(M1 원장이 같은 판정을 했다). 테스트 이름을 근거로 읽지 말 것 |
| H7 | ✅ | 항목 13 — 보관 후에도 이력에 남는다 |
| H8 | ✅ | 시도 전 `emp01` 이력 = `[]`(항목 12 이전 관측) |

### U. 활성 태그 (6행)

| # | 상태 | 실측 근거 |
|---|---|---|
| U1 | ✅ | 항목 13 — 보관된 문제에만 붙은 `m7보관태그` 가 in-use 에서 빠진다 |
| U2 | ✅ | 항목 18 — 이름 오름차순, 중복 없음 |
| U3 | ✅ | 항목 18 — 키 집합 `id`·`name`·`createdAt` |
| U4 | ✅ | 항목 13 — 같은 시점에 `/api/tags` 9건 vs `/api/tags/in-use` 8건 |
| U5 | ✅ | 항목 1 — EMPLOYEE 도 200 |
| U6 | – **해당 없음** | 동작이 아니라 포트 현황 기록 행이다(`findInUseTags` 는 서브플랜 4 산출물). 이번 서브플랜은 라우트만 추가했고 그 사실은 U1~U5 로 확인된다 |

### 집계

| 표기 | 행 수 | 행 |
|---|---|---|
| ✅ 파리티 확인 | **73** | — |
| ㉮·㉲·㉳ 이탈 확인(실측) | **3** | P1 · P10-1 · T11 |
| ⚠ 이탈로 대체 | **3** | T8 · T8-1 · T8-2 |
| ▣ 도달 불가 — 단위 테스트로 고정 | **2** | Q9 · T9 |
| ◻ 관측 불가 | **5** | S7 · Q10 · H2 · H4 · H6 |
| – 해당 없음 | **1** | U6 |
| **합계** | **87** | 미대조 **0** |

---

## 3. 발견

### F1 — 타임스탬프 직렬화 형식이 Spring 과 다르다 (결함 아님 / 컷오버 확인 필요)

**측정값.**

| 계층 | 값 |
|---|---|
| DB `attempts.submitted_at`(`timestamp without time zone`) | `2026-08-21 11:20:19.907937` |
| 포트 `GET /api/attempts/me` | `"2026-08-21T11:20:19.907Z"` |
| Spring `AttemptHistoryItem.submittedAt` 타입 | `LocalDateTime` (`backend/src/main/java/com/daeryun/probank/dto/solve/AttemptHistoryItem.java`) — Spring Boot 기본 Jackson 설정(`WRITE_DATES_AS_TIMESTAMPS` off, `application.yml` 에 날짜 설정 없음)에서는 오프셋 없는 ISO 지역시각(`2026-08-21T11:20:19.907937`)으로 나간다 |

**차이 두 가지.** ① 포트는 `Z`(UTC 단정)를 붙인다 ② 마이크로초가 밀리초로 절삭된다.
원인은 Drizzle 의 `timestamp`(비-timezone) 매핑이 값에 문자열 `+0000` 을 붙여 `Date` 를 만들고
(`node_modules/drizzle-orm/pg-core/columns/timestamp.js:31` — `new Date(this.withTimezone ? value : value + "+0000")`)
`JSON.stringify` 가 `toISOString()` 으로 직렬화하기 때문이다(`web/lib/db/attempts.ts:38`).
이 DB 는 세션 TZ 가 `Etc/UTC` 이므로 **결과 순간(instant)은 정확하다.**

**민감한 것은 Node 프로세스 TZ 가 아니라 DB 세션 TZ 다 — 브리프의 서술과 다르다.** 브리프 항목 19 는
"`timestamp without time zone` + postgres.js + **Node 프로세스 TZ** 조합이라 서버 TZ 가 바뀌면
표시가 어긋난다"고 적었지만, 실측하면 측정 머신의 Node TZ 는 `Asia/Seoul`(offset −540)인데도
출력은 DB 벽시계 그대로에 `Z` 가 붙었다. Node TZ 가 개입했다면 `2026-08-21T02:20:19.907Z` 가
나왔어야 한다. 위 Drizzle 코드가 **항상** `+0000` 을 붙이기 때문이다. 쓰는 쪽도
`submitted_at` 기본값이 DB `now()` 라 Node 를 거치지 않는다. 따라서 표시가 어긋나는 조건은
**DB 세션 TZ 가 UTC 가 아니게 되는 것**이지 Node 프로세스 TZ 가 바뀌는 것이 아니다 —
운영 환경 점검 항목이 달라진다.

**프론트 영향.** `frontend/src/pages/solve/AttemptHistoryPage.jsx:24-27` 이
`new Date(value).toLocaleString()` 을 쓴다. 오프셋 없는 문자열은 **브라우저 로컬**로,
`Z` 붙은 문자열은 **UTC** 로 해석되므로 KST 브라우저에서 표시가 9시간 다르다 —
Spring 은 `11:20`(실제 순간보다 9시간 이르게), 포트는 `20:20`(정확)으로 표시한다.
**즉 포트 쪽이 옳고 Spring 표시가 틀렸던 것이지만, 문자열 계약은 분명히 다르다.**

**서브플랜 5 고유가 아니다.** 이미 병합된 표면도 같은 형식을 낸다 — 관리자 문제 목록
`createdAt: "2026-08-24T00:21:40.000Z"`(이번 세션 실측), 계정 목록
`lastLoginAt:"2026-08-17T15:39:02.476Z"`(`docs/qa/2026-08-16-dept-users-e2e-verification.md:119`).
`LocalDateTime` 을 내보내는 **모든 필드에 걸린 이관 전반의 성질**이다.

**새로 발견한 것이 아니다.** 계획서가 M3 시점에 이미 **컷오버 이월**로 올려 뒀고
(`.superpowers/sdd/2026-08-21-migration-solve/progress.md`), 브리프 항목 19 가 "추정하지 말고
관측값을 그대로 붙여라"라고 한 이유도 이것이다. 이번 측정이 그 항목의 **구체적인 값과 실제
민감 조건**을 채운다.

**권고.** 이 서브플랜에서 코드를 바꾸지 않았다(범위 밖이고, 고치면 이미 검증된 두 서브플랜의
동작이 함께 움직인다). **컷오버 시 한 번에 판단할 항목**으로 올린다 — 선택지는 (a) 그대로 두고
프론트 표시가 오히려 교정됨을 받아들인다 (b) 직렬화를 오프셋 없는 지역시각으로 맞춘다.
`docs/qa/2026-08-19-problem-bank-e2e-verification.md` 의 "컷오버 핸드오프" 절과 같은 성격이다.

### 그 외

**브리프에서 사실과 달랐던 것 1건** — 항목 19 의 "Node 프로세스 TZ 조합" 서술. 실제 민감 조건은
DB 세션 TZ 다(위 F1). 나머지 항목(픽스처 구성, 이탈 표기 규칙, 이미지 프록시 15/15, 시도 47 의
성격)은 전부 서술대로였다. 다만 **항목 4 는 기존 픽스처만으로는 성립하지 않는다** — 유일한
FILL_BLANK(문제 12)가 `revealCount == 빈칸 수`라 조합이 하나뿐이어서, 판별용 문제(184)를 새로
만들어야 했다.

**파리티 위반으로 볼 만한 것은 없었다.** 정답 유출 0건, E5-1 네 줄 일치, 승인된 이탈 3종이
모두 의도한 값으로 나왔다. 브리프가 예고한 함정(㉳ 를 위반으로 보고하기, `revealedBlanks[].answerText`
를 유출로 보고하기, T8 계열을 "파리티 확인"으로 적기)은 전부 해당 없음으로 정리했다.

---

## 4. Step 4 — 전체 검증

| 명령 | 결과 |
|---|---|
| `cd web && pnpm test` | **53 파일 / 609 테스트 통과** (실패 0, 소요 114s) |
| `cd web && pnpm build` | **성공.** 라우트 표에 `/api/problems`, `/api/problems/[id]`, `/api/problems/[id]/attempts`, `/api/problems/random`, `/api/attempts/me`, `/api/tags/in-use`, `/api/problem-images/[key]` 가 전부 동적(ƒ) 라우트로 등재 |
| `cd backend && ./gradlew cleanTest test` | **BUILD SUCCESSFUL — 301 테스트 / 실패 0 / 스킵 0.** 이 서브플랜은 `backend/` 를 건드리지 않았다 |

---

## 5. 이번 검증이 `probank_dev` 에 만든 데이터

개발 DB 이고 이후 회귀 검증에 유용하므로 **삭제하지 않고 그대로 뒀다.**

| 대상 | 내용 |
|---|---|
| `problems` 184 | FILL_BLANK, 개발팀(4), `sourceNumber 90001`, 빈칸 3개(a=서울·b=부산·c=광역시), `blankRevealCount=1`, 태그 `공통`. **ACTIVE 유지** — Q5·Q6·Q8·항목 4·항목 10 의 판별 픽스처다(기존 FILL_BLANK 12 는 revealCount == 빈칸 수라 판별력이 없다) |
| `problems` 185 | MCQ_SINGLE, 개발팀(4), `sourceNumber 90002`, 보기 `가`(정답)·`나`, 태그 `m7보관태그`. **검증 마지막에 ARCHIVED 로 전환** — H7·S2·U1 의 판별 픽스처 |
| `tags` | `m7보관태그` 1건 신규(보관 문제에만 붙어 있어 in-use 에서 빠지는 판별자) |
| `attempts` 48~72 | 25건 — `emp01`(user 5) 24건 + `admin` 1건. 자식 행 `attempt_choices` 9행, `attempt_blank_answers` 6행. 채점·저장 검증의 증거 행이다 |
| `users` `m7chk53850` | E3(비밀번호 변경 강제 게이트) 확인용 EMPLOYEE 계정, 개발팀(4), `must_change_password=true` 유지 |

기존 픽스처는 **하나도 수정·삭제하지 않았다.** 특히 **시도 47**(Spring 이 남긴 고아 FILL_BLANK
시도, `attempt_blank_answers` 0행)은 이탈 ㉯ 의 대조 증거이므로 그대로 보존했다.

---

## 컷오버 핸드오프 (서브플랜 5가 넘기는 전체 목록, 한 곳에 모음)

> 서브플랜 4의 같은 절과 같은 규칙이다 — **이 문서만 보고도 컷오버 담당자가 전부 찾을 수
> 있어야 한다.** 흩어져 있으면 없는 것과 같다.

### 이 서브플랜이 새로 만든 것

| # | 항목 | 무엇을 해야 하나 |
|---|---|---|
| C1 | **`SUPABASE_URL`·`SUPABASE_SERVICE_ROLE_KEY` 가 사용자용 GET 의 하드 런타임 의존이 됐다** | 이미지 프록시(`/api/problem-images/[key]`)가 이 둘 없이는 **500** 을 낸다. 라우트가 깨끗하게 처리하지만(그게 try/catch 의 존재 이유다) **"모든 문제 이미지가 500"** 은 배포 전제조건이다. 배포 환경변수 점검표에 넣어라 |
| C2 | **프록시가 이미지 렌더링을 같은 사이트 배포에 묶었다 — Spring 에는 없던 제약이다** | Spring 은 `/uploads/images/<file>` 을 **인증 없는 정적 리소스**로 서빙했다(`StaticResourceConfig`, `/api/**` 세션 필터 **밖**). 포트는 같은 이미지를 `/api/problem-images/…` 에서, 미들웨어 matcher **안**에서, `SameSite=lax` 쿠키 뒤에서 서빙한다. 그런데 `frontend/src/components/solve/ProblemSolveCard.jsx:96` 은 `<img src={problem.imageUrl}>` 로 **저장된 경로를 그대로** 쓴다 — 프론트 오리진 기준으로 풀린다. API 클라이언트는 `VITE_API_BASE_URL` 기준이다(`frontend/src/api/client.js:8`).<br>**실패 시나리오:** Vite 번들을 정적 호스트에, Next 를 다른 호스트명에 올리면 모든 `<img>` 가 프론트 오리진을 때려 404 가 나고, API 오리진으로 고쳐 써도 **Lax 쿠키는 교차 사이트 하위 리소스에 안 실려** 401 이 된다.<br>게이트 자체는 옳고 승인됐다(이탈 ㉱ + 이관 설계 Q8) — **문서화되지 않은 것은 배포 결합이다.** 같은 오리진에 올리거나, 프론트가 이미지 URL 도 API 베이스로 풀도록 고쳐야 한다 |
| C3 | **`timestamp without time zone` 표시 (F1)** | Java `LocalDateTime` 은 TZ 없이 직렬화하고 포트는 UTC `Z` 를 붙인다. **민감한 것은 Node 프로세스 TZ 가 아니라 DB 세션 TZ 다** — Drizzle 은 `value + "+0000"` 으로 항상 UTC 파싱한다(`drizzle-orm/pg-core/columns/timestamp.js`). 현재 `current_setting('TimeZone')` = `Etc/UTC`. 운영에서 이 값을 확인하라 |

### 이전 구간에서 이월된 것

| # | 항목 | 상태 |
|---|---|---|
| C4 | **이탈 ㉲ — 숫자 파라미터 변환** (P10-1) | `parseNumericParam` 이 서브플랜 3·4 공유 헬퍼라 이 서브플랜에서 바꾸지 않았다. Spring 은 `1e2`·공백을 거부하고 `"1 0"` 을 10 으로 읽는다 |
| C5 | **Q12-1 — 상세를 반복 호출하면 제출 없이 정답을 모을 수 있다** | Java 도 같으므로 파리티다. 막으려면 무엇을 보여 줬는지 저장하는 새 상태가 필요하다 |
| C6 | **이탈 ㉰ — 목록·이력에 페이지네이션 없음** | 722문항 규모에서 전체 반환의 실측 성능을 컷오버 후 확인 |
| C7 | **미들웨어의 1012 분기가 조용하다** | `mustChangePassword` 사용자는 `200 + JSON(1012)` 을 받는다 — 이미지 프록시에서는 **성공 상태를 단 깨진 이미지**이고 서버에 신호가 안 남는다. 비로그인(401)과 달리 진단 불가 |

### 서브플랜 6(통계)이 먼저 알아야 할 DB 사실

| # | 사실 | 왜 중요한가 |
|---|---|---|
| C8 | **`attempts` 47 번은 일부러 남긴 Spring 시대 고아 행이다** | FILL_BLANK 인데 `attempt_blank_answers` 가 **0행**이다. "모든 FILL_BLANK 시도는 자식이 1행 이상"이라는 단언을 세우면 여기서 깨지고, **포트 버그처럼 읽힌다.** 이탈 ㉯ 가 막으려던 바로 그 상태의 표본이다 |
| C9 | **선택지 0개인 시도가 계약상 존재한다** (시도 59·60) | T5 — 자식 행은 비어 있지 않을 때만 쓴다. `INNER JOIN attempt_choices` 하는 집계는 이 시도들을 **조용히 누락**한다. Java 도 동일하므로 파리티지만, 기본값으로 틀리기 쉬운 모양이다 |
