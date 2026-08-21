# 문제은행 E2E 검증 결과 (M7 / Task 10)

**측정일:** 2026-08-21
**대상:** `feat/problem-bank-m7`, `web/` 프로덕션 빌드(`pnpm build && pnpm start`)가 이미 떠 있는 `http://localhost:3220`
**DB:** `probank_dev`(docker `probank-postgres`, 호스트 포트 5434)
**정답지:** `docs/qa/2026-08-19-problem-bank-parity-checklist.md` (승인된 이탈 7건 + R/V/N/L/C/D/I/X/F/A 138행)
**측정 방식:** Node `fetch` 스크립트로 실제 HTTP 호출 → 응답 본문을 파일로 받아 그대로 옮겨 적음(한글이 셸 파이프에서 깨지므로 curl+grep 은 쓰지 않았다). DB 는 `docker exec … psql` 직접 조회. 스토리지는 Supabase Storage REST API 직접 호출.

**요약**

| 항목 | 결과 |
|---|---|
| Step 2 (엔드포인트 전수) | 14개 항목 + 하위 항목 전부 실측, 기대와 일치 |
| Step 3 (버킷 정리) | 업로드 4개 → 4개 삭제 → 재조회 `[]` (빈 상태 확인) |
| Step 4 (정답지 대조) | 138행 중 **133행 실측 확인 · 5행 미실측(사유 명시)**, 승인된 이탈 7건 유지, **컷오버 이월 3건** |
| Step 5 (전체 검증) | `web` vitest **441 passed / 40 files**, `pnpm build` 성공, `backend` gradle **301 tests, 0 failures** |
| 프로덕션 코드 결함 | **없음** (아래 "실측으로 새로 드러난 것" 3건은 전부 플랫폼 경계이거나 이미 문서화된 이탈의 재확인) |

**★ 가장 중요한 행 — 정답지 N4/N5, Step 2 #3**

```
POST /api/admin/problems?departmentId=4   (개발팀, sourceNumber=1001 재등록)
HTTP 400
{"resultCode":1000,"resultMsg":"개발팀 1001번은 이미 있습니다. 다른 번호를 입력하세요."}
```

`처리 중 오류가 발생하였습니다` 가 **아니다.** 부서명(`개발팀`)과 번호(`1001`)가 모두 문구에 들어가 있으므로,
부서명 조회가 쓰기 **전에** 끝났고(N5) catch 안에서 SELECT 하지 않았다는 뜻이다 — QA-1 은 재발하지 않았다.
계약된 중복(`uq_problems_department_source_number`)을 실제 DB 행으로 만들어 낸 진짜 중복이며, 수정 경로에서도 같다:

```
PUT /api/admin/problems/5   (sourceNumber 를 이미 존재하는 1001 로 변경)
HTTP 400
{"resultCode":1000,"resultMsg":"개발팀 1001번은 이미 있습니다. 다른 번호를 입력하세요."}
```

---

## Step 1. 서버 기동

기동은 이 Task 이전에 이미 되어 있었다(프로덕션 빌드 + `pnpm start`, 포트 3220). 재기동·재빌드 없이 측정했다.
Step 5 의 `pnpm build` 는 모든 실측이 끝난 뒤에 돌렸고, 그 뒤에도 `GET /` 200 · `GET /api/tags` 401(미인증)로
서버가 살아 있음을 확인했다. **어떤 프로세스도 종료하지 않았다.**

계정은 `…/scratchpad/m7_fixtures.json` 의 것을 그대로 썼다.

| 사번 | 역할 | 부서 |
|---|---|---|
| `admin` | SUPER_ADMIN | 본사(3) |
| `dev01` | DEPT_ADMIN | 개발팀(4) |
| `sal01` | DEPT_ADMIN | 영업팀(5) |
| `emp01` | EMPLOYEE | 개발팀(4) |

부서: 본사 3(ACTIVE) · 개발팀 4(ACTIVE) · 영업팀 5(ACTIVE) · **폐지팀 6(INACTIVE)**.
측정 시작 시점 `problems` 0건, `tags` 0건, `excel_upload_logs` 0건, `audit_logs` 7건(부서·계정 생성 흔적).

---

## Step 2. 엔드포인트 전수 확인 — 응답 본문 그대로

`resultMsg` 는 응답에서 그대로 복사한 것이다.

### #1 총괄로 생성

```
POST /api/admin/problems?departmentId=4
{"type":"MCQ_SINGLE","content":"총괄 생성 문제","choices":[{"text":"가","correct":true},{"text":"나","correct":false}],
 "sourceNumber":1001,"tags":["Alpha"," alpha ","beta"]}
HTTP 200
{"resultCode":200,"resultMsg":"정상 처리되었습니다."}
```

기대(200 / `resultCode:200`)와 일치. `data` 없음(`ok()`) — 응답 봉투 규칙대로다.
태그는 `Alpha`/` alpha `/`beta` 3개를 보냈으나 저장은 `["alpha","beta"]` — trim → `toLowerCase()` → 중복 제거(V29).

### #2 부서관리자로 생성(부서 위조)

```
POST /api/admin/problems?departmentId=5      ← dev01(개발팀) 이 영업팀 id 를 보냄
HTTP 200
{"resultCode":200,"resultMsg":"정상 처리되었습니다."}
```

DB 실측: `id=2, department_id=4, source_number=1002` — **요청한 5 가 무시되고 본인 부서 4 로 저장**되었다(R5).

### #3 중복 번호로 생성 ★

```
POST /api/admin/problems?departmentId=4      ← sourceNumber 1001 재사용
HTTP 400
{"resultCode":1000,"resultMsg":"개발팀 1001번은 이미 있습니다. 다른 번호를 입력하세요."}
```

기대(400 / 1000 / 부서명+번호 문구)와 일치. `처리 중 오류가 발생하였습니다` 아님.

### #4 목록 `size=100000`

```
GET /api/admin/problems?size=100000
HTTP 200
{"resultCode":200,"resultMsg":"정상 처리되었습니다.","data":{"items":[…11건…],"totalCount":11,"page":1,"size":100}}
```

`size:100` 으로 클램프(L3). 곁들여 잰 것: `size=0` → `size:20`, `size=-5` → `size:20`(L2), `page=0`·`page=-3` → `page:1`(L4).

### #5 목록 필터

| 필터 | 요청 | 결과 |
|---|---|---|
| departmentId | `?departmentId=5&size=100` | `totalCount:1`, id 14(영업팀 문제) |
| type | `?type=FILL_BLANK&size=100` | `totalCount:1`, id 12 |
| status | `?status=ARCHIVED&size=100` / `?status=ACTIVE&size=100` | 1건 / 10건 |
| tag(대문자) | `?tag=ALPHA&size=100` | `totalCount:1`, id 1 — `lower()` 비교(L10) |
| tag(없는 값) | `?tag=nope` | `totalCount:0` |
| keyword | `?keyword=정상` | `totalCount:1`, id 6 (`V11 정상`) — ILIKE 부분일치 |
| createdFrom(미래) | `?createdFrom=2027-01-01` | `totalCount:0` |
| createdTo(오늘) | `?createdTo=2026-08-21` | `totalCount:11` — **오늘 만든 행이 포함**(`+ INTERVAL '1 day'`, L9) |
| createdTo(과거) | `?createdTo=2026-08-01` | `totalCount:0` |
| 9개 전부 | `?departmentId=4&type=MCQ_SINGLE&status=ACTIVE&createdFrom=2026-08-01&createdTo=2026-12-31&tag=alpha&keyword=총괄&page=1&size=20` | `totalCount:1`, id 1 (L1) |

