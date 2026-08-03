# 문제 은행 Hub (Daeryun Learning Hub)

사내 부서별 문제 등록·관리와 전 직원 문제 풀이를 지원하는 학습 플랫폼. 상세 요구사항은 [`docs/PRD.md`](docs/PRD.md), 디자인 기준은 [`docs/superpowers/specs/2026-07-29-blue-bento-design-system.md`](docs/superpowers/specs/2026-07-29-blue-bento-design-system.md), 구현 계획은 [`docs/superpowers/plans/`](docs/superpowers/plans/)를 참고한다.

## 구현 진행 상황

- **Plan 1(프로젝트 기반 구축 및 인증)은 완료됐다** (`worktree-plan1-foundation-auth` 브랜치, 아직 `master`에 머지하지 않음). Task 1~15 전부 구현·리뷰·수정 완료.
- 백엔드 54개 테스트, 프론트엔드 27개 테스트 통과. 프로덕션 빌드 성공. 로그인 → 강제 비밀번호 변경 → 기기/역할 기반 랜딩 플로우까지 브라우저로 확인했다.
- **Plan 2를 시작하기 전에 [`docs/superpowers/plans/2026-07-28-01-foundation-and-auth.md`](docs/superpowers/plans/2026-07-28-01-foundation-and-auth.md) 상단의 네 섹션을 반드시 읽을 것** — "구현 진행 상황", "구현 중 확정된 사항", "최종 전체 리뷰에서 수정된 보안 사항", "Plan 2 시작 전 권장 정비". 세션 ID 교체, 원자적 로그인 실패 카운터, `resultCode` 1012가 HTTP 200이라는 규약, `refetchSession()` 호출 의무 등 이후 Plan이 전제해야 할 사항이 정리돼 있다.
- Plan 2~5는 아직 착수하지 않았다.

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
- 이 컨테이너를 쓰려면 백엔드 실행 시 `DB_URL=jdbc:postgresql://localhost:5434/probank_dev` 환경변수를 지정한다(기본값은 `localhost:5432`).

### 3. PostgreSQL 준비 — 로컬 설치 (대안)

Docker를 쓰지 않으려면 로컬 PostgreSQL에 아래를 직접 생성한다(포트 5432 기준, `DB_URL` 재정의 불필요).

```sql
CREATE USER probank WITH PASSWORD 'probank_dev';
CREATE DATABASE probank_dev OWNER probank;
```

### 4. 백엔드 실행

```bash
cd backend
export JAVA_HOME=/path/to/jdk8
export PATH="$JAVA_HOME/bin:$PATH"
DB_URL=jdbc:postgresql://localhost:5434/probank_dev ./gradlew bootRun --args='--spring.profiles.active=dev'
```

Docker Postgres(포트 5434)를 쓰는 경우 위처럼 `DB_URL`을 함께 지정한다. 로컬 PostgreSQL을 5432로 쓴다면 `DB_URL` 없이 실행해도 된다.

앱이 처음 기동할 때 `SUPER_ADMIN` 계정이 하나도 없으면 기본 부서(`본사`, 코드 `HQ`)와 총괄관리자 계정을 자동 생성한다. 기본값은 사번 `admin` / 비밀번호 `changeme1234`이며 **최초 로그인 시 비밀번호 변경이 강제된다**. `BOOTSTRAP_ADMIN_EMPLOYEE_NO` / `BOOTSTRAP_ADMIN_PASSWORD` / `BOOTSTRAP_ADMIN_EMAIL` 환경변수로 바꿀 수 있다.

### 5. 프론트엔드 실행

```bash
cd frontend
npm install
npm run dev
```

개발 서버는 5173에서 뜨고 `/api/**` 요청을 `localhost:8080`으로 프록시한다. 세션 쿠키 인증이므로 백엔드를 함께 띄워야 로그인이 동작한다.

### 6. 테스트 실행

```bash
# 백엔드 (54개) — 실제 PostgreSQL 통합 테스트를 포함하므로 DB가 떠 있어야 한다
cd backend && DB_URL=jdbc:postgresql://localhost:5434/probank_dev ./gradlew test

# 프론트엔드 (27개)
cd frontend && npm test
```

> 백엔드 테스트는 아직 전용 테스트 데이터소스가 없어 개발 DB를 그대로 사용한다. `@SpringBootTest` 클래스에는 반드시 `@ActiveProfiles("test")`를 붙여야 한다 — 붙이지 않으면 앱 기동 시 부트스트랩 러너가 실제 개발 DB에 관리자·부서 행을 기록한다.
