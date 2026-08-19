# 문제은행 파리티 체크리스트

**목적:** 현재 Spring `ProblemServiceImpl`·`ExcelProblemUploadServiceImpl`·`ProblemProvisioningServiceImpl`·`ProblemImageServiceImpl`·`OwningDepartmentResolver`·`ImageUrlValidator`·`ProblemController`·`TagController`·`ProblemMapper.xml` 실측 계약을 정의한 정답지. Task 2~10은 이 문구·순서를 그대로 인용한다.
**작성일:** 2026-08-19
**측정 근거:** `backend/src/main/java/com/daeryun/probank/service/ProblemServiceImpl.java`, `ExcelProblemUploadServiceImpl.java`, `ProblemProvisioningServiceImpl.java`, `ProblemImageServiceImpl.java`, `OwningDepartmentResolver.java`, `ImageUrlValidator.java`, `backend/src/main/java/com/daeryun/probank/controller/ProblemController.java`, `TagController.java`, `backend/src/main/java/com/daeryun/probank/common/ErrorCode.java`, `backend/src/main/resources/mappers/probank/ProblemMapper.xml`, `backend/src/main/resources/application.yml`
**역할 요구사항:** `ProblemController`는 클래스 레벨 `@RequireRole({SUPER_ADMIN, DEPT_ADMIN})` — 9개 엔드포인트 중 8개가 두 역할 모두 허용된다. 예외는 부서 이동 하나(`SUPER_ADMIN` 전용). `TagController`는 인증만 요구하고 역할 제한이 없다. 역할 불일치 → HTTP 403, resultCode 990.

이 문서 하단 표의 "Spring 출처" 열은 `파일:줄` 형식이며, 파일명은 위 측정 근거 경로를 기준으로 한다(서비스/컨트롤러는 `backend/src/main/java/com/daeryun/probank/{service,controller}/`, 매퍼는 `backend/src/main/resources/mappers/probank/`, 설정은 `backend/src/main/resources/`).

---

## 승인된 이탈(4건)

| 번호 | 유형 | 설명 | Spring 출처 | 근거 문서 |
|------|------|------|------|----------|
| ① | 이미지 저장소 변경 | Vercel 서버리스에는 영속 디스크가 없어 로컬 디스크(`./uploads/images`) 저장을 그대로 이식할 수 없다. Supabase Storage로 간다(플랫폼 제약, 목표 동작이지 파리티 대상이 아님) | `ProblemImageServiceImpl.java:47,50-56,70-76`(로컬 `uploadDir` 저장 구현 전체가 대체 대상) | 이관 스펙 Q8 |
| ② | 이미지 URL 접두어 변경 | `ImageUrlValidator.PREFIX`가 새 접두어로 바뀐다. 현재 `problems.image_url`이 NULL이 아닌 행은 0건(26건 중 0)이라 기존 데이터가 깨지지 않는다 | `ImageUrlValidator.java:17`(PREFIX 정의) | DB 실측(2026-08-19) — 이 사실 자체는 Spring 코드가 아니라 런타임 데이터 조회로 확인됨. plan Global Constraints 원문에 실측치로 기록됨 |
| ③ | 엑셀 파일 상한 하향 | Spring 멀티파트 상한 20MB → 플랫폼 안전값 4MB로 하향, resultCode 1015 (서브플랜 3 Q6 승인 기준과 동일 취급) | `application.yml:18-19`(`max-file-size: 20MB`, `max-request-size: 20MB`) | 이관 스펙 Q6 |
| ④ | SheetJS 행 번호 어긋남 | SheetJS `blankrows:false`로 인해 빈 행이 많은 파일에서 오류 행 번호가 엑셀과 어긋날 수 있다. 동일한 이유로 `totalRows` 집계와 500행 상한 판정에서도 빈 행이 제외된다(Spring `lastRowNum`은 빈 행을 포함해 센다) | `ExcelProblemUploadServiceImpl.java:111`(`sheet.getLastRowNum()`, 빈 행 포함 계수) | `docs/qa/2026-08-16-dept-users-parity-checklist.md` 승인된 이탈 ⑤와 동일 사유 |

---

## R. 역할·부서 스코프

