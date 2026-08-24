# 부서·계정 관리 파리티 체크리스트

**목적:** 현재 Spring `DepartmentServiceImpl`, `UserAdminServiceImpl`, `ExcelAccountUploadServiceImpl`, `AccountProvisioningServiceImpl`, `AuditLogServiceImpl` 실측 계약을 정의한 정답지.  
**작성일:** 2026-08-16  
**측정 근거:** `ErrorCode.java`, `ResponseDto.java`, `GlobalExceptionHandler.java`, 컨트롤러  
**역할 요구사항:** 모든 엔드포인트는 `SUPER_ADMIN` 전용 (역할 불일치 → HTTP 403, resultCode 990)

---

## 승인된 이탈(7건)

| 번호 | 유형 | 설명 | 근거 문서 |
|------|------|------|----------|
| ① | D6 메일 제거 | 단건 생성 응답에 `temporaryPassword` 포함 (감사에는 비밀번호 절대 미기록) | deployment.md D6, 이관 스펙 Q6 |
| ② | D7 일괄 추가 필드 | 엑셀 일괄 업로드 응답에 `successAccounts` 배열 추가 | deployment.md D7, 이관 스펙 Q7 |
| ③ | 행 실패 문구 정화 | 엑셀 행별 실패 문구에서 메일 언급 제거 | 이관 스펙 Q6 |
| ④ | 파일 상한 하향 | 파일 크기 상한 20MB → 4MB, resultCode 1015. Spring 실측: 20MB 초과는 `MaxUploadSizeExceeded`(Multipart)로 잡혀 HTTP 200, resultCode 1009였다; 포트는 4MB 초과 시 HTTP 400, resultCode 1015로 응답한다(상한값·상태코드·resultCode 모두 이탈) | 이관 스펙 Q7 플랫폼 안전값 |
| ⑤ | SheetJS 행 번호 어긋남 | SheetJS `blankrows:false`로 인해 빈 행 많은 파일에서 오류 행 번호가 엑셀과 어긋날 수 있음. 동일한 이유로 `totalRows` 집계와 500행 상한 판정에서도 빈 행이 제외된다(Spring `lastRowNum`은 빈 행을 포함해 센다) | 실사용 파일엔 빈 행 없음, 미세 이탈로 기록 |
| ⑥ | file 필드 부재 통일 | 멀티파트 file 필드 부재 → HTTP 200, resultCode 1009로 통일 (Spring은 catch-all 200/-1) | 의도적 개선 |
| ⑦ | API 타임스탬프 UTC 직렬화 | API 응답의 타임스탬프는 UTC ISO("Z" 접미사)로 직렬화한다(Spring은 존 정보 없는 KST 벽시계 문자열). 표시층에서 현지화하므로 화면에는 동일하게 노출된다. **확정**: 컨벤션은 UTC + `Z` 접미사이고 표시 현지화는 프론트 책임이다. Drizzle 이 `timestamp` 텍스트를 항상 `+0000` 으로 파싱하므로(`drizzle-orm/pg-core/columns/timestamp.js`) 포트 내부는 DB 세션 TZ 와 무관하게 일관되며, `web/lib/http/timestamp.test.ts` 로 테스트에 고정했다. **컷오버에서 확인할 것은 서버 TZ 가 아니라 `current_setting('TimeZone')`** 이다(현재 `Etc/UTC`) | 서브플랜 6 Task 0 에서 확정. 근거: `.superpowers/sdd/2026-08-24-migration-stats/task-0-brief.md` |

---

## D. 부서(Department)

