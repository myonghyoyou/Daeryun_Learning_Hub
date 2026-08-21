# Spring Boot → Next.js 이관 설계 (Vercel 단일 콘솔)

- 작성일: 2026-08-15
- 상태: 설계 확정 (구현 계획은 별도)
- 근거: 2026-08-15 브레인스토밍 세션 (Q1~Q10)
- 원 요청: "다른 프로젝트가 전부 Vercel에 있어서 이 프로젝트 하나만 Railway인 게 거슬린다. Vercel로 전체를 관리하고 싶다."

## 배경 — 왜 재작성인가

목표는 **운영 콘솔을 Vercel 하나로 통합**하는 것이다. 그런데 Vercel 서버리스는 JVM을 돌리지 않아 **Spring Boot 백엔드를 그대로 올릴 수 없다.** rewrites·프록시 같은 설정 트릭으로는 콘솔이 통합되지 않는다(백엔드가 여전히 외부에 산다). 따라서 이 프로젝트를 "진짜로 Vercel에 올린다"는 것은 **백엔드를 Next.js로 재작성한다**는 뜻이다 — 우회로가 없다.

- 배포는 아직 프로덕션에 나가지 않았다(운영 DB는 빈 상태에서 시작 — `docs/superpowers/specs/2026-08-14-deployment.md` D8). 잠식할 라이브 트래픽이 없어 **빅뱅 이관**이 가능하다.
- 이 결정은 배포 스펙의 **D1(프론트만 Vercel, 백엔드 Railway 유지)·D4(Supabase 독립 프로젝트)를 뒤집는다.** **D6/D7(메일 제거·임시비밀번호 화면 표시)** 은 이 이관에서 적용한다. 나머지 배포 세부(도메인·시크릿 등)는 컷오버 플랜에서 확정한다.
- Java 8 / Spring Boot 2.7 은 이미 EOL이라, 재작성엔 "언젠가는 손봐야 한다"는 부차적 명분도 있다.

## 성공 기준 — 기능 동등 이식(파리티)

**유일한 성공 기준은 파리티다:** 같은 입력에 현재 Spring 앱과 **같은 결과·같은 규칙·같은 에러**를 낸다. 기능 추가·개선·정리는 이 이관의 범위가 아니며, 파리티가 검증된 뒤에 별도로 다룬다(메일 D6/D7만 예외 — 아래 Q7 참조).

## 확정 결정 (Q1~Q10)

| # | 결정 | 확정 |
|---|---|---|
| Q1 | 이관 범위 | **기능 동등 이식(순수 포팅). 개선·정리는 동작 확인 후.** |
| Q2 | Next 구조 | **App Router.** 기존 Vite 프론트를 Next 안으로 흡수(프론트+API = 한 앱). |
| Q3 | DB | **Supabase Postgres (서울 ap-northeast-2).** Vercel 함수는 icn1(서울)에 공동 배치. |
| Q3b | DB 연결 | **Vercel Marketplace 통합** — Vercel 콘솔 하나에 DB·스토리지가 함께 잡힘. |
| Q4 | DB 접근 | **Drizzle** (복잡 통계는 raw SQL). 서버리스는 **Supabase 트랜잭션 풀러(6543)** 필수. |
| Q5 | 인증·세션 | **무상태 JWT (httpOnly 쿠키).** 서버 세션 저장소 없음. |
| Q6 | 엑셀 업로드 | **멀티파트 → 서버 SheetJS 파싱.** 최대 크기 상한을 플랫폼 안전값으로 하향. |
| Q7 | 메일 | **D6/D7 적용** — 메일 제거, 임시비번 화면 표시 + 일괄 다운로드(UTF-8 BOM). |
| Q8 | 이미지 저장 | **Supabase Storage** + 서명 URL(로그인 게이트 유지). 기능은 이식(실사용 0건). |
| Q9 | 테스트 | **상세 QA 체크리스트를 현재 Spring 앱으로 실측해 정답 고정 → Vitest로 파리티 검증.** 체크리스트는 **서브시스템별 just-in-time** 작성. |
| Q10 | 리포·컷오버 | **A + 빅뱅** — `web/`에 Next 앱 신설, Spring·Vite는 정답지로 유지, 컷오버 커밋에서 제거. |

## 섹션 A — 목표 아키텍처 & 토폴로지

하나의 Next.js 앱(App Router)이 프론트+API를 담아 Vercel에 배포된다.