| ID | 시나리오 | 입력·사전조건 | 기대결과 | Spring 출처 |
|---|---|---|---|---|
| R1 | 클래스 레벨 역할 | `ProblemController`의 create/list/getDetail/update/archive/uploadImage/nextSourceNumber/uploadExcel 8개 엔드포인트 | `SUPER_ADMIN`·`DEPT_ADMIN` 모두 허용 | `ProblemController.java:22-23` |
| R2 | 메서드 레벨 역할 좁힘 | `changeDepartment`(`PUT /{id}/department`) | `SUPER_ADMIN` 전용 — `RoleCheckInterceptor`가 메서드 애너테이션을 클래스 애너테이션보다 먼저 본다 | `ProblemController.java:90-99` |
| R3 | 태그 컨트롤러 역할 없음 | `TagController`의 `list`·`listInUse` | 인증(로그인)만 요구, `@RequireRole` 없음 | `TagController.java:11-17,25-34` |
| R4 | 역할 불일치 응답 | 역할이 맞지 않는 사용자가 접근 | HTTP 403, resultCode 990 | `ErrorCode.java:20`(`ACCESS_AUTH_DENIED`) |
| R5 | 쓰기 경로 부서 관문 | 생성·엑셀 업로드·다음 문항번호 조회 | `OwningDepartmentResolver.resolve`가 단일 관문 — `SUPER_ADMIN` 아니면 요청값 무시, `actor.departmentId` 강제 | `OwningDepartmentResolver.java:36-39`; 호출부 `ProblemServiceImpl.java:98,561-562`, `ExcelProblemUploadServiceImpl.java:101` |
| R6 | 읽기·수정·보관 부서 관문 | 상세 조회·수정·보관 | `assertOwnership`이 단일 관문 — `SUPER_ADMIN` 아니고 `problem.departmentId !== actor.departmentId` → `ACCESS_AUTH_DENIED`(990) | `ProblemServiceImpl.java:214-218`; 호출부 `136,174,202` |
| R7 | 목록 조회 부서 관문(세 번째 형태) | 부서 관리자가 목록 조회 시 임의의 `departmentId` 전달 | `effectiveDepartmentId = actor.role===SUPER_ADMIN ? departmentId : actor.departmentId` — 부서 관리자는 요청 파라미터가 무시된다(전체 조회 불가) | `ProblemServiceImpl.java:183-185` |

---

## V. 생성·수정 검증(5유형)

