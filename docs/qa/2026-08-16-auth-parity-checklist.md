# Auth 파리티 체크리스트 (Spring 실측)

**목적:** 파리티 정답지 — 현재 Spring `AuthServiceImpl`/`AuthController`/`AuthServiceImplTest` 실측

**작성일:** 2026-08-16

## 잠금 파라미터

- **최대 실패 횟수:** 5회
- **잠금 지속 시간:** 15분

## 원자 잠금 SQL

다음 SQL은 비밀번호 불일치 시 `failed_login_count`를 증가시키고, 임계값에 도달하면 `locked_until`을 설정한다. 동시 요청에 의한 우회를 방지하기 위해 업데이트와 잠금 판정이 단일 SQL 문장 내에서 원자적으로 수행된다.

```sql
UPDATE users SET failed_login_count = failed_login_count + 1,
  locked_until = CASE WHEN failed_login_count + 1 >= <max> THEN <now+15m> ELSE locked_until END
WHERE id = <id> RETURNING locked_until
```

## 체크리스트

| # | 시나리오 | 입력·사전조건 | 기대결과(HTTP·resultCode·메시지·부수효과) |
|---|---|---|---|
| L1 | 로그인 성공 | 유효 사번/비번, ACTIVE | 200 / 200 / data{name,role,mustChangePassword}; `failed_login_count=0`, `last_login_at` 갱신, JWT 쿠키 발급 |
| L2 | 빈 사번 또는 빈 비번 | employeeNo="" 또는 password="" | 400 / 1000 / "사번과 비밀번호를 입력하세요." |
| L3 | 없는 사번 | 미존재 사번 | 400 / 1011 / "사번 또는 비밀번호가 올바르지 않습니다." |
| L4 | 비활성 계정 | status=INACTIVE | 400 / 1011 (없는 사번과 동일) |
| L5 | 비번 불일치(임계 미만) | 틀린 비번, failed<4 | 400 / 1011; `failed_login_count`+1, `locked_until` 유지 |
| L6 | 비번 불일치(이번에 잠김) | 틀린 비번, failed=4→5 | 400 / **1010** "계정이 잠겼습니다. 잠시 후 다시 시도하세요."; `locked_until`=now+15m |
| L7 | 잠긴 계정 + 맞는 비번 | locked_until 미래, 올바른 비번 | 400 / 1010 (비번 검사 전에 차단) |
| L8 | 로그아웃 | 세션 유무 무관 | 200 / 200 / ok(); 쿠키 삭제 |
| S1 | 세션 조회(로그인) | 유효 JWT | 200 / 200 / data{isLoggedIn:true, employeeNo,name,role,departmentId,departmentName(최신), mustChangePassword} |
| S2 | 세션 조회(미로그인) | 쿠키 없음/위조 | 200 / 200 / data{isLoggedIn:false, 나머지 null/false} |
| C1 | 비번변경 성공 | 세션, 8자+ 새 비번(현재와 다름) | 200 / 200 / ok(); `password_hash` 갱신, `must_change_password=FALSE`, JWT 재발급(mustChangePassword=false) |
| C2 | 비번변경 짧음 | 8자 미만 | 400 / 1000 / "비밀번호는 8자 이상이어야 합니다." |
| C3 | 비번변경 세션없음 | 세션 없음 | 401 / 980 / "세션 정보가 없습니다." |
| C4 | 비번변경 현재와 동일 | 현재 비번과 같은 값 | 400 / 1000 / "현재 비밀번호와 다른 비밀번호를 입력하세요." |
| G1 | mustChangePassword 게이트 | mustChange=true로 `/api/problems` | 200 / 1012 (Foundation 게이트) |
| G2 | mustChangePassword가 change-password는 통과 | mustChange=true로 `/api/auth/change-password` | 게이트 통과(로직은 C1~C4) |

## 검증 방법

각 행은 이후 Task(2~5)의 Vitest가 기계 검증하고, Task 6의 E2E curl이 런타임 경로를 확인한다.