```
브라우저 ──HTTPS──▶ Vercel (Next.js, 리전 icn1/서울)
                      │  app/(routes)         ← 기존 React 화면을 클라이언트 컴포넌트로
                      │  app/api/**/route.ts  ← 31개 REST 엔드포인트
                      │  middleware.ts        ← JWT 검증 + 역할·비번변경 게이트
                      ├──▶ Supabase Postgres (서울, 트랜잭션 풀러 6543) ← Drizzle
                      └──▶ Supabase Storage   (문제 이미지, 서명 URL)
                    DB·스토리지는 Vercel Marketplace로 Vercel 콘솔 하나에 집약
```

리포 구조 (A + 빅뱅):

```
Daeryun_Learning_Hub/
  backend/      ← Spring (정답지, 컷오버까지 유지)
  frontend/     ← Vite (정답지, 컷오버까지 유지)
  web/          ← 신규 Next.js 앱 (Vercel Root Directory = web/)
  docs/         ← 공유 (스펙·QA 체크리스트)
```

파리티 검증 완료 후 **컷오버 커밋 하나**로 `backend/`·`frontend/`를 제거한다.

## 섹션 B — 컴포넌트 매핑 + 6개 파리티 지점

계층 매핑 (Spring → Next/TS):

| Spring | Next.js/TS |
|---|---|
| `@RestController` | `app/api/**/route.ts` (31개) |
| `@Service`/`ServiceImpl` | `web/lib/services/*.ts` (순수 TS 모듈) |
| MyBatis DAO + XML 매퍼 | `web/lib/db/*.ts` — Drizzle 쿼리(복잡 통계는 raw SQL) |
| DTO | TS 타입 + **Zod** 입력 검증 |
| `@LoginUser` + `SessionCheckFilter` + `RoleCheckInterceptor` | `middleware.ts` + `getAuthUser()` 헬퍼 + 라우트 역할 가드 |
| `BizException` + `GlobalExceptionHandler` | 타입 에러 + 응답 래퍼 |
| `ResponseDto{resultCode,resultMsg,data}` | **JSON 봉투·에러코드 그대로 유지**(포팅한 React가 `resultCode`를 읽음 — 파리티 앵커) |
| BCrypt | `bcryptjs` |
| `SuperAdminBootstrapRunner` | 시드 스크립트(총괄관리자 없을 때만 생성 + 본사 부서, `mustChangePassword=true`) |
| `schema.sql` + `db/migration/` | **Drizzle 마이그레이션**으로 통일 |

6개 까다로운 지점 → 처리:

1. **엑셀 행별 복원(`REQUIRES_NEW`×12)** — 행마다 개별 트랜잭션/세이브포인트 루프. 한 행 실패가 나머지를 죽이지 않게 명시적으로 구현(Node엔 선언적 트랜잭션 전파가 없다).
2. **POI 파싱** — SheetJS로 셀 타입 처리·검증 규칙을 1:1 재현(체크리스트로 고정).
3. **인증·잠금×26** — JWT + 미들웨어 게이트 + **DB 기반 5회 실패 잠금**(그대로) + bcryptjs + 비밀번호 변경 강제 플로우.
4. **중복키 23505 → 한국어 메시지** — `pg` 에러 `code==='23505'`를 잡아 컨텍스트별 한국어 문구로 변환(부서/문항번호 각각). Spring의 `DuplicateKeyException` 변환을 대체.
5. **무상태 세션** — 메모리 `HttpSession` 대신 JWT(섹션 A). 부작용: 서버 재시작에도 로그인 유지(개선, 파리티에 무해). 만료(90분) 전 서버측 강제 무효화는 불가 — 사내 도구로서 수용.
6. **임시 파일시스템** — 로컬 `/uploads` 대신 Supabase Storage + 서명 URL.

**핵심 파리티 앵커:** API JSON 봉투(`resultCode`/`resultMsg`/`data`)·에러코드·쿠키 동작을 바이트 단위로 동일하게 유지한다 — 그래야 포팅한 프론트가 그대로 붙는다.

**추가 정합 사항 (코드 대조로 확정):**