| ID | 시나리오 | 입력·사전조건 | 기대결과 | Spring 출처 |
|---|---|---|---|---|
| V1 | 생성 검증 순서 | `create()` | `normalize()` → `validate()` → `validateSourceNumber()` 순 | `ProblemServiceImpl.java:94-96` |
| V2 | 수정 검증 순서 | `update()` | `assertOwnership` → 유형 변경 금지 검사 → `normalize()` → `validate()` → `validateSourceNumber()` 순 | `ProblemServiceImpl.java:136-142` |
| V3 | normalize 대상 필드 | 저장 전 trim | `content`·`imageUrl`·`referenceText`·`explanation`·각 `choice.text`·`answers[]`·각 `blank.blankKey`·`blank.answerText`를 `trimToNull`(trim 후 빈 문자열이면 null) | `ProblemServiceImpl.java:230-249,251-257` |
| V4 | 수정 시 유형 변경 금지 | 기존 유형과 다른 `type`으로 수정 시도 | "문제 유형은 수정할 수 없습니다." | `ProblemServiceImpl.java:137-139` |
| V5 | 유형 누락(최우선 검사) | `type == null` | "문제 유형을 선택하세요." — switch가 어떤 분기도 타지 않아 검증을 건너뛰는 것을 막기 위해 가장 먼저 검사 | `ProblemServiceImpl.java:322-324` |
| V6 | 내용 공백 | `content` trim 결과 공백 | "문제 내용을 입력하세요." | `ProblemServiceImpl.java:325-327` |
| V7 | imageUrl 비어있음 | `imageUrl`이 null 또는 빈 문자열 | 통과(검증 없음) | `ImageUrlValidator.java:38-41` |
| V8 | imageUrl 접두어/경로 탈출 | 접두어가 `/uploads/images/`가 아니거나 `..` 포함 | "이미지는 이미지 업로드 API로 등록한 경로(/uploads/images/...)만 사용할 수 있습니다." | `ImageUrlValidator.java:42-45`; 문구 조립 `ProblemServiceImpl.java:359-362` |
| V9 | imageUrl 길이 초과 | 500자 초과 | "이미지 경로는 500자 이하여야 합니다." | `ImageUrlValidator.java:20,46-48`; 문구 조립 `ProblemServiceImpl.java:363-366` |
| V10 | MCQ_SINGLE 규칙 | 보기 개수·정답 개수 | 보기 2~5개, 정답 정확히 1개 | `ProblemServiceImpl.java:330-332` |
| V11 | MCQ_MULTI 규칙 | 보기 개수·정답 개수 | 보기 2~5개, 정답 1개 이상 | `ProblemServiceImpl.java:333-335` |
| V12 | OX 규칙(순서 고정) | 보기 개수 | 보기가 정확히 2개 아니면 "OX 문제는 보기 2개(O/X)가 필요합니다."가 먼저, 그 다음 정답 1개 검사 | `ProblemServiceImpl.java:336-341` |
| V13 | 보기 개수 위반(공통) | 보기 < 2 또는 > 5 | "보기는 2개 이상 5개 이하이어야 합니다." | `ProblemServiceImpl.java:370-372` |
| V14 | 빈 보기(공통) | 보기 텍스트 공백 | "빈 보기는 입력할 수 없습니다." | `ProblemServiceImpl.java:373-375` |
| V15 | 보기 길이 초과(공통) | 보기 텍스트 500자 초과 | "보기는 500자 이하여야 합니다." | `ProblemServiceImpl.java:376-379` |
| V16 | 정답 수 불일치(exact) | MCQ_SINGLE/OX에서 정답 개수 ≠ 1 | "정답 개수가 올바르지 않습니다." | `ProblemServiceImpl.java:380-383` |
| V17 | 정답 0개(multi) | MCQ_MULTI에서 정답 0개 | "정답을 최소 1개 선택하세요." | `ProblemServiceImpl.java:384-386` |
| V18 | SHORT_ANSWER 빈 목록 | `answers` null 또는 empty | "정답을 최소 1개 입력하세요." | `ProblemServiceImpl.java:390-392` |
| V19 | SHORT_ANSWER 빈 항목 | `answers` 중 공백 항목 존재 | "빈 정답은 입력할 수 없습니다." | `ProblemServiceImpl.java:393-395` |
| V20 | SHORT_ANSWER 길이 초과 | 정답 500자 초과 | "정답은 500자 이하여야 합니다." | `ProblemServiceImpl.java:396-399` |
| V21 | FILL_BLANK 빈칸 없음 | `blanks` null 또는 empty | "빈칸을 최소 1개 정의하세요." | `ProblemServiceImpl.java:403-405` |
| V22 | FILL_BLANK 키/정답 공백 | 키 또는 정답 중 하나라도 공백 | "빈칸 키와 정답을 모두 입력하세요." | `ProblemServiceImpl.java:408-410` |
| V23 | FILL_BLANK 키 길이 초과 | 키 50자 초과 | "빈칸 키는 50자 이하여야 합니다." | `ProblemServiceImpl.java:411-414` |
| V24 | FILL_BLANK 정답 길이 초과 | 정답 500자 초과 | "빈칸 정답은 500자 이하여야 합니다." | `ProblemServiceImpl.java:415-418` |
| V25 | FILL_BLANK 키 중복 | 동일 `blankKey` 중복 | "빈칸 키가 중복되었습니다." | `ProblemServiceImpl.java:421-424` |
| V26 | FILL_BLANK 선언된 키 누락 | 선언된 키가 본문 마커에 없음 | "본문에 없는 빈칸 마커입니다: \<key\>" | `ProblemServiceImpl.java:425-429` |
| V27 | FILL_BLANK 역방향 검사 | 본문의 마커 중 선언되지 않은 것 존재, 패턴 `/\{\{([A-Za-z0-9_-]+)\}\}/g` | "정답이 등록되지 않은 빈칸 마커가 본문에 있습니다: \<key\>" | `ProblemServiceImpl.java:49(패턴),433-440` |
| V28 | FILL_BLANK 공개 개수 검증 | `blankRevealCount`가 null·1 미만·`blanks.length` 초과 | "출제할 빈칸 개수가 유효하지 않습니다." | `ProblemServiceImpl.java:441-443` |
| V29 | 태그 정규화 | trim → 빈 것 제거 → `toLowerCase(Locale.ROOT)` → 중복 제거, 20개 초과 또는 100자 초과 | "태그는 문제당 20개, 태그명은 100자 이하여야 합니다." (JS는 `toLowerCase()`가 로케일 독립이므로 `toLocaleLowerCase()` 사용 금지) | `ProblemServiceImpl.java:259-270` |
| V30 | 수정 시 재삽입 | `update()` 저장 단계 | 기존 보기/정답/빈칸을 전량 삭제(`deleteByProblemId` ×3) 후 `saveTypeSpecificData`로 재삽입 | `ProblemServiceImpl.java:158-161` |

---

## N. 문항번호

