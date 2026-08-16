# Auth E2E 런타임 검증 (2026-08-16)

**목적:** 실행 중인 Next dev 서버 + 실 Postgres(test DB) + 부트스트랩 계정으로 auth API의 쿠키 발급·검증·미들웨어 게이트 실경로를 사람이 확인한다. 단위/통합 테스트(Task 2~5, 57 green)가 못 잡는 런타임 배선(next/headers 쿠키, 미들웨어 실경로)을 덮는 것이 목적.

## 환경

- **커밋:** `8500b86` (branch `feat/migration-auth`)
- **서버:** `web/` 에서 `next dev -p 3100` (포트 3000은 무관한 사용자 프로세스 PID 34676 이 점유 중이어서 회피, 건드리지 않음)
- **DB:** Docker `probank-postgres` (localhost:5434), DB `probank_test` — drizzle 마이그레이션 이미 적용됨
- **부트스트랩:** `pnpm bootstrap` 으로 총괄관리자(`admin` / `changeme1234`) + 본사 부서 시드 (테스트 스위트는 이번 검증 중 실행하지 않음 — 테이블 truncate 회피)
- **env:** `DATABASE_URL`, `SESSION_JWT_SECRET`(32+ bytes), `BOOTSTRAP_ADMIN_*` 를 `web/.env.local`(gitignored, 검증 후 삭제) 및 셸 인라인으로 주입

## 시나리오별 결과

### 1. 로그인 성공 (checklist L1)

```
curl -i -c cookie.txt -X POST http://localhost:3100/api/auth/login \
  -H 'content-type: application/json' -d '{"employeeNo":"admin","password":"changeme1234"}'
```

실측:
```
HTTP/1.1 200 OK
set-cookie: session=eyJ...; Path=/; Expires=...; Max-Age=5400; HttpOnly; SameSite=lax

{"resultCode":200,"resultMsg":"정상 처리되었습니다.","data":{"name":"총괄관리자","role":"SUPER_ADMIN","mustChangePassword":true}}
```

**PASS** — 200/200, `data{name,role,mustChangePassword:true}` 일치, `Set-Cookie`가 `HttpOnly; SameSite=lax`로 발급됨.

### 2. 세션 조회 (쿠키 포함) (checklist S1)

```
curl -s -b cookie.txt http://localhost:3100/api/auth/session
```

실측:
```
{"resultCode":200,"resultMsg":"정상 처리되었습니다.","data":{"isLoggedIn":true,"employeeNo":"admin","name":"총괄관리자","role":"SUPER_ADMIN","departmentId":1,"departmentName":"본사","mustChangePassword":true}}
```

**PASS** — `isLoggedIn:true`, `departmentName:"본사"`, `mustChangePassword:true` 일치.

### 3. 게이트 확인 — `/api/problems` (checklist G1)

```
curl -s -b cookie.txt http://localhost:3100/api/problems
```

실측:
```
{"resultCode":1012,"resultMsg":"비밀번호 변경이 필요합니다."}
```

**PASS** — 라우트가 존재하지 않음에도 미들웨어가 라우팅보다 먼저 걸려 1012를 반환 (mustChangePassword 게이트가 실경로에서 동작함을 증명).

### 4. 비밀번호 변경 (checklist C1, C2, C3, C4)

**4a. 8자 미만 (C2)**
```
curl -s -b cookie.txt -X POST .../api/auth/change-password -d '{"newPassword":"short7!"}'
→ {"resultCode":1000,"resultMsg":"비밀번호는 8자 이상이어야 합니다."}
```
**PASS**

**4b. 현재와 동일 (C4)**
```
curl -s -b cookie.txt -X POST .../api/auth/change-password -d '{"newPassword":"changeme1234"}'
→ {"resultCode":1000,"resultMsg":"현재 비밀번호와 다른 비밀번호를 입력하세요."}
```
**PASS**

**4c. 성공 (C1)**
```
curl -i -c cookie.txt -b cookie.txt -X POST .../api/auth/change-password -d '{"newPassword":"newpass1234"}'
```
실측:
```
HTTP/1.1 200 OK
set-cookie: session=eyJ...mustChangePassword...false...; HttpOnly; SameSite=lax

{"resultCode":200,"resultMsg":"정상 처리되었습니다."}
```
이후 세션 조회:
```
{"resultCode":200,"resultMsg":"정상 처리되었습니다.","data":{"isLoggedIn":true,...,"mustChangePassword":false}}
```
**PASS** — bare ok(), 새 JWT 쿠키 재발급, 이후 세션에서 `mustChangePassword:false` 확인.

**4d. 세션 없음 (C3, 브리프 외 추가 확인)**
```
curl -s -w "%{http_code}" -X POST .../api/auth/change-password -d '{"newPassword":"whatever123"}' (쿠키 없음)
→ 401, {"resultCode":980,"resultMsg":"세션 정보가 없습니다."}
```
**PASS**

### 5. 잠금 (checklist L5, L6, L7)

5회 틀린 비번 로그인:
```
for i in 1 2 3 4 5; do curl -s -X POST .../api/auth/login -d '{"employeeNo":"admin","password":"wrong"}'; done
```
실측 resultCode 순서: `1011, 1011, 1011, 1011, 1010`