날짜 형식 위반:

```
GET /api/admin/problems?createdFrom=2026-02-30
HTTP 400
{"resultCode":1000,"resultMsg":"요청 값의 형식이 올바르지 않습니다: createdFrom"}

GET /api/admin/problems?createdTo=20260801
HTTP 400
{"resultCode":1000,"resultMsg":"요청 값의 형식이 올바르지 않습니다: createdTo"}
```

### #6 부서관리자로 남의 부서 상세

```
GET    /api/admin/problems/14   (영업팀 문제, dev01)   HTTP 403  {"resultCode":990,"resultMsg":"접근 권한이 없습니다."}
PUT    /api/admin/problems/14   (dev01)                HTTP 403  {"resultCode":990,"resultMsg":"접근 권한이 없습니다."}
DELETE /api/admin/problems/14   (dev01)                HTTP 403  {"resultCode":990,"resultMsg":"접근 권한이 없습니다."}
```

### #7 부서관리자로 부서 이동

```
PUT /api/admin/problems/1/department   (dev01, DEPT_ADMIN)
HTTP 403
{"resultCode":990,"resultMsg":"접근 권한이 없습니다."}
```

정상 이동(총괄):

```
PUT /api/admin/problems/1/department  {"departmentId":5}
HTTP 200
{"resultCode":200,"resultMsg":"정상 처리되었습니다.","data":{"sourceNumber":2002}}
```

영업팀 최대 번호가 2001 이었으므로 2002 — `findMaxSourceNumber+1`(C7). 응답은 `{sourceNumber:n}`(C10).

### #8 같은 부서로 이동

```
PUT /api/admin/problems/1/department  {"departmentId":4}   ← 이미 개발팀 소속
HTTP 400
{"resultCode":1000,"resultMsg":"이미 개발팀 소속입니다."}
```

같은 라우트의 나머지 갈래:

```
{"departmentId":null} / 필드 자체 없음 → 400 {"resultCode":1000,"resultMsg":"옮길 부서를 선택하세요."}
{"departmentId":999999}              → 400 {"resultCode":1000,"resultMsg":"존재하지 않는 부서입니다."}
{"departmentId":6}(폐지팀 INACTIVE)   → 400 {"resultCode":1000,"resultMsg":"비활성 부서로는 옮길 수 없습니다: 폐지팀"}
문제 id 99999999                      → 400 {"resultCode":1000,"resultMsg":"존재하지 않는 문제입니다."}
```

### #9 다음 번호

```
GET /api/admin/problems/next-source-number?departmentId=4
HTTP 200
{"resultCode":200,"resultMsg":"정상 처리되었습니다.","data":9303}
```

`data` 가 **숫자 그대로**다(C12). `[id]` 라우트로 새지 않았다 — 샜다면 `"존재하지 않는 문제입니다."` 가 나왔을 것이다.

| 호출 | 결과 |
|---|---|
| admin, `departmentId=5` | `2003` — 이동으로 2002 가 생긴 뒤라 영업팀 max 2002+1 |
| dev01, `departmentId=5`(위조) | `9303` — 본인 부서(4) 스코프로 강제(R5/C11) |
| sal01, 파라미터 없음 | `2003` — 본인 부서(5) |
| admin, 파라미터 없음 | 400 `{"resultCode":1000,"resultMsg":"문제가 귀속될 부서를 선택하세요."}` (R8) |
| admin, `departmentId=6`(INACTIVE) | 400 `{"resultCode":1000,"resultMsg":"비활성 부서에는 문제를 등록할 수 없습니다: 폐지팀"}` (R10) |
| emp01(EMPLOYEE) | 403 `{"resultCode":990,"resultMsg":"접근 권한이 없습니다."}` |

**번호 재사용 금지(C7/spec D5) 판별력 있는 확인:** 개발팀 최대 번호(9302)를 가진 문제를 보관 처리한 뒤 다시 물었더니
여전히 `9303` 이었다 — `findMaxSourceNumber` 의 `WHERE` 에 상태 조건이 없다는 뜻이다.

### #10 이미지 svg 업로드

```
POST /api/admin/problems/images   (file=evil.svg, Content-Type: image/svg+xml)
HTTP 400
{"resultCode":1014,"resultMsg":"허용되지 않는 파일 형식입니다. png, jpg, jpeg, gif, webp 이미지만 업로드할 수 있습니다."}
```

이중 검증(I3)이 각각 독립적으로 도는 것도 실측했다:

```
a.bmp + Content-Type: image/png   (확장자만 위반)      → 400 / 1014 / 같은 문구
a.png + Content-Type: text/plain  (Content-Type만 위반) → 400 / 1014 / 같은 문구
```

### #10-1 `file` 파트 자체가 없음 (I11ⓐ/ⓑ 통합 — 승인된 이탈 ⑥)

```
POST /api/admin/problems/images   (멀티파트는 정상, file 파트만 없음)
HTTP 200
{"resultCode":1009,"resultMsg":"파일을 업로드할 수 없습니다."}
```

같은 문구로 통합되는 나머지 갈래도 실측했다.

```
ⓐ-1 깨진 멀티파트(Content-Type: multipart/form-data; boundary=----zzz, 본문은 쓰레기)
    HTTP 200 {"resultCode":1009,"resultMsg":"파일을 업로드할 수 없습니다."}
ⓐ-2 바디가 애초에 멀티파트가 아님(Content-Type: application/json, 본문 "{}")
    HTTP 200 {"resultCode":1009,"resultMsg":"파일을 업로드할 수 없습니다."}
ⓐ-2 + 역할 불일치(emp01)
    HTTP 200 {"resultCode":1009,"resultMsg":"파일을 업로드할 수 없습니다."}   ← Java 는 403/990 이 나는 자리
```

정답지 I11 이 "ⓐ-2 는 실측하지 않았다"고 남겨 둔 칸을 **포트 쪽만** 채웠다. Java 쪽 실제 응답은
Spring 인스턴스가 있어야 재도 되므로 여전히 **컷오버 이월**이다(아래 Step 4 참고).

### #10-2 `file` 파트는 있지만 0바이트 (I11ⓒ — 이탈 아님)

```
POST /api/admin/problems/images   (file=empty.png, 0 bytes, image/png)
HTTP 400
{"resultCode":1009,"resultMsg":"필수 파일이 누락되었습니다."}
```

**#10-1 과 문구가 다르다** — 파트 부재("파일을 업로드할 수 없습니다.", 200)와 0바이트("필수 파일이 누락되었습니다.", 400)가
뭉개지지 않았다. 이것이 이 두 행의 확인 대상이었다.

### #10-3 5MB 초과 + 형식 위반 동시 (I4 가 I5 보다 먼저)

```
POST /api/admin/problems/images   (5,242,881 bytes, name=big.exe, Content-Type: application/octet-stream)
HTTP 400
{"resultCode":1015,"resultMsg":"이미지 크기는 5MB를 초과할 수 없습니다."}
```

1014 형식 문구가 아니라 **1015 크기 문구**가 나왔다 — 크기 검사(java:63-65)가 형식 검사(:130-142)보다 먼저다.
경계값도 쟀다: 정확히 5,242,880 바이트(`exact.png`, image/png)는 **200 성공**.

### #10-4 성공 업로드 + 감사 로그 (I9/A7)

```
POST /api/admin/problems/images   (file 이름 "사진.PNG", Content-Type: image/png, 70 bytes)
HTTP 200
{"resultCode":200,"resultMsg":"정상 처리되었습니다.","data":{"imageUrl":"/api/problem-images/7d512a3e-d0c4-4625-8749-bac615419527.png"}}
```