| ID | 시나리오 | 입력·사전조건 | 기대결과 | Spring 출처 |
|---|---|---|---|---|
| N1 | 번호 누락 | `sourceNumber == null` | "문항 번호를 입력하세요." | `ProblemServiceImpl.java:455-457` |
| N2 | 번호 범위 위반 | `sourceNumber < 1` | "문항 번호는 1 이상이어야 합니다." | `ProblemServiceImpl.java:458-460` |
| N3 | 등록·수정 모두 필수 | `create`·`update` 양쪽 경로 | `validateSourceNumber`가 두 경로에서 모두 호출됨(예외 없음) | `ProblemServiceImpl.java:96,142` |
| N4 | 중복 문항번호 | `UNIQUE(department_id, source_number)` 위반, SQLState 23505, 제약명 `uq_problems_department_source_number` | "\<부서명\> \<번호\>번은 이미 있습니다. 다른 번호를 입력하세요." | `ProblemServiceImpl.java:63,490-496` |
| N5 | 부서명 조회 시점(QA-1 재발 금지) | 쓰기(INSERT/UPDATE) 직전 | 부서명은 쓰기 **전에** 읽어 둔다 — catch 안에서 SELECT하면 PostgreSQL이 25P02로 트랜잭션 전체를 abort시켜 안내 문구가 만들어지지 못하고 `-1 처리 중 오류가 발생하였습니다`로 샌다 | `ProblemServiceImpl.java:99-100(create),150-151(update),463-469(주석)` |
| N6 | 다른 제약의 UNIQUE 위반 | 제약 이름이 `uq_problems_department_source_number`가 아님 | 번호 탓으로 돌리지 않고 원래 예외를 그대로 던진다 | `ProblemServiceImpl.java:491-494` |
| N7 | postgres.js 오류 객체 속성명 | 동일 `code`로 두 번 insert했을 때 실측 | `code:"23505"`, **`constraint_name`**은 있음, **`constraint`는 undefined**(pg 드라이버와 이름이 다름) | Spring 소스 아님 — postgres.js 런타임 실측(plan Global Constraints 원문, `docs/superpowers/plans/2026-08-19-migration-problem-bank.md:115-121`) |

---

## L. 목록 필터·정렬·페이징

| ID | 시나리오 | 입력·사전조건 | 기대결과 | Spring 출처 |
|---|---|---|---|---|
| L1 | 필터 파라미터 목록 | 목록 조회 요청 | `departmentId`·`type`·`status`·`createdFrom`·`createdTo`·`tag`·`keyword`·`page`(기본 1)·`size`(기본 20) 9개 | `ProblemController.java:46-61` |
| L2 | size 하한 클램프 | `size <= 0` | 20으로 대체 | `ProblemServiceImpl.java:188`(`DEFAULT_PAGE_SIZE=20`, 정의는 `:37`) |
| L3 | size 상한 클램프 | `size > 100` | 100으로 클램프 — 없으면 `size=100000`이 페이징을 무력화한다 | `ProblemServiceImpl.java:188`(`MAX_PAGE_SIZE=100`, 정의는 `:38`) |
| L4 | page 하한 클램프 | `page < 1` | 1로 클램프 | `ProblemServiceImpl.java:189` |
| L5 | departmentId 필터 SQL | 필터 적용 | `AND p.department_id = :departmentId` | `ProblemMapper.xml:81` |
| L6 | type 필터 SQL | 필터 적용 | `AND p.type = :type` | `ProblemMapper.xml:82` |
| L7 | status 필터 SQL | 필터 적용 | `AND p.status = :status` | `ProblemMapper.xml:83` |
| L8 | createdFrom 필터 SQL | 필터 적용 | `AND p.created_at >= :createdFrom` | `ProblemMapper.xml:84` |
| L9 | createdTo 필터 SQL | 필터 적용 | `AND p.created_at < (:createdTo + INTERVAL '1 day')` — 그 날 전체를 포함 | `ProblemMapper.xml:85` |
| L10 | tag 필터 SQL | 필터 적용 | `EXISTS (... lower(t.name) = lower(:tag))` 상관 서브쿼리 | `ProblemMapper.xml:86` |
| L11 | keyword 필터 SQL | 필터 적용 | `p.content ILIKE '%' || :keyword || '%'` | `ProblemMapper.xml:87` |
| L12 | 정렬·타이브레이커 | 목록 조회 | `ORDER BY p.created_at DESC, p.id DESC` — `id` 타이브레이커가 없으면 엑셀 업로드로 `created_at`이 같은 행이 생겼을 때 LIMIT/OFFSET 페이징에서 중복·누락이 난다 | `ProblemMapper.xml:102`(findAll),`130`(findRecent) |
| L13 | countAll 태그 조인 금지 | 총건수 계산 | `countAll`은 태그 조인을 하지 않는다(조인을 두면 태그 수만큼 count(*)가 부풀어 총건수가 틀린다) | `ProblemMapper.xml:106-115` |
| L14 | 응답 형태 | 목록 조회 성공 | `{items:[{id,type,content,status,departmentId,departmentName,createdAt,tags:[]}], totalCount, page, size}` | `ProblemServiceImpl.java:190-193` |
| L15 | 날짜 파라미터 형식 오류 | `createdFrom`/`createdTo`가 `YYYY-MM-DD`가 아니거나 `2026-02-30`처럼 불가능한 날짜 | Spring은 `@DateTimeFormat(ISO.DATE)` 미충족 시 `MethodArgumentTypeMismatchException`으로 목록 조회 전체가 실패(QA D1) — Next는 `parseDateParam`으로 동형 `BizError(1000, "요청 값의 형식이 올바르지 않습니다: <name>")` 재현 | `ProblemController.java:50-55`(애너테이션·주석) |
| L16 | 부서 관리자 파라미터 무시 | `DEPT_ADMIN`이 임의 `departmentId` 전달 | 무시되고 `actor.departmentId`로 강제(전체 조회 불가) | `ProblemServiceImpl.java:183-185` |

