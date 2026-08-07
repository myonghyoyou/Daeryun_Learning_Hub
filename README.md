# 문제 은행 Hub (Daeryun Learning Hub)

사내 부서별 문제 등록·관리와 전 직원 문제 풀이를 지원하는 학습 플랫폼. 상세 요구사항은 [`docs/PRD.md`](docs/PRD.md), 디자인 기준은 [`docs/superpowers/specs/2026-07-29-blue-bento-design-system.md`](docs/superpowers/specs/2026-07-29-blue-bento-design-system.md), 구현 계획은 [`docs/superpowers/plans/`](docs/superpowers/plans/)를 참고한다.

## 구현 진행 상황

- **Plan 1(인증)·Plan 2(부서/계정 관리)는 완료되어 `master`에 병합됐다.**
- **Plan 3(문제 은행 관리)은 완료됐다** — `worktree-plan3-problem-bank` 브랜치, 아직 `master`에 병합하지 않음. Task 1~9 전부 구현·리뷰·수정 완료.
- 백엔드 189개, 프론트엔드 170개 테스트 통과. 프로덕션 빌드 성공.
- Plan 4(풀이)·Plan 5(통계)는 아직 착수하지 않았다.
- **Plan 4를 시작하기 전에 [`docs/superpowers/plans/2026-07-28-03-problem-bank-management.md`](docs/superpowers/plans/2026-07-28-03-problem-bank-management.md) 상단의 "구현 중 확정된 사항"과 "미해결 — 판단 필요"를 반드시 읽을 것.** 특히 관리자용 `ProblemDetailResponse`에는 정답·해설이 들어 있어 풀이 화면에 그대로 쓰면 학습자에게 정답이 전송되고, `problem_choices.is_correct`는 명시적 resultMap으로만 매핑된다(자동 매핑으로 되돌리면 경고 없이 채점이 망가진다).
- Plan 1의 전제 사항은 [`2026-07-28-01-foundation-and-auth.md`](docs/superpowers/plans/2026-07-28-01-foundation-and-auth.md) 상단에 정리돼 있다 — 세션 ID 교체, 원자적 로그인 실패 카운터, `resultCode` 1012가 HTTP 200이라는 규약, `refetchSession()` 호출 의무 등.

### QA 문서

- [`docs/qa/2026-08-04-plan1-2-qa-checklist.md`](docs/qa/2026-08-04-plan1-2-qa-checklist.md) — Plan 1·2 체크리스트
- [`docs/qa/2026-08-07-p1-result.md`](docs/qa/2026-08-07-p1-result.md) — 위 체크리스트 P1 실행 결과
- [`docs/qa/2026-08-07-plan3-qa-checklist.md`](docs/qa/2026-08-07-plan3-qa-checklist.md) — Plan 3 체크리스트 (**미실행**)

### 남은 과제

- **회사 로고 자산이 없다.** 디자인 시스템 8.1이 CSS·텍스트로 로고를 재현하는 것을 금지하므로, `frontend/src/pages/auth/LoginPage.jsx`에 자리만 비워두고 TODO를 남겼다. 실제 로고 파일이 필요하다.
- ⚠️ **운영 배포 시 `SESSION_COOKIE_SECURE=true`를 반드시 설정해야 한다.** 로컬 HTTP 개발을 위해 기본값이 `false`라, 설정하지 않으면 세션 쿠키가 평문으로 전송된다.

## 로컬 개발 환경 준비

### 1. 사전 설치

