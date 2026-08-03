# 문제 은행 Hub — Plan 1: 프로젝트 기반 구축 및 인증 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Spring Boot 백엔드와 React 프론트엔드 프로젝트를 처음부터 구성하고, 사번/비밀번호 기반 서버 세션 인증과 기기(PC/모바일)·역할(총괄관리자/부서관리자/직원) 기반 라우팅 분기까지 동작하는 로그인 흐름을 완성한다.

**Architecture:** 백엔드는 `trend_one/backend`(Spring Boot 2.7 + MyBatis + PostgreSQL, `controller → service → dao → mapper(XML)` 계층, 공통 `ResponseDto`/`ErrorCode`/`BizException` 응답 규약)를 그대로 참고 아키텍처로 사용한다. 프론트엔드는 `trend_one/frontend`(Vite + React, `@/` 별칭, `PrivateRoute`/`PublicRoute` 레이아웃 가드, `useSessionStatus` 훅, `api/client.js` 공통 fetch 래퍼)의 구조를 그대로 따르되, 로그인 식별자를 사번으로, 인증을 서버 세션으로 구현한다.

**Tech Stack:** Spring Boot 2.7(Java 8) · MyBatis 2.2.2 · PostgreSQL · Apache POI(이후 Plan에서 사용) · spring-security-crypto(BCrypt) · spring-boot-starter-mail · Lombok / React 19 · Vite · Tailwind CSS 4(`@tailwindcss/vite`) · react-router-dom 7 · Zustand · react-toastify

## 구현 진행 상황 (2026-08-03 기준) — **Plan 1 전체 완료**

- **완료:** Task 1~15 및 Task 3-A **전부 완료**. 모든 Step 체크박스가 `- [x]`이다. 각 Task는 subagent-driven-development 방식(구현 서브에이전트 → 별도 리뷰어 검증 → 필요 시 수정 라운드 → 범위 한정 재검증)으로 진행되었고 전부 커밋 완료.
- **테스트 현황:** 백엔드 41개 테스트 통과(실제 PostgreSQL 통합 테스트 포함), 프론트엔드 17개 테스트 통과(`node --test`), 프로덕션 빌드 성공. 브라우저에서 로그인 → 강제 비밀번호 변경 → 기기/역할 기반 랜딩 전체 플로우 수동 확인 완료.
- **다음 단계:** Plan 2(부서/계정 관리)부터 진행. Plan 2~5는 이 Plan이 만든 `AuthService`, `SessionCheckFilter`, `@RequireRole`, `AuditLogService`, 프론트엔드 세션 스토어/라우터 위에 얹는다.

### 구현 중 확정된 사항 (이후 Plan이 반드시 따라야 함)

- **비밀번호 변경 강제 응답은 HTTP 200 + `resultCode` 1012다** (403이 아님). Task 4의 원안 코드와 원안 테스트가 서로 모순이어서 사람 확인 후 200으로 확정했다. 이 필터를 소비하는 모든 코드는 HTTP 상태가 아니라 응답 본문의 `resultCode`로 분기해야 한다.
- **`AuditLogService.record`는 `detailJson`에 password 계열 JSON 키가 있으면 `IllegalArgumentException`을 던진다.** 키 이름 기준 검사이므로 `{"changedField":"password"}` 같은 정당한 기록은 통과한다. Plan 2의 임시 비밀번호 발급 로직은 절대 비밀번호 값을 detail에 담지 말 것.
- **`UserDao.incrementFailedLogin(userId, failedCount)`는 절대값을 설정한다** — SQL 증가가 아니다. 호출자가 `현재값 + 1`을 계산해야 하며 동시 로그인 실패에 대해 원자적이지 않다.
- **`SuperAdminBootstrapRunner`는 `@Profile("!test")`다.** `@SpringBootTest` 클래스는 반드시 `@ActiveProfiles("test")`를 붙여야 한다 — 붙이지 않으면 앱 기동 시 실제 개발 DB에 관리자/부서 행이 기록된다(실제로 한 번 발생했다).
- **프론트엔드 세션 스토어는 스스로 갱신하지 않는다.** `login()`/`logout()`이 resolve된 뒤 반드시 `refetchSession()`(`@/store/sessionStore.js`)을 호출해야 한다. 클라이언트 라우팅은 페이지 리로드가 없으므로, 호출하지 않으면 방금 로그인한 사용자가 `/login`으로 되튕긴다.
- **미해결 — 회사 로고 자산 없음.** 디자인 시스템 8.1은 CSS/텍스트로 로고를 재현하는 것을 금지한다. `LoginPage`에 TODO만 남겨둔 상태이며, 실제 로고 파일이 제공되어야 채울 수 있다.
- **미해결 — 로그인 감사 로그 누락.** Task 3-A가 감사 로그 인프라를 만들었지만 Plan 1의 어떤 Task도 로그인 성공/실패/계정잠금을 기록하지 않는다. 필요하다면 Plan 2 이후에 별도로 추가해야 한다.
- **Plan 4 주의:** `routes.jsx`의 `/solve`는 `children` 없는 단일 leaf라서, 하위 라우트를 추가하려면 컴포넌트 교체가 아니라 해당 엔트리 구조 자체를 바꿔야 한다(`/admin`은 이미 `children` 배열이 있음).
- **작업 브랜치:** `worktree-plan1-foundation-auth` (git worktree). 이 브랜치의 커밋 로그가 실제 코드 산출물이다. `superpowers:subagent-driven-development`로 재개할 경우 `.superpowers/sdd/2026-07-28-01-foundation-and-auth/progress.md`(git-ignored 워크스페이스 ledger)를 먼저 확인할 것 — 단, 그 ledger는 커밋되지 않으므로 다른 환경에서 새로 받으면 존재하지 않는다. 이 섹션과 git 커밋 로그가 진짜 진실의 원천이다.
- **DB 준비 (다른 환경에서 이어서 할 때):** 저장소 루트의 `docker-compose.yml`로 PostgreSQL을 띄우는 것을 권장한다 — `docker compose up -d`. 컨테이너는 호스트 포트 `5434`(로컬에 이미 설치된 Postgres의 기본 5432, `trend_one`의 Docker Postgres가 쓰는 5433과 겹치지 않도록 선택)에 `probank`/`probank_dev`(비밀번호 `probank_dev`) 계정과 DB를 자동 생성한다. 백엔드 실행 시 `DB_URL=jdbc:postgresql://localhost:5434/probank_dev` 환경변수로 이 컨테이너를 가리키면 된다(스키마는 앱이 `spring.sql.init.mode=always`로 기동 시 자동 적용하므로 별도 초기화 스크립트가 필요 없다). 로컬에 이미 5432로 Postgres를 설치해 쓰는 경우 Docker 없이 `docker-compose.yml`의 기본값과 동일한 계정(`probank`/`probank_dev`, DB `probank_dev`)만 직접 만들어도 된다 — 이 경우 `DB_URL` 재정의 없이 `application.yml` 기본값(`localhost:5432`)이 그대로 맞는다.
- **환경변수 유의:** Java(Temurin 8)·Gradle 관련 `JAVA_HOME`/`PATH`는 이 세션에서 사용한 셸이 세션 중간의 영구 환경변수 변경을 자동 반영하지 않는 문제가 있었다 — 다른 환경/새 셸에서는 보통 정상 동작하지만, 안 될 경우 매 gradle 명령 앞에 `export JAVA_HOME=<jdk8-path>; export PATH="$JAVA_HOME/bin:$PATH"`를 직접 붙이면 된다.
- **보안 유의:** Task 2 진행 중 한 구현 서브에이전트가 DB 인증 실패를 진단하다가 슈퍼유저 비밀번호를 추측 시도한 사고가 있었다(상세는 위 ledger 참고, 실제 시스템 변경은 없었음). 향후 이 Plan을 재개하는 누구든 DB 접속 문제가 나면 자격증명을 추측/무작위 대입하지 말고 사람에게 확인할 것.

## Global Constraints

(PRD `docs/PRD.md` 기준, 모든 Task에 암묵적으로 적용됨)

- 로그인 식별자는 **사번**이다 (섹션 3.1, 11.1).
- 인증 방식은 **서버 세션(Session Cookie, `httpOnly`, `SameSite=Lax`)**이다. JWT는 사용하지 않는다 (섹션 3.3, 11.1).
- 세션은 무활동 90분 후 만료된다 (섹션 3.3).
- 로그인 5회 실패 시 계정을 일정 시간 잠근다 (섹션 3.3).
- 최초 로그인 시 비밀번호 변경을 강제한다 (섹션 3.1).
- 비밀번호는 해시(BCrypt)로 저장하며 평문 저장/전송을 금지한다 (섹션 3.1, 9.2).
- 총괄 관리자는 전체 부서, 부서 관리자는 자기 부서 데이터에만 접근 가능하다 — 이 Plan에서는 인터셉터 골격만 만들고, 실제 데이터 범위 제한은 Plan 2~4에서 각 API에 적용한다 (섹션 2.2).
- 기기 판별은 **뷰포트 너비 768px** 미만을 모바일로 간주한다 (섹션 3.2, 7).
- 모바일은 **역할과 무관하게** 문제 풀이 화면만 접근 가능하다. PC는 관리자(총괄/부서 관리자) → 관리자 화면 + 문제 풀이 화면, 직원 → 문제 풀이 화면만 접근 가능하다 (섹션 3.2).
- 백엔드/프론트엔드 아키텍처는 `trend_one/backend`, `trend_one/frontend` 구조를 참고한다 (섹션 7, 8.2).

## Design System Implementation Contract

모든 프론트엔드 구현은 `docs/superpowers/specs/2026-07-29-blue-bento-design-system.md`를 단일 디자인 기준으로 사용한다. 이 Plan에서는 이후 Plan이 재사용할 기반 토큰과 공통 레이아웃 계약을 만든다.

- 디자인 방향은 **Blue Bento Learning**으로 고정한다. 색상, 간격, 타이포그래피, 모서리, 그림자, 상태 색상은 디자인 시스템 토큰을 우선 사용하며 화면별 임의의 Tailwind 색상·간격 값을 반복해서 만들지 않는다.
- 기본 글꼴은 `Noto Sans KR` 계열, 아이콘은 `@phosphor-icons/react`를 사용한다. 회사 로고는 실제 제공된 자산을 사용하고 CSS 도형·텍스트 조합으로 재현하지 않는다.
- 공통 버튼, 입력, 카드, 배지, Toast, Modal, Loading, Empty, Error 상태는 이후 화면이 재사용할 수 있는 컴포넌트·토큰으로 구성한다.
- 768px 미만은 모바일 기준으로 처리한다. 모바일에서는 관리자 메뉴·화면을 노출하지 않고 `/solve`로 연결하며, PC에서는 역할에 따른 관리자/학습 Shell을 사용한다.
- `/login`, `/change-password`는 디자인 시스템 8.1의 로그인·최초 비밀번호 변경 규칙과 8.1.4의 모바일 규칙을 적용한다. 로딩, 인증 실패, 세션 만료, 비밀번호 변경 성공·실패 상태를 포함한다.
- Plan 1 완료 기준에는 1440×1024 및 390×844 기준의 레이아웃 확인, 키보드 포커스, 명도 대비, 오류·로딩 상태 확인을 포함한다. 이후 Plan의 화면은 이 공통 계약을 변경하지 않고 재사용한다.

## Approved Amendments (2026-07-29)

- `users`에 `email`(회사 이메일) 필드를 추가하고 필수값으로 검증한다. 부트스트랩 총괄관리자 이메일은 `BOOTSTRAP_ADMIN_EMAIL` 환경변수로 주입한다.
- 계정 생성 시 임시 비밀번호를 회사 이메일로 전달한다. 메일 발송을 위해 `spring-boot-starter-mail`과 SMTP 환경변수 설정을 추가한다.
- 초기 스키마에 `tags`, `problem_tags`, `audit_logs` 테이블을 포함한다. 감사 로그는 표준 출력이 아닌 DB에 저장한다.
- 프론트엔드 세션 상태는 `useSessionStatus` 인스턴스별로 중복 조회하지 않도록 전역 세션 스토어 또는 상위 라우트 상태를 공유한다. `Landing`/`AdminRoute`는 세션 확인 중 리다이렉트하지 않는다.
- 역할 거부 응답은 HTTP 403과 애플리케이션 오류 코드 990을 함께 사용한다. 인증 누락은 HTTP 401에 해당하는 세션 오류 규약을 유지한다.
- 모바일 관리자 차단은 뷰포트 기반 프론트 라우트·메뉴에서 적용하고, 관리자 API는 역할·부서 권한을 서버에서 검증한다. 서버는 HTTP 요청만으로 실제 뷰포트를 신뢰하지 않는다.

Task 1/2에 다음 설정과 스키마를 추가한다.

```gradle
implementation 'org.springframework.boot:spring-boot-starter-mail'
```

```yaml
spring:
  mail:
    host: ${MAIL_HOST:localhost}
    port: ${MAIL_PORT:25}
    username: ${MAIL_USERNAME:}
    password: ${MAIL_PASSWORD:}
    properties:
      mail.smtp.auth: ${MAIL_SMTP_AUTH:false}
      mail.smtp.starttls.enable: ${MAIL_SMTP_STARTTLS:false}

app:
  bootstrap:
    super-admin:
      email: ${BOOTSTRAP_ADMIN_EMAIL:admin@company.local}
```

`schema.sql`의 `users`에는 `email VARCHAR(255) NOT NULL`을 추가하고, 다음 테이블을 생성한다.

```sql
CREATE TABLE IF NOT EXISTS tags (
    id BIGSERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE,
    created_at TIMESTAMP NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS problem_tags (
    problem_id BIGINT NOT NULL REFERENCES problems(id) ON DELETE CASCADE,
    tag_id BIGINT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
    PRIMARY KEY (problem_id, tag_id)
);

CREATE TABLE IF NOT EXISTS audit_logs (
    id BIGSERIAL PRIMARY KEY,
    actor_id BIGINT NOT NULL REFERENCES users(id),
    action VARCHAR(50) NOT NULL,
    target_type VARCHAR(50) NOT NULL,
    target_id BIGINT,
    detail JSONB,
    created_at TIMESTAMP NOT NULL DEFAULT now()
);
```

## 사전 준비 (사람이 직접 확인)

- Java 8(1.8) 이상, Gradle(로컬 설치 또는 `gradle` 명령 사용 가능), Node.js 18+, PostgreSQL 로컬 실행 중
- PostgreSQL에 아래 DB/계정 생성:
  ```sql
  CREATE USER probank WITH PASSWORD 'probank_dev';
  CREATE DATABASE probank_dev OWNER probank;
  ```

---

## Part 1 — 백엔드 기반 구축

### Task 1: Gradle 프로젝트 골격 및 Spring Boot 엔트리포인트