---

## C. 부서 이동·다음번호

| ID | 시나리오 | 입력·사전조건 | 기대결과 | Spring 출처 |
|---|---|---|---|---|
| C1 | 역할 제한 | 부서 이동 요청 | `SUPER_ADMIN` 전용(메서드 레벨) | `ProblemController.java:99-104` |
| C2 | 대상 문제 없음 | 존재하지 않는 문제 id | "존재하지 않는 문제입니다." | `ProblemServiceImpl.java:508-511` |
| C3 | 대상 부서 미지정 | `departmentId == null` | "옮길 부서를 선택하세요." | `ProblemServiceImpl.java:512-514` |
| C4 | 대상 부서 없음 | 존재하지 않는 `departmentId` | "존재하지 않는 부서입니다." | `ProblemServiceImpl.java:515-518` |
| C5 | 대상 부서 비활성 | `department.status != ACTIVE` | "비활성 부서로는 옮길 수 없습니다: \<부서명\>" | `ProblemServiceImpl.java:519-522` |
| C6 | 동일 부서 이동 거절 | `departmentId`가 현재 소속과 동일 | "이미 \<부서명\> 소속입니다." — 조용한 no-op 대신 거절(안 그러면 없는 이동을 한 것처럼 안내가 나간다) | `ProblemServiceImpl.java:524-531` |
| C7 | 새 번호 산정 | 부서 이동 실행 | `findMaxSourceNumber(대상부서)+1`(없으면 1). 보관 상태 문제도 번호를 점유하므로 `WHERE`에 상태 조건이 없다(spec D5, 번호 재사용 금지) | `ProblemServiceImpl.java:536-537`; `ProblemMapper.xml:134-138` |
| C8 | 동시 이동 경합 | 두 관리자가 같은 부서로 동시 이동 | UNIQUE 위반 시 이미 조회해둔 부서명으로 `duplicateSourceNumber` 재사용(DB 재조회 없음) | `ProblemServiceImpl.java:541-545` |
| C9 | 감사 로그 | 부서 이동 성공 | `PROBLEM_DEPARTMENT_CHANGED`, detail `{"from":n,"to":n,"sourceNumberFrom":n,"sourceNumberTo":n}` | `ProblemServiceImpl.java:546-549` |
| C10 | 응답 형태 | 부서 이동 성공 | `{sourceNumber: n}`(새로 배정된 번호) | `ProblemController.java:104-105` |
| C11 | 다음 문항번호 스코프 | `nextSourceNumber` 조회 | `owningDepartmentResolver.resolve(departmentId, actor)`로 스코프 결정 후 `findMaxSourceNumber+1` | `ProblemServiceImpl.java:561-564` |
| C12 | 다음 문항번호 응답 형태 | 조회 성공 | 응답은 숫자 그대로(래핑 없음) | `ProblemController.java:108-111` |

---

## I. 이미지