잠긴 뒤 맞는 비번(`newpass1234`)으로 재시도:
```
→ {"resultCode":1010,"resultMsg":"계정이 잠겼습니다. 잠시 후 다시 시도하세요."}
```

**PASS** — 1~4회 1011, 5회째 1010 전환, 잠금 이후 올바른 비번도 1010(비번 검사 전에 잠금이 차단).

DB 직접 원복:
```
docker exec probank-postgres psql -U probank -d probank_test -c \
  "UPDATE users SET failed_login_count=0, locked_until=NULL WHERE employee_no='admin'"
→ UPDATE 1
```

원복 후 재로그인:
```
curl -i -c cookie.txt -X POST .../api/auth/login -d '{"employeeNo":"admin","password":"newpass1234"}'
→ HTTP/1.1 200 OK, set-cookie 재발급, {"resultCode":200,...,"data":{"name":"총괄관리자","role":"SUPER_ADMIN","mustChangePassword":false}}
```
**PASS** — 잠금 해제 후 정상 로그인 재개.

### 6. 로그아웃 (checklist L8)

```
curl -i -c cookie.txt -b cookie.txt -X POST http://localhost:3100/api/auth/logout
```
실측:
```
HTTP/1.1 200 OK
set-cookie: session=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT

{"resultCode":200,"resultMsg":"정상 처리되었습니다."}
```
로그아웃 이후 세션 조회:
```
{"resultCode":200,"resultMsg":"정상 처리되었습니다.","data":{"isLoggedIn":false,"employeeNo":null,"name":null,"role":null,"departmentId":null,"departmentName":null,"mustChangePassword":false}}
```
**PASS** — bare ok(), 쿠키가 만료된 빈 값(`session=`, epoch Expires)으로 삭제됨, 이후 세션 `isLoggedIn:false`.

### 부가 확인 (checklist S2, 게이트 무인증)

- 쿠키 없이 세션 조회 → `200 / {"isLoggedIn":false, ...}` (401이 아님) — **PASS** (S2)
- 쿠키 없이 `/api/problems` → `401 / {"resultCode":980,"resultMsg":"세션 정보가 없습니다."}` — **PASS**

## 체크리스트 매핑 요약

| Row | 검증 방식 | 결과 |
|---|---|---|
| L1 | E2E (시나리오 1) | PASS |
| L2 | Task 2~5 Vitest (E2E 미실행) | — |
| L3 | Task 2~5 Vitest (E2E 미실행) | — |
| L4 | Task 2~5 Vitest (E2E 미실행) | — |
| L5 | E2E (시나리오 5, 1~4회차) | PASS |
| L6 | E2E (시나리오 5, 5회차) | PASS |
| L7 | E2E (시나리오 5, 잠금 후 맞는 비번) | PASS |
| L8 | E2E (시나리오 6) | PASS |
| S1 | E2E (시나리오 2) | PASS |
| S2 | E2E (부가 확인, 쿠키 없음) | PASS |
| C1 | E2E (시나리오 4c) | PASS |
| C2 | E2E (시나리오 4a) | PASS |
| C3 | E2E (시나리오 4d) | PASS |
| C4 | E2E (시나리오 4b) | PASS |
| G1 | E2E (시나리오 3) | PASS |
| G2 | Task 2~5 Vitest (로직은 C1~C4에서 검증됨; change-password 라우트 자체가 게이트 우회 대상이라 E2E에서 별도 미실행) | — |

L2/L3/L4/G2는 브리프의 curl 시나리오 범위 밖(입력값을 만들려면 미존재 사번/비활성 계정 등 추가 픽스처가 필요)이라 이번 E2E에서는 실행하지 않았고, 이미 Task 2~5의 Vitest 통합 테스트가 기계 검증했다. 브리프에 명시된 모든 시나리오(로그인/세션/게이트/비번변경/잠금/로그아웃)는 실행 중인 서버로 모두 실측했고 전부 PASS.

## 최종 DB 상태 (probank_test, users 테이블 admin 행)

```
employee_no | status | failed_login_count | locked_until | must_change_password
admin       | ACTIVE | 0                   | (null)       | f
```

비밀번호는 검증 과정에서 `changeme1234` → `newpass1234` 로 변경된 상태로 남아있음 (scratch DB이므로 원복하지 않음).

## 정리 (Cleanup)

- 이번 검증을 위해 기동한 dev 서버 프로세스(PID 8452, `next dev -p 3100`)를 종료함 (`taskkill /PID 8452 /F`). 무관한 사용자 프로세스 PID 34676(port 3000)은 건드리지 않음.
- `web/cookie.txt` 삭제.
- `web/.env.local`(검증용으로 임시 생성, gitignored) 삭제.
- `probank_test` DB는 그대로 둠(스크래치 DB) — 최종 상태는 위 표 참고.

## 결론

브리프에 명시된 모든 curl 시나리오(로그인 성공/세션 조회/게이트/비번변경 3종+세션없음/잠금 5회+원복/로그아웃/무쿠키 케이스)가 파리티 체크리스트 기대값과 정확히 일치했다. **이탈(FAIL) 없음.**