**Files:**
- Create: `backend/settings.gradle`
- Create: `backend/build.gradle`
- Create: `backend/src/main/java/com/daeryun/probank/ProbankApplication.java`
- Create: `backend/src/main/resources/application.yml`
- Create: `backend/src/main/resources/application-dev.yml`
- Create: `backend/.gitignore`
- Test: `backend/src/test/java/com/daeryun/probank/ProbankApplicationTests.java`

**Interfaces:**
- Consumes: (없음 — 최초 Task)
- Produces: 실행 가능한 Spring Boot 애플리케이션 컨텍스트. 이후 모든 Task는 `com.daeryun.probank` 패키지 하위에 클래스를 추가한다.

- [x] **Step 1: 디렉터리와 Gradle 파일 작성**

`backend/settings.gradle`:
```gradle
rootProject.name = 'probank-backend'
```

`backend/build.gradle`:
```gradle
plugins {
    id 'org.springframework.boot' version '2.7.3'
    id 'io.spring.dependency-management' version '1.0.13.RELEASE'
    id 'java'
}

group = 'com.daeryun'
version = '0.0.1-SNAPSHOT'
sourceCompatibility = '1.8'

repositories {
    mavenCentral()
}

dependencies {
    implementation 'org.springframework.boot:spring-boot-starter-web'
    implementation 'org.springframework.boot:spring-boot-starter-validation'
    implementation 'org.springframework.security:spring-security-crypto'
    implementation 'org.springframework.boot:spring-boot-starter-mail'
    implementation 'org.mybatis.spring.boot:mybatis-spring-boot-starter:2.2.2'
    implementation 'org.apache.poi:poi-ooxml:5.2.3'
    implementation 'org.postgresql:postgresql'

    compileOnly 'org.projectlombok:lombok'
    annotationProcessor 'org.projectlombok:lombok'

    testImplementation 'org.springframework.boot:spring-boot-starter-test'
    testImplementation 'org.mockito:mockito-core'
}

tasks.named('test') {
    useJUnitPlatform()
}
```

`backend/src/main/java/com/daeryun/probank/ProbankApplication.java`:
```java
package com.daeryun.probank;

import org.mybatis.spring.annotation.MapperScan;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

@SpringBootApplication
@MapperScan("com.daeryun.probank.dao")
public class ProbankApplication {

    public static void main(String[] args) {
        SpringApplication.run(ProbankApplication.class, args);
    }
}
```

`backend/src/main/resources/application.yml`:
```yaml
server:
  port: ${SERVER_PORT:8080}
  servlet:
    session:
      timeout: 90m
      cookie:
        http-only: true
        same-site: lax

spring:
  application:
    name: probank-backend
  servlet:
    multipart:
      max-file-size: 20MB
      max-request-size: 20MB
  datasource:
    url: ${DB_URL:jdbc:postgresql://localhost:5432/probank_dev}
    username: ${DB_USERNAME:probank}
    password: ${DB_PASSWORD:probank_dev}
    driver-class-name: org.postgresql.Driver
  mail:
    host: ${MAIL_HOST:localhost}
    port: ${MAIL_PORT:25}
    username: ${MAIL_USERNAME:}
    password: ${MAIL_PASSWORD:}
    properties:
      mail.smtp.auth: ${MAIL_SMTP_AUTH:false}
      mail.smtp.starttls.enable: ${MAIL_SMTP_STARTTLS:false}
  sql:
    init:
      mode: always

mybatis:
  mapper-locations: classpath:/mappers/probank/**/*.xml
  type-aliases-package: com.daeryun.probank.domain
  configuration:
    map-underscore-to-camel-case: true

app:
  cors:
    allowed-origins: ${CORS_ALLOWED_ORIGINS:http://localhost:5173,http://localhost:3000}
  auth:
    max-failed-attempts: 5
    lockout-minutes: 15
  bootstrap:
    super-admin:
      employee-no: ${BOOTSTRAP_ADMIN_EMPLOYEE_NO:admin}
      password: ${BOOTSTRAP_ADMIN_PASSWORD:changeme1234}
      email: ${BOOTSTRAP_ADMIN_EMAIL:admin@company.local}
```

`backend/src/main/resources/application-dev.yml`:
```yaml
logging:
  level:
    com.daeryun.probank: DEBUG
```

`backend/.gitignore`:
```
.gradle/
build/
.idea/
*.iml
```

- [x] **Step 2: Gradle Wrapper 생성**

Run (로컬에 Gradle이 설치되어 있어야 함):
```bash
cd backend && gradle wrapper --gradle-version 7.5
```
Expected: `backend/gradlew`, `backend/gradlew.bat`, `backend/gradle/wrapper/` 생성됨

- [x] **Step 3: 컨텍스트 로드 스모크 테스트 작성**

`backend/src/test/java/com/daeryun/probank/ProbankApplicationTests.java`:
```java
package com.daeryun.probank;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;

@SpringBootTest
class ProbankApplicationTests {

    @Test
    void contextLoads() {
    }
}
```

- [x] **Step 4: 테스트 실행 (사전 준비의 DB가 떠 있어야 함)**

Run: `cd backend && ./gradlew test --tests ProbankApplicationTests`
Expected: `BUILD SUCCESSFUL`, 1 test 통과 (DB 연결 실패 시 사전 준비 섹션의 DB 생성 여부 확인)

- [x] **Step 5: Commit**

```bash
git add backend
git commit -m "chore: bootstrap Spring Boot backend project"
```

---

### Task 2: DB 스키마 생성

**Files:**
- Create: `backend/src/main/resources/schema.sql`

**Interfaces:**
- Consumes: Task 1의 `spring.sql.init.mode=always` 설정 (앱 기동 시 자동 실행됨)
- Produces: `departments`, `users`, `problems`, `problem_choices`, `problem_answers`, `problem_blanks`, `attempts`, `attempt_blank_answers`, `excel_upload_logs`, `tags`, `problem_tags`, `audit_logs` 12개 테이블. 이후 모든 Dao/Mapper Task가 이 스키마를 전제로 한다.

- [x] **Step 1: 전체 테이블 DDL 작성**

`backend/src/main/resources/schema.sql`:
```sql
CREATE TABLE IF NOT EXISTS departments (
    id BIGSERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    code VARCHAR(50) NOT NULL UNIQUE,
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE')),
    created_at TIMESTAMP NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS users (
    id BIGSERIAL PRIMARY KEY,
    employee_no VARCHAR(50) NOT NULL UNIQUE,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    department_id BIGINT NOT NULL REFERENCES departments(id),
    role VARCHAR(20) NOT NULL CHECK (role IN ('SUPER_ADMIN', 'DEPT_ADMIN', 'EMPLOYEE')),
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE')),
    must_change_password BOOLEAN NOT NULL DEFAULT TRUE,
    failed_login_count INT NOT NULL DEFAULT 0,
    locked_until TIMESTAMP,
    last_login_at TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS problems (
    id BIGSERIAL PRIMARY KEY,
    type VARCHAR(20) NOT NULL CHECK (type IN ('MCQ_SINGLE', 'MCQ_MULTI', 'OX', 'SHORT_ANSWER', 'FILL_BLANK')),
    content TEXT NOT NULL,
    image_url VARCHAR(500),
    reference_text TEXT,
    explanation TEXT,
    blank_reveal_count INT,
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'ARCHIVED')),
    department_id BIGINT NOT NULL REFERENCES departments(id),
    created_by BIGINT NOT NULL REFERENCES users(id),
    created_at TIMESTAMP NOT NULL DEFAULT now(),
    updated_at TIMESTAMP NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS problem_choices (
    id BIGSERIAL PRIMARY KEY,
    problem_id BIGINT NOT NULL REFERENCES problems(id) ON DELETE CASCADE,
    choice_text VARCHAR(500) NOT NULL,
    is_correct BOOLEAN NOT NULL DEFAULT FALSE,
    display_order INT NOT NULL
);

CREATE TABLE IF NOT EXISTS problem_answers (
    id BIGSERIAL PRIMARY KEY,
    problem_id BIGINT NOT NULL REFERENCES problems(id) ON DELETE CASCADE,
    answer_text VARCHAR(500) NOT NULL
);

CREATE TABLE IF NOT EXISTS problem_blanks (
    id BIGSERIAL PRIMARY KEY,
    problem_id BIGINT NOT NULL REFERENCES problems(id) ON DELETE CASCADE,
    blank_key VARCHAR(50) NOT NULL,
    answer_text VARCHAR(500) NOT NULL,
    display_order INT NOT NULL
);

CREATE TABLE IF NOT EXISTS attempts (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id),
    problem_id BIGINT NOT NULL REFERENCES problems(id),
    submitted_answer VARCHAR(500),
    is_correct BOOLEAN NOT NULL,
    submitted_at TIMESTAMP NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS attempt_blank_answers (
    id BIGSERIAL PRIMARY KEY,
    attempt_id BIGINT NOT NULL REFERENCES attempts(id) ON DELETE CASCADE,
    blank_key VARCHAR(50) NOT NULL,
    submitted_answer VARCHAR(500),
    is_correct BOOLEAN NOT NULL
);

CREATE TABLE IF NOT EXISTS excel_upload_logs (
    id BIGSERIAL PRIMARY KEY,
    uploaded_by BIGINT NOT NULL REFERENCES users(id),
    department_id BIGINT REFERENCES departments(id), -- nullable: 계정 엑셀 업로드(Plan 2)는 총괄관리자가 여러 부서를 한 파일에 섞어 등록할 수 있어 단일 부서로 강제하지 않는다
    file_name VARCHAR(255) NOT NULL,
    total_rows INT NOT NULL,
    success_rows INT NOT NULL,
    fail_rows INT NOT NULL,
    error_detail TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tags (
    id BIGSERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE,
    created_at TIMESTAMP NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS problem_tags (
    problem_id BIGINT NOT NULL REFERENCES problems(id) ON DELETE CASCADE,
    tag_id BIGINT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
    PRIMARY KEY (problem_id, tag_id)
);

CREATE TABLE IF NOT EXISTS audit_logs (
    id BIGSERIAL PRIMARY KEY,
    actor_id BIGINT NOT NULL REFERENCES users(id),
    action VARCHAR(50) NOT NULL,
    target_type VARCHAR(50) NOT NULL,
    target_id BIGINT,
    detail JSONB,
    created_at TIMESTAMP NOT NULL DEFAULT now()
);
```

- [x] **Step 2: 앱 기동으로 스키마 반영 확인**

Run: `cd backend && ./gradlew bootRun --args='--spring.profiles.active=dev'` 실행 후 Ctrl+C로 종료, 이어서:
```bash
psql -U probank -d probank_dev -c "\dt"
```
Expected: 12개 테이블 목록 출력

- [x] **Step 3: Commit**

```bash
git add backend/src/main/resources/schema.sql
git commit -m "feat: add initial database schema"
```

---

### Task 3: 공통 응답/에러 처리 인프라 + CORS

**Files:**
- Create: `backend/src/main/java/com/daeryun/probank/common/ResponseDto.java`
- Create: `backend/src/main/java/com/daeryun/probank/common/ErrorCode.java`
- Create: `backend/src/main/java/com/daeryun/probank/common/ErrorResponse.java`
- Create: `backend/src/main/java/com/daeryun/probank/exception/BizException.java`
- Create: `backend/src/main/java/com/daeryun/probank/exception/GlobalExceptionHandler.java`
- Create: `backend/src/main/java/com/daeryun/probank/config/CorsConfig.java`
- Test: `backend/src/test/java/com/daeryun/probank/exception/GlobalExceptionHandlerTest.java`

**Interfaces:**
- Consumes: (없음)
- Produces: `ResponseDto.ok()` / `ResponseDto.ok(data)` / `ResponseDto.ok(code, message)`, `ErrorCode` enum(`getCode()`, `getMessage()`), `BizException(ErrorCode)` / `BizException(ErrorCode, String)`. 이후 모든 컨트롤러/서비스 Task가 이 클래스들을 사용한다.

- [x] **Step 1: ResponseDto 작성**

`backend/src/main/java/com/daeryun/probank/common/ResponseDto.java`:
```java
package com.daeryun.probank.common;

import com.fasterxml.jackson.annotation.JsonInclude;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@AllArgsConstructor
@NoArgsConstructor
@JsonInclude(JsonInclude.Include.NON_NULL)
public class ResponseDto<T> {

    private int resultCode;
    private String resultMsg;
    private T data;

    public static ResponseDto<?> ok() {
        return ResponseDto.builder().resultCode(200).resultMsg("정상 처리되었습니다.").build();
    }

    public static <T> ResponseDto<T> ok(T data) {
        return ResponseDto.<T>builder().resultCode(200).resultMsg("정상 처리되었습니다.").data(data).build();
    }

    public static ResponseDto<?> ok(int code, String message) {
        return ResponseDto.builder().resultCode(code).resultMsg(message).build();
    }
}
```

- [x] **Step 2: ErrorCode 작성**

`backend/src/main/java/com/daeryun/probank/common/ErrorCode.java`:
```java
package com.daeryun.probank.common;

import lombok.Getter;

@Getter
public enum ErrorCode {

    MSG_PROC_FAIL("처리 중 오류가 발생하였습니다.", -1),
    INPUT_VALUE_INVALID("잘못된 파라미터를 입력했습니다.", 1000),
    FILE_REQUIRED("필수 파일이 누락되었습니다.", 1009),
    ACCOUNT_LOCKED("계정이 잠겼습니다. 잠시 후 다시 시도하세요.", 1010),
    LOGIN_FAILED("사번 또는 비밀번호가 올바르지 않습니다.", 1011),
    PASSWORD_CHANGE_REQUIRED("비밀번호 변경이 필요합니다.", 1012),
    EMPTY_SESSION("세션 정보가 없습니다.", 980),
    ACCESS_AUTH_DENIED("접근 권한이 없습니다.", 990);

    private final String message;
    private final int code;

    ErrorCode(String message, int code) {
        this.message = message;
        this.code = code;
    }
}
```

- [x] **Step 3: ErrorResponse, BizException, GlobalExceptionHandler 작성**

`backend/src/main/java/com/daeryun/probank/common/ErrorResponse.java`:
```java
package com.daeryun.probank.common;

import com.fasterxml.jackson.annotation.JsonInclude;
import lombok.Builder;
import lombok.Getter;

import java.util.ArrayList;
import java.util.List;

@Getter
@JsonInclude(JsonInclude.Include.NON_NULL)
public class ErrorResponse {

    private final int resultCode;
    private final String resultMsg;
    private final List<FieldError> errorList;

    @Builder
    public ErrorResponse(String message, int code, List<FieldError> data) {
        this.resultCode = code;
        this.resultMsg = message;
        this.errorList = data == null ? null : new ArrayList<>(data);
    }

    @Getter
    @Builder
    public static class FieldError {
        private final String field;
        private final String value;
        private final String reason;
    }
}
```