| ID | 시나리오 | 입력·사전조건 | 기대결과 | Spring 출처 |
|---|---|---|---|---|
| I1 | 확장자 허용목록 | 업로드 파일 확장자 | `png/jpg/jpeg/gif/webp`만 허용, **svg 제외**(인라인 `<script>`로 저장형 XSS 우려) | `ProblemImageServiceImpl.java:27-34` |
| I2 | Content-Type 허용목록 | 업로드 파일 Content-Type | `image/png,image/jpeg,image/gif,image/webp` | `ProblemImageServiceImpl.java:36-37` |
| I3 | 이중 검증 | 확장자·Content-Type 검증 | 둘 다 독립적으로 허용목록을 통과해야 한다(Content-Type만 신뢰하지 않음) | `ProblemImageServiceImpl.java:130-142` |
| I4 | 크기 상한 | 파일 크기 > 5MB | "이미지 크기는 5MB를 초과할 수 없습니다." | `ProblemImageServiceImpl.java:45,63-65` |
| I5 | 형식 불일치 | 확장자 또는 Content-Type이 허용목록 밖 | resultCode 1014, "허용되지 않는 파일 형식입니다. png, jpg, jpeg, gif, webp 이미지만 업로드할 수 있습니다." | `ProblemImageServiceImpl.java:133-134,138-139`; `ErrorCode.java:17` |
| I6 | 저장 파일명 | 저장 시 | 항상 새 UUID + 검증된 확장자. 원본 파일명은 경로 생성에 쓰지 않는다(경로 조작 불가) | `ProblemImageServiceImpl.java:72-76` |
| I7 | 경로 이탈 방어 | 저장 대상 경로 계산 | `target.getParent()`가 `uploadDir`과 다르면 거부(벨트 앤 브레이스, UUID+정규식 확장자만으로 이미 차단됨) | `ProblemImageServiceImpl.java:76-85` |
| I8 | 감사 로그 fail-closed | 감사 기록 실패 | 이미 저장된 파일을 지우고 업로드 전체를 `MSG_PROC_FAIL`, "이미지 업로드에 실패했습니다."로 실패시킨다(감사 없이 파일만 남는 상태 금지) | `ProblemImageServiceImpl.java:96-107` |
| I9 | 감사 로그 형태 | 업로드 성공 | action `PROBLEM_IMAGE_UPLOADED`, targetType `PROBLEM_IMAGE`, targetId **null**, detail `{"fileName":"<uuid.ext>"}` | `ProblemImageServiceImpl.java:101-107` |
| I10 | 반환 URL | 업로드 성공 응답 | `PREFIX("/uploads/images/") + fileName` | `ProblemImageServiceImpl.java:109`; `ImageUrlValidator.java:17` |
| I11 | 파일 필드 부재 | `file`이 없거나 빈 파일 | resultCode 1009(`FILE_REQUIRED`) | `ProblemImageServiceImpl.java:60-62`; `ErrorCode.java:10` |
| I12 | 기존 데이터 영향 | 이관 시점 `problems.image_url` 현황 | NULL이 아닌 행 0건(26건 중 0) — 접두어 변경(승인된 이탈②)이 기존 데이터를 깨지 않는 근거 | Spring 코드 출처 아님 — DB 실측(2026-08-19), plan Global Constraints 원문에 기록 |

---

## X. 엑셀 행 검증

컬럼 순서: `0 유형 · 1 내용 · 2 이미지 · 3 참조지문 · 4~8 보기1~5 · 9 정답 · 10 해설 · 11 태그 · 12 문항번호`. 헤더 1행.