- **Drizzle 스키마 = DDL 계약.** Drizzle 스키마는 현재 `schema.sql` + `db/migration/`의 테이블·컬럼 타입·제약을 **정확히** 재현한다 — 특히 `uq_problems_department_source_number` 유니크, `attempt_choices` 테이블, FK `ON DELETE CASCADE`, 인덱스. 초기 마이그레이션을 생성한 뒤 현재 개발 DB와 diff해 어긋남이 없음을 확인한다.
- **Zod는 메커니즘, 규칙·문구는 그대로.** 입력 검증은 Zod로 하되 **검증 규칙과 한국어 메시지·에러코드는 현재 Spring과 동일**해야 한다(파리티). Zod는 표현 수단일 뿐 새 규칙을 도입하지 않는다.
- **JWT 쿠키 사양 = 현재 세션 쿠키 미러.** 만료 **90분**, `SameSite=Lax`, `secure`는 `SESSION_COOKIE_SECURE` 대응 env로 전환(현재 `application.yml`과 동일). 쿠키 이름·경로도 프론트 기대와 맞춘다.
- **CORS 제거.** 단일 Next 앱은 동일 출처라 `CorsConfig`가 불필요하다(현재 `/api/**` allowCredentials 설정은 사라짐). 이는 파리티에 무해한 단순화다.
- **bcrypt/해시.** 현재 `BCryptPasswordEncoder`(기본 강도, 표준 `$2a$`) → `bcryptjs`. 프로덕션 DB는 빈 상태에서 시작(D8)하므로 **해시 이전이 없다.** Vitest 통합 테스트가 사용자를 시드할 때는 Spring 해시를 재사용하지 말고 `bcryptjs`로 직접 해싱한다.

## 섹션 C — 테스트 · 파리티 체크리스트 전략

**산출물 ① 서브시스템별 상세 QA 체크리스트(정답지).** 각 항목 = `시나리오 / 사전조건 / 입력 / 기대결과(상태·응답봉투·에러코드·부수효과)`. 31개 엔드포인트 + 까다로운 행동(5회 잠금, 엑셀 행별 복원, 23505 한국어 문구, 빈칸 무작위 노출, 통계 집계 경계값)까지 커버한다. **현재 Spring 앱으로 실측**해 정답을 고정한다 — 기존 301개 테스트가 이미 단언한 것은 인용하고, 빈 곳은 실행 중 서버에 대한 조작/`curl`로 확인해 채운다. **체크리스트는 서브시스템별 just-in-time으로 작성한다**(해당 서브플랜 착수 직전).

**산출물 ② Vitest 스위트.** Next 포트가 정답지와 일치하는지 기계 검증한다.
- **단위**: 서비스 로직(DB 목) — 빠름.
- **통합**: DAO·라우트 ↔ 실 Postgres(로컬 Docker) — SQL 충실도(통계 집계·동적 필터·23505·엑셀 복원).
- **계약**: 라우트가 `ResponseDto` 봉투·에러코드·쿠키를 동일하게 내는지.
- **프론트**: 기존 순수 유틸 테스트는 Vitest로 흡수. 화면은 종전처럼 브라우저 QA(jsdom 부재).

**파리티 완료 정의:** 모든 체크리스트 항목이 Spring 실측값과 일치하는 green Vitest(자동화가 닿지 않는 것만 문서화된 브라우저 QA)를 가진다.

## 섹션 D — 분해 · 순서 · 컷오버

이 이관 = 이 스펙 1개 + 서브플랜 시퀀스. 각 서브플랜은 **① 그 서브시스템 QA 체크리스트 작성(현재 Spring 실측) → ② 파리티 구현 → ③ Vitest green → ④ 브라우저 QA** 순으로 진행한다.

| # | 서브플랜 | 내용 |
|---|---|---|
| 1 | **Foundation** | `web/` Next 스캐폴드, Drizzle+Supabase 풀러, 스키마→Drizzle 마이그레이션, `ResponseDto`·에러 프레임워크, JWT 미들웨어+`getAuthUser`, Vitest 하네스(Docker Postgres), 부트스트랩 시드 — *기능 없는 레일* |
| 2 | **Auth** (Plan1 파리티) | 로그인·5회 실패 잠금·bcrypt·비밀번호 변경 강제·JWT·로그아웃 |
| 3 | **부서·계정** (Plan2) | 부서/계정 CRUD, **D6/D7**(임시비번 화면+다운로드), 계정 엑셀(행별 복원) |
| 4 | **문제은행** (Plan3) | 5유형·빈칸·태그·이미지(Storage)·문제 엑셀·페이지네이션·문항번호 |
| 5 | **풀이** (Plan4) | 정답 비노출 조회·채점 5유형·시도·`attempt_choices`·이력·랜덤/필터/네비 |
| 6 | **통계·대시보드** (Plan5) | 목록·상세·대시보드 요약·집계 SQL |
| 7 | **컷오버·배포** | Vercel(Root=`web/`, icn1)·Supabase Marketplace+Storage·마이그레이션·부트스트랩, `backend/`·`frontend/` 제거 커밋, 스모크 |

Foundation(1)은 이후 모든 서브플랜의 선행 조건이다. 서브플랜 2~6은 서로 의존이 적어 순서를 조정할 수 있으나, 데이터 의존(계정→문제→풀이→통계) 때문에 위 순서를 권한다.