`backend/src/main/java/com/daeryun/probank/exception/BizException.java`:
```java
package com.daeryun.probank.exception;

import com.daeryun.probank.common.ErrorCode;
import lombok.Getter;

@Getter
public class BizException extends RuntimeException {

    private final ErrorCode errorCode;

    public BizException(ErrorCode errorCode) {
        super(errorCode.getMessage());
        this.errorCode = errorCode;
    }

    public BizException(ErrorCode errorCode, String message) {
        super(message);
        this.errorCode = errorCode;
    }
}
```

`backend/src/main/java/com/daeryun/probank/exception/GlobalExceptionHandler.java`:
```java
package com.daeryun.probank.exception;

import com.daeryun.probank.common.ErrorCode;
import com.daeryun.probank.common.ErrorResponse;
import com.daeryun.probank.common.ResponseDto;
import org.springframework.http.ResponseEntity;
import org.springframework.http.HttpStatus;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.validation.BindException;
import org.springframework.validation.BindingResult;
import org.springframework.validation.FieldError;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ControllerAdvice;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.ResponseBody;
import org.springframework.web.multipart.MultipartException;

import java.util.List;
import java.util.Optional;
import java.util.stream.Collectors;

@ControllerAdvice
@ResponseBody
public class GlobalExceptionHandler {

    @ExceptionHandler(BizException.class)
    public ResponseEntity<ResponseDto<?>> handleBizException(BizException exception) {
        ErrorCode errorCode = exception.getErrorCode();
        HttpStatus status = errorCode == ErrorCode.EMPTY_SESSION ? HttpStatus.UNAUTHORIZED
                : errorCode == ErrorCode.ACCESS_AUTH_DENIED ? HttpStatus.FORBIDDEN
                : HttpStatus.BAD_REQUEST;
        return ResponseEntity.status(status).body(ResponseDto.ok(errorCode.getCode(), exception.getMessage()));
    }

    @ExceptionHandler({MethodArgumentNotValidException.class, BindException.class})
    public ErrorResponse handleValidationException(Exception exception) {
        BindingResult bindingResult = exception instanceof MethodArgumentNotValidException
                ? ((MethodArgumentNotValidException) exception).getBindingResult()
                : ((BindException) exception).getBindingResult();
        return buildFieldErrors(ErrorCode.INPUT_VALUE_INVALID, bindingResult);
    }

    @ExceptionHandler(HttpMessageNotReadableException.class)
    public ErrorResponse handleMessageNotReadableException() {
        return buildFieldErrors(ErrorCode.INPUT_VALUE_INVALID, null);
    }

    @ExceptionHandler(MultipartException.class)
    public ResponseEntity<ResponseDto<?>> handleMultipartException() {
        return ResponseEntity.ok(ResponseDto.ok(ErrorCode.FILE_REQUIRED.getCode(), "파일을 업로드할 수 없습니다."));
    }

    @ExceptionHandler(Exception.class)
    public ErrorResponse handleUnexpectedException() {
        return buildFieldErrors(ErrorCode.MSG_PROC_FAIL, null);
    }

    private ErrorResponse buildFieldErrors(ErrorCode errorCode, BindingResult bindingResult) {
        List<ErrorResponse.FieldError> errors = bindingResult == null
                ? null
                : bindingResult.getFieldErrors().stream().map(this::toFieldError).collect(Collectors.toList());
        return ErrorResponse.builder().code(errorCode.getCode()).message(errorCode.getMessage()).data(errors).build();
    }

    private ErrorResponse.FieldError toFieldError(FieldError error) {
        return ErrorResponse.FieldError.builder()
                .field(error.getField())
                .value(Optional.ofNullable(error.getRejectedValue()).map(Object::toString).orElse(null))
                .reason(error.getDefaultMessage())
                .build();
    }
}
```

`backend/src/main/java/com/daeryun/probank/config/CorsConfig.java`:
```java
package com.daeryun.probank.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.CorsRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

import java.util.Arrays;
import java.util.stream.Collectors;

@Configuration
public class CorsConfig implements WebMvcConfigurer {

    private final String[] allowedOrigins;

    public CorsConfig(@Value("${app.cors.allowed-origins}") String allowedOrigins) {
        this.allowedOrigins = Arrays.stream(allowedOrigins.split(","))
                .map(String::trim)
                .filter(origin -> !origin.isEmpty())
                .collect(Collectors.toList())
                .toArray(new String[0]);
    }

    @Override
    public void addCorsMappings(CorsRegistry registry) {
        registry.addMapping("/api/**")
                .allowedOrigins(allowedOrigins)
                .allowedMethods("GET", "POST", "PUT", "DELETE", "OPTIONS")
                .allowedHeaders("*")
                .allowCredentials(true)
                .maxAge(3600);
    }
}
```

- [x] **Step 4: BizException → ResponseDto 변환 단위 테스트 작성**

`backend/src/test/java/com/daeryun/probank/exception/GlobalExceptionHandlerTest.java`:
```java
package com.daeryun.probank.exception;

import com.daeryun.probank.common.ErrorCode;
import com.daeryun.probank.common.ResponseDto;
import org.junit.jupiter.api.Test;
import org.springframework.http.ResponseEntity;

import static org.junit.jupiter.api.Assertions.assertEquals;

class GlobalExceptionHandlerTest {

    @Test
    void handleBizException_returnsErrorCodeAndMessage() {
        GlobalExceptionHandler handler = new GlobalExceptionHandler();
        BizException exception = new BizException(ErrorCode.ACCESS_AUTH_DENIED);

        ResponseEntity<ResponseDto<?>> response = handler.handleBizException(exception);

        assertEquals(403, response.getStatusCodeValue());
        assertEquals(ErrorCode.ACCESS_AUTH_DENIED.getCode(), response.getBody().getResultCode());
        assertEquals(ErrorCode.ACCESS_AUTH_DENIED.getMessage(), response.getBody().getResultMsg());
    }
}
```

- [x] **Step 5: 테스트 실행**

Run: `cd backend && ./gradlew test --tests GlobalExceptionHandlerTest`
Expected: `BUILD SUCCESSFUL`, 1 test 통과

- [x] **Step 6: Commit**

```bash
git add backend/src/main/java/com/daeryun/probank/common backend/src/main/java/com/daeryun/probank/exception backend/src/main/java/com/daeryun/probank/config backend/src/test
git commit -m "feat: add common response/error handling and CORS config"
```

---

### Task 3-A: DB 감사 로그 저장 인프라

**Files:**
- Create: `backend/src/main/java/com/daeryun/probank/domain/AuditLog.java`
- Create: `backend/src/main/java/com/daeryun/probank/dao/AuditLogDao.java`
- Create: `backend/src/main/resources/mappers/probank/AuditLogMapper.xml`
- Create: `backend/src/main/java/com/daeryun/probank/service/AuditLogService.java`
- Create: `backend/src/main/java/com/daeryun/probank/service/AuditLogServiceImpl.java`
- Test: `backend/src/test/java/com/daeryun/probank/service/AuditLogServiceImplTest.java`

**Interfaces:**
- Consumes: Task 2의 `audit_logs` 테이블, Task 4 이후의 `AuthUser`
- Produces: `AuditLogService.record(Long actorId, String action, String targetType, Long targetId, String detailJson)`. Plan 2~5의 관리자 변경 작업이 이 서비스를 호출한다.

- [x] **Step 1: 감사 로그 도메인·DAO·Mapper 작성**

`AuditLog`은 `id`, `actorId`, `action`, `targetType`, `targetId`, `detail`, `createdAt`을 갖는다. `AuditLogDao.insert(AuditLog)`는 `audit_logs`에 JSONB detail을 저장한다.

- [x] **Step 2: 서비스 단위 테스트 작성**

서비스 호출 시 전달된 actor/action/target/detail을 `AuditLogDao.insert`에 그대로 전달하는 테스트를 작성한다. 비밀번호·임시 비밀번호는 detail에 포함하지 않는다는 검증 규칙을 테스트 데이터로 명시한다.

- [x] **Step 3: 구현 및 테스트 실행**

Run: `cd backend && ./gradlew test --tests AuditLogServiceImplTest`
Expected: `BUILD SUCCESSFUL`

- [x] **Step 4: Commit**

```bash
git add backend/src/main/java/com/daeryun/probank/domain/AuditLog.java backend/src/main/java/com/daeryun/probank/dao/AuditLogDao.java backend/src/main/resources/mappers/probank/AuditLogMapper.xml backend/src/main/java/com/daeryun/probank/service/AuditLogService.java backend/src/main/java/com/daeryun/probank/service/AuditLogServiceImpl.java backend/src/test/java/com/daeryun/probank/service/AuditLogServiceImplTest.java
git commit -m "feat: add database audit log persistence"
```

---

### Task 4: 세션 principal 및 SessionCheckFilter

**Files:**
- Create: `backend/src/main/java/com/daeryun/probank/domain/UserRole.java`
- Create: `backend/src/main/java/com/daeryun/probank/common/SessionKeys.java`
- Create: `backend/src/main/java/com/daeryun/probank/common/AuthUser.java`
- Create: `backend/src/main/java/com/daeryun/probank/filter/SessionCheckFilter.java`
- Test: `backend/src/test/java/com/daeryun/probank/filter/SessionCheckFilterTest.java`

**Interfaces:**
- Consumes: `ResponseDto`, `ErrorCode`(Task 3)
- Produces: `AuthUser`(userId, employeeNo, name, role, departmentId, mustChangePassword — 모두 getter 보유), `SessionKeys.LOGIN_USER`(String 상수). 이후 인증 관련 모든 Task가 세션에 `AuthUser`를 이 키로 저장/조회한다.

- [x] **Step 1: UserRole, SessionKeys, AuthUser 작성**

`backend/src/main/java/com/daeryun/probank/domain/UserRole.java`:
```java
package com.daeryun.probank.domain;

public enum UserRole {
    SUPER_ADMIN,
    DEPT_ADMIN,
    EMPLOYEE
}
```

`backend/src/main/java/com/daeryun/probank/common/SessionKeys.java`:
```java
package com.daeryun.probank.common;

public final class SessionKeys {

    public static final String LOGIN_USER = "loginUser";

    private SessionKeys() {
    }
}
```

`backend/src/main/java/com/daeryun/probank/common/AuthUser.java`:
```java
package com.daeryun.probank.common;

import com.daeryun.probank.domain.UserRole;
import lombok.AllArgsConstructor;
import lombok.Getter;

import java.io.Serializable;

@Getter
@AllArgsConstructor
public class AuthUser implements Serializable {

    private static final long serialVersionUID = 1L;

    private Long userId;
    private String employeeNo;
    private String name;
    private UserRole role;
    private Long departmentId;
    private boolean mustChangePassword;
}
```

- [x] **Step 2: SessionCheckFilter 작성**

인증이 필요 없는 경로(`/api/auth/login`, `/api/auth/session`, OPTIONS 요청)를 제외한 모든 `/api/**` 요청에 세션을 요구한다. 세션은 있으나 `mustChangePassword`가 true이고 `/api/auth/*`가 아닌 경로를 요청하면 비밀번호 변경을 강제한다.

**구현 시 발견된 정정 사항:** 아래 코드 블록은 최초 작성 당시 `PASSWORD_CHANGE_REQUIRED`에 HTTP 403을 반환하도록 되어 있었으나, 바로 아래 Step 3의 테스트 코드는 처음부터 HTTP 200(본문 `resultCode:1012`)을 기대하고 있어 서로 모순이었다. 구현 시 이 모순이 발견되어 사람에게 확인했고, **테스트가 기대하는 HTTP 200이 최종 사양으로 확정**되었다 — `writeError`는 `EMPTY_SESSION`에만 401을 명시적으로 설정하고, `PASSWORD_CHANGE_REQUIRED`는 기본 상태코드 200으로 응답 본문의 `resultCode`로만 구분한다(주석으로 문서화됨). 아래 코드 블록은 이 최종 동작을 반영해 갱신했다. 이후 이 필터를 소비하는 모든 Task(프론트엔드 `useSessionStatus`, 로그인/비밀번호 변경 플로우 등)는 `mustChangePassword` 강제 응답을 **HTTP 200 + resultCode 1012**로 가정해야 한다(401/403이 아님).

`backend/src/main/java/com/daeryun/probank/filter/SessionCheckFilter.java`:
```java
package com.daeryun.probank.filter;

import com.daeryun.probank.common.AuthUser;
import com.daeryun.probank.common.ErrorCode;
import com.daeryun.probank.common.ResponseDto;
import com.daeryun.probank.common.SessionKeys;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import javax.servlet.FilterChain;
import javax.servlet.ServletException;
import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpServletResponse;
import javax.servlet.http.HttpSession;
import java.io.IOException;

@Component
public class SessionCheckFilter extends OncePerRequestFilter {

    private final ObjectMapper objectMapper;

    public SessionCheckFilter(ObjectMapper objectMapper) {
        this.objectMapper = objectMapper;
    }

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        if ("OPTIONS".equalsIgnoreCase(request.getMethod())) {
            return true;
        }
        String uri = request.getRequestURI();
        if (!uri.startsWith("/api/")) {
            return true;
        }
        return "/api/auth/login".equals(uri) || "/api/auth/session".equals(uri);
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain filterChain)
            throws ServletException, IOException {
        HttpSession session = request.getSession(false);
        AuthUser authUser = session == null ? null : (AuthUser) session.getAttribute(SessionKeys.LOGIN_USER);

        if (authUser == null) {
            writeError(response, ErrorCode.EMPTY_SESSION);
            return;
        }

        boolean isAuthPath = request.getRequestURI().startsWith("/api/auth/");
        if (authUser.isMustChangePassword() && !isAuthPath) {
            writeError(response, ErrorCode.PASSWORD_CHANGE_REQUIRED);
            return;
        }

        filterChain.doFilter(request, response);
    }

    private void writeError(HttpServletResponse response, ErrorCode errorCode) throws IOException {
        if (errorCode == ErrorCode.EMPTY_SESSION) {
            response.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
        }
        // PASSWORD_CHANGE_REQUIRED intentionally returns HTTP 200 so clients can read the structured error
        // via ResponseDto.resultCode (1012). This differs from GlobalExceptionHandler, which maps the same
        // ErrorCode to 400 when raised as BizException elsewhere in the application.
        response.setContentType("application/json;charset=UTF-8");
        objectMapper.writeValue(response.getWriter(), ResponseDto.ok(errorCode.getCode(), errorCode.getMessage()));
    }
}
```

- [x] **Step 3: 필터 동작 단위 테스트 작성**

