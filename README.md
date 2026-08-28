# 문제 은행 Hub (Daeryun Learning Hub)

사내 부서별 문제 등록·관리와 전 직원 문제 풀이를 지원하는 학습 플랫폼. 상세 요구사항은 [`docs/PRD.md`](docs/PRD.md), 디자인 기준은 [`docs/superpowers/specs/2026-07-29-blue-bento-design-system.md`](docs/superpowers/specs/2026-07-29-blue-bento-design-system.md), 구현 계획은 [`docs/superpowers/plans/`](docs/superpowers/plans/)를 참고한다.

## 구현 진행 상황

기존 Spring 백엔드와 Vite 프론트엔드가 단일 Next.js 애플리케이션(`web/`)으로 완전히 이관됐다. 인증, 부서/계정 관리, 문제 은행 관리, 풀이/응시, 통계를 포함한 전 직원·관리자 화면 20개가 모두 `web/` 아래에서 동작하며, Spring 백엔드는 Next.js의 API 라우트(`web/app/api/**`)로 대체됐다.

이관 과정의 상세 기록은 [`docs/superpowers/plans/`](docs/superpowers/plans/) 아래 각 계획 문서를 참고한다.

### QA 문서

- [`docs/qa/2026-08-04-plan1-2-qa-checklist.md`](docs/qa/2026-08-04-plan1-2-qa-checklist.md) — Plan 1·2 체크리스트
- [`docs/qa/2026-08-07-p1-result.md`](docs/qa/2026-08-07-p1-result.md) — 위 체크리스트 P1 실행 결과
- [`docs/qa/2026-08-07-plan3-qa-checklist.md`](docs/qa/2026-08-07-plan3-qa-checklist.md) — Plan 3 체크리스트 (**미실행**)

### 남은 과제

- ⚠️ **운영 배포 시 `SESSION_COOKIE_SECURE=true`를 반드시 설정해야 한다.** 로컬 HTTP 개발을 위해 기본값이 `false`라, 설정하지 않으면 세션 쿠키가 평문으로 전송된다.

## 로컬 개발 환경 준비

### 1. 사전 설치

- Node.js
- pnpm — `web/`의 패키지 매니저
- PostgreSQL — 아래 두 방법 중 하나

### 2. PostgreSQL 준비 — Docker (권장)

저장소 루트의 `docker-compose.yml`이 `probank`/`probank_dev` 계정과 DB를 자동으로 만든다.

```bash
docker compose up -d
```

- 호스트 포트: `5434` (로컬에 이미 설치된 Postgres의 기본 포트 5432, `trend_one` 프로젝트의 Docker Postgres가 쓰는 5433과 겹치지 않도록 선택)
- 계정: `probank` / `probank_dev`, DB명: `probank_dev`

> 기본값이 5434인 이유: 예전에는 기본값이 `localhost:5432`였는데, Docker 컨테이너가 내려간 줄 모르고 앱이 **로컬에 설치된 다른 Postgres에 조용히 붙는 사고**가 실제로 있었다(2026-08-07 QA, [`docs/qa/2026-08-07-p1-result.md`](docs/qa/2026-08-07-p1-result.md) §0.1). 저장소가 함께 제공하는 `docker-compose.yml`이 5434를 쓰므로 기본값도 그쪽에 맞춘다.

### 3. PostgreSQL 준비 — 로컬 설치 (대안)

Docker를 쓰지 않고 로컬 PostgreSQL(기본 포트 5432)을 쓰려면 아래를 직접 생성한 뒤, `DATABASE_URL` 환경변수로 포트를 명시해야 한다(기본값이 5434이므로 생략하면 붙지 않는다).

```sql
CREATE USER probank WITH PASSWORD 'probank_dev';
CREATE DATABASE probank_dev OWNER probank;
```

### 4. 환경변수

`web/.env`에 아래 환경변수를 설정한다(이 파일은 실제 비밀값을 담고 있어 `.gitignore`에 포함돼 있다):

- `DATABASE_URL` — PostgreSQL 접속 문자열
- `SESSION_JWT_SECRET` — 세션 쿠키에 담기는 JWT 서명 비밀키
- `SESSION_COOKIE_SECURE` — 세션 쿠키의 `Secure` 속성 여부. 운영 배포 시 반드시 `true`
- `SUPABASE_URL` — Supabase 프로젝트 URL
- `SUPABASE_SERVICE_ROLE_KEY` — Supabase 서비스 역할 키, 문제 이미지 비공개 버킷 접근에 쓰인다
- `BOOTSTRAP_ADMIN_EMPLOYEE_NO` — 최초 부트스트랩 시 생성되는 총괄관리자 계정의 사번
- `BOOTSTRAP_ADMIN_PASSWORD` — 위 계정의 초기 비밀번호
- `BOOTSTRAP_ADMIN_EMAIL` — 위 계정의 이메일

### 5. 의존성 설치

```bash
cd web
pnpm install
```

이후 단계의 `pnpm drizzle:migrate`·`pnpm bootstrap`·`pnpm dev` 등은 모두 이 설치를 전제로 한다.

### 6. 데이터베이스 스키마 준비 및 관리자 계정 부트스트랩

```bash
cd web
pnpm drizzle:migrate   # 스키마 마이그레이션 적용
pnpm bootstrap          # 총괄관리자(SUPER_ADMIN) 계정 생성
```

스키마를 수정한 뒤에는 `pnpm drizzle:generate`로 마이그레이션 파일을 새로 생성한다.

### 7. 앱 실행

```bash
cd web
pnpm dev
```

개발 서버는 기본 포트(3000)에서 뜬다. 세션 쿠키 인증을 쓰므로 위 환경변수와 DB가 준비돼 있어야 로그인이 동작한다.

프로덕션 모드로 확인하려면:

```bash
pnpm build
pnpm start
```

### 8. 테스트 실행

테스트는 `web/` 아래 한 러너(vitest)로 모인다.

```bash
cd web && pnpm test
```