| ID | 시나리오 | 입력·사전조건 | 기대결과 | Spring 출처 |
|---|---|---|---|---|
| X1 | 컬럼 순서 고정 | 셀 인덱스 상수 | 위 순서대로 고정 | `ExcelProblemUploadServiceImpl.java:61-69` |
| X2 | 유형·내용 누락 | `typeText` 또는 `content` 공백 | "문제유형과 문제내용은 필수입니다." | `ExcelProblemUploadServiceImpl.java:193-195` |
| X3 | FILL_BLANK 미지원 | 유형이 `FILL_BLANK` | "빈칸 채우기는 엑셀 업로드를 지원하지 않습니다. 개별 입력을 이용하세요." | `ExcelProblemUploadServiceImpl.java:196-200` |
| X4 | 알 수 없는 유형 | `ProblemType.valueOf` 실패 | "유효하지 않은 문제유형입니다: \<원문\>" | `ExcelProblemUploadServiceImpl.java:202-207` |
| X5 | 번호 없음 | 문항번호 셀 공백 | "문항 번호는 필수입니다." | `ExcelProblemUploadServiceImpl.java:211-214` |
| X6 | 번호가 숫자 아님 | `Integer.parseInt` 실패 | "문항 번호는 숫자여야 합니다: \<원문\>" | `ExcelProblemUploadServiceImpl.java:216-220` |
| X7 | 번호 범위 위반 | 번호 < 1 | "문항 번호는 1 이상이어야 합니다: \<번호\>" | `ExcelProblemUploadServiceImpl.java:221-223` |
| X8 | 파일 안 중복 | 동일 파일 내 동일 번호 재등장 | "파일 안에서 문항 번호가 중복됩니다: \<번호\>" | `ExcelProblemUploadServiceImpl.java:224-228` |
| X9 | 태그 초과 | 태그 20개 초과 또는 100자 초과 | "태그는 문제당 20개, 태그명은 100자 이하여야 합니다." | `ExcelProblemUploadServiceImpl.java:230-233,380-388` |
| X10 | 정답 없음 | 정답 셀 공백 | "정답은 필수입니다." | `ExcelProblemUploadServiceImpl.java:234-236` |
| X11 | 이미지 열 미허용 | 이미지 열이 비어있지 않음 | "이미지는 엑셀로 등록할 수 없습니다. 이미지 열은 비워 두고, 문제 개별 등록/수정 화면에서 이미지를 첨부하세요." | `ExcelProblemUploadServiceImpl.java:238-246` |
| X12 | 보기 개수 위반 | 보기 < 2 또는 > 5 | "보기는 2개 이상 5개 이하이어야 합니다." | `ExcelProblemUploadServiceImpl.java:312-314` |
| X13 | 빈 보기(열 정렬 보존) | 앞선 보기 열이 비고 뒤 열에 값 존재 | "빈 보기는 입력할 수 없습니다."(값을 앞으로 당겨 채우지 않는다 — 정답 번호가 엉뚱한 보기를 가리키는 조용한 오답 버그 방지) | `ExcelProblemUploadServiceImpl.java:316-327` |
| X14 | OX 보기 개수 | OX인데 보기 2개 아님 | "OX 문제는 보기 2개(O/X)가 필요합니다." | `ExcelProblemUploadServiceImpl.java:328-330` |
| X15 | 정답 파싱 실패 | 정답 셀이 숫자로 파싱 안 됨 | "정답은 보기 번호(1부터 시작)여야 합니다: \<원문\>" | `ExcelProblemUploadServiceImpl.java:332-338` |
| X16 | 정답 범위 초과 | 정답 인덱스가 보기 범위 밖 | "정답 번호가 보기 범위를 벗어났습니다: \<index\>" | `ExcelProblemUploadServiceImpl.java:339-343` |
| X17 | 단일 정답 유형 위반 | MCQ_MULTI 아닌데 고유 정답 개수 ≠ 1 | "이 유형은 정답이 1개여야 합니다." | `ExcelProblemUploadServiceImpl.java:344-347` |
| X18 | MULTI 정답 0개 | MCQ_MULTI인데 고유 정답 0개 | "정답을 최소 1개 선택하세요." | `ExcelProblemUploadServiceImpl.java:348-350` |
| X19 | SHORT_ANSWER 빈 토큰 | 콤마로 나눈 정답 중 빈 토큰 존재 | "빈 정답은 입력할 수 없습니다." | `ExcelProblemUploadServiceImpl.java:270-275` |
| X20 | 저장 시 중복(23505) | DB에 이미 같은 부서·번호 존재 | "문항 번호 \<번호\>번은 이 부서에 이미 있습니다." — 일반 문구에 묻히면 안 된다 | `ExcelProblemUploadServiceImpl.java:286-289(단답형),364-367(선택형)` |
| X21 | 그 밖의 저장 실패 | DB insert 실패(중복 외) | "문제 저장 중 오류가 발생했습니다." | `ExcelProblemUploadServiceImpl.java:290-293,368-371` |
| X22 | 행별 격리 | 다수 행 업로드 중 일부 실패 | 각 성공 행은 `REQUIRES_NEW` 독립 트랜잭션(문제 insert + 보기/정답 insert + 태그 연결 + 감사)으로 커밋되며, 한 행의 실패가 다른 행을 롤백하지 않는다 | `ProblemProvisioningServiceImpl.java:43-54,60-71` |

---

## F. 엑셀 파일 수준