`backend/src/test/java/com/daeryun/probank/filter/SessionCheckFilterTest.java`:
```java
package com.daeryun.probank.filter;

import com.daeryun.probank.common.AuthUser;
import com.daeryun.probank.common.SessionKeys;
import com.daeryun.probank.domain.UserRole;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.mock.web.MockFilterChain;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class SessionCheckFilterTest {

    private final SessionCheckFilter filter = new SessionCheckFilter(new ObjectMapper());

    @Test
    void rejectsRequestWithoutSession() throws Exception {
        MockHttpServletRequest request = new MockHttpServletRequest("GET", "/api/departments");
        MockHttpServletResponse response = new MockHttpServletResponse();

        filter.doFilter(request, response, new MockFilterChain());

        assertEquals(401, response.getStatus());
        assertTrue(response.getContentAsString().contains("\"resultCode\":980"));
    }

    @Test
    void allowsLoginPathWithoutSession() throws Exception {
        MockHttpServletRequest request = new MockHttpServletRequest("POST", "/api/auth/login");
        MockHttpServletResponse response = new MockHttpServletResponse();
        MockFilterChain chain = new MockFilterChain();

        filter.doFilter(request, response, chain);

        assertTrue(chain.getRequest() != null);
    }

    @Test
    void requiresPasswordChangeBeforeOtherApis() throws Exception {
        MockHttpServletRequest request = new MockHttpServletRequest("GET", "/api/departments");
        AuthUser authUser = new AuthUser(1L, "1001", "홍길동", UserRole.EMPLOYEE, 1L, true);
        request.getSession(true).setAttribute(SessionKeys.LOGIN_USER, authUser);
        MockHttpServletResponse response = new MockHttpServletResponse();

        filter.doFilter(request, response, new MockFilterChain());

        assertEquals(200, response.getStatus());
        assertTrue(response.getContentAsString().contains("\"resultCode\":1012"));
    }

    @Test
    void allowsRequestWithValidSession() throws Exception {
        MockHttpServletRequest request = new MockHttpServletRequest("GET", "/api/departments");
        AuthUser authUser = new AuthUser(1L, "1001", "홍길동", UserRole.EMPLOYEE, 1L, false);
        request.getSession(true).setAttribute(SessionKeys.LOGIN_USER, authUser);
        MockHttpServletResponse response = new MockHttpServletResponse();
        MockFilterChain chain = new MockFilterChain();

        filter.doFilter(request, response, chain);

        assertTrue(chain.getRequest() != null);
    }
}
```

- [x] **Step 4: 테스트 실행**

Run: `cd backend && ./gradlew test --tests SessionCheckFilterTest`
Expected: `BUILD SUCCESSFUL`, 4 tests 통과

- [x] **Step 5: Commit**

```bash
git add backend/src/main/java/com/daeryun/probank/domain backend/src/main/java/com/daeryun/probank/common backend/src/main/java/com/daeryun/probank/filter backend/src/test/java/com/daeryun/probank/filter
git commit -m "feat: add session principal and session check filter"
```

---

## Part 2 — 인증 API

### Task 5: Department/User 도메인 및 Dao·Mapper

**Files:**
- Create: `backend/src/main/java/com/daeryun/probank/domain/Status.java`
- Create: `backend/src/main/java/com/daeryun/probank/domain/Department.java`
- Create: `backend/src/main/java/com/daeryun/probank/domain/User.java`
- Create: `backend/src/main/java/com/daeryun/probank/dao/DepartmentDao.java`
- Create: `backend/src/main/java/com/daeryun/probank/dao/UserDao.java`
- Create: `backend/src/main/resources/mappers/probank/DepartmentMapper.xml`
- Create: `backend/src/main/resources/mappers/probank/UserMapper.xml`
- Create: `backend/src/main/java/com/daeryun/probank/config/SecurityBeansConfig.java`
- Test: `backend/src/test/java/com/daeryun/probank/dao/UserDaoTest.java`

**Interfaces:**
- Consumes: Task 2의 스키마
- Produces: `UserDao.findByEmployeeNo(String)`, `UserDao.insert(User)`, `UserDao.incrementFailedLogin(Long, int)`, `UserDao.lockAccount(Long, LocalDateTime)`, `UserDao.resetFailedLogin(Long)`, `UserDao.updateLastLoginAt(Long, LocalDateTime)`, `UserDao.updatePassword(Long, String)`, `UserDao.existsSuperAdmin()`; `DepartmentDao.findByCode(String)`, `DepartmentDao.insert(Department)`. `PasswordEncoder` 빈(BCrypt). 이후 인증/계정 관련 모든 Task가 이 Dao를 사용한다.

- [x] **Step 1: 도메인 POJO 작성**

`backend/src/main/java/com/daeryun/probank/domain/Status.java`:
```java
package com.daeryun.probank.domain;

public enum Status {
    ACTIVE,
    INACTIVE
}
```

`backend/src/main/java/com/daeryun/probank/domain/Department.java`:
```java
package com.daeryun.probank.domain;

import lombok.Data;

import java.time.LocalDateTime;

@Data
public class Department {
    private Long id;
    private String name;
    private String code;
    private Status status;
    private LocalDateTime createdAt;
}
```

`backend/src/main/java/com/daeryun/probank/domain/User.java`:
```java
package com.daeryun.probank.domain;

import lombok.Data;

import java.time.LocalDateTime;

@Data
public class User {
    private Long id;
    private String employeeNo;
    private String name;
    private String email;
    private String passwordHash;
    private Long departmentId;
    private UserRole role;
    private Status status;
    private boolean mustChangePassword;
    private int failedLoginCount;
    private LocalDateTime lockedUntil;
    private LocalDateTime lastLoginAt;
    private LocalDateTime createdAt;
}
```

- [x] **Step 2: Dao 인터페이스 작성**

`backend/src/main/java/com/daeryun/probank/dao/DepartmentDao.java`:
```java
package com.daeryun.probank.dao;

import com.daeryun.probank.domain.Department;

public interface DepartmentDao {
    Department findByCode(String code);
    void insert(Department department);
}
```

`backend/src/main/java/com/daeryun/probank/dao/UserDao.java`:
```java
package com.daeryun.probank.dao;

import com.daeryun.probank.domain.User;
import org.apache.ibatis.annotations.Param;

import java.time.LocalDateTime;

public interface UserDao {
    User findByEmployeeNo(@Param("employeeNo") String employeeNo);
    boolean existsByEmail(@Param("email") String email);
    boolean existsSuperAdmin();
    void insert(User user);
    void incrementFailedLogin(@Param("userId") Long userId, @Param("failedCount") int failedCount);
    void lockAccount(@Param("userId") Long userId, @Param("lockedUntil") LocalDateTime lockedUntil);
    void resetFailedLogin(@Param("userId") Long userId);
    void updateLastLoginAt(@Param("userId") Long userId, @Param("lastLoginAt") LocalDateTime lastLoginAt);
    void updatePassword(@Param("userId") Long userId, @Param("passwordHash") String passwordHash);
}
```

- [x] **Step 3: Mapper XML 작성**

`backend/src/main/resources/mappers/probank/DepartmentMapper.xml`:
```xml
<?xml version="1.0" encoding="UTF-8" ?>
<!DOCTYPE mapper PUBLIC "-//mybatis.org//DTD Mapper 3.0//EN" "http://mybatis.org/dtd/mybatis-3-mapper.dtd">
<mapper namespace="com.daeryun.probank.dao.DepartmentDao">

    <select id="findByCode" resultType="Department">
        SELECT id, name, code, status, created_at
        FROM departments
        WHERE code = #{code}
    </select>

    <insert id="insert" parameterType="Department" useGeneratedKeys="true" keyProperty="id">
        INSERT INTO departments (name, code, status)
        VALUES (#{name}, #{code}, #{status})
    </insert>

</mapper>
```

`backend/src/main/resources/mappers/probank/UserMapper.xml`:
```xml
<?xml version="1.0" encoding="UTF-8" ?>
<!DOCTYPE mapper PUBLIC "-//mybatis.org//DTD Mapper 3.0//EN" "http://mybatis.org/dtd/mybatis-3-mapper.dtd">
<mapper namespace="com.daeryun.probank.dao.UserDao">

    <select id="findByEmployeeNo" resultType="User">
        SELECT id, employee_no, name, email, password_hash, department_id, role, status,
               must_change_password, failed_login_count, locked_until, last_login_at, created_at
        FROM users
        WHERE employee_no = #{employeeNo}
    </select>

    <select id="existsSuperAdmin" resultType="boolean">
        SELECT EXISTS (SELECT 1 FROM users WHERE role = 'SUPER_ADMIN')
    </select>

    <select id="existsByEmail" resultType="boolean">
        SELECT EXISTS (SELECT 1 FROM users WHERE lower(email) = lower(#{email}))
    </select>

    <insert id="insert" parameterType="User" useGeneratedKeys="true" keyProperty="id">
        INSERT INTO users (employee_no, name, email, password_hash, department_id, role, status, must_change_password)
        VALUES (#{employeeNo}, #{name}, #{email}, #{passwordHash}, #{departmentId}, #{role}, #{status}, #{mustChangePassword})
    </insert>

    <update id="incrementFailedLogin">
        UPDATE users SET failed_login_count = #{failedCount} WHERE id = #{userId}
    </update>

    <update id="lockAccount">
        UPDATE users SET locked_until = #{lockedUntil}, failed_login_count = 0 WHERE id = #{userId}
    </update>

    <update id="resetFailedLogin">
        UPDATE users SET failed_login_count = 0, locked_until = NULL WHERE id = #{userId}
    </update>

    <update id="updateLastLoginAt">
        UPDATE users SET last_login_at = #{lastLoginAt} WHERE id = #{userId}
    </update>

    <update id="updatePassword">
        UPDATE users SET password_hash = #{passwordHash}, must_change_password = FALSE WHERE id = #{userId}
    </update>

</mapper>
```

- [x] **Step 4: PasswordEncoder 빈 등록**

`backend/src/main/java/com/daeryun/probank/config/SecurityBeansConfig.java`:
```java
package com.daeryun.probank.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;

@Configuration
public class SecurityBeansConfig {

    @Bean
    public PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder();
    }
}
```

- [x] **Step 5: Dao 통합 테스트 작성 (실DB 필요)**

`backend/src/test/java/com/daeryun/probank/dao/UserDaoTest.java`:
```java
package com.daeryun.probank.dao;

import com.daeryun.probank.domain.Department;
import com.daeryun.probank.domain.Status;
import com.daeryun.probank.domain.User;
import com.daeryun.probank.domain.UserRole;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.transaction.annotation.Transactional;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

@SpringBootTest
@Transactional
class UserDaoTest {

    @Autowired
    private DepartmentDao departmentDao;

    @Autowired
    private UserDao userDao;

    @Test
    void insertAndFindByEmployeeNo() {
        Department department = new Department();
        department.setName("테스트부서");
        department.setCode("TEST-DEPT-" + System.nanoTime());
        department.setStatus(Status.ACTIVE);
        departmentDao.insert(department);

        User user = new User();
        user.setEmployeeNo("EMP-" + System.nanoTime());
        user.setName("홍길동");
        user.setEmail("user-" + System.nanoTime() + "@company.local");
        user.setPasswordHash("hashed");
        user.setDepartmentId(department.getId());
        user.setRole(UserRole.EMPLOYEE);
        user.setStatus(Status.ACTIVE);
        user.setMustChangePassword(true);
        userDao.insert(user);

        User found = userDao.findByEmployeeNo(user.getEmployeeNo());

        assertEquals(user.getName(), found.getName());
        assertEquals(UserRole.EMPLOYEE, found.getRole());
        assertNull(found.getLockedUntil());
    }
}
```

- [x] **Step 6: 테스트 실행**

Run: `cd backend && ./gradlew test --tests UserDaoTest`
Expected: `BUILD SUCCESSFUL` (PostgreSQL이 떠 있어야 함, `@Transactional`로 테스트 후 자동 롤백됨)

- [x] **Step 7: Commit**

```bash
git add backend/src/main/java/com/daeryun/probank/domain backend/src/main/java/com/daeryun/probank/dao backend/src/main/resources/mappers backend/src/main/java/com/daeryun/probank/config/SecurityBeansConfig.java backend/src/test/java/com/daeryun/probank/dao
git commit -m "feat: add department/user domain, dao and mapper"
```

---

### Task 6: 로그인 서비스/API (계정 잠금 포함)

**Files:**
- Create: `backend/src/main/java/com/daeryun/probank/dto/auth/LoginRequest.java`
- Create: `backend/src/main/java/com/daeryun/probank/dto/auth/LoginResponse.java`
- Create: `backend/src/main/java/com/daeryun/probank/service/AuthService.java`
- Create: `backend/src/main/java/com/daeryun/probank/service/AuthServiceImpl.java`
- Create: `backend/src/main/java/com/daeryun/probank/controller/AuthController.java`
- Test: `backend/src/test/java/com/daeryun/probank/service/AuthServiceImplTest.java`

**Interfaces:**
- Consumes: `UserDao`, `PasswordEncoder`(Task 5), `AuthUser`, `SessionKeys`, `ErrorCode`, `BizException`(Task 3, 4)
- Produces: `AuthService.login(LoginRequest, HttpServletRequest) : LoginResponse`. `POST /api/auth/login`. 이후 Task 7(로그아웃/세션조회), Task 14(프론트엔드 로그인 화면)이 이 API를 사용한다.

- [x] **Step 1: 실패하는 서비스 테스트 작성**