DB 직접 조회 `select … from audit_logs order by id desc limit 1`:

```
id=27 | actor_id=2 | action=PROBLEM_IMAGE_UPLOADED | target_type=PROBLEM_IMAGE | target_id=(NULL)
detail={"fileName": "7d512a3e-d0c4-4625-8749-bac615419527.png"}
```

`detail.fileName` 이 응답 URL 의 `IMAGE_URL_PREFIX`(`/api/problem-images/`) **이후 부분과 정확히 일치**한다.
`target_id` 는 NULL 이다. 원본 파일명(`사진.PNG`)은 키에 전혀 남지 않았다 — 항상 새 UUID + 검증된 소문자 확장자(I6).

경로 조작 파일명도 확인: `a.png/../../evil.png`(image/png) → 200, 저장 키
`3d60b389-ace4-435f-9c4e-c08db52c0fd8.png` — `..` 도 경로 구분자도 키에 섞이지 않았다(I6/I7).

부서 관리자도 올릴 수 있다(I13): `dev01` → 200 `{"imageUrl":"/api/problem-images/6acd25e6-10ab-424b-81d2-acdceacbd7af.png"}`,
감사 로그 `actor_id=3`. `emp01`(EMPLOYEE) → 403 / 990.

업로드가 돌려준 URL 을 그대로 문제 저장에 넣어도 통과한다(왕복 확인): `imageUrl` 에 위 URL 을 넣은 생성 → 200.

### #11 12컬럼 엑셀 업로드

```
POST /api/admin/problems/excel-upload?departmentId=4   (docs/문제은행_엑셀/문제_01_공통.xlsx, 12컬럼 43행)
HTTP 200
{"resultCode":200,"resultMsg":"정상 처리되었습니다.",
 "data":{"totalRows":43,"successRows":0,"failRows":43,
         "errorDetail":"행 2: 문항 번호는 필수입니다.\n행 3: 문항 번호는 필수입니다.\n … 행 44: 문항 번호는 필수입니다."}}
```

**전 43행이 `"문항 번호는 필수입니다."`** — 13번째 열(문항번호)이 없는 배포본이므로 기대대로다.

### #12 13컬럼 엑셀 업로드

```
POST /api/admin/problems/excel-upload?departmentId=4   (real13.xlsx, 13컬럼 43행, 문항번호 1~46)
HTTP 200
{"resultCode":200,"resultMsg":"정상 처리되었습니다.","data":{"totalRows":43,"successRows":43,"failRows":0,"errorDetail":null}}
```

### #13 같은 파일 재업로드

```
POST /api/admin/problems/excel-upload?departmentId=4   (real13.xlsx 재업로드)
HTTP 200
{"resultCode":200,"resultMsg":"정상 처리되었습니다.",
 "data":{"totalRows":43,"successRows":0,"failRows":43,
         "errorDetail":"행 2: 문항 번호 1번은 이 부서에 이미 있습니다.\n행 3: 문항 번호 2번은 이 부서에 이미 있습니다.\n
                        … 행 44: 문항 번호 46번은 이 부서에 이미 있습니다."}}
```

전 43행이 `"문항 번호 N번은 이 부서에 이미 있습니다."` — X20 문구가 일반 문구에 묻히지 않았다.

### #14 태그 목록

```
GET /api/tags   (admin)
HTTP 200
{"resultCode":200,"resultMsg":"정상 처리되었습니다.","data":[
  {"id":5,"name":"지리",…},{"id":6,"name":"재삽입",…},{"id":1,"name":"alpha",…},
  {"id":2,"name":"beta",…},{"id":3,"name":"keep",…},{"id":4,"name":"trimtag",…}]}
```

`emp01`(EMPLOYEE)도 200 을 받는다 — `TagController` 에는 `@RequireRole` 이 없다(R3).
`GET /api/tags/in-use` 는 **404**(Next 기본 not-found HTML) — 정답지 R3 이 명시한 대로 서브플랜 5 소관이라 아직 라우트가 없다.

---

## Step 3. 업로드한 이미지 오브젝트 정리

**버킷 설정 실측**(`GET /storage/v1/bucket/problem-images`):

```json
{"id":"problem-images","name":"problem-images","public":false,"file_size_limit":5242880,
 "allowed_mime_types":["image/png","image/jpeg","image/gif","image/webp"]}
```

비공개 · 5MB · svg 제외 — 정답지 I14 대로다.

**검증 시작 시점 목록:** `[]` (빈 버킷)

**이 검증이 만든 오브젝트 4개**(성공 업로드 4건 전부):

| 키 | 크기 | 만든 항목 |
|---|---|---|
| `3d60b389-ace4-435f-9c4e-c08db52c0fd8.png` | 70 B | I6 경로 조작 파일명 |
| `c84a6310-109c-4dc1-a5a0-c74a8252d09c.png` | 5,242,880 B | I4 경계값(정확히 5MB) |
| `7d512a3e-d0c4-4625-8749-bac615419527.png` | 70 B | **#10-4 감사 로그 대상** |
| `6acd25e6-10ab-424b-81d2-acdceacbd7af.png` | 70 B | I13 dev01 업로드 |

**삭제**(`DELETE /storage/v1/object/problem-images`, `{"prefixes":[…4개…]}`) → HTTP 200, 응답에 4개 오브젝트가 삭제 대상으로 그대로 반환됨.

**삭제 후 재조회**(`POST /storage/v1/object/list/problem-images`, prefix `""`, limit 1000):

```json
{"status":200,"body":[]}
```

**버킷은 비어 있다.** 애플리케이션에는 이미지 삭제 API 가 없으므로(`ProblemController` 9개 매핑 어디에도 없고
`archive`(`DELETE /{id}`)도 `problems.status` 만 바꾼다) M5 전례·Ruling 12 대로 Storage API 로 직접 지웠다.
서비스 롤 키는 `web/.env` 에서 읽어 헤더로만 썼고 어디에도 출력하지 않았다.

> **남는 흔적 하나(의도적, DB 는 보존하라는 지시에 따름):** `problems.image_url` 이 NULL 이 아닌 행이 2건 남는다 —
> `id=15`(`/api/problem-images/7d512a3e-….png`, 위에서 지운 오브젝트를 가리키는 dangling 참조)와
> `id=17`(`/api/problem-images/a.png`, X11 "이미 유효한 경로는 그대로 저장된다" 검증용으로 애초에 실물이 없던 값).
> 정답지 I12 가 기록한 "이관 시점 0건"은 역사적 사실이고, 이 두 건은 **이 검증이 만든 것**이다.

---

## Step 4. 정답지 대조 (138행)

**범례** — `실측`: 이 문서의 HTTP/DB/Storage 실측으로 확인. `이탈`: 승인된 이탈, 재심 안 함. `이월`: 로컬에서 원리상 잴 수 없어 컷오버로 넘김. `미실측`: 재지 못했고 사유를 적음.

### 승인된 이탈 7건 — 전부 유지, 재심하지 않음

