# 문제 은행 Hub (Daeryun Learning Hub)

사내 부서별 문제 등록·관리와 전 직원 문제 풀이를 지원하는 학습 플랫폼. 상세 요구사항은 [`docs/PRD.md`](docs/PRD.md), 디자인 기준은 [`docs/superpowers/specs/2026-07-29-blue-bento-design-system.md`](docs/superpowers/specs/2026-07-29-blue-bento-design-system.md), 구현 계획은 [`docs/superpowers/plans/`](docs/superpowers/plans/)를 참고한다.

## 구현 진행 상황

- Plan 1(프로젝트 기반 구축 및 인증)은 `worktree-plan1-foundation-auth` 브랜치에서 진행 중이다.
- 완료/재개 지점은 [`docs/superpowers/plans/2026-07-28-01-foundation-and-auth.md`](docs/superpowers/plans/2026-07-28-01-foundation-and-auth.md) 상단의 "구현 진행 상황" 섹션과 각 Step의 `- [x]`/`- [ ]` 체크박스를 확인한다.
- Plan 2~5는 아직 착수하지 않았다.

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
./gradlew bootRun --args='--spring.profiles.active=dev'
```

Docker Postgres를 쓰는 경우 `DB_URL` 환경변수를 위와 같이 함께 지정한다.

### 5. 프론트엔드 실행

Plan 1 Task 11 이후 `frontend/` 디렉터리가 생기면:

```bash
cd frontend
npm install
npm run dev
```