`backend/src/test/java/com/daeryun/probank/service/AuthServiceImplTest.java`:
```java
package com.daeryun.probank.service;

import com.daeryun.probank.common.AuthUser;
import com.daeryun.probank.common.SessionKeys;
import com.daeryun.probank.dao.UserDao;
import com.daeryun.probank.domain.Status;
import com.daeryun.probank.domain.User;
import com.daeryun.probank.domain.UserRole;
import com.daeryun.probank.dto.auth.LoginRequest;
import com.daeryun.probank.dto.auth.LoginResponse;
import com.daeryun.probank.exception.BizException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;

import java.time.LocalDateTime;

import static org.junit.jupiter.api.Assertions.*;

class AuthServiceImplTest {

    private UserDao userDao;
    private PasswordEncoder passwordEncoder;
    private AuthServiceImpl authService;

    @BeforeEach
    void setUp() {
        userDao = Mockito.mock(UserDao.class);
        passwordEncoder = new BCryptPasswordEncoder();
        authService = new AuthServiceImpl(userDao, passwordEncoder, 5, 15);
    }

    private User activeUser(String rawPassword) {
        User user = new User();
        user.setId(1L);
        user.setEmployeeNo("1001");
        user.setName("홍길동");
        user.setPasswordHash(passwordEncoder.encode(rawPassword));
        user.setDepartmentId(10L);
        user.setRole(UserRole.EMPLOYEE);
        user.setStatus(Status.ACTIVE);
        user.setMustChangePassword(false);
        user.setFailedLoginCount(0);
        return user;
    }

    @Test
    void login_success_createsSessionWithAuthUser() {
        User user = activeUser("correct-password");
        Mockito.when(userDao.findByEmployeeNo("1001")).thenReturn(user);
        MockHttpServletRequest request = new MockHttpServletRequest();

        LoginRequest loginRequest = new LoginRequest();
        loginRequest.setEmployeeNo("1001");
        loginRequest.setPassword("correct-password");

        LoginResponse response = authService.login(loginRequest, request);

        assertEquals("홍길동", response.getName());
        assertEquals(UserRole.EMPLOYEE, response.getRole());
        AuthUser sessionUser = (AuthUser) request.getSession().getAttribute(SessionKeys.LOGIN_USER);
        assertNotNull(sessionUser);
        assertEquals("1001", sessionUser.getEmployeeNo());
        Mockito.verify(userDao).resetFailedLogin(1L);
        Mockito.verify(userDao).updateLastLoginAt(Mockito.eq(1L), Mockito.any());
    }

    @Test
    void login_wrongPassword_incrementsFailedCountAndRejects() {
        User user = activeUser("correct-password");
        Mockito.when(userDao.findByEmployeeNo("1001")).thenReturn(user);
        MockHttpServletRequest request = new MockHttpServletRequest();

        LoginRequest loginRequest = new LoginRequest();
        loginRequest.setEmployeeNo("1001");
        loginRequest.setPassword("wrong-password");

        BizException exception = assertThrows(BizException.class, () -> authService.login(loginRequest, request));

        assertEquals(1011, exception.getErrorCode().getCode());
        Mockito.verify(userDao).incrementFailedLogin(1L, 1);
    }

    @Test
    void login_fifthWrongPassword_locksAccount() {
        User user = activeUser("correct-password");
        user.setFailedLoginCount(4);
        Mockito.when(userDao.findByEmployeeNo("1001")).thenReturn(user);
        MockHttpServletRequest request = new MockHttpServletRequest();

        LoginRequest loginRequest = new LoginRequest();
        loginRequest.setEmployeeNo("1001");
        loginRequest.setPassword("wrong-password");

        assertThrows(BizException.class, () -> authService.login(loginRequest, request));

        Mockito.verify(userDao).lockAccount(Mockito.eq(1L), Mockito.any(LocalDateTime.class));
        Mockito.verify(userDao, Mockito.never()).incrementFailedLogin(Mockito.anyLong(), Mockito.anyInt());
    }

    @Test
    void login_lockedAccount_rejectsEvenWithCorrectPassword() {
        User user = activeUser("correct-password");
        user.setLockedUntil(LocalDateTime.now().plusMinutes(10));
        Mockito.when(userDao.findByEmployeeNo("1001")).thenReturn(user);
        MockHttpServletRequest request = new MockHttpServletRequest();

        LoginRequest loginRequest = new LoginRequest();
        loginRequest.setEmployeeNo("1001");
        loginRequest.setPassword("correct-password");

        BizException exception = assertThrows(BizException.class, () -> authService.login(loginRequest, request));

        assertEquals(1010, exception.getErrorCode().getCode());
    }

    @Test
    void login_unknownEmployeeNo_rejectsWithSameMessageAsWrongPassword() {
        Mockito.when(userDao.findByEmployeeNo("unknown")).thenReturn(null);
        MockHttpServletRequest request = new MockHttpServletRequest();

        LoginRequest loginRequest = new LoginRequest();
        loginRequest.setEmployeeNo("unknown");
        loginRequest.setPassword("anything");

        BizException exception = assertThrows(BizException.class, () -> authService.login(loginRequest, request));

        assertEquals(1011, exception.getErrorCode().getCode());
    }
}
```

- [x] **Step 2: 테스트 실행하여 실패 확인 (컴파일 실패 예상)**

Run: `cd backend && ./gradlew test --tests AuthServiceImplTest`
Expected: FAIL — `AuthServiceImpl`, `LoginRequest`, `LoginResponse`가 존재하지 않아 컴파일 오류

- [x] **Step 3: DTO와 서비스 구현**

`backend/src/main/java/com/daeryun/probank/dto/auth/LoginRequest.java`:
```java
package com.daeryun.probank.dto.auth;

import lombok.Data;

@Data
public class LoginRequest {
    private String employeeNo;
    private String password;
}
```

`backend/src/main/java/com/daeryun/probank/dto/auth/LoginResponse.java`:
```java
package com.daeryun.probank.dto.auth;

import com.daeryun.probank.domain.UserRole;
import lombok.AllArgsConstructor;
import lombok.Data;

@Data
@AllArgsConstructor
public class LoginResponse {
    private String name;
    private UserRole role;
    private boolean mustChangePassword;
}
```

`backend/src/main/java/com/daeryun/probank/service/AuthService.java`:
```java
package com.daeryun.probank.service;

import com.daeryun.probank.dto.auth.LoginRequest;
import com.daeryun.probank.dto.auth.LoginResponse;

import javax.servlet.http.HttpServletRequest;

public interface AuthService {
    LoginResponse login(LoginRequest loginRequest, HttpServletRequest request);
}
```

`backend/src/main/java/com/daeryun/probank/service/AuthServiceImpl.java`:
```java
package com.daeryun.probank.service;

import com.daeryun.probank.common.AuthUser;
import com.daeryun.probank.common.ErrorCode;
import com.daeryun.probank.common.SessionKeys;
import com.daeryun.probank.dao.UserDao;
import com.daeryun.probank.domain.Status;
import com.daeryun.probank.domain.User;
import com.daeryun.probank.dto.auth.LoginRequest;
import com.daeryun.probank.dto.auth.LoginResponse;
import com.daeryun.probank.exception.BizException;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;

import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpSession;
import java.time.LocalDateTime;

@Service
public class AuthServiceImpl implements AuthService {

    private final UserDao userDao;
    private final PasswordEncoder passwordEncoder;
    private final int maxFailedAttempts;
    private final int lockoutMinutes;

    public AuthServiceImpl(
            UserDao userDao,
            PasswordEncoder passwordEncoder,
            @Value("${app.auth.max-failed-attempts:5}") int maxFailedAttempts,
            @Value("${app.auth.lockout-minutes:15}") int lockoutMinutes) {
        this.userDao = userDao;
        this.passwordEncoder = passwordEncoder;
        this.maxFailedAttempts = maxFailedAttempts;
        this.lockoutMinutes = lockoutMinutes;
    }

    @Override
    public LoginResponse login(LoginRequest loginRequest, HttpServletRequest request) {
        if (loginRequest == null || isBlank(loginRequest.getEmployeeNo()) || isBlank(loginRequest.getPassword())) {
            throw new BizException(ErrorCode.INPUT_VALUE_INVALID, "사번과 비밀번호를 입력하세요.");
        }

        User user = userDao.findByEmployeeNo(loginRequest.getEmployeeNo());
        if (user == null || user.getStatus() == Status.INACTIVE) {
            throw new BizException(ErrorCode.LOGIN_FAILED);
        }
        if (user.getLockedUntil() != null && user.getLockedUntil().isAfter(LocalDateTime.now())) {
            throw new BizException(ErrorCode.ACCOUNT_LOCKED);
        }
        if (!passwordEncoder.matches(loginRequest.getPassword(), user.getPasswordHash())) {
            handleFailedAttempt(user);
            throw new BizException(ErrorCode.LOGIN_FAILED);
        }

        userDao.resetFailedLogin(user.getId());
        userDao.updateLastLoginAt(user.getId(), LocalDateTime.now());

        AuthUser authUser = new AuthUser(
                user.getId(), user.getEmployeeNo(), user.getName(), user.getRole(),
                user.getDepartmentId(), user.isMustChangePassword());
        HttpSession session = request.getSession(true);
        session.setAttribute(SessionKeys.LOGIN_USER, authUser);

        return new LoginResponse(user.getName(), user.getRole(), user.isMustChangePassword());
    }

    private void handleFailedAttempt(User user) {
        int nextFailedCount = user.getFailedLoginCount() + 1;
        if (nextFailedCount >= maxFailedAttempts) {
            userDao.lockAccount(user.getId(), LocalDateTime.now().plusMinutes(lockoutMinutes));
        } else {
            userDao.incrementFailedLogin(user.getId(), nextFailedCount);
        }
    }

    private boolean isBlank(String value) {
        return value == null || value.trim().isEmpty();
    }
}
```

`backend/src/main/java/com/daeryun/probank/controller/AuthController.java`:
```java
package com.daeryun.probank.controller;

import com.daeryun.probank.common.ResponseDto;
import com.daeryun.probank.dto.auth.LoginRequest;
import com.daeryun.probank.service.AuthService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import javax.servlet.http.HttpServletRequest;

@RestController
@RequestMapping("/api/auth")
public class AuthController {

    private final AuthService authService;

    public AuthController(AuthService authService) {
        this.authService = authService;
    }

    @PostMapping("/login")
    public ResponseEntity<ResponseDto<?>> login(@RequestBody(required = false) LoginRequest loginRequest,
                                                  HttpServletRequest request) {
        return ResponseEntity.ok(ResponseDto.ok(authService.login(loginRequest, request)));
    }
}
```

- [x] **Step 4: 테스트 실행하여 통과 확인**

Run: `cd backend && ./gradlew test --tests AuthServiceImplTest`
Expected: `BUILD SUCCESSFUL`, 5 tests 통과

- [x] **Step 5: Commit**

```bash
git add backend/src/main/java/com/daeryun/probank/dto/auth backend/src/main/java/com/daeryun/probank/service backend/src/main/java/com/daeryun/probank/controller/AuthController.java backend/src/test/java/com/daeryun/probank/service
git commit -m "feat: add login API with account lockout"
```

---

### Task 7: 로그아웃/세션 조회 API

**Files:**
- Create: `backend/src/main/java/com/daeryun/probank/dto/auth/SessionStatusResponse.java`
- Modify: `backend/src/main/java/com/daeryun/probank/service/AuthService.java`
- Modify: `backend/src/main/java/com/daeryun/probank/service/AuthServiceImpl.java`
- Modify: `backend/src/main/java/com/daeryun/probank/controller/AuthController.java`
- Test: `backend/src/test/java/com/daeryun/probank/service/AuthServiceImplTest.java`

**Interfaces:**
- Consumes: `AuthUser`, `SessionKeys`(Task 4)
- Produces: `AuthService.logout(HttpServletRequest)`, `AuthService.getSessionStatus(HttpServletRequest) : SessionStatusResponse`. `POST /api/auth/logout`, `GET /api/auth/session`. Task 13(useSessionStatus)이 `GET /api/auth/session`을 사용한다.

- [x] **Step 1: 실패하는 테스트 추가**

`backend/src/test/java/com/daeryun/probank/service/AuthServiceImplTest.java`의 클래스 끝에 아래 테스트 2개를 추가한다 (기존 import 문 아래, 마지막 `}` 앞):
```java
    @Test
    void getSessionStatus_noSession_returnsLoggedInFalse() {
        MockHttpServletRequest request = new MockHttpServletRequest();

        SessionStatusResponse status = authService.getSessionStatus(request);

        assertFalse(status.isLoggedIn());
    }

    @Test
    void logout_invalidatesSession() {
        User user = activeUser("correct-password");
        Mockito.when(userDao.findByEmployeeNo("1001")).thenReturn(user);
        MockHttpServletRequest request = new MockHttpServletRequest();
        LoginRequest loginRequest = new LoginRequest();
        loginRequest.setEmployeeNo("1001");
        loginRequest.setPassword("correct-password");
        authService.login(loginRequest, request);

        authService.logout(request);

        assertNull(request.getSession(false));
    }
```
그리고 파일 상단 import에 다음을 추가한다:
```java
import com.daeryun.probank.dto.auth.SessionStatusResponse;
```

- [x] **Step 2: 테스트 실행하여 실패 확인**

Run: `cd backend && ./gradlew test --tests AuthServiceImplTest`
Expected: FAIL — `AuthService`에 `getSessionStatus`/`logout`이 없어 컴파일 오류

- [x] **Step 3: 구현**

`backend/src/main/java/com/daeryun/probank/dto/auth/SessionStatusResponse.java`:
```java
package com.daeryun.probank.dto.auth;

import com.daeryun.probank.domain.UserRole;
import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class SessionStatusResponse {

    @JsonProperty("isLoggedIn")
    private boolean loggedIn;
    private String employeeNo;
    private String name;
    private UserRole role;
    private Long departmentId;
    private boolean mustChangePassword;

    public static SessionStatusResponse notLoggedIn() {
        return new SessionStatusResponse(false, null, null, null, null, false);
    }
}
```

`AuthService` 인터페이스에 메서드 추가:
```java
    void logout(HttpServletRequest request);

    SessionStatusResponse getSessionStatus(HttpServletRequest request);
```
(파일 상단에 `import com.daeryun.probank.dto.auth.SessionStatusResponse;` 추가)

`AuthServiceImpl`에 메서드 추가 (클래스 마지막 private 메서드 위):
```java
    @Override
    public void logout(HttpServletRequest request) {
        HttpSession session = request.getSession(false);
        if (session != null) {
            session.invalidate();
        }
    }

    @Override
    public SessionStatusResponse getSessionStatus(HttpServletRequest request) {
        HttpSession session = request.getSession(false);
        AuthUser authUser = session == null ? null : (AuthUser) session.getAttribute(SessionKeys.LOGIN_USER);
        if (authUser == null) {
            return SessionStatusResponse.notLoggedIn();
        }
        return new SessionStatusResponse(
                true, authUser.getEmployeeNo(), authUser.getName(), authUser.getRole(),
                authUser.getDepartmentId(), authUser.isMustChangePassword());
    }
```
(상단 import에 `import com.daeryun.probank.dto.auth.SessionStatusResponse;` 추가)

`AuthController`에 엔드포인트 추가:
```java
    @PostMapping("/logout")
    public ResponseEntity<ResponseDto<?>> logout(HttpServletRequest request) {
        authService.logout(request);
        return ResponseEntity.ok(ResponseDto.ok());
    }

    @GetMapping("/session")
    public ResponseEntity<ResponseDto<?>> getSession(HttpServletRequest request) {
        return ResponseEntity.ok(ResponseDto.ok(authService.getSessionStatus(request)));
    }
```

- [x] **Step 4: 테스트 실행하여 통과 확인**

Run: `cd backend && ./gradlew test --tests AuthServiceImplTest`
Expected: `BUILD SUCCESSFUL`, 7 tests 통과

- [x] **Step 5: Commit**

```bash
git add backend/src/main/java/com/daeryun/probank/dto/auth backend/src/main/java/com/daeryun/probank/service backend/src/main/java/com/daeryun/probank/controller/AuthController.java backend/src/test/java/com/daeryun/probank/service
git commit -m "feat: add logout and session status API"
```

---

### Task 8: 비밀번호 변경 API + 강제 변경 가드 연동

**Files:**
- Create: `backend/src/main/java/com/daeryun/probank/dto/auth/ChangePasswordRequest.java`
- Modify: `backend/src/main/java/com/daeryun/probank/service/AuthService.java`
- Modify: `backend/src/main/java/com/daeryun/probank/service/AuthServiceImpl.java`
- Modify: `backend/src/main/java/com/daeryun/probank/controller/AuthController.java`
- Test: `backend/src/test/java/com/daeryun/probank/service/AuthServiceImplTest.java`