| 번호 | 상태 | 실측 근거 |
|---|---|---|
| ① 이미지 저장소 변경(Supabase Storage) | 이탈 유지 | 버킷 `problem-images` 실동작 확인(Step 3) |
| ② 이미지 URL 접두어 `/api/problem-images/` | 이탈 유지 | #10-4 응답 URL, V8 거부 문구 모두 이 접두어 |
| ③ 엑셀 상한 20MB→4MB / 1015 | 이탈 유지 | 4.2·5·8·9MB 파일 모두 400/1015(아래 F7) |
| ④ SheetJS 행 번호(blankrows:false) | 이탈 유지 | 실측 파일에 빈 행이 없어 어긋남이 드러나지 않음(어긋날 조건 자체가 없었음) |
| ⑤ 유형 enum 서수 입력 거부 | 이탈 유지 | `{"type":3}` → HTTP 200 / 1000 / `"잘못된 파라미터를 입력했습니다."` (Spring 은 200/정상저장) |
| ⑥ 리스트 원소 null 관용 | 이탈 유지 | `{"tags":[null,"keep"]}` → 200 성공, 저장 태그 `["keep"]` (Java 는 NPE→-1) |
| ⑦ 엑셀 중복 판정의 좁힘 | 이탈 유지 | X20 은 계약된 제약에서만 번호 문구가 나옴(재업로드 43행 전부) |

### R. 역할·부서 스코프 (12행)

| ID | 상태 | 실측값 |
|---|---|---|
| R1 | 실측 | dev01 로 8개 전부 성공: 생성 200 · 목록 200 · 자기 부서 상세 200 · 자기 부서 수정 200 · 자기 부서 보관 200 · 이미지 업로드 200 · 엑셀 업로드 200 · 다음번호 200 |
| R2 | 실측 | dev01 `PUT /{id}/department` → 403 / 990 |
| R3 | 실측 | emp01 `GET /api/tags` → 200. `GET /api/tags/in-use` → **404**(행이 명시한 서브플랜 5 소관, 결함 아님) |
| R4 | 실측 | emp01 생성 403/990, 이미지 403/990, 엑셀 403/990, 다음번호 403/990 |
| R5 | 실측 | dev01 이 `departmentId=5` 로 생성 → DB `department_id=4`. 엑셀도 동일(F6: 감사 detail `departmentId:4`) |
| R6 | 실측 | dev01 → 영업팀 문제 상세/수정/보관 전부 403/990 |
| R7 | 실측 | dev01 `?departmentId=5` 목록 → 개발팀 행만, 영업팀 id 14 없음 |
| R8 | 실측 | `"문제가 귀속될 부서를 선택하세요."` (생성·다음번호 양쪽) |
| R9 | 실측 | `departmentId=999999` → `"존재하지 않는 부서입니다."` |
| R10 | 실측 | `departmentId=6` → `"비활성 부서에는 문제를 등록할 수 없습니다: 폐지팀"` (C5 문구와 다름을 나란히 확인) |
| R11 | 실측 | 상세/수정/보관 세 경로 모두 `"존재하지 않는 문제입니다."` |
| R12 | 실측 | departmentId 미지정 + sourceNumber null → **`"문항 번호를 입력하세요."`** (R8 문구가 아님 = 순서 유지) |

### V. 생성·수정 검증 (33행) — 전부 실측

| ID | 실측 문구 / 결과 |
|---|---|
| V1 | content 공백 + sourceNumber null → `"문제 내용을 입력하세요."` (validate 가 validateSourceNumber 보다 먼저) |
| V2 | 유형 변경 + content 공백 + sourceNumber null → `"문제 유형은 수정할 수 없습니다."` (유형 검사가 먼저) |
| V3 | `content:"  V3 트림 대상  "`, `referenceText:"  참조  "`, `explanation:"   "` → 저장 `content:"V3 트림 대상"`, `referenceText:"참조"`, `explanation:null` |
| V4 | `"문제 유형은 수정할 수 없습니다."` |
| V5 | `"문제 유형을 선택하세요."` |
| V6 | `"문제 내용을 입력하세요."` |
| V7 | `imageUrl:"   "` → 200 생성, DB `image_url` NULL |
| V8 | `/uploads/images/a.png` 및 `/api/problem-images/../secret.png` → `"이미지는 이미지 업로드 API로 등록한 경로(/api/problem-images/...)만 사용할 수 있습니다."` |
| V9 | 501자(접두어 유효) → `"이미지 경로는 500자 이하여야 합니다."` |
| V10 | 보기 2 · 정답 1 → 200 |
| V11 | MCQ_MULTI 정답 2 → 200 |
| V12 | OX 보기 3개 → `"OX 문제는 보기 2개(O/X)가 필요합니다."` (보기 개수 문구가 아님 = 순서 유지) |
| V13 | 보기 1개 → `"보기는 2개 이상 5개 이하이어야 합니다."` |
| V14 | `"빈 보기는 입력할 수 없습니다."` |
| V15 | `"보기는 500자 이하여야 합니다."` |
| V16 | MCQ_SINGLE 정답 2개 → `"정답 개수가 올바르지 않습니다."` |
| V17 | MCQ_MULTI 정답 0개 → `"정답을 최소 1개 선택하세요."` |
| V18 | `"정답을 최소 1개 입력하세요."` |
| V19 | `"빈 정답은 입력할 수 없습니다."` |
| V20 | `"정답은 500자 이하여야 합니다."` |
| V21 | `"빈칸을 최소 1개 정의하세요."` |
| V22 | `"빈칸 키와 정답을 모두 입력하세요."` |
| V23 | `"빈칸 키는 50자 이하여야 합니다."` |
| V24 | `"빈칸 정답은 500자 이하여야 합니다."` |
| V25 | `"빈칸 키가 중복되었습니다."` |
| V26 | `"본문에 없는 빈칸 마커입니다: zz"` |
| V27 | `"정답이 등록되지 않은 빈칸 마커가 본문에 있습니다: b"` |
| V28 | null 및 `blanks.length` 초과 둘 다 → `"출제할 빈칸 개수가 유효하지 않습니다."` |
| V29 | 태그 21개 / 태그명 101자 → `"태그는 문제당 20개, 태그명은 100자 이하여야 합니다."`. 정규화는 `["Alpha"," alpha ","beta"]` → `["alpha","beta"]` |
| V30 | 보기 2개 문제를 3개로 수정 → 상세의 choice id 가 23·24·25 로 전량 새로 발급(전삭제 후 재삽입) |
| V31 | MCQ_SINGLE 에 `blankRevealCount:3` 전달 → DB `blank_reveal_count` **NULL** |
| V32 | 보기 `displayOrder` 1,2,3 / 빈칸 `displayOrder` 1,2 — 둘 다 1부터 |
| V33 | `{"type":"NOPE"}`·`content` 자리에 객체·`tags` 자리에 문자열 셋 다 → **HTTP 200** + `{"resultCode":1000,"resultMsg":"잘못된 파라미터를 입력했습니다."}`, 본문에 **`errorList` 키가 아예 없음** |

### N. 문항번호 (8행)

| ID | 상태 | 실측값 |
|---|---|---|
| N1 | 실측 | `"문항 번호를 입력하세요."` |
| N2 | 실측 | `0`·`-5` 둘 다 → `"문항 번호는 1 이상이어야 합니다."` |
| N3 | 실측 | 수정 경로에서도 sourceNumber null → `"문항 번호를 입력하세요."` |
| N4 | 실측 ★ | 생성·수정 양쪽에서 `"개발팀 1001번은 이미 있습니다. 다른 번호를 입력하세요."` (400/1000) |
| N5 | 실측 ★ | 위 문구에 부서명이 들어 있다는 사실 자체가 판별력이다 — catch 안 SELECT 였다면 25P02 로 트랜잭션이 abort 되어 `-1 처리 중 오류가 발생하였습니다` 가 나왔을 것이다. 나오지 않았다 |
| N6 | **미실측**(레이스 재현 실패) | 다른 제약의 23505 를 CRUD 경로에서 일으키려면 `tags_name_unique` 경합이 필요하다. 새 태그명 하나로 8개 생성 요청을 동시에 던졌으나 8건 모두 200 — 직렬화되어 경합이 발생하지 않았다. 행 본문이 밝히듯 **설계상 도달 불가에 가까운 갈래**이고, 좁힘 자체는 `problemService.test.ts`(`isDuplicateSourceNumber 는 그 제약의 23505 에만 true 다`)로 고정돼 있다 |
| N7 | 실측 | `postgres.js` 로 같은 (부서,번호) 재삽입을 직접 유발해 오류 객체를 덤프: `code:"23505"`, **`constraint_name:"uq_problems_department_source_number"`**, **`constraint: undefined`**, `table_name:"problems"`. 키 목록: `name,severity_local,severity,code,detail,schema_name,table_name,constraint_name,file,line,routine` |
| N8 | **미실측**(도달 불가) | `lookupDepartmentName` 에 null/없는 부서가 들어가려면 그 전에 `resolveOwningDepartment` 나 `findDepartmentById` 가 이미 부서를 확인해 둔 상태여야 하므로 HTTP 경로로는 `"해당 부서"` 폴백에 도달할 수 없다. 방어적 폴백 |