| ID | 시나리오 | 입력·사전조건 | 기대결과 | Spring 출처 |
|---|---|---|---|---|
| F1 | 파일 필드 부재 | `file`이 없거나 빈 파일 | resultCode 1009(`FILE_REQUIRED`) | `ExcelProblemUploadServiceImpl.java:97-99`; `ErrorCode.java:10` |
| F2 | 확장자 제한 | `.xlsx`/`.xls`가 아님 | resultCode 1014, "xlsx 또는 xls 엑셀 파일만 업로드할 수 있습니다." | `ExcelProblemUploadServiceImpl.java:181-186`; `ErrorCode.java:17` |
| F3 | 열 수 없는 파일 | 손상·암호화·엑셀 아닌 바이트 | resultCode 1013, "엑셀 파일을 읽을 수 없습니다. 손상되었거나 암호가 설정된 파일인지 확인한 뒤 다시 올려 주세요." | `ExcelProblemUploadServiceImpl.java:77-78,164-171`; `ErrorCode.java:16` |
| F4 | 시트 없음 | 워크북에 시트가 0개 | resultCode 1013, "엑셀 파일에 시트가 없습니다. 첫 번째 시트에 문제 목록을 담아 다시 올려 주세요."(계정 업로드와 문구가 다름) | `ExcelProblemUploadServiceImpl.java:173-179` |
| F5 | 데이터 행 상한 | 데이터 행 501개 이상(헤더 제외) | 처리 전 전체 거부, "한 번에 업로드할 수 있는 데이터 행은 최대 500건입니다. 파일을 나눠 업로드하세요." | `ExcelProblemUploadServiceImpl.java:76,111-116` |
| F6 | 부서 스코프 결정 시점 | 파일 파싱 전 | `owningDepartmentResolver.resolve`로 스코프를 행 파싱 전에 확정 | `ExcelProblemUploadServiceImpl.java:101` |
| F7 | 파일 크기 상한(승인된 이탈③) | 파일 크기 초과 | Spring 20MB(멀티파트) → 4MB로 하향, resultCode 1015 | `application.yml:18-19` |

---

## A. 감사 로그(Audit Log)

| ID | 동작 | action | detail | Spring 출처 |
|---|---|---|---|---|
| A1 | 문제 생성 | `PROBLEM_CREATED` | `{"type":"<유형>"}` | `ProblemServiceImpl.java:125-126` |
| A2 | 문제 수정 | `PROBLEM_UPDATED` | `{"type":"<기존 유형>"}` | `ProblemServiceImpl.java:163-164` |
| A3 | 문제 보관 | `PROBLEM_ARCHIVED` | `{}` | `ProblemServiceImpl.java:176` |
| A4 | 부서 이동 | `PROBLEM_DEPARTMENT_CHANGED` | `{"from":n,"to":n,"sourceNumberFrom":n,"sourceNumberTo":n}` | `ProblemServiceImpl.java:546-549` |
| A5 | 엑셀 문제 행 생성 | `PROBLEM_CREATED_BY_EXCEL`(targetType `PROBLEM`) | `{"type":"<유형>"}` | `ProblemProvisioningServiceImpl.java:52-53,69-70` |
| A6 | 엑셀 업로드 완료 | `PROBLEM_EXCEL_UPLOADED`(targetType `EXCEL_UPLOAD_LOG`, targetId=로그 id) | `{fileName,totalRows,successRows,failRows,departmentId}` — **`departmentId`를 빠뜨리지 말 것** | `ExcelProblemUploadServiceImpl.java:151-154` |
| A7 | 이미지 업로드 | `PROBLEM_IMAGE_UPLOADED`(targetType `PROBLEM_IMAGE`, targetId **null**) | `{"fileName":"<uuid.ext>"}`, fail-closed(감사 실패 시 파일도 삭제) | `ProblemImageServiceImpl.java:101-107` |

`recordAudit`의 fail-closed 규칙(키 이름에 "password" 포함 시 거부)은 서브플랜 3에서 이미 구현됐다(`web/lib/audit/auditLog.ts`) — 이번 정답지의 대상이 아니다.

---

## 검증 기준

각 행은 다음 단계에서 기계 검증된다:
- **Task 2~9:** Vitest 단위·통합 테스트(각 시나리오별 assert)
- **Task 10:** E2E 테스트(런타임 HTTP 경로 실측, 정확한 메시지·상태코드·응답 필드 확인) + 이 정답지와의 대조

**실행 구간(M1~M7) 매핑:** M1(Task 1+4)이 이 정답지와 검증 모듈을 만든다. M3(Task 5)가 V·N 구획, M4(Task 6+7)가 L·C 구획, M5(Task 9)가 X·F 구획, M6(Task 8)이 I 구획, M7(Task 10)이 전체 E2E 대조를 담당한다. 자세한 근거는 `docs/superpowers/plans/2026-08-19-migration-problem-bank.md`의 `## 실행 구간 (7구간)` 표를 참고.

**응답 봉투 공통 규칙:** `{resultCode,resultMsg,data}`. `create`·`update`·`archive`는 `data` 없이 `ok()`. `changeDepartment` 응답은 `{sourceNumber: n}`. `nextSourceNumber` 응답은 숫자 그대로.