**Interfaces:**
- Consumes: `UserDao.updatePassword`(Task 5), `SessionCheckFilter`의 `mustChangePassword` 가드(Task 4)
- Produces: `AuthService.changePassword(String newPassword, HttpServletRequest)`. `POST /api/auth/change-password`. Task 14(ChangePasswordPage)가 사용한다.

- [x] **Step 1: 실패하는 테스트 추가**

`AuthServiceImplTest`에 아래 테스트 추가:
```java
    @Test
    void changePassword_updatesHashAndSessionFlag() {
        User user = activeUser("correct-password");
        user.setMustChangePassword(true);
        Mockito.when(userDao.findByEmployeeNo("1001")).thenReturn(user);
        MockHttpServletRequest request = new MockHttpServletRequest();
        LoginRequest loginRequest = new LoginRequest();
        loginRequest.setEmployeeNo("1001");
        loginRequest.setPassword("correct-password");
        authService.login(loginRequest, request);

        authService.changePassword("new-password-123", request);

        Mockito.verify(userDao).updatePassword(Mockito.eq(1L), Mockito.anyString());
        AuthUser sessionUser = (AuthUser) request.getSession().getAttribute(SessionKeys.LOGIN_USER);
        assertFalse(sessionUser.isMustChangePassword());
    }

    @Test
    void changePassword_tooShort_rejectsBeforeUpdating() {
        MockHttpServletRequest request = new MockHttpServletRequest();
        request.getSession(true);

        assertThrows(BizException.class, () -> authService.changePassword("short", request));
        Mockito.verify(userDao, Mockito.never()).updatePassword(Mockito.anyLong(), Mockito.anyString());
    }
```

- [x] **Step 2: 테스트 실행하여 실패 확인**

Run: `cd backend && ./gradlew test --tests AuthServiceImplTest`
Expected: FAIL — `changePassword` 메서드가 없어 컴파일 오류

- [x] **Step 3: 구현**

`backend/src/main/java/com/daeryun/probank/dto/auth/ChangePasswordRequest.java`:
```java
package com.daeryun.probank.dto.auth;

import lombok.Data;

@Data
public class ChangePasswordRequest {
    private String newPassword;
}
```

`AuthUser`는 불변(생성자만 있음)이므로, 세션에 저장된 `mustChangePassword`를 갱신하려면 새 `AuthUser`로 교체해야 한다. `AuthService`에 메서드 추가:
```java
    void changePassword(String newPassword, HttpServletRequest request);
```

`AuthServiceImpl`에 추가 (클래스 상수 영역에 최소 길이 상수 추가 후 메서드 구현):
```java
    private static final int MIN_PASSWORD_LENGTH = 8;

    @Override
    public void changePassword(String newPassword, HttpServletRequest request) {
        if (isBlank(newPassword) || newPassword.length() < MIN_PASSWORD_LENGTH) {
            throw new BizException(ErrorCode.INPUT_VALUE_INVALID, "비밀번호는 8자 이상이어야 합니다.");
        }
        HttpSession session = request.getSession(false);
        AuthUser current = session == null ? null : (AuthUser) session.getAttribute(SessionKeys.LOGIN_USER);
        if (current == null) {
            throw new BizException(ErrorCode.EMPTY_SESSION);
        }

        userDao.updatePassword(current.getUserId(), passwordEncoder.encode(newPassword));

        AuthUser updated = new AuthUser(
                current.getUserId(), current.getEmployeeNo(), current.getName(), current.getRole(),
                current.getDepartmentId(), false);
        session.setAttribute(SessionKeys.LOGIN_USER, updated);
    }
```

`AuthController`에 엔드포인트 추가:
```java
    @PostMapping("/change-password")
    public ResponseEntity<ResponseDto<?>> changePassword(@RequestBody ChangePasswordRequest changePasswordRequest,
                                                           HttpServletRequest request) {
        authService.changePassword(changePasswordRequest.getNewPassword(), request);
        return ResponseEntity.ok(ResponseDto.ok());
    }
```
(상단 import에 `import com.daeryun.probank.dto.auth.ChangePasswordRequest;` 추가)

- [x] **Step 4: 테스트 실행하여 통과 확인**

Run: `cd backend && ./gradlew test --tests AuthServiceImplTest`
Expected: `BUILD SUCCESSFUL`, 9 tests 통과

- [x] **Step 5: Commit**

```bash
git add backend/src/main/java/com/daeryun/probank/dto/auth backend/src/main/java/com/daeryun/probank/service backend/src/main/java/com/daeryun/probank/controller/AuthController.java backend/src/test/java/com/daeryun/probank/service
git commit -m "feat: add change-password API enforcing minimum length"
```

---

### Task 9: 총괄관리자 계정 부트스트랩

**Files:**
- Create: `backend/src/main/java/com/daeryun/probank/config/SuperAdminBootstrapRunner.java`
- Test: `backend/src/test/java/com/daeryun/probank/config/SuperAdminBootstrapRunnerTest.java`

**Interfaces:**
- Consumes: `UserDao`, `DepartmentDao`(Task 5), `PasswordEncoder`(Task 5)
- Produces: 앱 최초 기동 시 `SUPER_ADMIN` 계정이 하나도 없으면 기본 부서("본사", 코드 `HQ`)와 총괄관리자 계정을 자동 생성한다. 이후 Plan 2(부서/계정 관리)는 이 계정으로 로그인해 다른 계정을 만든다.

- [x] **Step 1: 실패하는 테스트 작성**

`backend/src/test/java/com/daeryun/probank/config/SuperAdminBootstrapRunnerTest.java`:
```java
package com.daeryun.probank.config;

import com.daeryun.probank.dao.DepartmentDao;
import com.daeryun.probank.dao.UserDao;
import com.daeryun.probank.domain.Department;
import com.daeryun.probank.domain.User;
import com.daeryun.probank.domain.UserRole;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.mockito.Mockito;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class SuperAdminBootstrapRunnerTest {

    @Test
    void whenNoSuperAdminExists_createsDepartmentAndSuperAdmin() throws Exception {
        DepartmentDao departmentDao = Mockito.mock(DepartmentDao.class);
        UserDao userDao = Mockito.mock(UserDao.class);
        Mockito.when(userDao.existsSuperAdmin()).thenReturn(false);
        Mockito.when(departmentDao.findByCode("HQ")).thenReturn(null);

        SuperAdminBootstrapRunner runner = new SuperAdminBootstrapRunner(
                departmentDao, userDao, new BCryptPasswordEncoder(), "admin", "admin@company.local", "changeme1234");

        runner.run();

        ArgumentCaptor<Department> departmentCaptor = ArgumentCaptor.forClass(Department.class);
        Mockito.verify(departmentDao).insert(departmentCaptor.capture());
        assertEquals("HQ", departmentCaptor.getValue().getCode());

        ArgumentCaptor<User> userCaptor = ArgumentCaptor.forClass(User.class);
        Mockito.verify(userDao).insert(userCaptor.capture());
        assertEquals("admin", userCaptor.getValue().getEmployeeNo());
        assertEquals(UserRole.SUPER_ADMIN, userCaptor.getValue().getRole());
        assertTrue(userCaptor.getValue().isMustChangePassword());
    }

    @Test
    void whenSuperAdminAlreadyExists_doesNothing() throws Exception {
        DepartmentDao departmentDao = Mockito.mock(DepartmentDao.class);
        UserDao userDao = Mockito.mock(UserDao.class);
        Mockito.when(userDao.existsSuperAdmin()).thenReturn(true);

        SuperAdminBootstrapRunner runner = new SuperAdminBootstrapRunner(
                departmentDao, userDao, new BCryptPasswordEncoder(), "admin", "admin@company.local", "changeme1234");

        runner.run();

        Mockito.verify(userDao, Mockito.never()).insert(Mockito.any());
    }
}
```

- [x] **Step 2: 테스트 실행하여 실패 확인**

Run: `cd backend && ./gradlew test --tests SuperAdminBootstrapRunnerTest`
Expected: FAIL — `SuperAdminBootstrapRunner` 클래스가 없어 컴파일 오류

- [x] **Step 3: 구현**

`backend/src/main/java/com/daeryun/probank/config/SuperAdminBootstrapRunner.java`:
```java
package com.daeryun.probank.config;

import com.daeryun.probank.dao.DepartmentDao;
import com.daeryun.probank.dao.UserDao;
import com.daeryun.probank.domain.Department;
import com.daeryun.probank.domain.Status;
import com.daeryun.probank.domain.User;
import com.daeryun.probank.domain.UserRole;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.CommandLineRunner;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;

@Component
public class SuperAdminBootstrapRunner implements CommandLineRunner {

    private static final String DEFAULT_DEPARTMENT_CODE = "HQ";
    private static final String DEFAULT_DEPARTMENT_NAME = "본사";

    private final DepartmentDao departmentDao;
    private final UserDao userDao;
    private final PasswordEncoder passwordEncoder;
    private final String bootstrapEmployeeNo;
    private final String bootstrapEmail;
    private final String bootstrapPassword;

    public SuperAdminBootstrapRunner(
            DepartmentDao departmentDao,
            UserDao userDao,
            PasswordEncoder passwordEncoder,
            @Value("${app.bootstrap.super-admin.employee-no}") String bootstrapEmployeeNo,
            @Value("${app.bootstrap.super-admin.email}") String bootstrapEmail,
            @Value("${app.bootstrap.super-admin.password}") String bootstrapPassword) {
        this.departmentDao = departmentDao;
        this.userDao = userDao;
        this.passwordEncoder = passwordEncoder;
        this.bootstrapEmployeeNo = bootstrapEmployeeNo;
        this.bootstrapEmail = bootstrapEmail;
        this.bootstrapPassword = bootstrapPassword;
    }

    @Override
    public void run(String... args) {
        if (userDao.existsSuperAdmin()) {
            return;
        }

        Department department = departmentDao.findByCode(DEFAULT_DEPARTMENT_CODE);
        if (department == null) {
            department = new Department();
            department.setName(DEFAULT_DEPARTMENT_NAME);
            department.setCode(DEFAULT_DEPARTMENT_CODE);
            department.setStatus(Status.ACTIVE);
            departmentDao.insert(department);
        }

        User superAdmin = new User();
        superAdmin.setEmployeeNo(bootstrapEmployeeNo);
        superAdmin.setName("총괄관리자");
        superAdmin.setEmail(bootstrapEmail);
        superAdmin.setPasswordHash(passwordEncoder.encode(bootstrapPassword));
        superAdmin.setDepartmentId(department.getId());
        superAdmin.setRole(UserRole.SUPER_ADMIN);
        superAdmin.setStatus(Status.ACTIVE);
        superAdmin.setMustChangePassword(true);
        userDao.insert(superAdmin);
    }
}
```

- [x] **Step 4: 테스트 실행하여 통과 확인**

Run: `cd backend && ./gradlew test --tests SuperAdminBootstrapRunnerTest`
Expected: `BUILD SUCCESSFUL`, 2 tests 통과

- [x] **Step 5: Commit**

```bash
git add backend/src/main/java/com/daeryun/probank/config/SuperAdminBootstrapRunner.java backend/src/test/java/com/daeryun/probank/config
git commit -m "feat: bootstrap default department and super admin account on startup"
```

---

### Task 10: 역할 기반 접근 제어 (`@RequireRole`)

**Files:**
- Create: `backend/src/main/java/com/daeryun/probank/common/RequireRole.java`
- Create: `backend/src/main/java/com/daeryun/probank/config/RoleCheckInterceptor.java`
- Create: `backend/src/main/java/com/daeryun/probank/config/WebConfig.java`
- Test: `backend/src/test/java/com/daeryun/probank/config/RoleCheckInterceptorTest.java`

**Interfaces:**
- Consumes: `AuthUser`, `SessionKeys`, `ErrorCode`, `BizException`(Task 3, 4)
- Produces: `@RequireRole({UserRole...})` 어노테이션(메서드/클래스 레벨). Plan 2~5의 관리자 전용 컨트롤러 메서드는 이 어노테이션을 붙여 권한을 제한한다.

- [x] **Step 1: 어노테이션 작성**

`backend/src/main/java/com/daeryun/probank/common/RequireRole.java`:
```java
package com.daeryun.probank.common;

import com.daeryun.probank.domain.UserRole;

import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

@Retention(RetentionPolicy.RUNTIME)
@Target({ElementType.METHOD, ElementType.TYPE})
public @interface RequireRole {
    UserRole[] value();
}
```

- [x] **Step 2: 실패하는 인터셉터 테스트 작성**

`backend/src/test/java/com/daeryun/probank/config/RoleCheckInterceptorTest.java`:
```java
package com.daeryun.probank.config;

import com.daeryun.probank.common.AuthUser;
import com.daeryun.probank.common.RequireRole;
import com.daeryun.probank.common.SessionKeys;
import com.daeryun.probank.domain.UserRole;
import com.daeryun.probank.exception.BizException;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.web.method.HandlerMethod;

import java.lang.reflect.Method;

import static org.junit.jupiter.api.Assertions.*;

class RoleCheckInterceptorTest {

    static class SampleController {
        @RequireRole(UserRole.SUPER_ADMIN)
        public void superAdminOnly() {
        }

        public void anyoneAllowed() {
        }
    }

    private final RoleCheckInterceptor interceptor = new RoleCheckInterceptor();

    private HandlerMethod handlerMethodFor(String methodName) throws NoSuchMethodException {
        Method method = SampleController.class.getMethod(methodName);
        return new HandlerMethod(new SampleController(), method);
    }

    @Test
    void methodWithoutAnnotation_isAllowedWithoutSession() throws Exception {
        MockHttpServletRequest request = new MockHttpServletRequest();
        boolean result = interceptor.preHandle(request, new MockHttpServletResponse(), handlerMethodFor("anyoneAllowed"));
        assertTrue(result);
    }

    @Test
    void methodWithAnnotation_noSession_throwsEmptySession() throws Exception {
        MockHttpServletRequest request = new MockHttpServletRequest();
        assertThrows(BizException.class, () ->
                interceptor.preHandle(request, new MockHttpServletResponse(), handlerMethodFor("superAdminOnly")));
    }

    @Test
    void methodWithAnnotation_wrongRole_throwsAccessDenied() throws Exception {
        MockHttpServletRequest request = new MockHttpServletRequest();
        AuthUser authUser = new AuthUser(1L, "1001", "홍길동", UserRole.EMPLOYEE, 1L, false);
        request.getSession(true).setAttribute(SessionKeys.LOGIN_USER, authUser);

        BizException exception = assertThrows(BizException.class, () ->
                interceptor.preHandle(request, new MockHttpServletResponse(), handlerMethodFor("superAdminOnly")));
        assertEquals(990, exception.getErrorCode().getCode());
    }

    @Test
    void methodWithAnnotation_matchingRole_isAllowed() throws Exception {
        MockHttpServletRequest request = new MockHttpServletRequest();
        AuthUser authUser = new AuthUser(1L, "admin", "총괄관리자", UserRole.SUPER_ADMIN, 1L, false);
        request.getSession(true).setAttribute(SessionKeys.LOGIN_USER, authUser);

        boolean result = interceptor.preHandle(request, new MockHttpServletResponse(), handlerMethodFor("superAdminOnly"));
        assertTrue(result);
    }
}
```