- Java 8 (JDK) — 예: [Eclipse Temurin 8](https://adoptium.net/)
- Node.js 18+
- PostgreSQL — 아래 두 방법 중 하나

### 2. PostgreSQL 준비 — Docker (권장)

저장소 루트의 `docker-compose.yml`이 `probank`/`probank_dev` 계정과 DB를 자동으로 만든다.

```bash
docker compose up -d
```

- 호스트 포트: `5434` (로컬에 이미 설치된 Postgres의 기본 포트 5432, `trend_one` 프로젝트의 Docker Postgres가 쓰는 5433과 겹치지 않도록 선택)
- 계정: `probank` / `probank_dev`, DB명: `probank_dev`
- 스키마는 별도 초기화 스크립트 없이, 백엔드 앱이 기동 시 `spring.sql.init.mode=always`로 `backend/src/main/resources/schema.sql`을 자동 적용한다.
- **백엔드의 기본 접속 대상이 이 컨테이너(`localhost:5434`)다.** `DB_URL`을 지정하지 않으면 여기에 붙는다.

> 기본값이 5434인 이유: 예전에는 기본값이 `localhost:5432`였는데, Docker 컨테이너가 내려간 줄 모르고 백엔드가 **로컬에 설치된 다른 Postgres에 조용히 붙는 사고**가 실제로 있었다(2026-08-07 QA, [`docs/qa/2026-08-07-p1-result.md`](docs/qa/2026-08-07-p1-result.md) §0.1). 저장소가 함께 제공하는 `docker-compose.yml`이 5434를 쓰므로 기본값도 그쪽에 맞춘다.

### 3. PostgreSQL 준비 — 로컬 설치 (대안)

Docker를 쓰지 않고 로컬 PostgreSQL(기본 포트 5432)을 쓰려면 아래를 직접 생성한 뒤, 실행 시 **`DB_URL`로 포트를 명시해야 한다**(기본값이 5434이므로 생략하면 붙지 않는다).

```sql
CREATE USER probank WITH PASSWORD 'probank_dev';
CREATE DATABASE probank_dev OWNER probank;
```

```bash
DB_URL=jdbc:postgresql://localhost:5432/probank_dev ./gradlew bootRun --args='--spring.profiles.active=dev'
```

### 4. 백엔드 실행

```bash
cd backend
export JAVA_HOME=/path/to/jdk8
export PATH="$JAVA_HOME/bin:$PATH"
./gradlew bootRun --args='--spring.profiles.active=dev'
```

기본 접속 대상이 Docker Postgres(`localhost:5434`)이므로 위 그대로 실행하면 된다. 다른 DB를 쓸 때만 `DB_URL`을 앞에 붙인다 — 예: 로컬 5432를 쓰려면 `DB_URL=jdbc:postgresql://localhost:5432/probank_dev ./gradlew bootRun ...`.

**실행 후 어느 DB에 붙었는지 확인할 것.** 기동 로그의 HikariCP 항목이나 `docker compose ps`로 컨테이너가 떠 있는지 먼저 보면 위 사고를 피할 수 있다.

앱이 처음 기동할 때 `SUPER_ADMIN` 계정이 하나도 없으면 기본 부서(`본사`, 코드 `HQ`)와 총괄관리자 계정을 자동 생성한다. 기본값은 사번 `admin` / 비밀번호 `changeme1234`이며 **최초 로그인 시 비밀번호 변경이 강제된다**. `BOOTSTRAP_ADMIN_EMPLOYEE_NO` / `BOOTSTRAP_ADMIN_PASSWORD` / `BOOTSTRAP_ADMIN_EMAIL` 환경변수로 바꿀 수 있다.

### 5. 프론트엔드 실행

```bash
cd frontend
npm install
npm run dev
```

개발 서버는 5173에서 뜨고 `/api/**`와 `/uploads/**` 요청을 `localhost:8080`으로 프록시한다(`/uploads`가 없으면 문제 이미지 미리보기가 404가 난다). 세션 쿠키 인증이므로 백엔드를 함께 띄워야 로그인이 동작한다.

### 6. 테스트 실행

```bash
# 백엔드 (189개) — 실제 PostgreSQL 통합 테스트를 포함하므로 DB가 떠 있어야 한다
cd backend && ./gradlew test

# 프론트엔드 (170개)
cd frontend && npm test
```

> 백엔드 테스트는 아직 전용 테스트 데이터소스가 없어 개발 DB를 그대로 사용한다. `@SpringBootTest` 클래스에는 반드시 `@ActiveProfiles("test")`를 붙여야 한다 — 붙이지 않으면 앱 기동 시 부트스트랩 러너가 실제 개발 DB에 관리자·부서 행을 기록한다.