### L. 목록 필터·정렬·페이징 (16행) — 전부 실측

| ID | 실측값 |
|---|---|
| L1 | 9개 파라미터 동시 전달 → 200, `totalCount:1` |
| L2 | `size=0`·`size=-5` → 응답 `size:20` |
| L3 | `size=100000` → 응답 `size:100` |
| L4 | `page=0`·`page=-3` → 응답 `page:1` |
| L5 | `departmentId=5` → 영업팀 1건만 |
| L6 | `type=FILL_BLANK` → 1건 |
| L7 | `status=ARCHIVED` 1건 / `ACTIVE` 10건 (합 = 전체 11) |
| L8 | `createdFrom=2027-01-01` → 0건 |
| L9 | `createdTo=2026-08-21`(오늘) → 오늘 만든 11건 **포함**, `createdTo=2026-08-01` → 0건 |
| L10 | `tag=ALPHA` → `alpha` 태그 문제 매칭(대소문자 무관) |
| L11 | `keyword=정상` → 본문 부분일치 1건 |
| L12 | `orderBy(desc(createdAt), desc(id))`(`lib/db/problems.ts:159`) 확인 + 엑셀 60건 적재 뒤 `size=5` 로 page1~3 순회 시 id 중복·누락 0. (실측 데이터에는 `created_at` 이 완전히 같은 행이 생기지 않았다 — 행별 트랜잭션이라 `now()` 가 행마다 다르다. 타이브레이커는 코드로 확인) |
| L13 | 태그 2개짜리 문제가 섞인 전체 목록에서 `totalCount:60` = `select count(*) from problems` 60. 부풀지 않았다. `countProblems` 에 태그 조인 없음(`lib/db/problems.ts:171-179`) |
| L14 | `{items:[{id,type,content,status,departmentId,departmentName,createdAt,tags}],totalCount,page,size}` — 그대로 |
| L15 | `2026-02-30`·`20260801` → `"요청 값의 형식이 올바르지 않습니다: <name>"` (1000) |
| L16 | dev01 이 `departmentId=5` 전달 → 무시, 본인 부서만 |

### C. 부서 이동·다음번호 (12행)

| ID | 상태 | 실측값 |
|---|---|---|
| C1 | 실측 | dev01 → 403/990 |
| C2 | 실측 | `"존재하지 않는 문제입니다."` |
| C3 | 실측 | 필드 누락·`null` 둘 다 `"옮길 부서를 선택하세요."` |
| C4 | 실측 | `"존재하지 않는 부서입니다."` |
| C5 | 실측 | `"비활성 부서로는 옮길 수 없습니다: 폐지팀"` |
| C6 | 실측 | `"이미 개발팀 소속입니다."` (조용한 no-op 아님) |
| C7 | 실측 | 영업팀 max 2001 → 2002 배정. 최대 번호 보유 문제를 보관해도 다음 번호가 그대로 → `WHERE` 에 상태 조건 없음 |
| C8 | **미실측**(레이스 재현 실패) | 같은 부서로 두 문제를 병렬 이동(`Promise.all`) 시켰으나 2002·2003 이 순서대로 나와 UNIQUE 위반이 발생하지 않았다. 이 갈래는 **레이스 없이는 도달 불가**다(`max+1` 은 정의상 비어 있는 번호). 재조회 없이 미리 읽어 둔 부서명을 쓰는 구조는 `departmentMove.ts` 코드와 단위테스트로 고정 |
| C9 | 실측 | `PROBLEM_DEPARTMENT_CHANGED` / `PROBLEM` / target 1 / `{"to": 5, "from": 4, "sourceNumberTo": 2002, "sourceNumberFrom": 1001}` |
| C10 | 실측 | `{"sourceNumber":2002}` |
| C11 | 실측 | admin `?departmentId=5`→2003 · dev01 `?departmentId=5`→9303(본인 부서) · sal01 무인자→2003 · admin 무인자→R8 문구 · admin `?departmentId=6`→R10 문구 |
| C12 | 실측 | `"data":9303` — 숫자 그대로 |

### D. 상세조회 (4행) — 전부 실측

| ID | 실측값 |
|---|---|
| D1 | `{"id":1,"type":"MCQ_SINGLE","content":…,"imageUrl":null,"referenceText":null,"explanation":null,"blankRevealCount":null,"status":"ACTIVE","departmentId":4,"sourceNumber":1001,"choices":[…],"answers":[],"blanks":[],"tags":["alpha","beta"]}` — 14개 필드, 목록(L14)과 구성이 다름 |
| D2 | `{"id":1,"problemId":1,"choiceText":"가","correct":true,"displayOrder":1}` — 플래그 이름이 **`correct`**(`isCorrect` 아님) |
| D3 | `{"id":1,"problemId":12,"blankKey":"a","answerText":"서울","displayOrder":1}` — 다섯 필드 그대로 |
| D4 | `"answers":["서울","서울특별시"]`, `"tags":["지리"]` — 둘 다 **문자열 배열** |

### I. 이미지 (14행)