- [x] **Step 3: 테스트 실행하여 실패 확인**

Run: `cd backend && ./gradlew test --tests RoleCheckInterceptorTest`
Expected: FAIL — `RoleCheckInterceptor` 클래스가 없어 컴파일 오류

- [x] **Step 4: 인터셉터와 등록 설정 구현**

`backend/src/main/java/com/daeryun/probank/config/RoleCheckInterceptor.java`:
```java
package com.daeryun.probank.config;

import com.daeryun.probank.common.AuthUser;
import com.daeryun.probank.common.ErrorCode;
import com.daeryun.probank.common.RequireRole;
import com.daeryun.probank.common.SessionKeys;
import com.daeryun.probank.domain.UserRole;
import com.daeryun.probank.exception.BizException;
import org.springframework.stereotype.Component;
import org.springframework.web.method.HandlerMethod;
import org.springframework.web.servlet.HandlerInterceptor;

import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpServletResponse;
import javax.servlet.http.HttpSession;
import java.util.Arrays;

@Component
public class RoleCheckInterceptor implements HandlerInterceptor {

    @Override
    public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler) {
        if (!(handler instanceof HandlerMethod)) {
            return true;
        }
        HandlerMethod handlerMethod = (HandlerMethod) handler;
        RequireRole requireRole = handlerMethod.getMethodAnnotation(RequireRole.class);
        if (requireRole == null) {
            requireRole = handlerMethod.getBeanType().getAnnotation(RequireRole.class);
        }
        if (requireRole == null) {
            return true;
        }

        HttpSession session = request.getSession(false);
        AuthUser authUser = session == null ? null : (AuthUser) session.getAttribute(SessionKeys.LOGIN_USER);
        if (authUser == null) {
            throw new BizException(ErrorCode.EMPTY_SESSION);
        }

        boolean allowed = Arrays.asList(requireRole.value()).contains(authUser.getRole());
        if (!allowed) {
            throw new BizException(ErrorCode.ACCESS_AUTH_DENIED);
        }
        return true;
    }
}
```

`backend/src/main/java/com/daeryun/probank/config/WebConfig.java`:
```java
package com.daeryun.probank.config;

import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.InterceptorRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

@Configuration
public class WebConfig implements WebMvcConfigurer {

    private final RoleCheckInterceptor roleCheckInterceptor;

    public WebConfig(RoleCheckInterceptor roleCheckInterceptor) {
        this.roleCheckInterceptor = roleCheckInterceptor;
    }

    @Override
    public void addInterceptors(InterceptorRegistry registry) {
        registry.addInterceptor(roleCheckInterceptor).addPathPatterns("/api/**");
    }
}
```

- [x] **Step 5: 테스트 실행하여 통과 확인**

Run: `cd backend && ./gradlew test --tests RoleCheckInterceptorTest`
Expected: `BUILD SUCCESSFUL`, 4 tests 통과

- [x] **Step 6: Commit**

```bash
git add backend/src/main/java/com/daeryun/probank/common/RequireRole.java backend/src/main/java/com/daeryun/probank/config backend/src/test/java/com/daeryun/probank/config
git commit -m "feat: add role-based access control interceptor"
```

---

## Part 3 — 프론트엔드 기반 구축

### Task 11: Vite + React 프로젝트 초기화

**Files:**
- Create: `frontend/package.json`
- Create: `frontend/vite.config.js`
- Create: `frontend/jsconfig.json`
- Create: `frontend/index.html`
- Create: `frontend/.gitignore`
- Create: `frontend/src/main.jsx`
- Create: `frontend/src/App.jsx`
- Create: `frontend/src/styles/index.css`

**Interfaces:**
- Consumes: (없음 — 프론트엔드 최초 Task)
- Produces: `npm run dev`로 실행 가능한 Vite 개발 서버(5173), `/api/**` 요청을 `localhost:8080`으로 프록시. `@/` → `src/` 별칭. 이후 모든 프론트엔드 Task가 `src/` 하위에 파일을 추가한다.

- [x] **Step 1: package.json 작성**

`frontend/package.json`:
```json
{
  "name": "frontend",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview",
    "test": "node --test"
  },
  "dependencies": {
    "react": "^19.2.0",
    "react-dom": "^19.2.0",
    "react-router-dom": "^7.13.0",
    "react-toastify": "^11.0.5",
    "zustand": "^5.0.11"
  },
  "devDependencies": {
    "@tailwindcss/vite": "^4.1.18",
    "@vitejs/plugin-react": "^5.1.1",
    "tailwindcss": "^4.1.18",
    "vite": "^8.0.0-beta.13"
  }
}
```

- [x] **Step 2: Vite/별칭/프록시 설정 작성**

`frontend/vite.config.js`:
```javascript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:8080',
        changeOrigin: true,
      },
    },
  },
})
```

`frontend/jsconfig.json`:
```json
{
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": ["src"]
}
```

`frontend/index.html`:
```html
<!doctype html>
<html lang="ko">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>문제 은행 Hub</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.jsx"></script>
  </body>
</html>
```

`frontend/.gitignore`:
```
node_modules/
dist/
```

- [x] **Step 3: 엔트리 파일 작성**

`frontend/src/styles/index.css`:
```css
@import "tailwindcss";
```

`frontend/src/main.jsx`:
```javascript
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/index.css'
import App from '@/App.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
```

`frontend/src/App.jsx` (이 Task에서는 골격만 — 라우터는 Task 13에서 연결):
```javascript
export default function App() {
  return <div>문제 은행 Hub</div>
}
```

- [x] **Step 4: 의존성 설치 및 개발 서버 확인**

Run: `cd frontend && npm install && npm run dev`
Expected: `Local: http://localhost:5173/` 출력, 브라우저에서 "문제 은행 Hub" 텍스트 확인 후 Ctrl+C로 종료

- [x] **Step 5: Commit**

```bash
git add frontend
git commit -m "chore: bootstrap Vite + React frontend project"
```

---

### Task 12: 공통 API 클라이언트 (`api/client.js`, `api/auth.js`)

**Files:**
- Create: `frontend/src/api/client.js`
- Create: `frontend/src/api/auth.js`
- Test: `frontend/src/api/client.test.js`

**Interfaces:**
- Consumes: (없음 — 순수 함수 + fetch)
- Produces: `apiGet(path)`, `apiPost(path, body)`, `ApiError`, `resolveErrorMessage(error, fallback)`, `setOnSessionExpired(listener)`, `setOnPasswordChangeRequired(listener)`; `login({employeeNo, password})`, `logout()`, `getSession()`, `changePassword({newPassword})`. Task 13(useSessionStatus), Task 14(로그인 화면)이 사용한다.

- [x] **Step 1: client.js 실패하는 테스트 작성**

`frontend/src/api/client.test.js`:
```javascript
import { test } from "node:test";
import assert from "node:assert/strict";
import { ApiError, resolveErrorMessage } from "./client.js";

test("ApiError carries resultCode and message", () => {
  const error = new ApiError(1011, "사번 또는 비밀번호가 올바르지 않습니다.");
  assert.equal(error.resultCode, 1011);
  assert.equal(error.message, "사번 또는 비밀번호가 올바르지 않습니다.");
});

test("resolveErrorMessage returns ApiError message", () => {
  const error = new ApiError(1011, "사번 또는 비밀번호가 올바르지 않습니다.");
  assert.equal(resolveErrorMessage(error, "fallback"), "사번 또는 비밀번호가 올바르지 않습니다.");
});

test("resolveErrorMessage falls back for non-ApiError", () => {
  assert.equal(resolveErrorMessage(new Error("boom"), "fallback"), "fallback");
});
```

- [x] **Step 2: 테스트 실행하여 실패 확인**

Run: `cd frontend && npm test`
Expected: FAIL — `client.js` 파일이 없음

- [x] **Step 3: client.js, auth.js 구현**

`frontend/src/api/client.js`:
```javascript
/**
 * 백엔드(Spring Boot) 공통 fetch 래퍼.
 * 모든 요청에 credentials: 'include'를 강제해 세션 쿠키를 동봉한다.
 * 응답은 { resultCode, resultMsg, data } 형태의 ResponseDto를 공통으로 가정한다.
 * resultCode 980(세션 만료), 1012(비밀번호 변경 필요)는 등록된 리스너를 호출한다.
 */

const BASE_URL = import.meta.env.VITE_API_BASE_URL || "";

export class ApiError extends Error {
  constructor(resultCode, resultMsg, data) {
    super(resultMsg || `API 요청이 실패했습니다. (resultCode: ${resultCode})`);
    this.name = "ApiError";
    this.resultCode = resultCode;
    this.resultMsg = resultMsg;
    this.data = data;
  }
}

export function resolveErrorMessage(error, fallback) {
  return error instanceof ApiError ? error.message : fallback;
}

let sessionExpiredListener = null;
let passwordChangeRequiredListener = null;

export function setOnSessionExpired(listener) {
  sessionExpiredListener = listener;
}

export function setOnPasswordChangeRequired(listener) {
  passwordChangeRequiredListener = listener;
}

async function request(path, options = {}) {
  const response = await fetch(`${BASE_URL}${path}`, {
    credentials: "include",
    ...options,
    headers: {
      ...(options.body instanceof FormData ? {} : { "Content-Type": "application/json" }),
      ...options.headers,
    },
  });

  const json = await response.json();

  if (json.resultCode === 980) {
    sessionExpiredListener?.();
  }
  if (json.resultCode === 1012) {
    passwordChangeRequiredListener?.();
  }
  if (json.resultCode !== 200) {
    throw new ApiError(json.resultCode, json.resultMsg, json.data ?? json.errorList);
  }

  return json.data;
}

export function apiGet(path) {
  return request(path, { method: "GET" });
}

export function apiPost(path, body, options = {}) {
  return request(path, { method: "POST", body: JSON.stringify(body), ...options });
}

export function apiPostForm(path, formData) {
  return request(path, { method: "POST", body: formData });
}
```

`frontend/src/api/auth.js`:
```javascript
import { apiGet, apiPost } from "@/api/client.js";

export function login({ employeeNo, password }) {
  return apiPost("/api/auth/login", { employeeNo, password });
}

export function logout() {
  return apiPost("/api/auth/logout", {});
}

export function getSession() {
  return apiGet("/api/auth/session");
}

export function changePassword({ newPassword }) {
  return apiPost("/api/auth/change-password", { newPassword });
}
```

- [x] **Step 4: 테스트 실행하여 통과 확인**

Run: `cd frontend && npm test`
Expected: 모든 테스트 통과 (`# pass 3`)

- [x] **Step 5: Commit**

```bash
git add frontend/src/api
git commit -m "feat: add common API client and auth API wrapper"
```

---

### Task 13: `useSessionStatus` 훅 + `PrivateRoute`/`PublicRoute`

**Files:**
- Create: `frontend/src/hooks/useSessionStatus.js`
- Create: `frontend/src/components/ui/Loader.jsx`
- Create: `frontend/src/routers/PrivateRoute.jsx`
- Create: `frontend/src/routers/PublicRoute.jsx`

**Interfaces:**
- Consumes: `getSession()`(Task 12)
- Produces: `useSessionStatus() : { status: "loading"|"authenticated"|"unauthenticated", session }` — `session`은 `SessionStatusResponse`(role, departmentId 등) 원본을 담는다. `<PrivateRoute/>`, `<PublicRoute/>` 레이아웃 라우트 컴포넌트. Task 14, 15가 사용한다.

- [x] **Step 1: useSessionStatus 작성**

`frontend/src/hooks/useSessionStatus.js`:
```javascript
import { useEffect, useState } from "react";
import { getSession } from "@/api/auth.js";

/**
 * @returns {{ status: "loading" | "authenticated" | "unauthenticated", session: object | null }}
 */
export function useSessionStatus() {
  const [state, setState] = useState({ status: "loading", session: null });

  useEffect(() => {
    let cancelled = false;

    getSession()
      .then((session) => {
        if (cancelled) return;
        setState({
          status: session?.isLoggedIn ? "authenticated" : "unauthenticated",
          session: session ?? null,
        });
      })
      .catch(() => {
        if (!cancelled) setState({ status: "unauthenticated", session: null });
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
```

- [x] **Step 2: 로더 컴포넌트 작성**

`frontend/src/components/ui/Loader.jsx`:
```javascript
export default function Loader({ visible, message }) {
  if (!visible) return null;
  return (
    <div className="flex h-screen items-center justify-center text-sm text-gray-500">
      {message}
    </div>
  );
}
```

- [x] **Step 3: PrivateRoute / PublicRoute 작성**

`frontend/src/routers/PrivateRoute.jsx`:
```javascript
import { Navigate, Outlet } from "react-router-dom";
import Loader from "@/components/ui/Loader.jsx";
import { useSessionStatus } from "@/hooks/useSessionStatus.js";

export default function PrivateRoute() {
  const { status } = useSessionStatus();

  if (status === "loading") {
    return <Loader visible message="세션 확인 중..." />;
  }
  if (status === "unauthenticated") {
    return <Navigate to="/login" replace />;
  }
  return <Outlet />;
}
```

`frontend/src/routers/PublicRoute.jsx`:
```javascript
import { Navigate, Outlet } from "react-router-dom";
import Loader from "@/components/ui/Loader.jsx";
import { useSessionStatus } from "@/hooks/useSessionStatus.js";

export default function PublicRoute() {
  const { status } = useSessionStatus();

  if (status === "loading") {
    return <Loader visible message="세션 확인 중..." />;
  }
  if (status === "authenticated") {
    return <Navigate to="/" replace />;
  }
  return <Outlet />;
}
```

- [x] **Step 4: Commit**

```bash
git add frontend/src/hooks frontend/src/components/ui/Loader.jsx frontend/src/routers/PrivateRoute.jsx frontend/src/routers/PublicRoute.jsx
git commit -m "feat: add session status hook and route guards"
```

(이 Task는 React 컴포넌트/DOM 훅으로, 프로젝트 관례상 `node:test`로 직접 단위 테스트하지 않는다 — Task 15에서 분리되는 순수 로직만 테스트한다.)

---

### Task 14: 로그인 / 비밀번호 변경 페이지

**Files:**
- Create: `frontend/src/pages/auth/LoginPage.jsx`
- Create: `frontend/src/pages/auth/ChangePasswordPage.jsx`

**Interfaces:**
- Consumes: `login`, `changePassword`(Task 12), `ApiError`, `resolveErrorMessage`(Task 12), `react-toastify`
- Produces: `/login`, `/change-password` 라우트에 매칭되는 화면 컴포넌트. Task 15가 `routes.jsx`에 연결한다.

- [x] **Step 1: LoginPage 작성**