| ID | 시나리오 | 입력·사전조건 | 기대결과 |
|---|---|---|---|
| D1 | 부서 목록 조회 | SUPER_ADMIN이 부서 목록 조회 | HTTP 200, resultCode 200, 응답 필드: `[{id, name, code, status}]`, 정렬: `ORDER BY name` |
| D2 | 부서 생성 성공 | name: "개발팀", code: "DEV001", 모두 필수값 충족, 중복 없음 | HTTP 200, resultCode 200, 응답 본문은 bare ok() — data 키 없음, INSERT(status=ACTIVE), 감사(`DEPARTMENT_CREATED`, detail: `{code: "DEV001"}`) |
| D3 | 부서명 검증 실패 | name 미입력 또는 name > 100자 | HTTP 400, resultCode 1000, 메시지: "부서명을 입력하세요." (미입력) 또는 "부서명은 100자를 넘을 수 없습니다." (초과) |
| D4 | 부서 코드 검증 실패 | code 미입력 또는 code > 50자 | HTTP 400, resultCode 1000, 메시지: "부서 코드를 입력하세요." (미입력) 또는 "부서 코드는 50자를 넘을 수 없습니다." (초과) |
| D5 | 부서 코드 중복 | 기존 코드와 동일한 code 입력 | HTTP 400, resultCode 1000, 메시지: "이미 존재하는 부서 코드입니다: {code}" |
| D6 | 부서 수정 성공 | name: "개발팀 수정", status: "ACTIVE", 기존 부서 ID 존재 | HTTP 200, resultCode 200, 응답 본문은 bare ok() — data 키 없음, 갱신: name/status만, 감사(`DEPARTMENT_UPDATED`, detail: `{code: "DEV001", name: "개발팀 수정", status: "ACTIVE"}`) |
| D7 | 부서 수정 시 status 누락 | name만 입력, status 미제공 | HTTP 400, resultCode 1000, 메시지: "부서 상태를 선택하세요." |
| D8 | 부서 조회/수정 시 존재하지 않는 ID | 존재하지 않는 departmentId로 조회 또는 수정 시도 | HTTP 400, resultCode 1000, 메시지: "존재하지 않는 부서입니다." |
| D9 | 부서 엔드포인트 역할 제한 | DEPT_ADMIN 또는 EMPLOYEE가 부서 조작 시도 | HTTP 403, resultCode 990, 메시지: "접근 권한이 없습니다." |

---

## U. 계정(User Account)

| ID | 시나리오 | 입력·사전조건 | 기대결과 |
|---|---|---|---|
| U1 | 계정 목록 조회 | SUPER_ADMIN이 계정 목록 조회, 선택 필터: departmentId | HTTP 200, resultCode 200, 응답: `[{id, employeeNo, name, email, departmentId, departmentName, role, status, lastLoginAt}]`, JOIN departments, 정렬: `ORDER BY employee_no` |
| U2 | 계정 생성 성공 | employeeNo: "EMP001", name: "홍길동", email: "hong@company.com", departmentId: 1, role: "EMPLOYEE", 모두 유효, 중복 없음, 부서 존재 | HTTP 200, resultCode 200, 응답: `{employeeNo, name, email, temporaryPassword}` [D6 이탈], INSERT(must_change_password=true, status=ACTIVE), 임시비밀번호: 10자 문자셋(I,L,O,l,o,0,1 제외) bcrypt(10), 감사(`USER_CREATED`, detail: `{employeeNo: "EMP001"}` — 비밀번호 절대 미기록) |
| U3 | 사번 검증 실패 | employeeNo 미입력 또는 > 50자 | HTTP 400, resultCode 1000, 메시지: "사번을 입력하세요." (미입력) 또는 "사번은 50자를 넘을 수 없습니다." (초과) |
| U4 | 이름 검증 실패 | name 미입력 또는 > 100자 | HTTP 400, resultCode 1000, 메시지: "이름을 입력하세요." (미입력) 또는 "이름은 100자를 넘을 수 없습니다." (초과) |
| U5 | 이메일 검증 실패 | email 미입력, 형식 오류, 또는 > 255자 | HTTP 400, resultCode 1000, 메시지: "유효한 회사 이메일을 입력하세요." (미입력·형식 오류 통일) 또는 "회사 이메일은 255자를 넘을 수 없습니다." (길이 초과) |
| U6 | 역할 검증 실패 | role 미입력 또는 유효하지 않은 역할값 | 역할 누락 → HTTP 400, resultCode 1000, 메시지: "역할을 선택하세요." / 역할 값이 유효 enum이 아님 → Spring은 Jackson 강제변환 실패로 HTTP 200, resultCode 1000(일반 문구 "잘못된 파라미터를 입력했습니다."·errorList), 포트는 HTTP 400, resultCode 1000 "역할을 선택하세요."로 수렴 — 수용된 미세 이탈(본문 파싱 계열, resultCode 1000은 동일·프론트는 resultCode로만 분기). "유효하지 않은 역할입니다: {text}"는 X6(엑셀 행별 검증) 전용이며 U6에는 적용되지 않는다 |
| U7 | 사번 중복 | 기존 사번과 동일한 employeeNo 입력 | HTTP 400, resultCode 1000, 메시지: "이미 존재하는 사번입니다: {employeeNo}" |
| U8 | 이메일 중복 (대소문자 무시) | 기존 이메일과 동일 (대소문자 무시 비교) | HTTP 400, resultCode 1000, 메시지: "이미 사용 중인 회사 이메일입니다: {email}" |
| U9 | 부서 미존재 | 존재하지 않는 departmentId 입력 | HTTP 400, resultCode 1000, 메시지: "존재하지 않는 부서입니다." departmentId가 오형식(비숫자)인 경우: Spring은 Jackson 강제변환 실패로 HTTP 200, resultCode 1000(일반 문구)이고, 포트는 "존재하지 않는 부서입니다."로 HTTP 400, resultCode 1000 — U6와 같은 수용 계열의 본문 파싱 미세 이탈(resultCode 1000은 동일) |
| U10 | 계정 수정 성공 | name/email/departmentId/role/status 모두 필수, 유효, 이메일 변경 시만 중복 검사, 계정 존재 | HTTP 200, resultCode 200, 응답 본문은 bare ok() — data 키 없음, 갱신: name/email/departmentId/role/status, 감사(`USER_UPDATED`, detail: `{employeeNo, name, email, departmentId, role, status}`) |
| U11 | 본인 SUPER_ADMIN 역할 해제 금지 | SUPER_ADMIN이 자신의 role을 SUPER_ADMIN에서 다른 역할로 변경 시도 | HTTP 400, resultCode 1000, 메시지: "본인의 총괄 관리자 역할은 스스로 해제할 수 없습니다." |
| U12 | 본인 계정 비활성화 금지 | SUPER_ADMIN이 자신의 status를 INACTIVE로 변경 시도 | HTTP 400, resultCode 1000, 메시지: "본인 계정은 스스로 비활성화할 수 없습니다." |
| U13 | 마지막 활성 SUPER_ADMIN 보호 | 마지막 남은 활성 SUPER_ADMIN이 자신의 역할을 해제하거나 비활성화 시도 | HTTP 400, resultCode 1000, 메시지: "마지막 활성 총괄 관리자입니다. 다른 총괄 관리자를 먼저 지정한 뒤 역할 변경 또는 비활성화하세요." |
| U14 | 이메일 미변경 시 중복 검사 생략 | 수정 요청에서 기존 이메일과 동일한 이메일 제공 (equalsIgnoreCase) | HTTP 200, resultCode 200, 응답 본문은 bare ok() — data 키 없음, 이메일 중복 검사 스킵 |
| U15 | 계정 수정 시 존재하지 않는 계정 | 존재하지 않는 사용자 ID로 수정 시도 | HTTP 400, resultCode 1000, 메시지: "존재하지 않는 계정입니다." |