| ID | 상태 | 실측값 |
|---|---|---|
| I1 | 실측 | svg 거부(1014), `.bmp` 거부(1014), `.png` 허용 |
| I2 | 실측 | `text/plain` 거부(1014), `image/png` 허용 |
| I3 | 실측 | 확장자만 위반·Content-Type 만 위반 각각 독립적으로 거부 |
| I4 | 실측 + **이월** | 5,242,881 B → 400/1015 `"이미지 크기는 5MB를 초과할 수 없습니다."`, 정확히 5,242,880 B → 200. **4~5MB 구간(플랫폼 요청 본문 상한과 겹치는 자리)은 로컬에서 잴 수 없다** — 정답지가 지시한 대로 초록으로 인증하지 않고 컷오버로 넘긴다. 다만 localhost 에도 상한이 없지는 않다는 사실을 새로 쟀다: 미들웨어(matcher `/api/:path*`)가 감싸는 본문 클론 상한(`experimental.middlewareClientMaxBodySize`, 기본 10 MiB = 10,485,760 B)을 넘으면 Next 가 예외 없이 본문을 **자른다** — 멀티파트는 이 때문에 경계가 깨져 `request.formData()` 파싱이 실패한다(아래 "실측으로 새로 드러난 것" 1) |
| I5 | 실측 | 1014 + `"허용되지 않는 파일 형식입니다. png, jpg, jpeg, gif, webp 이미지만 업로드할 수 있습니다."` |
| I6 | 실측 | `사진.PNG` → `7d512a3e-….png`, `a.png/../../evil.png` → `3d60b389-….png` — 원본 파일명이 키에 남지 않음 |
| I7 | 실측(대체 확인) | 포트에는 대응 개념이 없다는 것이 행 본문. 경로 조작 파일명이 UUID 키로만 저장되는 것을 실측해 "방어가 빠진 게 아님"을 확인 |
| I8 | **미실측**(E2E 불가) | 감사 기록 실패를 HTTP 로 유도할 방법이 없다(감사 테이블을 고의로 깨야 한다 — 이 검증은 DB 를 파괴하지 않는다). `problemImage.test.ts` "감사 로그 기록이 실패하면 fail-closed…" 가 뮤테이션 검증까지 마친 상태로 고정 |
| I9 | 실측 | 위 #10-4 감사 로그 행 그대로. 4건 모두 `target_id` NULL |
| I10 | 실측 | `/api/problem-images/<uuid>.png` |
| I11 | 실측 + **이월** | ⓐ-1 200/1009 · ⓐ-2 200/1009 · ⓑ 200/1009 · ⓒ 400/1009 `"필수 파일이 누락되었습니다."` 전부 실측(#10-1·#10-2). **ⓐ-2 의 Java 쪽 실제 응답만 이월** — Spring 인스턴스가 있어야 잴 수 있다. 참고로 포트 쪽 ⓐ-2 는 역할이 틀린 요청에도 200/1009 를 낸다(Java 라면 403/990) |
| I12 | 실측(역사) | "이관 시점 26건 중 0건"은 2026-08-19 시점 사실이며 재측정 대상이 아니다. **이 검증 후에는 2건**(Step 3 말미 참고) |
| I13 | 실측 | dev01 업로드 200 |
| I14 | 실측 | 버킷 JSON 그대로(Step 3). `SUPABASE_URL`·`SUPABASE_SERVICE_ROLE_KEY` 는 `web/.env` 에 있고 `NEXT_PUBLIC_` 접두어 없음 |

### X. 엑셀 행 검증 (24행) — 전부 실측

전용 케이스 파일(`x_cases.xlsx`, 26 데이터 행)을 개발팀(4)에 올린 결과:
`{"totalRows":26,"successRows":4,"failRows":22}`.

| ID | 엑셀 행 | 실측 문구 |
|---|---|---|
| X1 | — | 13열 배치대로 파싱됨(아래 전 행이 그 전제 위에서 맞았다). 12열 파일은 전 행 X5 |
| X2 | 2·3 | `"문제유형과 문제내용은 필수입니다."` (유형 누락·내용 누락 각각) |
| X3 | 4 | `"빈칸 채우기는 엑셀 업로드를 지원하지 않습니다. 개별 입력을 이용하세요."` |
| X4 | 5 | `"유효하지 않은 문제유형입니다: MCQ"` |
| X5 | 6 | `"문항 번호는 필수입니다."` |
| X6 | 7 | `"문항 번호는 숫자여야 합니다: 육백사"` |
| X7 | 8 | `"문항 번호는 1 이상이어야 합니다: 0"` |
| X8 | 9·10 | 9행은 성공(700), 10행은 `"파일 안에서 문항 번호가 중복됩니다: 700"` |
| X9 | 11·12 | `"태그는 문제당 20개, 태그명은 100자 이하여야 합니다."` (21개 / 101자 각각) |
| X10 | 13 | `"정답은 필수입니다."` |
| X11 | 14·15 | 14행(`https://evil.example/x.png`) → `"이미지는 엑셀로 등록할 수 없습니다. 이미지 열은 비워 두고, 문제 개별 등록/수정 화면에서 이미지를 첨부하세요."` / **15행(`/api/problem-images/a.png`)은 성공**, DB `image_url` 에 그대로 저장 |
| X12 | 16 | `"보기는 2개 이상 5개 이하이어야 합니다."` |
| X13 | 17 | 보기1 비고 보기2·3 만 채운 행 → `"빈 보기는 입력할 수 없습니다."` (당겨 채우지 않음) |
| X14 | 18 | `"OX 문제는 보기 2개(O/X)가 필요합니다."` |
| X15 | 19 | `"정답은 보기 번호(1부터 시작)여야 합니다: 일"` |
| X16 | 20 | `"정답 번호가 보기 범위를 벗어났습니다: 5"` |
| X17 | 21 | MCQ_SINGLE + 정답 `1,2` → `"이 유형은 정답이 1개여야 합니다."` |
| X18 | 22 | MCQ_MULTI + 정답 셀 `","` → `"정답을 최소 1개 선택하세요."` (Java `split(",")` 의 후행 빈 토큰 제거를 `javaSplit` 이 그대로 미러하므로 도달한다) |
| X19 | 23 | SHORT_ANSWER 정답 `서울,,Seoul` → `"빈 정답은 입력할 수 없습니다."` |
| X20 | 27 | DB 에 이미 있는 1002 → `"문항 번호 1002번은 이 부서에 이미 있습니다."` (재업로드 43행에서도 동일) |
| X21 | 24 | 보기 텍스트 501자(엑셀 경로에는 길이 검증이 없어 `varchar(500)` 에서 22001) → `"문제 저장 중 오류가 발생했습니다."` — 번호 문구에 묻히지 않았다 |
| X22 | 9·15·25·26 | 22행이 실패하는 동안 이 4행은 커밋됨(`successRows:4`). 실패한 24행이 소비한 id(18)는 비어 있다 = 그 행만 롤백 |
| X23 | 25 | 유형·내용·보기2개·정답·번호만 채우고 뒤 셀은 아예 없는 행이 성공 → 없는 셀이 `""` 로 읽힘(예외 아님) |
| X24 | 26 | 태그 셀 `",,"` 인 행이 성공, `problem_tags` 연결 0건 — 위반이 아니라 `[]`. 43행이 공유한 `공통` 태그는 `tags` 에 1행만 생성 |

### F. 엑셀 파일 수준 (8행)

| ID | 상태 | 실측값 |
|---|---|---|
| F1a | 실측 | `file` 파트 없음 → **HTTP 200** `{"resultCode":1009,"resultMsg":"파일을 업로드할 수 없습니다."}` |
| F1b | 실측 | 0바이트 → **HTTP 400** `{"resultCode":1009,"resultMsg":"필수 파일이 누락되었습니다."}` |
| F2 | 실측 | `.txt` → 400 `{"resultCode":1014,"resultMsg":"xlsx 또는 xls 엑셀 파일만 업로드할 수 있습니다."}` |
| F3 | 실측 | 엑셀 아닌 바이트를 `.xlsx` 로 → 400 `{"resultCode":1013,"resultMsg":"엑셀 파일을 읽을 수 없습니다. 손상되었거나 암호가 설정된 파일인지 확인한 뒤 다시 올려 주세요."}` |
| F4 | 실측 | `xl/workbook.xml` 의 `<sheets>` 를 비운 진짜 워크북 → 400 `{"resultCode":1013,"resultMsg":"엑셀 파일에 시트가 없습니다. 첫 번째 시트에 문제 목록을 담아 다시 올려 주세요."}` (계정 업로드와 문구 다름 확인) |
| F5 | 실측 | 501행 → 400 `{"resultCode":1000,"resultMsg":"한 번에 업로드할 수 있는 데이터 행은 최대 500건입니다. 파일을 나눠 업로드하세요."}` / **500행(경계값)은 통과**해 행별 처리로 들어감(`totalRows:500`) |
| F6 | 실측 | dev01 이 `?departmentId=5` 로 올린 파일 → 문제 `department_id=4`, 감사 detail `"departmentId": 4` |
| F7 | 실측 + **이월** | 4.2MB·5MB·8MB·9MB 전부 400/1015 `"파일 크기가 허용 범위를 초과했습니다."`. **요청 본문(멀티파트 전체)이 10,485,760 B(10 MiB)를 넘으면 200/1009** — 아래 1 참고(이전 판의 `10,481,664 B`/`10,485,759 B` 는 파일 바이트였다, 본문 바이트가 아니다) |

### A. 감사 로그 (7행) — 전부 실측(DB 직접 조회)

| ID | 실측 행 |
|---|---|
| A1 | `PROBLEM_CREATED` / `PROBLEM` / target=문제 id / `{"type": "MCQ_SINGLE"}`, `{"type":"FILL_BLANK"}` 등 유형별로 |
| A2 | `PROBLEM_UPDATED` / `PROBLEM` / `{"type": "MCQ_SINGLE"}` (기존 유형) |
| A3 | `PROBLEM_ARCHIVED` / `PROBLEM` / `{}` |
| A4 | `PROBLEM_DEPARTMENT_CHANGED` / `{"to": 5, "from": 4, "sourceNumberTo": 2002, "sourceNumberFrom": 1001}` |
| A5 | `PROBLEM_CREATED_BY_EXCEL` / **targetType `PROBLEM`** / `{"type": "MCQ_SINGLE"}`·`{"type":"OX"}` (48행) |
| A6 | `PROBLEM_EXCEL_UPLOADED` / **targetType `EXCEL_UPLOAD_LOG`** / targetId = 로그 id / `{"failRows": 0, "fileName": "real13.xlsx", "totalRows": 43, "successRows": 43, "departmentId": 4}` — **`departmentId` 포함** |
| A7 | `PROBLEM_IMAGE_UPLOADED` / `PROBLEM_IMAGE` / targetId **NULL** / `{"fileName": "7d512a3e-….png"}` |

`excel_upload_logs` 6행도 함께 확인: `file_name`(한글 파일명 `문제_01_공통.xlsx` 포함) · `total_rows` · `success_rows` · `fail_rows` · `uploaded_by` · `department_id` · `error_detail` 이 응답과 일치.

### 대조 집계

| 구분 | 수 | 목록 |
|---|---|---|
| 실측 확인 | **133** | 위 표에서 `실측` 로 표시한 전부 |
| 미실측 | **5** | N6·N8·C8·I8 (재현 불가/도달 불가/E2E 불가) · I12 (역사적 실측치라 재측정 대상 아님) |
| 승인된 이탈(재심 안 함) | 7 | ①~⑦ |
| 컷오버 이월 | 3 | I4(4~5MB 플랫폼 구간 + 요청 본문 잘림, 범위를 전체 `/api/**` 로 확대) · I11ⓐ-2(Java 쪽 응답) · F7(요청 본문 > 10 MiB 잘림, 새로 발견) |

---

## 실측으로 새로 드러난 것 (프로덕션 코드 변경 없음)

### 1. 요청 본문이 10 MiB 를 넘으면 Next 가 본문을 자른다(잘림) — 크기 문구(1015) 대신 1009 가 나가는 진짜 이유

**메커니즘(아래 세 파일을 직접 읽어 확인, `web/node_modules/next` = `next@15.5.23`):**

- `web/middleware.ts` 의 `matcher`(`export const config = { matcher: ["/api/:path*"] }`)가 두 업로드 라우트를 포함한
  모든 `/api/**` 요청을 잡는다.
- 매칭된 요청은 `next-server.js:1320-1321` 에서 `getCloneableBody(req.originalRequest, this.nextConfig.experimental.middlewareClientMaxBodySize)`
  로 감싸진다.
- 이 옵션의 기본값은 `config-shared.js:219` 에 `middlewareClientMaxBodySize: 10485760`(정확히 10 MiB)로 박혀 있다.
- 상한을 넘으면 `body-streams.js:85-97`(`cloneBodyStream`)이 **예외를 던지지 않는다.** `limitExceeded` 플래그를 세우고
  두 출력 스트림(`p1`,`p2`)에 `null` 을 흘려 넣어 본문을 그 자리에서 **끊는다**(잘림), 그리고 `middlewareClientMaxBodySize`
  를 이름으로 언급하는 `console.warn` 하나만 남긴다.

멀티파트 바디가 이렇게 잘리면 닫는 경계(boundary)가 사라지므로 `request.formData()` 파싱이 사실상 항상 실패해
승인된 이탈 ⑥ 의 `1009 "파일을 업로드할 수 없습니다."` 경로로 빠진다 — **이것은 멀티파트 포맷의 성질이지 런타임이
보장하는 동작이 아니다.** 아래 2번의 비-멀티파트 사례는 잘려도 파싱이 성공해 버린다.

이전 판은 이 자리에서 "`next.config.mjs` 는 비어 있으므로 앱 설정이 아니다"라고 적었는데, 그 추론은 **거꾸로**였다.
`next.config.mjs` 가 비어 있다는 것은 정확히 이 10 MiB **기본값**이 그대로 적용 중이라는 뜻이다.
`middlewareClientMaxBodySize` 는 `next.config.mjs` 의 `experimental` 블록에서 앱이 직접 조정할 수 있는 설정이고,
로컬에서만 우연히 존재하는 런타임 아티팩트가 아니라 **앱과 함께 배포 플랫폼까지 이동한다.**

경계 재실측(요청 **본문 전체** 바이트 기준 — 파일 바이트가 아니다):

| 요청 본문 크기(바이트, 실제 전송된 본문 전체) | 응답 |
|---|---|
| 10,485,760 B (= 10 MiB, 상한 이하) | 400 / 1015 / `"파일 크기가 허용 범위를 초과했습니다."`(앱 자신의 크기 검사가 정상 도달) |
| 10,485,761 B (상한 + 1 B) | 200 / 1009 / `"파일을 업로드할 수 없습니다."`(잘림 → 파싱 실패) |

규칙은 **`본문 바이트 > 10,485,760` → 1009** 다. (이전 판이 적었던 `10,481,664 B`·`10,485,759 B` 는 요청 본문이 아니라
**파일** 바이트 수였다 — 멀티파트 경계 문자열 등 오버헤드(약 158 B)를 더해야 실제 본문 바이트가 된다. 그 값들을
"본문 크기"라는 이름으로 적어 놓고 "상한은 정확히 10 MiB"라고 결론지으면, 상한보다 1 바이트 **작은** 본문이 이미
실패한다는 자기모순으로 읽힌다 — 실제로는 어긋나지 않는다.)

이전 판의 안심("거절된다는 결과는 같고 문구·상태·코드만 다르다")은 **멀티파트를 전제로 한 이야기다.** 잘림은
거부를 보장하지 않는다 — 아래 2번 참고. **코드는 손대지 않았다** — 이 순서를 뒤집으면 "파싱 실패 → 1009"라는
형제 라우트 셋의 일관성(스탠딩 룰링, Ruling 15)이 깨진다.

### 2. 비-멀티파트 라우트는 잘려도 거부되지 않을 수 있다 — 컷오버 항목을 전체 `/api/**` 로 넓힌다

미들웨어 matcher(`/api/:path*`)는 업로드 두 라우트만이 아니라 **모든 API 라우트**를 감싼다. 잘림 자체는 어떤 라우트든
겪지만, 결과는 바디 형식에 달렸다 — 멀티파트는 경계가 깨져 거의 항상 파싱 실패로 이어지는 반면, 그 외 형식은 잘려도
형식이 멀쩡하면 파싱이 **성공해 버린다.**

감사자가 실측·보고한 사례(이 문서를 쓴 나는 재현하지 않았다 — 최종 보고서 참고): `POST /api/admin/problems` 에
11,534,485 바이트 JSON 본문(앞 10,485,760 바이트가 그 자체로 완결된 유효 JSON 문서, 그 뒤는 공백 패딩)을 보내면
Next 가 본문을 자르고, 핸들러는 살아남은 앞부분만으로 정상 파싱해 **평범한 업무 응답을 돌려준다** — 클라이언트가
보낸 마지막 1 MiB 가 **어느 계층에서도 오류 없이 조용히 버려진다.** 그런 완결 구조가 없는 큰 JSON 본문은 대신
`200/1000 "잘못된 파라미터를 입력했습니다."` 로 끝난다 — 이 경우도 크기 오류는 아니다.

**컷오버 항목(신규, 범위 확대):** 이 잘림 위험은 업로드 두 라우트에 국한되지 않는다 — matcher 아래 있는
**모든 `/api/**` 라우트**가 대상이다. 컷오버 시점에 확인할 것을 아래 "컷오버 핸드오프"에 정리했다.

**열린 질문(가정하지 말고 컷오버에서 잴 것):** 배포 예정 플랫폼은 자체 요청 본문 상한을 갖고 있고, 그 값이 10 MiB
**보다 작다고 알려져 있다.** 만약 그렇다면 플랫폼이 Next 가 자르기도 전에 먼저 거부하므로 이 잘림 위험은 프로덕션에서
도달 불가능할 수 있다 — 하지만 이것은 지금 **가정**일 뿐이다. 두 상한(플랫폼 자체 상한 vs Next 의 10 MiB
`middlewareClientMaxBodySize`)은 한쪽이 다른 쪽을 가릴 수 있으므로, 컷오버에서 **같은 세션에** 함께 측정해야 한다.

### 3. I11ⓐ-2 의 포트 쪽 절반은 이제 실측됐다

비-멀티파트 바디는 역할이 맞든(admin) 틀리든(emp01) 포트에서 **똑같이 200/1009** 다. Java 라면
`isMultipart(request)` 가 false 라 요청이 그대로 흘러가 `RoleCheckInterceptor` 에서 **403/990** 이 났을 자리다.
이 차이는 정답지가 이미 스탠딩 룰링으로 "코드는 그대로 둔다"고 못 박은 통합의 결과이므로 결함으로 신고하지 않는다.
정답지가 비워 둔 것은 "role 이 맞는 요청에서 Java 가 어떤 문구를 내는가"이고, 그건 Spring 인스턴스 없이는 잴 수 없어 이월한다.

### 4. `problems.image_url` NOT NULL 행이 0건 → 2건

Step 3 말미 참고. 정답지 I12 의 "0건"은 이관 시점 값이고, 이 검증이 2건을 만들었다(하나는 지운 오브젝트를 가리키는
dangling 참조). 서브플랜 5 가 조회 경로를 만들 때 이 두 행이 404 를 내는 것은 정상이다.

**프로덕션 코드에서 고쳐야 할 결함은 발견되지 않았다.**

---

## 컷오버 핸드오프 (M7 이 넘기는 전체 목록, 한 곳에 모음)

이 검증 자체가 만든 항목과 더 이른 마일스톤이 이미 이월해 둔 항목을 한 곳에 모은다 — 이 문서만 보고도
컷오버 담당자가 전부 찾을 수 있어야 한다.

| # | 항목 | 무엇을 재야 하는가 | 근거 |
|---|---|---|---|
| 1 | I4 — 이미지 4~5MB 대역 | 배포 플랫폼의 실제 요청 본문 상한을 실측하고, 4.0~5.0MB 이미지가 앱 검사(1015)에 도달하는지 확인 | 정답지 I4, 위 1 |
| 2 | F7/I4 — 요청 본문 > 10 MiB 잘림(전체 `/api/**`) | 배포 플랫폼에서도 같은 잘림이 재현되는지, 아니면 플랫폼 자체 상한이 먼저 걸려 도달 불가인지 확인(위 2 의 열린 질문과 같은 세션에서) | 위 1·2 |
| 3 | I11ⓐ-2 — Java 쪽 실제 응답 | Spring 인스턴스에서 비-멀티파트 바디 + 역할 일치 요청의 실제 응답 문구 확인 | 정답지 I11, 위 3 |
| 4 | `excel_upload_logs.file_name varchar(255)` 초과 | 255자 넘는 파일명 업로드 시 전 행 커밋 후 로그 insert 가 실패해 `-1` 이 새는 것을 컷오버에서 어떻게 다룰지 결정(Spring 도 같은 모양이라 파리티 이탈은 아님) | 원장 M6 Task 9(`.superpowers/sdd/2026-08-19-migration-problem-bank/progress.md:454-455`) |
| 5 | 테스트 하네스 가드 — DB 이름만 검사 | `TRUNCATE` 가드가 호스트·포트·자격증명은 보지 않고 DB **이름**만 확인한다 — 컷오버 배포 전에 강화할지 결정 | 원장 M6 "이월 확정"(`progress.md:618-619`, Minor 2) |
| 6 | `drizzle.config.ts` 가 ambient 환경변수로 대상을 고른다 | 배포 파이프라인에서 이 파일이 잘못된 DB 를 가리킬 수 있는지 확인 | 원장 M6 "이월 확정"(`progress.md:618-619`, Minor 6) |

---

## Step 5. 전체 검증

```
cd web && pnpm test
  Test Files  40 passed (40)
       Tests  441 passed (441)
    Duration  78.21s

cd web && pnpm build
  ✓ Compiled successfully — 라우트 18개(문제은행 6개 포함) 전부 ƒ(dynamic)로 잡힘, exit 0

cd backend && ./gradlew cleanTest test
  BUILD SUCCESSFUL in 30s
  build/test-results/test 집계: tests: 301  skipped: 0  failures: 0  errors: 0
```

`backend` 는 이 서브플랜에서 한 줄도 건드리지 않았고 **301 이 그대로 유지**된다.
`pnpm test` 는 셸에 `DATABASE_URL` 이 없는 상태에서 돌렸다(확인함) — `test/db.ts` 가 `probank_test` 로 고정되므로
개발 DB 를 `TRUNCATE` 하지 않는다.

빌드 후에도 3220 포트의 기존 프로세스는 살아 있다(`GET /` 200, `GET /api/tags` 401). 어떤 프로세스도 죽이지 않았다.

---

## 이 검증이 DB 에 남긴 것 (보존, 삭제하지 않음)

| 테이블 | 행 수 | 비고 |
|---|---|---|
| `problems` | 68 | 개발팀(4) ACTIVE 61 / ARCHIVED 3, 영업팀(5) ACTIVE 4 |
| `problem_choices` | 207 | |
| `problem_answers` | 6 | |
| `problem_blanks` | 2 | |
| `tags` | 8 | `alpha, beta, keep, trimtag, 지리, 재삽입, 공통, racetag…` |
| `problem_tags` | 57 | |
| `audit_logs` | 93 | 시작 7 → 93 |
| `excel_upload_logs` | 6 | `rows500.xlsx`, `문제_01_공통.xlsx`, `x_cases.xlsx`, `f6.xlsx`, `real13.xlsx` ×2 |

번호 대역: 실물 엑셀 1~46(개발팀), 수기 케이스 700~716·800·1001~1002·2001~2004·8801~8808·9203~9401.
Storage 버킷은 **비어 있다**(Step 3).

측정 스크립트·응답 원본은 `…/scratchpad/m7/`(`s1_rvnd.mjs`·`s2_lc.mjs`·`s3_images.mjs`·`s4_excel.mjs`,
`out_s*.json`, `s*.log`)에 남아 있다.