`frontend/src/pages/auth/LoginPage.jsx`:
```javascript
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "react-toastify";
import { login } from "@/api/auth.js";
import { ApiError, resolveErrorMessage } from "@/api/client.js";

export default function LoginPage() {
  const navigate = useNavigate();
  const [employeeNo, setEmployeeNo] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setSubmitting(true);
    try {
      const result = await login({ employeeNo, password });
      if (result.mustChangePassword) {
        navigate("/change-password", { replace: true });
      } else {
        navigate("/", { replace: true });
      }
    } catch (error) {
      toast.error(resolveErrorMessage(error, "로그인에 실패했습니다."));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex h-screen items-center justify-center">
      <form onSubmit={handleSubmit} className="w-80 space-y-4 rounded border p-6">
        <h1 className="text-lg font-semibold">문제 은행 Hub 로그인</h1>
        <input
          className="w-full rounded border px-3 py-2"
          placeholder="사번"
          value={employeeNo}
          onChange={(event) => setEmployeeNo(event.target.value)}
          autoComplete="username"
        />
        <input
          className="w-full rounded border px-3 py-2"
          type="password"
          placeholder="비밀번호"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          autoComplete="current-password"
        />
        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded bg-blue-600 py-2 text-white disabled:opacity-50"
        >
          로그인
        </button>
      </form>
    </div>
  );
}
```

- [x] **Step 2: ChangePasswordPage 작성**

`frontend/src/pages/auth/ChangePasswordPage.jsx`:
```javascript
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "react-toastify";
import { changePassword } from "@/api/auth.js";
import { resolveErrorMessage } from "@/api/client.js";

const MIN_LENGTH = 8;

export default function ChangePasswordPage() {
  const navigate = useNavigate();
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    if (newPassword.length < MIN_LENGTH) {
      toast.error(`비밀번호는 ${MIN_LENGTH}자 이상이어야 합니다.`);
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error("비밀번호가 일치하지 않습니다.");
      return;
    }
    setSubmitting(true);
    try {
      await changePassword({ newPassword });
      toast.success("비밀번호가 변경되었습니다.");
      navigate("/", { replace: true });
    } catch (error) {
      toast.error(resolveErrorMessage(error, "비밀번호 변경에 실패했습니다."));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex h-screen items-center justify-center">
      <form onSubmit={handleSubmit} className="w-80 space-y-4 rounded border p-6">
        <h1 className="text-lg font-semibold">비밀번호 변경</h1>
        <p className="text-sm text-gray-500">최초 로그인이므로 비밀번호를 변경해야 합니다.</p>
        <input
          className="w-full rounded border px-3 py-2"
          type="password"
          placeholder="새 비밀번호 (8자 이상)"
          value={newPassword}
          onChange={(event) => setNewPassword(event.target.value)}
          autoComplete="new-password"
        />
        <input
          className="w-full rounded border px-3 py-2"
          type="password"
          placeholder="새 비밀번호 확인"
          value={confirmPassword}
          onChange={(event) => setConfirmPassword(event.target.value)}
          autoComplete="new-password"
        />
        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded bg-blue-600 py-2 text-white disabled:opacity-50"
        >
          변경하기
        </button>
      </form>
    </div>
  );
}
```

- [x] **Step 3: Commit**

```bash
git add frontend/src/pages/auth
git commit -m "feat: add login and change-password pages"
```

---

### Task 15: 기기/역할 기반 라우팅

**Files:**
- Create: `frontend/src/utils/device.js`
- Create: `frontend/src/utils/device.test.js`
- Create: `frontend/src/utils/routing.js`
- Create: `frontend/src/utils/routing.test.js`
- Create: `frontend/src/hooks/useDeviceType.js`
- Create: `frontend/src/routers/AdminRoute.jsx`
- Create: `frontend/src/routers/Landing.jsx`
- Create: `frontend/src/pages/admin/AdminHomePage.jsx`
- Create: `frontend/src/pages/solve/SolveHomePage.jsx`
- Create: `frontend/src/routers/routes.jsx`
- Modify: `frontend/src/App.jsx`

**Interfaces:**
- Consumes: `PrivateRoute`, `PublicRoute`, `useSessionStatus`(Task 13), `LoginPage`, `ChangePasswordPage`(Task 14)
- Produces: `classifyDevice(viewportWidth) : "mobile"|"pc"`, `canAccessAdmin({device, role}) : boolean`, `resolveLandingPath({device, role}) : string`, `useDeviceType() : "mobile"|"pc"`. `router`(react-router-dom `createBrowserRouter` 인스턴스) — Plan 2~5가 여기에 `/admin/**`, `/solve/**` 하위 라우트를 추가한다.

이 Task는 PRD 섹션 3.2 표를 그대로 코드화한다:

| 기기 | 역할 | 랜딩 | 관리자 화면 접근 |
|---|---|---|---|
| PC | SUPER_ADMIN/DEPT_ADMIN | `/admin` | 허용 |
| PC | EMPLOYEE | `/solve` | 차단 |
| 모바일 | 전 역할 | `/solve` | 차단 |

- [x] **Step 1: 순수 로직 실패하는 테스트 작성**

`frontend/src/utils/device.test.js`:
```javascript
import { test } from "node:test";
import assert from "node:assert/strict";
import { classifyDevice, MOBILE_BREAKPOINT } from "./device.js";

test("returns mobile below breakpoint", () => {
  assert.equal(classifyDevice(MOBILE_BREAKPOINT - 1), "mobile");
});

test("returns pc at breakpoint", () => {
  assert.equal(classifyDevice(MOBILE_BREAKPOINT), "pc");
});

test("returns pc above breakpoint", () => {
  assert.equal(classifyDevice(1920), "pc");
});
```

`frontend/src/utils/routing.test.js`:
```javascript
import { test } from "node:test";
import assert from "node:assert/strict";
import { canAccessAdmin, resolveLandingPath } from "./routing.js";

test("pc + SUPER_ADMIN can access admin", () => {
  assert.equal(canAccessAdmin({ device: "pc", role: "SUPER_ADMIN" }), true);
});

test("pc + DEPT_ADMIN can access admin", () => {
  assert.equal(canAccessAdmin({ device: "pc", role: "DEPT_ADMIN" }), true);
});

test("pc + EMPLOYEE cannot access admin", () => {
  assert.equal(canAccessAdmin({ device: "pc", role: "EMPLOYEE" }), false);
});

test("mobile + SUPER_ADMIN cannot access admin", () => {
  assert.equal(canAccessAdmin({ device: "mobile", role: "SUPER_ADMIN" }), false);
});

test("landing path for pc admin roles is /admin", () => {
  assert.equal(resolveLandingPath({ device: "pc", role: "SUPER_ADMIN" }), "/admin");
  assert.equal(resolveLandingPath({ device: "pc", role: "DEPT_ADMIN" }), "/admin");
});

test("landing path for pc employee is /solve", () => {
  assert.equal(resolveLandingPath({ device: "pc", role: "EMPLOYEE" }), "/solve");
});

test("landing path for any mobile role is /solve", () => {
  assert.equal(resolveLandingPath({ device: "mobile", role: "SUPER_ADMIN" }), "/solve");
  assert.equal(resolveLandingPath({ device: "mobile", role: "EMPLOYEE" }), "/solve");
});
```

- [x] **Step 2: 테스트 실행하여 실패 확인**

Run: `cd frontend && npm test`
Expected: FAIL — `device.js`, `routing.js` 파일이 없음

- [x] **Step 3: 순수 로직 구현**

`frontend/src/utils/device.js`:
```javascript
export const MOBILE_BREAKPOINT = 768;

export function classifyDevice(viewportWidth) {
  return viewportWidth < MOBILE_BREAKPOINT ? "mobile" : "pc";
}
```

`frontend/src/utils/routing.js`:
```javascript
const ADMIN_ROLES = ["SUPER_ADMIN", "DEPT_ADMIN"];

export function canAccessAdmin({ device, role }) {
  return device === "pc" && ADMIN_ROLES.includes(role);
}

export function resolveLandingPath({ device, role }) {
  return canAccessAdmin({ device, role }) ? "/admin" : "/solve";
}
```

- [x] **Step 4: 테스트 실행하여 통과 확인**

Run: `cd frontend && npm test`
Expected: 모든 테스트 통과

- [x] **Step 5: useDeviceType 훅, AdminRoute, Landing, 임시 페이지 작성**

`frontend/src/hooks/useDeviceType.js`:
```javascript
import { useEffect, useState } from "react";
import { classifyDevice } from "@/utils/device.js";

export function useDeviceType() {
  const [device, setDevice] = useState(() => classifyDevice(window.innerWidth));

  useEffect(() => {
    function handleResize() {
      setDevice(classifyDevice(window.innerWidth));
    }
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  return device;
}
```

`frontend/src/routers/AdminRoute.jsx`:
```javascript
import { Navigate, Outlet } from "react-router-dom";
import { useSessionStatus } from "@/hooks/useSessionStatus.js";
import { useDeviceType } from "@/hooks/useDeviceType.js";
import { canAccessAdmin } from "@/utils/routing.js";

export default function AdminRoute() {
  const { session } = useSessionStatus();
  const device = useDeviceType();

  if (!canAccessAdmin({ device, role: session?.role })) {
    return <Navigate to="/solve" replace />;
  }
  return <Outlet />;
}
```

`frontend/src/routers/Landing.jsx`:
```javascript
import { Navigate } from "react-router-dom";
import { useSessionStatus } from "@/hooks/useSessionStatus.js";
import { useDeviceType } from "@/hooks/useDeviceType.js";
import { resolveLandingPath } from "@/utils/routing.js";

export default function Landing() {
  const { session } = useSessionStatus();
  const device = useDeviceType();

  return <Navigate to={resolveLandingPath({ device, role: session?.role })} replace />;
}
```

`frontend/src/pages/admin/AdminHomePage.jsx` (Plan 3~5에서 실제 화면으로 교체될 임시 페이지):
```javascript
export default function AdminHomePage() {
  return <div className="p-6">관리자 대시보드 (추후 Plan에서 채워짐)</div>;
}
```

`frontend/src/pages/solve/SolveHomePage.jsx`:
```javascript
export default function SolveHomePage() {
  return <div className="p-6">문제 풀이 화면 (추후 Plan에서 채워짐)</div>;
}
```

- [x] **Step 6: 라우터 조립**

`frontend/src/routers/routes.jsx`:
```javascript
import { createBrowserRouter } from "react-router-dom";
import PrivateRoute from "@/routers/PrivateRoute.jsx";
import PublicRoute from "@/routers/PublicRoute.jsx";
import AdminRoute from "@/routers/AdminRoute.jsx";
import Landing from "@/routers/Landing.jsx";
import LoginPage from "@/pages/auth/LoginPage.jsx";
import ChangePasswordPage from "@/pages/auth/ChangePasswordPage.jsx";
import AdminHomePage from "@/pages/admin/AdminHomePage.jsx";
import SolveHomePage from "@/pages/solve/SolveHomePage.jsx";

export const router = createBrowserRouter([
  {
    element: <PublicRoute />,
    children: [{ path: "/login", element: <LoginPage /> }],
  },
  {
    element: <PrivateRoute />,
    children: [
      { index: true, element: <Landing /> },
      { path: "/change-password", element: <ChangePasswordPage /> },
      {
        path: "/admin",
        element: <AdminRoute />,
        children: [{ index: true, element: <AdminHomePage /> }],
      },
      { path: "/solve", element: <SolveHomePage /> },
    ],
  },
]);
```

`frontend/src/App.jsx`:
```javascript
import { RouterProvider } from "react-router-dom";
import { ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import { router } from "@/routers/routes.jsx";

export default function App() {
  return (
    <>
      <RouterProvider router={router} />
      <ToastContainer position="top-center" />
    </>
  );
}
```

- [x] **Step 7: 개발 서버로 수동 확인**

Run: `cd backend && ./gradlew bootRun --args='--spring.profiles.active=dev'` (터미널 1), `cd frontend && npm run dev` (터미널 2)
1. 브라우저 창을 768px 미만으로 좁혀 `http://localhost:5173` 접속 → `/login`으로 리다이렉트 확인
2. 부트스트랩된 총괄관리자 계정(`admin` / `application.yml`의 기본값)으로 로그인 → 최초 로그인이므로 `/change-password`로 이동 확인
3. 비밀번호 변경 후 창 폭을 768px 미만으로 좁힌 상태에서 재로그인 → `/solve`로 랜딩(모바일은 관리자도 관리자 화면 접근 불가) 확인
4. 창을 768px 이상으로 넓히고 새로고침 → `/admin`으로 랜딩 확인
Expected: 위 4가지 시나리오가 PRD 섹션 3.2 표대로 동작

- [x] **Step 8: Commit**

```bash
git add frontend/src/utils frontend/src/hooks/useDeviceType.js frontend/src/routers frontend/src/pages/admin frontend/src/pages/solve frontend/src/App.jsx
git commit -m "feat: add device/role-based routing"
```

---

## Self-Review 결과

- **Spec 커버리지:** PRD 섹션 3.1(사번/서버세션/최초비밀번호변경/계정잠금) → Task 6,8,9; 3.2(기기·역할 라우팅 표) → Task 15; 3.3(세션 보안) → Task 1,4; 8.2(Spring Boot/MyBatis/PostgreSQL/서버세션, `trend_one` 구조 참고) → Task 1~10; 7(프론트 구조 참고) → Task 11~15. 부서/계정/문제/통계/엑셀은 이 Plan의 범위가 아니며 Plan 2~5에서 다룬다(아래 "다음 Plan" 참고).
- **플레이스홀더 스캔:** "TBD"/"추후 구현" 문구 없음 (임시 페이지는 다음 Plan에서 교체될 것임을 명시적으로 주석에 남김).
- **타입/시그니처 일관성:** `AuthUser` 생성자 시그니처(`userId, employeeNo, name, role, departmentId, mustChangePassword`)를 Task 4, 6, 8, 10에서 동일하게 사용. `SessionStatusResponse`의 `role`/`departmentId` 필드명이 프론트 `utils/routing.js`의 `{device, role}` 파라미터와 일치함을 확인.
- **후속 Plan 연계:** 회사 이메일 필수/메일 발송, 태그·문제태그·DB 감사 로그 3종 테이블, HTTP 401/403 규약을 Plan 2~5의 API·테스트가 공통으로 사용한다.

## 다음 Plan

이 Plan은 로그인/세션/역할·기기 라우팅까지만 다룬다. 아래는 후속 Plan으로 분리한다 (각 Plan은 이 Plan이 끝난 뒤 실행):

- Plan 2: 부서/계정 관리 (총괄관리자 전용 CRUD + 계정 엑셀 일괄 등록)
- Plan 3: 문제 은행 관리 (5개 문제 유형 CRUD, 개별입력 + 엑셀 업로드)
- Plan 4: 문제 풀이 (직원용 풀이 화면, 유형별 채점, 본인 이력)
- Plan 5: 통계 (문제별 정답률 리포트)