---

## A. 감사 로그(Audit Log)

| ID | 시나리오 | 입력·사전조건 | 기대결과 |
|---|---|---|---|
| A1 | 감사 로그 password 키 거부(fail-closed) | detail 객체에 "password"를 포함한 키가 있거나 재귀적으로 존재 (예: `{userPassword: "..."}`, `{nested: {password: "..."}}`) | 기록 전 throw/거부, 트랜잭션 롤백 (본체 INSERT 미실행) |
| A2 | 감사 로그 null detail 허용 | action만 있고 detail은 null | HTTP 200, resultCode 200, 감사 기록: detail=null 통과, 정상 저장 |
| A3 | 감사 로그 액션명·targetType 정의 | 사용 액션명: DEPARTMENT_CREATED, DEPARTMENT_UPDATED, USER_CREATED, USER_UPDATED, ACCOUNT_EXCEL_UPLOADED; targetType: DEPARTMENT, USER, EXCEL_UPLOAD_LOG | 감사 테이블에 위 값들로 기록, audit_logs.detail은 jsonb 타입 |

---

## X. 엑셀 일괄 등록(Excel Batch Upload)

| ID | 시나리오 | 입력·사전조건 | 기대결과 |
|---|---|---|---|
| X1 | 성공·실패 행 혼합 (행별 격리) | 파일에 성공 행 3개, 실패 행(검증 오류) 2개 포함 | HTTP 200, resultCode 200, 응답: `{totalRows: 5, successRows: 3, failRows: 2, errorDetail: "행 2: ...\n행 5: ...", successAccounts: [...]}`[D7], 성공 행은 각각 독립 트랜잭션 커밋, 실패 행은 롤백 |
| X2 | 500행 초과 사전 거부 | 데이터 행 501개 이상 | HTTP 400, resultCode 1000, 메시지: "한 번에 업로드할 수 있는 데이터 행은 최대 500건입니다. 파일을 나눠 업로드하세요." (처리 전 전체 거부) |
| X3 | 필수값 누락 | 임의 행에서 사번/이름/이메일/부서코드/역할 중 하나 이상 미입력 | HTTP 200, resultCode 200, errorDetail: "행 N: 필수값이 누락되었습니다." |
| X4 | 이메일 형식 오류 | 이메일이 정규식 ^[^\s@]+@[^\s@]+\.[^\s@]+$를 만족 안 함 | HTTP 200, resultCode 200, errorDetail: "행 N: 유효한 회사 이메일 형식이 아닙니다." |
| X5 | 사번 중복 (파일 내·DB) | 동일 사번이 파일 내 중복이거나 DB에 기존 존재 | HTTP 200, resultCode 200, errorDetail: "행 N: 이미 존재하는 사번입니다: {employeeNo}" |
| X6 | 이메일 중복 (소문자 정규화·DB) | 동일 이메일이 파일 내 소문자 비교로 중복이거나 DB에 기존 존재 (대소문자 무시) | HTTP 200, resultCode 200, errorDetail: "행 N: 이미 사용 중인 회사 이메일입니다: {email}" |
| X7 | 부서 코드 미존재 | 열 ④ 부서코드가 DEPARTMENT.code에 없음 | HTTP 200, resultCode 200, errorDetail: "행 N: 존재하지 않는 부서코드입니다: {code}" |
| X8 | 역할 유효성 오류 | 열 ⑤ 역할이 Enum(EMPLOYEE, DEPT_ADMIN, SUPER_ADMIN) 중 없음 | HTTP 200, resultCode 200, errorDetail: "행 N: 유효하지 않은 역할입니다: {text}" |
| X9 | 업로드 로그·감사 기록 | 엑셀 일괄 등록 완료 (성공·실패 혼합) | `excel_upload_logs` 테이블 INSERT(fileName, totalRows, successRows, failRows), 감사(`ACCOUNT_EXCEL_UPLOADED`, targetType: EXCEL_UPLOAD_LOG, detail: `{fileName, totalRows, successRows, failRows}`) — 업로드 로그+감사 한 트랜잭션 |
| X10 | 응답 형태 (successAccounts 추가) [D7] | 성공한 행들의 상세 정보 필요 | HTTP 200, resultCode 200, 응답: `{totalRows, successRows, failRows, errorDetail, successAccounts: [{rowNumber, employeeNo, name, email, temporaryPassword}]}` (프론트 표시·다운로드용, 서버는 파일 생성 안 함) |
| X11 | 파일 필드 부재 또는 멀티파트 파싱 실패 | file 필드 미제공 또는 멀티파트 바디 손상 | HTTP 200, resultCode 1009, 메시지: "파일을 업로드할 수 없습니다." [⑥ 이탈: Spring 200/-1에서 더 나은 1009로 통일] |
| X12 | 열 수 없는 파일 또는 시트 없음 | 손상·암호가 설정된 파일, 엑셀(xlsx/xls) 서명이 아닌 바이트, 시트 없음 등 — POI(WorkbookFactory)는 xlsx(zip)와 레거시 xls(OLE2/CFB) 를 모두 열므로 두 서명 모두 허용 대상 | HTTP 400, resultCode 1013, 메시지: "엑셀 파일을 읽을 수 없습니다. 손상되었거나 암호가 설정된 파일인지 확인한 뒤 다시 올려 주세요." 또는 "엑셀 파일에 시트가 없습니다. 첫 번째 시트에 계정 목록을 담아 다시 올려 주세요." |
| X13 | 파일 크기 초과 (4MB) [④ 이탈] | 파일 크기 4MB 초과 | HTTP 400, resultCode 1015, 메시지: "파일 크기가 허용 범위를 초과했습니다." |
| X14 | 행 저장 실패 메시지 [③ 이탈: 메일 문구 제거] | 행별 처리 중 DB INSERT 실패 또는 예기치 않은 오류 | HTTP 200, resultCode 200, errorDetail: "행 N: 계정 저장에 실패했습니다." (메일 자동 발송 언급 제거) |

**운영 리스크:** 대량 업로드 타임아웃/업로드 로그 트랜잭션 실패 시 successAccounts 유실 리스크 — 컷오버에서 다룸.

---

## 검증 기준

각 행은 다음 단계에서 기계 검증됨:
- **Task 2~6:** Vitest 단위·통합 테스트 (각 시나리오별 assert)
- **Task 7:** E2E 테스트 (런타임 HTTP 경로 실측, 정확한 메시지·상태코드·응답 필드 확인)

컬럼 순서(엑셀): ①사번 ②이름 ③이메일 ④부서코드 ⑤역할(Enum명)  
헤더: 1행 고정