**진행 현황 (2026-08-19 기준):**

| 서브플랜 | 상태 | 근거 |
|---|---|---|
| 1 Foundation | ✅ 완료·master 병합 | 계획 `2026-08-15-migration-foundation.md`, web/ 31 테스트 |
| 2 Auth | ✅ 완료·master 병합 | 계획 `2026-08-16-migration-auth.md`, 정답지+E2E, 누적 73 테스트 |
| 3 부서·계정 | ✅ 완료·master 병합 | 계획 `2026-08-16-migration-dept-users.md`, 정답지 41행+E2E 23행, 누적 116 테스트 |
| **4 문제은행** | ✅ **완료·master 병합** | 계획 `2026-08-19-migration-problem-bank.md`, 정답지 138행+E2E, 누적 441 테스트. 7구간(M1~M7) 전부 완료, `ProblemController` 9개 엔드포인트 이관, 정답지 138행 중 133행 실측 대조 — `docs/qa/2026-08-19-problem-bank-e2e-verification.md` |
| **5 풀이** | ▶ **진행 중** | `SolveController` 4 + `AttemptController` 1 + `GET /api/tags/in-use` = **6개 엔드포인트**. `SolveServiceImpl` 240줄 — 서브플랜 4(5,303줄/31개)보다 훨씬 작다 |
| 6 통계 / 7 컷오버 | 미착수 | 5 이후 순차 |

> **서브플랜 5 착수 시 놓치기 쉬운 것 — `GET /api/tags/in-use`.**
> 위 배정표가 `TagController` 를 "4(관리자 태그) + 5(풀이 활성 태그)"로 나눴다. 서브플랜 4 가
> `GET /api/tags` 만 만들었으므로 **나머지 절반은 서브플랜 5 것이다.** `SolveController`·
> `AttemptController` 만 보고 계획을 세우면 다른 컨트롤러에 있는 이 엔드포인트를 놓친다.
>
> DAO 는 이미 있다 — `web/lib/db/tags.ts` 의 `findInUseTags`(활성 문제에 붙은 태그만,
> `DISTINCT` + `p.status='ACTIVE'` + 이름순)와 테스트 2건이 서브플랜 4 에서 함께 만들어졌다.
> 서브플랜 5 는 `web/app/api/tags/in-use/route.ts` 만 추가하면 된다. `TagController` 에는
> `@RequireRole` 이 없으므로 인증만 요구한다(`requireActor()` 인자 없이).
>
> 소비자는 `frontend/src/api/problems.js:16` → `SolveProblemListPage` 이고 실패를
> `.catch(() => setTags([]))` 로 삼킨다. 빠뜨리면 학습자 태그 필터가 **오류 없이 조용히 빈 채로**
> 뜬다. 컷오버(7)가 5·6 뒤라 그 전에는 실현되지 않지만, 컷오버 스모크에서야 발견하면 늦다.

**서브플랜 4로 승계된 항목(레저 파킹분):**
- `xlsx` 패키지를 SheetJS CDN tarball(0.20.x)로 교체 — npm 0.18.5에 미해결 High 권고 2건, 문제 엑셀이 두 번째 파싱 경로를 추가하기 전에 처리(+컷오버 보안노트).
- (필요 시) 서비스 시그니처 `Db`→`DbConn` 승격 — 외부 트랜잭션 합성이 필요해지는 시점에.
- 컷오버로 이월: 엑셀 업로드 로그 tx 실패 시 결과 반환 여부(D6/D7 임시비번 유실 리스크), 대량 업로드 타임아웃 정책.

**10개 컨트롤러(31 엔드포인트) → 서브플랜 배정** (누락 방지):

| 컨트롤러 | 서브플랜 |
|---|---|
| `AuthController` | 2 Auth |
| `DepartmentController` · `UserAdminController` | 3 부서·계정 |
| `ProblemController` (문항번호·이미지·문제 엑셀 포함) | 4 문제은행 |
| `TagController` (전체 태그=관리자, 활성 태그=풀이 필터) | 4(관리자 태그) + 5(풀이 활성 태그) |
| `DepartmentOptionController` (로그인 사용자용 활성 부서 — 랜덤 세트 필터) | 5 풀이 |
| `SolveController` · `AttemptController` | 5 풀이 |
| `StatsController` · `DashboardController` | 6 통계·대시보드 |

## 이관 시 반드시 보존할 현재 동작 (파리티 앵커 목록)

컷오버 전 각 서브플랜 체크리스트에서 실측·고정한다. 특히:

- **계정 잠금**: 로그인 5회 연속 실패 시 잠금(정확히 5회째).
- **비밀번호 강제 변경**: `mustChangePassword=true`면 인증 경로 외 접근 차단(현재는 HTTP 200 + `resultCode 1012`로 구조화 반환 — 이 성질 유지).
- **엑셀 행별 복원**: 653행 중 한 행 실패가 나머지를 롤백하지 않음.
- **중복 문항번호/부서코드**: 23505 → 컨텍스트별 한국어 문구(글자까지 동일).
- **빈칸 무작위 노출**: 상세 조회마다 `blank_reveal_count`개를 무작위 선택, 나머지는 정답 텍스트 노출. 제출 검증은 중복·미정의 키 차단 + 개수 일치.
- **정답 비노출**: 풀이 API는 `is_correct`·정답을 절대 내려주지 않음(제출 응답에서만 채점 결과 반환).
- **부서 스코프**: 부서 관리자는 자기 부서만, 총괄은 전체(+부서 필터).
- **응답 봉투·에러코드**: `ResponseDto{resultCode,resultMsg,data}` 및 각 `ErrorCode` 값.

> **예외 — 계정 생성/일괄 등록:** 현재 Spring은 임시비밀번호를 메일로 발송하고 메일 실패 시 생성을 롤백한다. Next 포트는 **D6/D7을 적용**하므로 이 흐름만 체크리스트의 "정답"이 현재 동작이 아니라 **D6/D7 목표 동작**(메일 없음, 임시비번을 응답/화면에 반환, 일괄은 다운로드)이다. 나머지 계정 생성 규칙(중복 사번·이메일 거부, 감사 로그에 임시비번 미기록 등)은 현재 동작 그대로 보존한다.

## 범위 밖

- 기능 추가·UI 개선·미사용 기능(이미지) 정리 — 파리티 검증 후 별도.
- 다중 인스턴스·무중단 배포·오브젝트 스토리지 고도화.
- 비밀번호 초기화 기능(현재 없음).
- 배포 세부 미결정 항목(도메인, 시크릿 주입, 스키마 적용 절차, 722문항 적재 시점 등 — 배포 스펙 §5) → 컷오버 서브플랜에서 확정.

## 미결정 / 후속

- Foundation 착수 시 확정: Node 런타임(Vercel Node vs Edge — DB 드라이버·bcrypt 때문에 **Node 런타임**이 유력), 패키지 매니저, Drizzle 마이그레이션 디렉터리 구조.
- Vercel 함수 리전 고정 방법(`vercel.json` `regions: ["icn1"]`).
- 로컬 통합 테스트용 Postgres(기존 `probank-postgres` Docker 재사용).

## 컷오버 결정 (2026-08-21)

컷오버 착수 여부를 검토하다 아래를 정했다. 컷오버 시점에 다시 논의하지 않는다.

| # | 결정 | 근거 |
|---|---|---|
| K1 | **컷오버는 서브플랜 5·6 뒤로 미룬다** | 지금 배포하면 관리자 기능만 올라간다(풀이·통계 없음). 직원 공개까지 가는 것이 목표이므로 완성된 제품을 한 번에 올린다 |
| K2 | **도메인은 `*.vercel.app` 우선** | 바로 쓸 수 있고 HTTPS 기본이라 `SESSION_COOKIE_SECURE=true` 가 그대로 성립한다. 사내 커스텀 도메인은 나중에 붙여도 쿠키 설정이 바뀌지 않는다 |
| K3 | **Vercel 프로젝트는 아직 없다** | 컷오버 때 생성한다. Supabase 프로젝트는 이미 있고 Storage 만 쓰는 중이며, DB 는 여전히 로컬 도커다 |

**배포 스펙 §5 중 이미 죽었거나 해결된 항목** — 컷오버 때 다시 열지 말 것:

- §5-2(빌드 방식: Nixpacks vs Dockerfile, Java 버전) — **소멸.** Railway·Spring 배포가 사라졌다
- §5-7(직결 vs 풀러) — **결정됨.** Q4 가 트랜잭션 풀러(6543)로 못 박았다
- §5-6(요청 본문 크기 제한) — **절반 해결.** 서브플랜 4 M7 이 Next 쪽 상한(`middlewareClientMaxBodySize`
  기본 10 MiB, 초과 시 **거부가 아니라 잘라냄**)을 실측했다. 플랫폼 자체 상한은 아직 미측정 —
  두 상한이 서로를 가릴 수 있으므로 컷오버에서 같은 세션에 함께 잰다

**컷오버 이월 목록**(서브플랜 4 에서 파킹된 것 포함)은
`docs/qa/2026-08-19-problem-bank-e2e-verification.md` 의 "컷오버 핸드오프" 절에 모아 뒀다.
