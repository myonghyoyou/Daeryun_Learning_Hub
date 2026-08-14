# 출처 번호 표기와 랜덤 50문제 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 문제마다 "어느 팀의 몇 번인지"를 저장·표기해 종이 문제은행과 대조할 수 있게 하고, 랜덤 풀이에 50문제 선택지를 추가한다.

**Architecture:** 영역은 새 개념이 아니라 **기존 부서**다. `problems` 에 `source_number INT` 하나만 더하고 `UNIQUE(department_id, source_number)` 로 묶는다. 번호의 필수 여부는 DB 가 아니라 **서비스 계층이 검증**한다 — `schema.sql` 이 `CREATE TABLE IF NOT EXISTS` 라 기존 테이블을 바꾸지 못하고, DB `NOT NULL` 위반은 한국어 안내 없이 500 으로 끝나기 때문이다. 표기는 학습자 조회 3경로(단건 상세·목록·이력)에 부서명과 번호를 실어 화면 4곳이 같은 배지를 쓴다.

**Tech Stack:** Java 8 / Spring Boot 2.7.3 / MyBatis / PostgreSQL, React 19 / Vite / Tailwind 4. 테스트는 JUnit 5 + Mockito(백엔드 단위), `@SpringBootTest @Transactional`(DAO 왕복), Node 내장 러너 `node --test`(프론트엔드).

**전제 조건:** Plan 5(통계)까지 master 에 머지되어 있어야 한다.

**근거 문서:** `docs/superpowers/specs/2026-08-13-source-number-and-random-50.md` — 결정 10건(D1~D10)과 그 근거가 있다. 이 계획서와 어긋나면 그 문서가 우선이다.

---

## Global Constraints

이 절의 값은 모든 Task 의 요구사항에 암묵적으로 포함된다.

### 데이터 규칙

- **영역 = 부서.** `source_section` 같은 컬럼을 만들지 않는다. 표기에 쓰는 이름은 `departments.name` 이다.
- **번호는 등록·수정 모두 필수.** 같은 규칙을 두 경로에 똑같이 적용한다.
- **같은 부서에 같은 번호는 거부.** `UNIQUE(department_id, source_number)`.
- **번호는 재사용하지 않는다.** 보관(ARCHIVED)된 문제도 번호를 점유한다. "마지막 번호"를 구할 때 상태로 거르지 않는다.
- **부서를 옮기면 새 부서의 마지막+1로 자동 재부여**하고, 바뀐 번호를 호출부에 돌려준다.
- 번호는 **1 이상**의 정수다. 0 과 음수는 거부한다.

### 필수 여부를 DB 가 아니라 서비스에서 검증하는 이유

`application.yml` 의 `spring.sql.init.mode: always` 가 부팅마다 `schema.sql` 을 실행하지만, 모든 DDL 이 `CREATE TABLE IF NOT EXISTS` 라 **이미 있는 테이블은 절대 바뀌지 않는다.** 컬럼 추가는 별도 마이그레이션 스크립트로만 들어간다(Task 1). 그리고 DB `NOT NULL` 위반은 `GlobalExceptionHandler` 의 마지막 `@ExceptionHandler(Exception.class)` 로 떨어져 `MSG_PROC_FAIL(-1)` "처리 중 오류가 발생하였습니다"가 된다 — 무엇이 잘못됐는지 사용자에게 아무것도 알려주지 못한다.

`UNIQUE` 제약은 반대로 **DB 에 건다.** 검사-후-삽입에는 경합이 있고, 제약이 최후의 방어선이기 때문이다. 단 위반을 그대로 두면 위와 같은 -1 이 나가므로 서비스가 `DuplicateKeyException` 을 잡아 한국어 메시지로 바꾼다.

> PostgreSQL 의 `UNIQUE` 는 NULL 을 서로 다른 값으로 본다. 그래서 번호가 비어 있는 기존 14건이 여러 개 있어도 제약을 거는 데 문제가 없다.

### 화면 규칙

- **Tailwind 기본 팔레트 금지.** `text-gray-500`, `bg-blue-600` 등을 직접 쓰지 않는다(`frontend/src/styles/tokens.css`). 디자인 토큰과 공용 컴포넌트만 쓴다.
- **`<Link>` 가 `<Button>` 을 감쌀 수 없다.** 버튼처럼 보이는 링크는 `buttonClass({variant, size})`.
- 문제 본문을 표시하는 자리에는 **`previewContent()`** 를 쓴다(`{{b1}}` 마커 노출 방지).
- 출처 배지는 **유형 배지 옆 회색**(`ink-muted` 계열). 유형은 파란 계열(info)로 두어 성격과 위치가 구분된다.
- 표기 범위는 **학습자 경로 4곳**: 풀이 화면 · 문제 목록 · 풀이 이력 · 랜덤 결과 요약. 관리자 화면은 입력만 하고 표시는 지금 그대로 둔다.

### 테스트 제약

이 저장소에는 **jsdom 이 없어 React 컴포넌트를 단위 테스트할 수 없다.** alias(`@/`)를 쓰지 않는 `frontend/src/utils/*.js` 만 `node --test` 로 검증된다. 화면에 들어갈 판정·변환 로직은 반드시 `utils` 로 빼고 테스트를 붙인다.

SQL 은 **DAO 왕복 테스트**로 검증한다. 서비스 단위 테스트는 DAO 를 목으로 대체하므로 매핑을 전혀 거치지 않는다. `backend/src/test/java/com/daeryun/probank/dao/AttemptDaoTest.java` 가 그 이유를 자기 주석에 적어 두었고, 이 저장소에는 그런 테스트가 이미 6개 있다.

### 컨트롤러 규약

로그인 사용자는 **`@LoginUser AuthUser actor`** 파라미터로 받는다. `HttpServletRequest` + `SessionKeys` 를 쓰지 않는다.

---

## File Structure

### 백엔드 — 생성

| 경로 | 책임 |
|---|---|
| `backend/db/migration/2026-08-14-add-source-number.sql` | 컬럼·제약 추가(기존 DB 용) |
| `backend/src/test/java/com/daeryun/probank/dao/ProblemSourceNumberDaoTest.java` | 새 SQL 왕복 검증 |

### 백엔드 — 수정

| 경로 | 변경 |
|---|---|
| `resources/schema.sql` | `problems` 에 `source_number` + `UNIQUE` (새로 만드는 DB 용) |
| `domain/Problem.java` | `sourceNumber` 필드 |
| `dto/problem/ProblemCreateRequest.java` | `sourceNumber` 필드 |
| `dto/problem/ProblemDetailResponse.java` | `sourceNumber` 필드(수정 폼이 다시 채우려면 필요) |
| `dto/solve/ProblemSolveDetailResponse.java` | `departmentName`, `sourceNumber` |
| `dto/solve/ProblemSolveListItem.java` | `departmentName`, `sourceNumber` |
| `dto/solve/AttemptHistoryItem.java` | `departmentName`, `sourceNumber` |
| `dao/ProblemDao.java` + `mappers/probank/ProblemMapper.xml` | `findMaxSourceNumber`, insert/update/솔브 조회에 컬럼 반영 |
| `mappers/probank/AttemptMapper.xml` | 이력 조회에 부서명·번호 |
| `service/ProblemServiceImpl.java` | 검증·중복 변환·부서 이동 시 재부여 |
| `service/ProblemService.java` | `nextSourceNumber`, `changeDepartment` 반환형 |
| `service/SolveServiceImpl.java` | 상세 응답에 부서명·번호 |
| `service/ExcelProblemUploadServiceImpl.java` | 13번째 컬럼 |
| `controller/ProblemController.java` | 다음 번호 조회 엔드포인트 |

### 프론트엔드 — 생성

| 경로 | 책임 |
|---|---|
| `components/ui/SourceBadge.jsx` | "정보시스템 3번" 배지 |
| `utils/sourceLabel.js` (+ `.test.js`) | 배지 문구를 만드는 순수 함수 |

### 프론트엔드 — 수정

| 경로 | 변경 |
|---|---|
| `api/problems.js` | `fetchNextSourceNumber` |
| `utils/problemFormPayload.js` (+ `.test.js`) | `sourceNumber` 포함 |
| `utils/solveSession.js` (+ `.test.js`) | 세션에 부서명·번호 보존 |
| `pages/admin/problems/ProblemFormPage.jsx` | 번호 입력 + 자동 기본값 |
| `pages/solve/RandomSetupPage.jsx` | `50문제` 옵션 |
| `components/solve/ProblemSolveCard.jsx` | 배지 |
| `pages/solve/SolveProblemListPage.jsx` | 배지 |
| `pages/solve/AttemptHistoryPage.jsx` | 배지(표·카드 양쪽) |
| `pages/solve/RandomResultPage.jsx` | 배지 |

---

# Part 1 — 백엔드

## Task 1: 컬럼·제약과 등록/수정 검증

**Files:**
- Modify: `backend/src/main/resources/schema.sql`
- Create: `backend/db/migration/2026-08-14-add-source-number.sql`
- Modify: `backend/src/main/java/com/daeryun/probank/domain/Problem.java`
- Modify: `backend/src/main/java/com/daeryun/probank/dto/problem/ProblemCreateRequest.java`
- Modify: `backend/src/main/java/com/daeryun/probank/dto/problem/ProblemDetailResponse.java`
- Modify: `backend/src/main/resources/mappers/probank/ProblemMapper.xml`
- Modify: `backend/src/main/java/com/daeryun/probank/service/ProblemServiceImpl.java`
- Test: `backend/src/test/java/com/daeryun/probank/service/ProblemServiceImplTest.java`

**Interfaces:**
- Consumes: `Problem`, `ProblemCreateRequest`, `OwningDepartmentResolver`(모두 Plan 3)
- Produces: `problems.source_number` 컬럼과 `UNIQUE(department_id, source_number)`. `Problem.getSourceNumber()`, `ProblemCreateRequest.getSourceNumber()`, `ProblemDetailResponse.sourceNumber`. Task 2·3·4·5·6이 쓴다.

- [ ] **Step 1: 스키마에 컬럼과 제약 추가**

`backend/src/main/resources/schema.sql` 의 `problems` 테이블 정의를 아래로 교체한다(`updated_at` 다음 줄에 제약을 더한다):

```sql
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
    -- 출처(종이 문제은행)에서의 문항 번호. 영역은 department_id 가 겸한다.
    --
    -- NOT NULL 을 걸지 않는 것은 의도다. 필수 여부는 ProblemServiceImpl 이 검증해
    -- 한국어 안내를 돌려준다 — DB 제약 위반은 GlobalExceptionHandler 의 마지막
    -- 그물에 걸려 "처리 중 오류가 발생하였습니다"(-1) 로만 나가 원인을 알려주지 못한다.
    -- 반면 UNIQUE 는 DB 에 건다. 검사-후-삽입에는 경합이 있어 제약이 최후의 방어선이다.
    -- PostgreSQL 의 UNIQUE 는 NULL 을 서로 다른 값으로 보므로, 번호가 비어 있는 기존
    -- 행이 여럿이어도 제약을 거는 데 지장이 없다.
    source_number INT,
    created_by BIGINT NOT NULL REFERENCES users(id),
    created_at TIMESTAMP NOT NULL DEFAULT now(),
    updated_at TIMESTAMP NOT NULL DEFAULT now(),
    CONSTRAINT uq_problems_department_source_number UNIQUE (department_id, source_number)
);
```

- [ ] **Step 2: 기존 DB 용 마이그레이션 스크립트 작성**

`schema.sql` 은 `IF NOT EXISTS` 라서 **이미 있는 테이블을 바꾸지 않는다.** 개발 DB 에는 이 스크립트로 넣는다.

`backend/db/migration/2026-08-14-add-source-number.sql`:
```sql
-- problems 에 출처 문항 번호를 추가한다. 영역은 department_id 가 겸하므로 컬럼은 하나다.
--
-- schema.sql 은 CREATE TABLE IF NOT EXISTS 라 이미 있는 테이블을 바꾸지 못한다.
-- 새로 만드는 DB 는 schema.sql 이, 이미 있는 DB 는 이 스크립트가 담당한다.
-- 둘을 함께 고쳐라.
--
-- 실행:
--   docker exec -i -e PGPASSWORD=probank_dev probank-postgres \
--     psql -U probank -d probank_dev -v ON_ERROR_STOP=1 \
--     < backend/db/migration/2026-08-14-add-source-number.sql
--
-- 두 문장 모두 IF NOT EXISTS 라 재실행해도 안전하다.

BEGIN;

ALTER TABLE problems ADD COLUMN IF NOT EXISTS source_number INT;

-- 기존 행의 source_number 는 NULL 이고, PostgreSQL 의 UNIQUE 는 NULL 을 서로 다른
-- 값으로 보므로 여러 행이 비어 있어도 충돌하지 않는다.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'uq_problems_department_source_number'
    ) THEN
        ALTER TABLE problems
            ADD CONSTRAINT uq_problems_department_source_number
            UNIQUE (department_id, source_number);
    END IF;
END $$;

COMMIT;
```

- [ ] **Step 3: 도메인·DTO 에 필드 추가**

`domain/Problem.java` 의 `department_id` 대응 필드 아래에 추가한다:
```java
    /** 출처(종이 문제은행)에서의 문항 번호. 영역은 departmentId 가 겸한다. */
    private Integer sourceNumber;
```

`dto/problem/ProblemCreateRequest.java` 에 추가한다:
```java
    private Integer sourceNumber;
```

> `departmentId` 와 달리 `sourceNumber` 는 이 DTO 에 넣는다. 부서는 등록에서만 정하고 수정에서 못 바꾸게 하려고 별도 파라미터로 뺐지만(기존 주석 참고), 번호는 **등록과 수정 모두에서 바꿀 수 있어야 하므로** 본문에 있는 것이 맞다.

`dto/problem/ProblemDetailResponse.java` 에 필드를 추가하고 `of(...)` 에서 채운다. 수정 폼이 기존 번호를 다시 그려야 하기 때문이다:
```java
    private Integer sourceNumber;
```

- [ ] **Step 4: 매퍼에 컬럼 반영**

`ProblemMapper.xml` 의 `insert` · `update` · `findById` 를 아래로 교체한다:

```xml
    <insert id="insert" parameterType="Problem" useGeneratedKeys="true" keyProperty="id">
        INSERT INTO problems
            (type, content, image_url, reference_text, explanation, blank_reveal_count, status,
             department_id, source_number, created_by)
        VALUES
            (#{type}, #{content}, #{imageUrl}, #{referenceText}, #{explanation}, #{blankRevealCount}, #{status},
             #{departmentId}, #{sourceNumber}, #{createdBy})
    </insert>
```
```xml
    <update id="update" parameterType="Problem">
        UPDATE problems
        SET content = #{content}, image_url = #{imageUrl}, reference_text = #{referenceText},
            explanation = #{explanation}, blank_reveal_count = #{blankRevealCount},
            source_number = #{sourceNumber}, updated_at = now()
        WHERE id = #{id}
    </update>
```
`findById` 의 컬럼 목록에 `source_number` 를 더한다:
```xml
    <select id="findById" resultType="Problem">
        SELECT id, type, content, image_url, reference_text, explanation, blank_reveal_count,
               status, department_id, source_number, created_by, created_at, updated_at
        FROM problems WHERE id = #{id}
    </select>
```

- [ ] **Step 5: 실패하는 테스트 작성**

`ProblemServiceImplTest` 에 추가한다. 이 파일의 실제 헬퍼는 `shortAnswerRequest()` · `shortAnswerRequest(String imageUrl)` · `existingShortAnswer()`(id=5, departmentId=10, SHORT_ANSWER) · `choice(...)` · `listCaptor()` 다.

> **`OwningDepartmentResolver` 는 목이 아니라 실물이다**(`setUp()` 의 주석이 이유를 적어 두었다). 그런데 `resolve()` 는 부서 관리자면 `departmentDao` 를 조회하지 않고 `actor.getDepartmentId()` 를 바로 돌려준다. 테스트의 `actor` 가 DEPT_ADMIN(부서 10) 이므로 **아래 테스트들은 `departmentDao` 스텁이 필요 없다.**

```java
    @Test
    void create_withoutSourceNumber_isRejected() {
        ProblemCreateRequest request = shortAnswerRequest();
        request.setSourceNumber(null);

        BizException thrown = assertThrows(BizException.class, () -> service.create(request, null, actor));

        assertEquals(ErrorCode.INPUT_VALUE_INVALID, thrown.getErrorCode());
        Mockito.verify(problemDao, Mockito.never()).insert(Mockito.any());
    }

    @Test
    void create_withZeroOrNegativeSourceNumber_isRejected() {
        for (int bad : new int[]{0, -1}) {
            ProblemCreateRequest request = shortAnswerRequest();
            request.setSourceNumber(bad);
            assertThrows(BizException.class, () -> service.create(request, null, actor));
        }
    }

    @Test
    void update_withoutSourceNumber_isRejectedToo() {
        // 등록과 수정에 같은 규칙을 적용한다. 예외를 기억하지 않아도 되도록.
        Mockito.when(problemDao.findById(5L)).thenReturn(existingShortAnswer());
        ProblemCreateRequest request = shortAnswerRequest();
        request.setSourceNumber(null);

        assertThrows(BizException.class, () -> service.update(5L, request, actor));
    }

    @Test
    void create_persistsSourceNumber() {
        ProblemCreateRequest request = shortAnswerRequest();
        request.setSourceNumber(7);

        service.create(request, null, actor);

        ArgumentCaptor<Problem> captor = ArgumentCaptor.forClass(Problem.class);
        Mockito.verify(problemDao).insert(captor.capture());
        assertEquals(Integer.valueOf(7), captor.getValue().getSourceNumber());
    }

    @Test
    void create_duplicateNumber_isReportedInKoreanNotAsGenericFailure() {
        // DB UNIQUE 위반을 그대로 두면 GlobalExceptionHandler 의 마지막 그물에 걸려
        // "처리 중 오류가 발생하였습니다"(-1) 가 나간다 — 무엇이 문제인지 알 수 없다.
        ProblemCreateRequest request = shortAnswerRequest();
        request.setSourceNumber(12);
        Mockito.doThrow(new DuplicateKeyException("uq_problems_department_source_number"))
                .when(problemDao).insert(Mockito.any());

        BizException thrown = assertThrows(BizException.class, () -> service.create(request, null, actor));

        assertEquals(ErrorCode.INPUT_VALUE_INVALID, thrown.getErrorCode());
        assertTrue(thrown.getMessage().contains("12"), "메시지가 어떤 번호가 겹쳤는지 알려야 한다: " + thrown.getMessage());
    }

    @Test
    void create_duplicateFromAnotherConstraint_isNotBlamedOnTheNumber() {
        // 이 테이블의 다른 UNIQUE 위반까지 "번호가 겹쳤다"고 말하면 엉뚱한 곳을 고치게 된다.
        ProblemCreateRequest request = shortAnswerRequest();
        request.setSourceNumber(12);
        DuplicateKeyException other = new DuplicateKeyException("uq_some_other_constraint");
        Mockito.doThrow(other).when(problemDao).insert(Mockito.any());

        assertThrows(DuplicateKeyException.class, () -> service.create(request, null, actor));
    }
```

> `create_duplicateNumber_...` 에서 `departmentDao.findById(10L)` 은 스텁하지 않았으므로 목이 `null` 을 돌려주고, 메시지의 부서명 자리에 `"해당 부서"` 가 들어간다. 단언은 번호만 보므로 통과한다 — 구현의 null 처리가 실제로 동작하는지도 함께 확인된다.

- [ ] **Step 6: 테스트 실행하여 실패 확인**

Run: `cd backend && ./gradlew test --tests '*ProblemServiceImplTest*'`
Expected: FAIL — `setSourceNumber` 가 없어 컴파일 오류, 또는 검증이 없어 단언 실패

- [ ] **Step 7: 검증과 중복 변환 구현**

`ProblemServiceImpl` 에 상수와 헬퍼를 추가한다:
```java
    private static final String SOURCE_NUMBER_UNIQUE_CONSTRAINT = "uq_problems_department_source_number";

    /**
     * 번호는 등록·수정 모두 필수다(spec D2). 규칙이 하나여서 예외를 기억할 필요가 없다.
     * 0 과 음수는 종이 문제은행의 문항 번호가 될 수 없다.
     */
    private void validateSourceNumber(Integer sourceNumber) {
        if (sourceNumber == null) {
            throw new BizException(ErrorCode.INPUT_VALUE_INVALID, "문항 번호를 입력하세요.");
        }
        if (sourceNumber < 1) {
            throw new BizException(ErrorCode.INPUT_VALUE_INVALID, "문항 번호는 1 이상이어야 합니다.");
        }
    }

    /**
     * UNIQUE(department_id, source_number) 위반을 사람이 읽는 메시지로 바꾼다.
     * 그대로 두면 GlobalExceptionHandler 의 @ExceptionHandler(Exception.class) 에 걸려
     * MSG_PROC_FAIL(-1) "처리 중 오류가 발생하였습니다" 로만 나간다.
     */
    private BizException duplicateSourceNumber(DuplicateKeyException cause, Long departmentId, Integer sourceNumber) {
        if (cause.getMessage() != null && !cause.getMessage().contains(SOURCE_NUMBER_UNIQUE_CONSTRAINT)) {
            // 이 테이블의 다른 UNIQUE 위반이면 번호 탓으로 돌리지 않는다.
            throw cause;
        }
        Department department = departmentDao.findById(departmentId);
        String departmentName = department == null ? "해당 부서" : department.getName();
        return new BizException(ErrorCode.INPUT_VALUE_INVALID,
                departmentName + " " + sourceNumber + "번은 이미 있습니다. 다른 번호를 입력하세요.");
    }
```

import 를 추가한다:
```java
import org.springframework.dao.DuplicateKeyException;
```

`create(...)` 에서 `validate(request);` 바로 다음 줄에 추가한다:
```java
        validateSourceNumber(request.getSourceNumber());
```
그리고 `problem.setDepartmentId(owningDepartmentId);` 다음 줄에 추가한다:
```java
        problem.setSourceNumber(request.getSourceNumber());
```
`problemDao.insert(problem);` 를 아래로 교체한다:
```java
        try {
            problemDao.insert(problem);
        } catch (DuplicateKeyException e) {
            throw duplicateSourceNumber(e, owningDepartmentId, request.getSourceNumber());
        }
```

`update(...)` 에서 `validate(request);` 다음 줄에 추가한다:
```java
        validateSourceNumber(request.getSourceNumber());
```
그리고 `existing.setBlankRevealCount(...)` 다음 줄에 추가한다:
```java
        existing.setSourceNumber(request.getSourceNumber());
```
`problemDao.update(existing);` 를 아래로 교체한다:
```java
        try {
            problemDao.update(existing);
        } catch (DuplicateKeyException e) {
            throw duplicateSourceNumber(e, existing.getDepartmentId(), request.getSourceNumber());
        }
```

- [ ] **Step 8: 기존 테스트의 요청 빌더에 번호를 채운다**

번호가 필수가 되어 `ProblemServiceImplTest` 의 기존 등록·수정 테스트가 전부 깨진다. **하나씩 손으로 고치지 말고**, 요청을 만드는 공통 지점(헬퍼 메서드나 각 테스트의 요청 생성부)에 `request.setSourceNumber(1);` 를 넣어 통과시킨다. 유효한 요청이 무엇인지에 대한 정의가 바뀐 것이지, 각 테스트의 의도가 바뀐 것이 아니다.

Run: `cd backend && ./gradlew test --tests '*ProblemServiceImplTest*'`
Expected: `BUILD SUCCESSFUL` — 기존 테스트와 신규 5건이 모두 통과

- [ ] **Step 9: 마이그레이션 적용과 확인**

```bash
cd c:/projects/daeryun-learning-hub && docker exec -i -e PGPASSWORD=probank_dev probank-postgres \
  psql -U probank -d probank_dev -v ON_ERROR_STOP=1 \
  < backend/db/migration/2026-08-14-add-source-number.sql
```

확인:
```bash
docker exec -e PGPASSWORD=probank_dev probank-postgres psql -U probank -d probank_dev -c "
SELECT column_name, data_type, is_nullable FROM information_schema.columns
WHERE table_name='problems' AND column_name='source_number';" -c "
SELECT conname FROM pg_constraint WHERE conname='uq_problems_department_source_number';"
```
Expected: 컬럼 `source_number / integer / YES`, 제약 1건.

NULL 이 여럿이어도 제약이 걸리는지 직접 확인한다:
```bash
docker exec -e PGPASSWORD=probank_dev probank-postgres psql -U probank -d probank_dev -c "
SELECT count(*) AS rows_with_null_source FROM problems WHERE source_number IS NULL;"
```
Expected: 14 — 이 값이 여럿인데도 제약 생성이 성공했다는 것이 "PostgreSQL 의 UNIQUE 는 NULL 을 구분한다"의 실제 확인이다.

- [ ] **Step 10: Commit**

```bash
git add backend/src/main/resources/schema.sql backend/db/migration/2026-08-14-add-source-number.sql backend/src/main/java/com/daeryun/probank/domain/Problem.java backend/src/main/java/com/daeryun/probank/dto/problem/ProblemCreateRequest.java backend/src/main/java/com/daeryun/probank/dto/problem/ProblemDetailResponse.java backend/src/main/resources/mappers/probank/ProblemMapper.xml backend/src/main/java/com/daeryun/probank/service/ProblemServiceImpl.java backend/src/test/java/com/daeryun/probank/service/ProblemServiceImplTest.java
git commit -m "feat: store the source question number on problems"
```

---

## Task 2: 다음 번호 조회 API

**Files:**
- Modify: `backend/src/main/java/com/daeryun/probank/dao/ProblemDao.java`
- Modify: `backend/src/main/resources/mappers/probank/ProblemMapper.xml`
- Modify: `backend/src/main/java/com/daeryun/probank/service/ProblemService.java`
- Modify: `backend/src/main/java/com/daeryun/probank/service/ProblemServiceImpl.java`
- Modify: `backend/src/main/java/com/daeryun/probank/controller/ProblemController.java`
- Test: `backend/src/test/java/com/daeryun/probank/service/ProblemServiceImplTest.java`

**Interfaces:**
- Consumes: `ProblemDao`(Task 1), `OwningDepartmentResolver`
- Produces: `GET /api/admin/problems/next-source-number?departmentId=` → `{ "data": 13 }`. `ProblemService.nextSourceNumber(Long departmentId, AuthUser actor) : int`. Task 3(부서 이동)과 Task 6(등록 폼)이 쓴다.

- [ ] **Step 1: 실패하는 테스트 작성**

```java
    @Test
    void nextSourceNumber_isLastPlusOne() {
        Mockito.when(problemDao.findMaxSourceNumber(10L)).thenReturn(12);

        assertEquals(13, service.nextSourceNumber(10L, actor));
    }

    @Test
    void nextSourceNumber_firstProblemInDepartment_isOne() {
        // 아직 번호가 하나도 없으면 SQL 의 MAX 가 NULL 을 돌려준다.
        Mockito.when(problemDao.findMaxSourceNumber(10L)).thenReturn(null);

        assertEquals(1, service.nextSourceNumber(10L, actor));
    }

    @Test
    void nextSourceNumber_deptAdminIsForcedToOwnDepartment() {
        // 요청한 999 를 버리고 세션 부서(10)로 조회해야 한다.
        AuthUser deptAdmin = new AuthUser(1L, "1001", "부서관리자", UserRole.DEPT_ADMIN, 10L, false);
        Mockito.when(problemDao.findMaxSourceNumber(10L)).thenReturn(3);

        assertEquals(4, service.nextSourceNumber(999L, deptAdmin));

        Mockito.verify(problemDao).findMaxSourceNumber(10L);
        Mockito.verify(problemDao, Mockito.never()).findMaxSourceNumber(999L);
    }
```

- [ ] **Step 2: 테스트 실행하여 실패 확인**

Run: `cd backend && ./gradlew test --tests '*ProblemServiceImplTest*'`
Expected: FAIL — `findMaxSourceNumber` / `nextSourceNumber` 가 없어 컴파일 오류

- [ ] **Step 3: DAO·매퍼 추가**

`ProblemDao` 에 추가한다:
```java
    /**
     * 그 부서에서 가장 큰 문항 번호. 없으면 null.
     * 보관(ARCHIVED)된 문제도 번호를 점유하므로 상태로 거르지 않는다(spec D5).
     */
    Integer findMaxSourceNumber(@Param("departmentId") Long departmentId);
```

`ProblemMapper.xml` 의 `</mapper>` 앞에 추가한다:
```xml
    <!-- 상태로 거르지 않는다. 보관된 문제도 번호를 점유하고 번호는 재사용하지 않는다(spec D5).
         걸러 내면 보관된 12번과 같은 번호를 새로 발급해 UNIQUE 제약에 걸린다. -->
    <select id="findMaxSourceNumber" resultType="java.lang.Integer">
        SELECT MAX(source_number) FROM problems WHERE department_id = #{departmentId}
    </select>
```

- [ ] **Step 4: 서비스·컨트롤러 구현**

`ProblemService` 에 추가한다:
```java
    int nextSourceNumber(Long departmentId, AuthUser actor);
```

`ProblemServiceImpl` 에 추가한다:
```java
    /**
     * 등록 폼이 번호 칸을 미리 채우는 데 쓴다. 서버가 저장 시점에 자동으로 채우지는
     * 않는다 — 관리자가 종이 문서를 보고 다른 번호로 고칠 수 있어야 하기 때문이다.
     *
     * 두 명이 동시에 열면 같은 값을 받는다. 그건 UNIQUE 제약이 막고, 나중에 저장한
     * 쪽이 "…12번은 이미 있습니다" 를 받는다(Task 1).
     */
    @Override
    public int nextSourceNumber(Long departmentId, AuthUser actor) {
        Long scope = owningDepartmentResolver.resolve(departmentId, actor);
        Integer max = problemDao.findMaxSourceNumber(scope);
        return max == null ? 1 : max + 1;
    }
```

`ProblemController` 에 추가한다:
```java
    @GetMapping("/next-source-number")
    public ResponseEntity<ResponseDto<?>> nextSourceNumber(@RequestParam(required = false) Long departmentId,
                                                             @LoginUser AuthUser actor) {
        return ResponseEntity.ok(ResponseDto.ok(problemService.nextSourceNumber(departmentId, actor)));
    }
```

> **경로 순서 주의**: `@GetMapping("/next-source-number")` 는 `@GetMapping("/{id}")` 와 같은 클래스에 있다. Spring 은 선언 순서가 아니라 **구체성**으로 매칭하므로 리터럴 경로가 이긴다. 순서를 바꿀 필요가 없다.

- [ ] **Step 5: 테스트 실행하여 통과 확인**

Run: `cd backend && ./gradlew test --tests '*ProblemServiceImplTest*'`
Expected: `BUILD SUCCESSFUL`

- [ ] **Step 6: Commit**

```bash
git add backend/src/main/java/com/daeryun/probank/dao/ProblemDao.java backend/src/main/resources/mappers/probank/ProblemMapper.xml backend/src/main/java/com/daeryun/probank/service/ProblemService.java backend/src/main/java/com/daeryun/probank/service/ProblemServiceImpl.java backend/src/main/java/com/daeryun/probank/controller/ProblemController.java backend/src/test/java/com/daeryun/probank/service/ProblemServiceImplTest.java
git commit -m "feat: add an endpoint for the next source number in a department"
```

---

## Task 3: 부서 이동 시 번호 자동 재부여

**Files:**
- Modify: `backend/src/main/java/com/daeryun/probank/service/ProblemService.java`
- Modify: `backend/src/main/java/com/daeryun/probank/service/ProblemServiceImpl.java`
- Modify: `backend/src/main/resources/mappers/probank/ProblemMapper.xml`
- Modify: `backend/src/main/java/com/daeryun/probank/dao/ProblemDao.java`
- Modify: `backend/src/main/java/com/daeryun/probank/controller/ProblemController.java`
- Test: `backend/src/test/java/com/daeryun/probank/service/ProblemServiceImplTest.java`

**Interfaces:**
- Consumes: `findMaxSourceNumber`(Task 2)
- Produces: `changeDepartment` 가 새 번호를 돌려준다. `PUT /api/admin/problems/{id}/department` 응답 본문에 `{ "sourceNumber": 12 }`. Task 6(폼)이 안내 문구에 쓴다.

> 이 Task 가 없으면 부서 이동이 `UNIQUE` 위반으로 실패한다. `회계 5번` 을 `자금` 으로 옮기는데 자금에 이미 5번이 있으면 그렇다.

- [ ] **Step 1: 실패하는 테스트 작성**

부서 픽스처는 기존 부서 이동 테스트(파일의 688행 부근)가 쓰는 방식을 그대로 따른다 — `new Department()` 를 만들고 `setStatus(Status.ACTIVE)` 를 준 뒤 `departmentDao.findById(...)` 에 물린다.

```java
    private Department activeDepartment(Long id, String name) {
        Department department = new Department();
        department.setId(id);
        department.setName(name);
        department.setStatus(Status.ACTIVE);
        return department;
    }

    @Test
    void changeDepartment_reassignsNumberToTailOfNewDepartment() {
        Problem existing = existingShortAnswer();   // id=5, departmentId=10
        existing.setSourceNumber(5);
        Mockito.when(problemDao.findById(5L)).thenReturn(existing);
        Mockito.when(departmentDao.findById(20L)).thenReturn(activeDepartment(20L, "자금팀"));
        Mockito.when(problemDao.findMaxSourceNumber(20L)).thenReturn(11);

        int assigned = service.changeDepartment(5L, 20L, actor);

        assertEquals(12, assigned);
        Mockito.verify(problemDao).updateDepartmentAndSourceNumber(5L, 20L, 12);
    }

    @Test
    void changeDepartment_intoEmptyDepartment_startsAtOne() {
        Problem existing = existingShortAnswer();
        existing.setSourceNumber(5);
        Mockito.when(problemDao.findById(5L)).thenReturn(existing);
        Mockito.when(departmentDao.findById(20L)).thenReturn(activeDepartment(20L, "자금팀"));
        Mockito.when(problemDao.findMaxSourceNumber(20L)).thenReturn(null);

        assertEquals(1, service.changeDepartment(5L, 20L, actor));
    }
```

> `activeDepartment(...)` 헬퍼가 아직 없으면 위 코드처럼 추가한다. 기존 이동 테스트 세 곳이 같은 세 줄을 인라인으로 반복하고 있으므로, 헬퍼로 뽑고 그 세 곳도 함께 바꾸면 좋다.

- [ ] **Step 2: 테스트 실행하여 실패 확인**

Run: `cd backend && ./gradlew test --tests '*ProblemServiceImplTest*'`
Expected: FAIL — `changeDepartment` 가 `void` 이고 `updateDepartmentAndSourceNumber` 가 없다

- [ ] **Step 3: DAO 를 부서·번호 동시 갱신으로 바꾼다**

`ProblemDao` 의 `updateDepartment` 를 아래로 교체한다:
```java
    /**
     * 부서와 문항 번호를 함께 바꾼다. 부서만 바꾸면 옮겨 간 부서에 같은 번호가 있을 때
     * UNIQUE 제약에 걸리므로, 이동과 재부여는 한 문장이어야 한다.
     */
    void updateDepartmentAndSourceNumber(@Param("id") Long id,
                                          @Param("departmentId") Long departmentId,
                                          @Param("sourceNumber") Integer sourceNumber);
```

`ProblemMapper.xml` 의 `updateDepartment` 를 아래로 교체한다:
```xml
    <update id="updateDepartmentAndSourceNumber">
        UPDATE problems
        SET department_id = #{departmentId}, source_number = #{sourceNumber}, updated_at = now()
        WHERE id = #{id}
    </update>
```

- [ ] **Step 4: 서비스·컨트롤러 수정**

`ProblemService` 의 시그니처를 바꾼다:
```java
    /** @return 새 부서에서 새로 부여된 문항 번호 */
    int changeDepartment(Long id, Long departmentId, AuthUser actor);
```

`ProblemServiceImpl.changeDepartment` 의 마지막 세 줄(`Long from = ...` 부터 감사 로그까지)을 아래로 교체한다:
```java
        Long from = existing.getDepartmentId();
        // 옮겨 간 부서 기준으로 번호를 다시 매긴다. 원래 번호를 그대로 들고 가면 그 부서에
        // 같은 번호가 있을 때 UNIQUE 제약에 걸린다(spec D6).
        Integer max = problemDao.findMaxSourceNumber(departmentId);
        int assigned = max == null ? 1 : max + 1;
        problemDao.updateDepartmentAndSourceNumber(id, departmentId, assigned);
        auditLogService.record(actor.getUserId(), "PROBLEM_DEPARTMENT_CHANGED", "PROBLEM", id,
                "{\"from\":" + from + ",\"to\":" + departmentId
                        + ",\"sourceNumberFrom\":" + existing.getSourceNumber()
                        + ",\"sourceNumberTo\":" + assigned + "}");
        return assigned;
```

`ProblemController.changeDepartment` 를 아래로 교체한다:
```java
    @PutMapping("/{id}/department")
    public ResponseEntity<ResponseDto<?>> changeDepartment(@PathVariable Long id,
                                                            @RequestBody DepartmentChangeRequest request,
                                                            @LoginUser AuthUser actor) {
        int assigned = problemService.changeDepartment(id, request.getDepartmentId(), actor);
        return ResponseEntity.ok(ResponseDto.ok(java.util.Collections.singletonMap("sourceNumber", assigned)));
    }
```

- [ ] **Step 5: 테스트 실행하여 통과 확인**

Run: `cd backend && ./gradlew test`
Expected: `BUILD SUCCESSFUL` — 전체 스위트가 통과해야 한다(`changeDepartment` 시그니처 변경이 다른 호출부를 깨뜨리지 않았는지 확인)

- [ ] **Step 6: Commit**

```bash
git add backend/src/main/java/com/daeryun/probank/dao/ProblemDao.java backend/src/main/resources/mappers/probank/ProblemMapper.xml backend/src/main/java/com/daeryun/probank/service/ProblemService.java backend/src/main/java/com/daeryun/probank/service/ProblemServiceImpl.java backend/src/main/java/com/daeryun/probank/controller/ProblemController.java backend/src/test/java/com/daeryun/probank/service/ProblemServiceImplTest.java
git commit -m "feat: reassign the source number when a problem moves department"
```

---

## Task 4: 엑셀 업로드에 번호 컬럼

**Files:**
- Modify: `backend/src/main/java/com/daeryun/probank/service/ExcelProblemUploadServiceImpl.java`
- Test: `backend/src/test/java/com/daeryun/probank/service/ExcelProblemUploadServiceImplTest.java` (이미 있다 — 헬퍼 `buildExcel(String[][] rows)` 와 `activeDepartment(Long id)` 를 쓴다)

**Interfaces:**
- Consumes: `Problem.sourceNumber`(Task 1)
- Produces: 13번째 컬럼(0-기준 index 12)에서 문항 번호를 읽는다.

> **이 Task 의 무게**: `docs/문제은행_엑셀/` 에 이미 팀별 파일 12개(653행)가 있다. 번호 컬럼이 없으면 653개를 개별 등록 화면에서 손으로 쳐야 한다.

- [ ] **Step 1: 상수 추가**

`ExcelProblemUploadServiceImpl` 의 컬럼 상수 블록 끝에 추가한다:
```java
    private static final int COL_SOURCE_NUMBER = 12;
```

> **맨 뒤에 붙이는 이유**: 중간에 끼우면 기존 파일의 정답(9)·해설(10)·태그(11)가 한 칸씩 밀려 **조용히 잘못 읽힌다.** 뒤에 붙이면 예전 파일은 번호 칸이 비어 행마다 뚜렷이 실패한다. 소리 없는 오작동보다 시끄러운 실패가 낫다.

- [ ] **Step 2: 실패하는 테스트 작성**

이 파일에는 이미 `buildExcel(String[][] rows)`(1행이 헤더, `MockMultipartFile` 반환)와 `activeDepartment(Long id)` 가 있다. 그대로 쓴다. 헤더 행에 `"문항번호"` 를 13번째로 더한다.

```java
    private static final String[] HEADER = {
            "문제유형", "문제내용", "이미지", "참조지문", "보기1", "보기2", "보기3", "보기4", "보기5",
            "정답", "해설", "태그", "문항번호"
    };

    @Test
    void rowWithoutSourceNumber_fails() throws Exception {
        // 번호 칸이 없는 예전 파일은 행마다 뚜렷이 실패해야 한다.
        // 조용히 통과시키면 번호 없는 문제가 대량으로 들어온다.
        MockMultipartFile file = buildExcel(new String[][]{
                HEADER,
                {"MCQ_SINGLE", "수도는?", "", "", "서울", "부산", "", "", "", "1", "", "", ""},
        });

        ExcelUploadResult result = service.upload(file, 77L, superAdmin);

        assertEquals(0, result.getSuccessRows());
        assertEquals(1, result.getFailRows());
        assertTrue(result.getErrorDetail().contains("문항 번호"),
                "실패 사유가 번호 때문임을 알려야 한다: " + result.getErrorDetail());
    }

    @Test
    void rowWithNonNumericSourceNumber_fails() throws Exception {
        MockMultipartFile file = buildExcel(new String[][]{
                HEADER,
                {"MCQ_SINGLE", "수도는?", "", "", "서울", "부산", "", "", "", "1", "", "", "삼번"},
        });

        assertEquals(1, service.upload(file, 77L, superAdmin).getFailRows());
    }

    @Test
    void duplicateSourceNumberWithinTheSameFile_failsTheSecondRow() throws Exception {
        // 파일 안의 중복은 DB 에 닿기 전에 잡는다 — 첫 행만 들어가고 둘째 행이
        // 제약 위반으로 죽으면 사용자는 왜 절반만 들어갔는지 알기 어렵다.
        MockMultipartFile file = buildExcel(new String[][]{
                HEADER,
                {"MCQ_SINGLE", "첫 문제", "", "", "서울", "부산", "", "", "", "1", "", "", "3"},
                {"MCQ_SINGLE", "둘째 문제", "", "", "서울", "부산", "", "", "", "1", "", "", "3"},
        });

        ExcelUploadResult result = service.upload(file, 77L, superAdmin);

        assertEquals(1, result.getSuccessRows());
        assertEquals(1, result.getFailRows());
    }

    @Test
    void validRowPersistsTheSourceNumber() throws Exception {
        MockMultipartFile file = buildExcel(new String[][]{
                HEADER,
                {"MCQ_SINGLE", "수도는?", "", "", "서울", "부산", "", "", "", "1", "", "", "42"},
        });

        service.upload(file, 77L, superAdmin);

        ArgumentCaptor<Problem> captor = ArgumentCaptor.forClass(Problem.class);
        Mockito.verify(problemProvisioningService)
                .provisionWithChoices(captor.capture(), Mockito.anyList(), Mockito.anyList());
        assertEquals(Integer.valueOf(42), captor.getValue().getSourceNumber());
    }
```

> **기존 엑셀 테스트가 전부 깨진다.** 이 파일의 픽스처는 12컬럼 헤더와 12칸 데이터 행을 쓰고 있어, 번호가 필수가 되면 모두 실패한다. Task 1 Step 8 과 같은 성격의 작업이다 — 각 테스트의 의도가 바뀐 게 아니라 "유효한 행"의 정의가 바뀐 것이므로, 헤더 상수와 각 행 끝에 번호를 더해 통과시킨다.

- [ ] **Step 3: 테스트 실행하여 실패 확인**

Run: `cd backend && ./gradlew test --tests '*ExcelProblemUploadServiceImplTest*'`
Expected: FAIL

- [ ] **Step 4: 파싱과 검증 구현**

행 검증부(`String answerText = cellValue(row, COL_ANSWER, dataFormatter);` 근처)에 추가한다:
```java
        String sourceNumberText = cellValue(row, COL_SOURCE_NUMBER, dataFormatter);
        if (sourceNumberText == null || sourceNumberText.trim().isEmpty()) {
            return RowResult.fail(rowNumber, "문항 번호는 필수입니다.");
        }
        int sourceNumber;
        try {
            sourceNumber = Integer.parseInt(sourceNumberText.trim());
        } catch (NumberFormatException e) {
            return RowResult.fail(rowNumber, "문항 번호는 숫자여야 합니다: " + sourceNumberText);
        }
        if (sourceNumber < 1) {
            return RowResult.fail(rowNumber, "문항 번호는 1 이상이어야 합니다: " + sourceNumber);
        }
```

파일 안 중복 검사를 위해 반복문 바깥에 집합을 두고, 위 검증 다음에 확인한다:
```java
        // 파일 안 중복을 DB 에 닿기 전에 잡는다. 그냥 두면 첫 행은 들어가고 둘째 행이
        // UNIQUE 위반으로 죽어, 사용자에게는 절반만 들어간 이유가 보이지 않는다.
        if (!seenSourceNumbers.add(sourceNumber)) {
            return RowResult.fail(rowNumber, "파일 안에서 문항 번호가 중복됩니다: " + sourceNumber);
        }
```

`Problem` 을 만드는 자리에 추가한다:
```java
        problem.setSourceNumber(sourceNumber);
```

- [ ] **Step 5: 테스트 실행하여 통과 확인**

Run: `cd backend && ./gradlew test --tests '*ExcelProblemUploadServiceImplTest*'`
Expected: `BUILD SUCCESSFUL`

- [ ] **Step 6: Commit**

```bash
git add backend/src/main/java/com/daeryun/probank/service/ExcelProblemUploadServiceImpl.java backend/src/test/java/com/daeryun/probank/service/ExcelProblemUploadServiceImplTest.java
git commit -m "feat: read the source question number from the excel upload"
```

---

## Task 5: 학습자 조회 3경로에 부서명·번호 싣기

**Files:**
- Modify: `backend/src/main/java/com/daeryun/probank/dto/solve/ProblemSolveDetailResponse.java`
- Modify: `backend/src/main/java/com/daeryun/probank/dto/solve/ProblemSolveListItem.java`
- Modify: `backend/src/main/java/com/daeryun/probank/dto/solve/AttemptHistoryItem.java`
- Modify: `backend/src/main/resources/mappers/probank/ProblemMapper.xml`
- Modify: `backend/src/main/resources/mappers/probank/AttemptMapper.xml`
- Modify: `backend/src/main/java/com/daeryun/probank/service/SolveServiceImpl.java`
- Test: `backend/src/test/java/com/daeryun/probank/service/SolveServiceImplTest.java`
- Create: `backend/src/test/java/com/daeryun/probank/dao/ProblemSourceNumberDaoTest.java`

**Interfaces:**
- Consumes: `problems.source_number`(Task 1), `departments.name`
- Produces: 세 DTO 에 `departmentName`, `sourceNumber`. Task 7(화면 4곳)이 쓴다.

> **`SolveServiceImpl` 은 지금 부서 이름을 구할 방법이 없다.** `problemDao.findById` 가 돌려주는 `Problem` 도메인에는 `departmentId` 만 있다. `DepartmentDao` 를 주입해 이름을 한 번 더 조회한다 — `ProblemServiceImpl` 이 이미 같은 의존성을 갖고 있다.

- [ ] **Step 1: DTO 세 개에 필드 추가**

`ProblemSolveDetailResponse` 에 두 필드를 더한다(생성자 인자 순서는 마지막에 붙인다):
```java
    private String departmentName;
    private Integer sourceNumber;
```

`ProblemSolveListItem`, `AttemptHistoryItem` 에도 같은 두 필드를 더한다. 이 둘은 MyBatis 가 `resultMap`/`resultType` 으로 채우므로 생성자는 건드리지 않는다.

- [ ] **Step 2: 실패하는 테스트 작성 (서비스)**

`SolveServiceImplTest` 에 추가한다:
```java
    @Test
    void getDetail_carriesDepartmentNameAndSourceNumber() {
        Problem problem = new Problem();
        problem.setId(1L);
        problem.setType(ProblemType.SHORT_ANSWER);
        problem.setStatus(ProblemStatus.ACTIVE);
        problem.setContent("문제");
        problem.setDepartmentId(10L);
        problem.setSourceNumber(3);
        Mockito.when(problemDao.findById(1L)).thenReturn(problem);
        Department department = new Department();
        department.setId(10L);
        department.setName("정보시스템팀");
        Mockito.when(departmentDao.findById(10L)).thenReturn(department);

        ProblemSolveDetailResponse response = service.getDetail(1L);

        assertEquals("정보시스템팀", response.getDepartmentName());
        assertEquals(Integer.valueOf(3), response.getSourceNumber());
    }
```

`setUp()` 에 `departmentDao` 목을 추가하고 생성자에 넘긴다.

- [ ] **Step 3: 실패하는 테스트 작성 (DAO 왕복)**

**서비스 단위 테스트는 DAO 를 목으로 대체하므로 SQL 을 전혀 거치지 않는다.** 새로 쓰는 SQL 은 왕복 테스트로만 검증된다. `backend/src/test/java/com/daeryun/probank/dao/AttemptDaoTest.java` 를 먼저 읽고 그 구조를 그대로 따른다.

`ProblemSourceNumberDaoTest.java` 를 만들고 아래를 검증한다:

1. **`findMaxSourceNumber` 가 보관된 문제도 센다.** 부서 하나에 번호 5(활성)와 9(보관)를 넣고 `9` 가 나오는지 확인한다. 이게 spec D5 를 지키는 유일한 자동 검사다.
2. **`findMaxSourceNumber` 가 다른 부서를 세지 않는다.** 부서 A 에 100번을 넣고 부서 B 를 조회해 null 이 나오는지 확인한다.
3. **`findAllActive` 와 `findRandomActive` 가 부서명·번호를 채운다.**
4. **`AttemptDao.findByUserId` 가 부서명·번호를 채운다.**
5. **`UNIQUE(department_id, source_number)` 가 실제로 막는다.** 같은 부서·같은 번호로 두 번 insert 해 예외가 나는지 확인한다.
6. **번호가 NULL 인 행은 여러 개 가능하다.** 같은 부서에 번호 없는 문제 둘을 넣어도 통과하는지 확인한다 — 기존 14건이 공존할 수 있다는 근거다.

- [ ] **Step 4: 테스트 실행하여 실패 확인**

Run: `cd backend && ./gradlew test --tests '*SolveServiceImplTest*' --tests '*ProblemSourceNumberDaoTest*'`
Expected: FAIL

- [ ] **Step 5: 매퍼 수정**

`ProblemMapper.xml` 의 `findAllActive` 와 `findRandomActive` 에 부서 조인과 두 컬럼을 더한다. `findAllActive` 예시:
```xml
    <select id="findAllActive" resultMap="solveProblemListItemMap">
        SELECT p.id, p.type, p.content, d.name AS department_name, p.source_number,
               COALESCE(array_agg(DISTINCT t.name) FILTER (WHERE t.name IS NOT NULL), '{}') AS tags
        FROM problems p
        JOIN departments d ON d.id = p.department_id
        LEFT JOIN problem_tags pt ON pt.problem_id = p.id
        LEFT JOIN tags t ON t.id = pt.tag_id
        WHERE p.status = 'ACTIVE'
        <if test="keyword != null and keyword != ''">AND p.content ILIKE CONCAT('%', #{keyword}, '%')</if>
        <if test="tag != null and tag != ''">AND EXISTS (SELECT 1 FROM problem_tags fpt JOIN tags ft ON ft.id = fpt.tag_id WHERE fpt.problem_id = p.id AND lower(ft.name) = lower(#{tag}))</if>
        GROUP BY p.id, d.name
        ORDER BY p.created_at DESC
    </select>
```
`findRandomActive` 도 같은 방식으로 고친다. **`GROUP BY` 에 `d.name` 을 반드시 더한다** — 빠지면 PostgreSQL 이 거부한다.

> `departments.id` 는 `problems.department_id` 의 NOT NULL 외래키라 `JOIN` 이 행 수를 바꾸지 않는다. `LEFT JOIN` 을 쓸 이유가 없다.

`AttemptMapper.xml` 의 `findByUserId` 를 아래로 교체한다:
```xml
    <select id="findByUserId" resultType="com.daeryun.probank.dto.solve.AttemptHistoryItem">
        SELECT a.problem_id, p.content AS problem_content, a.submitted_answer,
               a.is_correct AS correct, a.submitted_at,
               d.name AS department_name, p.source_number
        FROM attempts a
        JOIN problems p ON p.id = a.problem_id
        JOIN departments d ON d.id = p.department_id
        WHERE a.user_id = #{userId}
        ORDER BY a.submitted_at DESC
    </select>
```

- [ ] **Step 6: 서비스 수정**

`SolveServiceImpl` 에 `DepartmentDao` 를 주입하고(필드·생성자 파라미터·대입 세 곳), `getDetail` 의 `return` 을 아래로 교체한다:
```java
        // Problem 도메인에는 departmentId 만 있다. 표기에 쓸 이름은 한 번 더 조회한다
        // (departments 는 작은 마스터 테이블이다).
        Department department = departmentDao.findById(problem.getDepartmentId());
        return new ProblemSolveDetailResponse(
                problem.getId(), problem.getType(), problem.getContent(), problem.getImageUrl(),
                problem.getReferenceText(), choices, blanksToAnswer, revealedBlanks,
                department == null ? null : department.getName(), problem.getSourceNumber());
```

- [ ] **Step 7: 테스트 실행하여 통과 확인**

Run: `cd backend && ./gradlew test`
Expected: `BUILD SUCCESSFUL`

- [ ] **Step 8: Commit**

```bash
git add backend/src/main/java/com/daeryun/probank/dto/solve backend/src/main/resources/mappers/probank/ProblemMapper.xml backend/src/main/resources/mappers/probank/AttemptMapper.xml backend/src/main/java/com/daeryun/probank/service/SolveServiceImpl.java backend/src/test/java/com/daeryun/probank/service/SolveServiceImplTest.java backend/src/test/java/com/daeryun/probank/dao/ProblemSourceNumberDaoTest.java
git commit -m "feat: carry department name and source number to the learner screens"
```

---

# Part 2 — 프론트엔드

## Task 6: 관리자 등록/수정 폼

**Files:**
- Modify: `frontend/src/api/problems.js`
- Modify: `frontend/src/utils/problemFormPayload.js`
- Modify: `frontend/src/utils/problemFormPayload.test.js`
- Modify: `frontend/src/pages/admin/problems/ProblemFormPage.jsx`

**Interfaces:**
- Consumes: `GET /api/admin/problems/next-source-number`(Task 2), `PUT .../department` 의 새 응답(Task 3)
- Produces: 번호를 담은 등록/수정 페이로드

- [ ] **Step 1: 실패하는 테스트 작성**

`frontend/src/utils/problemFormPayload.test.js` 에 추가한다:
```javascript
test("buildProblemPayload: sourceNumber를 숫자로 담는다", () => {
  const payload = buildProblemPayload({ ...baseForm(), sourceNumber: "13" });
  assert.equal(payload.sourceNumber, 13);
});

test("buildProblemPayload: 빈 sourceNumber는 null로 보낸다", () => {
  // 서버가 "문항 번호를 입력하세요"로 막는다. 화면이 0이나 NaN을 만들어
  // 보내면 그 메시지 대신 엉뚱한 검증에 걸린다.
  for (const empty of ["", null, undefined]) {
    const payload = buildProblemPayload({ ...baseForm(), sourceNumber: empty });
    assert.equal(payload.sourceNumber, null);
  }
});

test("buildProblemPayload: 여전히 departmentId를 넣지 않는다", () => {
  const payload = buildProblemPayload({ ...baseForm(), sourceNumber: "1" });
  assert.equal("departmentId" in payload, false);
});
```
(`baseForm()` 은 기존 테스트가 쓰는 폼 픽스처를 재사용한다. 없으면 기존 테스트의 인라인 객체를 헬퍼로 뽑는다.)

Run: `cd frontend && npm test`
Expected: FAIL

- [ ] **Step 2: 페이로드 변환 구현**

`problemFormPayload.js` 의 `base` 객체에 추가한다:
```javascript
    // 빈 값은 0/NaN 이 아니라 null 로 보낸다. 서버의 "문항 번호를 입력하세요" 안내가
    // 그대로 사용자에게 닿아야 한다.
    sourceNumber: form.sourceNumber === "" || form.sourceNumber === null || form.sourceNumber === undefined
      ? null
      : Number(form.sourceNumber),
```

Run: `cd frontend && npm test`
Expected: 통과

- [ ] **Step 3: API 래퍼 추가**

`frontend/src/api/problems.js` 에 추가한다:
```javascript
/** 등록 폼이 번호 칸을 미리 채우는 데 쓴다. 부서 관리자는 서버가 자기 부서로 강제한다. */
export function fetchNextSourceNumber(departmentId) {
  const query = departmentId ? `?departmentId=${encodeURIComponent(departmentId)}` : "";
  return apiGet(`/api/admin/problems/next-source-number${query}`);
}
```

- [ ] **Step 4: 폼에 번호 입력과 자동 기본값 추가**

`ProblemFormPage.jsx` 에 상태를 더한다:
```javascript
  const [sourceNumber, setSourceNumber] = useState("");
```

수정 모드에서 기존 값을 채우는 곳(다른 필드를 `detail` 에서 채우는 자리)에 더한다:
```javascript
      setSourceNumber(detail.sourceNumber == null ? "" : String(detail.sourceNumber));
```

**등록 모드에서만** 부서를 고르면 다음 번호를 받아 채운다:
```javascript
  useEffect(() => {
    // 수정 모드에서는 기존 번호를 덮어쓰면 안 된다.
    if (isEdit || !createDepartmentId) return;
    let cancelled = false;
    fetchNextSourceNumber(createDepartmentId)
      .then((next) => {
        if (!cancelled) setSourceNumber(String(next));
      })
      .catch(() => {
        // 실패해도 등록을 막지 않는다 — 관리자가 직접 넣으면 된다.
        if (!cancelled) setSourceNumber("");
      });
    return () => {
      cancelled = true;
    };
  }, [isEdit, createDepartmentId]);
```

귀속 부서 Select 바로 아래에 입력 칸을 둔다:
```javascript
              <Input
                id="problem-source-number"
                type="number"
                min="1"
                label="문항 번호"
                required
                value={sourceNumber}
                onChange={(event) => setSourceNumber(event.target.value)}
                className="w-40"
              />
```

`buildProblemPayload` 호출에 `sourceNumber` 를 넘긴다.

부서 이동 성공 처리에서 새 번호를 반영한다:
```javascript
      const moved = await changeProblemDepartment(id, moveDepartmentId);
      toast.success(`부서를 옮겼습니다. 문항 번호가 ${moved.sourceNumber}번으로 바뀌었습니다.`);
      setSourceNumber(String(moved.sourceNumber));
```

- [ ] **Step 5: 빌드와 CSS 생성 확인**

Run: `cd frontend && npm test && npm run build`
Expected: 통과

새로 쓴 클래스가 실제로 생성됐는지 빌드 산출물에서 확인한다. Tailwind 는 찾지 못한 클래스를 조용히 생략하므로, 이 저장소에서 다섯 번 물린 함정이다:
```bash
cd frontend && for c in w-40; do grep -q "\.$c" dist/assets/*.css && echo "OK   $c" || echo "MISS $c"; done
```

- [ ] **Step 6: Commit**

```bash
git add frontend/src/api/problems.js frontend/src/utils/problemFormPayload.js frontend/src/utils/problemFormPayload.test.js frontend/src/pages/admin/problems/ProblemFormPage.jsx
git commit -m "feat: enter the source question number on the problem form"
```

---

## Task 7: 랜덤 50과 학습자 화면 표기

**Files:**
- Create: `frontend/src/utils/sourceLabel.js`
- Create: `frontend/src/utils/sourceLabel.test.js`
- Create: `frontend/src/components/ui/SourceBadge.jsx`
- Modify: `frontend/src/utils/solveSession.js`
- Modify: `frontend/src/utils/solveSession.test.js`
- Modify: `frontend/src/pages/solve/RandomSetupPage.jsx`
- Modify: `frontend/src/components/solve/ProblemSolveCard.jsx`
- Modify: `frontend/src/pages/solve/SolveProblemListPage.jsx`
- Modify: `frontend/src/pages/solve/AttemptHistoryPage.jsx`
- Modify: `frontend/src/pages/solve/RandomResultPage.jsx`

**Interfaces:**
- Consumes: Task 5 가 실어 보낸 `departmentName`, `sourceNumber`
- Produces: `sourceLabel(item)`, `<SourceBadge />`

- [ ] **Step 1: 랜덤 50 옵션 추가**

`RandomSetupPage.jsx` 의 `COUNT_OPTIONS` 를 아래로 교체한다:
```javascript
const COUNT_OPTIONS = [
  { value: "5", label: "5문제" },
  { value: "10", label: "10문제" },
  { value: "20", label: "20문제" },
  { value: "50", label: "50문제" },
];
```

> 백엔드 `SolveServiceImpl.MAX_RANDOM_COUNT` 가 이미 50 이라 서버는 손대지 않는다. 조건에 맞는 문제가 50개보다 적어도 오류가 아니며 있는 만큼 시작한다 — 진행 표시가 `1 / 12` 로 나와 사용자가 바로 안다(spec D10).

- [ ] **Step 2: 표시 문구 순수 함수 — 실패하는 테스트 먼저**

`frontend/src/utils/sourceLabel.test.js`:
```javascript
import { test } from "node:test";
import assert from "node:assert/strict";
import { sourceLabel } from "./sourceLabel.js";

test("sourceLabel: 부서명과 번호를 합친다", () => {
  assert.equal(sourceLabel({ departmentName: "정보시스템팀", sourceNumber: 3 }), "정보시스템팀 3번");
});

test("sourceLabel: 번호가 없으면 null", () => {
  // 기존 문제는 번호가 비어 있다. 배지를 아예 그리지 않기 위한 신호다.
  assert.equal(sourceLabel({ departmentName: "정보시스템팀", sourceNumber: null }), null);
  assert.equal(sourceLabel({ departmentName: "정보시스템팀" }), null);
});

test("sourceLabel: 부서명이 없으면 번호만", () => {
  assert.equal(sourceLabel({ sourceNumber: 3 }), "3번");
});

test("sourceLabel: 0번은 번호가 아니다", () => {
  // 서버가 1 이상만 받지만 화면이 0을 "0번"으로 그리면 잘못된 확신을 준다.
  assert.equal(sourceLabel({ departmentName: "회계팀", sourceNumber: 0 }), null);
});

test("sourceLabel: 인자가 없어도 터지지 않는다", () => {
  assert.equal(sourceLabel(null), null);
  assert.equal(sourceLabel(undefined), null);
});
```

Run: `cd frontend && npm test`
Expected: FAIL — 모듈 없음

- [ ] **Step 3: 구현**

`frontend/src/utils/sourceLabel.js`:
```javascript
/**
 * 출처 배지 문구를 만든다. "정보시스템팀 3번".
 *
 * 영역은 별도 개념이 아니라 문제가 귀속된 부서다(spec D1). 화면(React)과 분리해
 * 두는 이유는 이 프로젝트에 jsdom 이 없어 컴포넌트를 테스트할 수 없기 때문이다.
 *
 * 번호가 없으면 null 을 돌려준다 — 호출부는 이걸 "배지를 그리지 않는다"로 읽는다.
 * 번호 없는 기존 문제가 남아 있는 동안 필요하다.
 */
export function sourceLabel(item) {
  if (!item) return null;
  const number = item.sourceNumber;
  if (number === null || number === undefined || number < 1) return null;
  const name = item.departmentName;
  return name ? `${name} ${number}번` : `${number}번`;
}
```

Run: `cd frontend && npm test`
Expected: 통과

- [ ] **Step 4: 배지 컴포넌트**

`frontend/src/components/ui/SourceBadge.jsx`:
```javascript
import { sourceLabel } from "@/utils/sourceLabel.js";

/**
 * 출처(부서 + 문항 번호) 배지. 유형 배지 옆에 회색으로 붙어, 무엇이 문제의 성격이고
 * 무엇이 위치 정보인지 구분되게 한다(spec D8).
 * 번호가 없는 문제에는 아무것도 그리지 않는다.
 */
export default function SourceBadge({ item, className = "" }) {
  const label = sourceLabel(item);
  if (!label) return null;
  return (
    <span
      className={`shrink-0 rounded-full bg-surface-subtle px-2.5 py-1 text-body-small font-medium text-ink-muted ${className}`}
    >
      {label}
    </span>
  );
}
```

- [ ] **Step 5: 세션이 부서명·번호를 버리지 않게 한다 — 테스트 먼저**

`createSession` 은 지금 문제를 `{ id, type, content }` 로 **잘라서** 저장한다. 그대로 두면 Task 5 가 실어 보낸 값이 결과 요약 화면에 닿지 않는다.

`solveSession.test.js` 에 추가한다:
```javascript
test("createSession: 출처 표기에 필요한 값을 버리지 않는다", () => {
  const session = createSession([
    { id: 1, type: "OX", content: "본문", departmentName: "회계팀", sourceNumber: 7, extra: "버려도 되는 값" },
  ]);
  const stored = session.problems[0];
  assert.equal(stored.departmentName, "회계팀");
  assert.equal(stored.sourceNumber, 7);
  // 세션은 sessionStorage 에 들어가므로 필요한 것만 담는다.
  assert.equal("extra" in stored, false);
});
```

Run: `cd frontend && npm test`
Expected: FAIL

`solveSession.js` 의 `createSession` 첫 줄을 아래로 교체한다:
```javascript
  // 결과 요약 화면이 출처 배지를 그리려면 이 두 값이 세션에 남아야 한다.
  // sessionStorage 에 들어가므로 필요한 것만 골라 담는다.
  const list = problems.map((p) => ({
    id: p.id,
    type: p.type,
    content: p.content,
    departmentName: p.departmentName,
    sourceNumber: p.sourceNumber,
  }));
```

Run: `cd frontend && npm test`
Expected: 통과 (기존 18건 포함)

- [ ] **Step 6: 화면 4곳에 배지 달기**

**풀이 화면** — `ProblemSolveCard.jsx` 의 유형 배지 `</span>` 다음에 넣는다. 두 배지를 한 줄에 두려면 감싸는 요소가 필요하다:
```javascript
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <span className="inline-block rounded-full bg-surface-blue px-2.5 py-1 text-body-small font-medium text-info-text">
            {problemTypeLabel(problem.type)}
          </span>
          <SourceBadge item={problem} />
        </div>
```
(기존 유형 배지의 `mb-3` 은 감싼 `div` 로 옮긴다.)

**문제 목록** — `SolveProblemListPage.jsx` 의 유형 배지 다음에 `<SourceBadge item={problem} />` 를 넣는다. 행이 `flex items-center gap-3` 이므로 그대로 붙는다.

**풀이 이력** — `AttemptHistoryPage.jsx` 는 표(PC)와 카드(모바일) 양쪽에 넣는다.
- 표: `문제` 셀의 본문 위에 배지를 둔다.
- 카드: 본문 아래 결과 옆에 둔다.

**랜덤 결과 요약** — `RandomResultPage.jsx` 의 본문 옆에 `<SourceBadge item={problem} />` 를 넣는다. `problem` 은 이미 `problemById(session, r.problemId)` 로 얻고 있고, Step 5 덕분에 두 값이 들어 있다.

- [ ] **Step 7: 빌드와 CSS 생성 확인**

Run: `cd frontend && npm test && npm run build`
Expected: 통과

```bash
cd frontend && for c in bg-surface-subtle text-ink-muted rounded-full; do grep -q "\.$c" dist/assets/*.css && echo "OK   $c" || echo "MISS $c"; done
```
Expected: 전부 `OK`

- [ ] **Step 8: Commit**

```bash
git add frontend/src/utils/sourceLabel.js frontend/src/utils/sourceLabel.test.js frontend/src/components/ui/SourceBadge.jsx frontend/src/utils/solveSession.js frontend/src/utils/solveSession.test.js frontend/src/pages/solve frontend/src/components/solve/ProblemSolveCard.jsx
git commit -m "feat: show the source badge on the learner screens and add the 50-problem option"
```

---

# Part 3 — 검증

## Task 8: Design QA

**Files:** 없음(검증). 결함 발견 시 해당 파일 수정.

**환경:** 프론트는 반드시 **5173**(아니면 CORS 로 로그인 실패). 백엔드는 이번 브랜치에서 변경되므로 **재기동이 필요하다**.
계정: `admin` / `QaAdmin1234!`(총괄), `dev_admin` / `QaPlan3!2026`(부서 관리자), `emp001` / `QaPlan3!2026`(직원)

**측정 방법:** `getComputedStyle` · `getBoundingClientRect` 로 실측한다. 눈대중 판정을 하지 마라. 함정은 `docs/qa/2026-08-12-solve-design-conformance-qa.md` §11 에 있다 — 특히 **`transition-colors` 가 걸린 요소는 포커스 직후 읽지 말 것(최소 500ms 대기)**.

- [ ] **Step 1: 등록 폼의 자동 번호**

| 확인 | 기대 |
|---|---|
| 부서를 고른다 | 번호 칸이 그 부서의 마지막+1 로 채워진다 |
| 부서를 바꾼다 | 번호가 새 부서 기준으로 다시 채워진다 |
| 문제가 없는 부서 | 1 이 채워진다 |
| 번호를 지우고 저장 | `문항 번호를 입력하세요.` |
| 0 이나 음수로 저장 | `문항 번호는 1 이상이어야 합니다.` |
| 이미 있는 번호로 저장 | `<부서명> N번은 이미 있습니다.` — **`처리 중 오류가 발생하였습니다` 가 나오면 실패다** |

- [ ] **Step 2: 수정 경로**

기존 문제를 열어 번호가 그대로 그려지는지, 번호를 지우고 저장하면 막히는지 확인한다. **번호가 없는 기존 14건 중 하나를 열면** 번호 칸이 비어 있고 저장이 막혀야 한다(spec D2).

- [ ] **Step 3: 부서 이동**

번호가 겹치는 상황을 일부러 만든다 — A 부서 5번, B 부서 5번을 두고 A 의 문제를 B 로 옮긴다.
Expected: 오류 없이 이동하고 `문항 번호가 N번으로 바뀌었습니다` 안내가 뜨며, 화면의 번호 칸도 그 값으로 갱신된다.

- [ ] **Step 4: 엑셀 업로드**

`docs/문제은행_엑셀/문제_01_공통.xlsx` 를 **그대로**(번호 컬럼 없이) 올린다.
Expected: 모든 행이 `문항 번호는 필수입니다.` 로 실패한다. 일부만 들어가거나 조용히 성공하면 실패다.

그 다음 13번째 컬럼에 번호를 채운 파일을 만들어 올려 성공을 확인하고, 같은 번호가 두 행에 있는 파일로 `파일 안에서 문항 번호가 중복됩니다` 를 확인한다.

- [ ] **Step 5: 학습자 화면 4곳 (1440×1024)**

| 화면 | 확인 |
|---|---|
| 풀이 화면 | `[객관식(단일)] [정보시스템팀 3번]` 두 배지가 한 줄에 |
| 문제 목록 | 행마다 배지 |
| 풀이 이력 | PC 표와 모바일 카드 양쪽 |
| 랜덤 결과 요약 | 문제마다 배지 |

배지 색을 실측한다: 배경 `--color-surface-subtle`, 글자 `--color-ink-muted`. 유형 배지와 **다른 색**이어야 한다.

**번호가 없는 문제에는 배지가 아예 없어야 한다.** 기존 14건으로 확인한다 — `undefined번` 이나 빈 배지가 보이면 실패다.

- [ ] **Step 6: 랜덤 50**

| 확인 | 기대 |
|---|---|
| 선택지 | `5 / 10 / 20 / 50` |
| 50 선택 후 시작 | 문제가 12건이면 `1 / 12` 로 시작하고 오류가 없다 |
| 세트 완주 | 결과 요약에 배지가 남아 있다(세션이 값을 버리지 않았는지) |

- [ ] **Step 7: 회귀와 콘솔**

| 확인 | 기대 |
|---|---|
| 5개 유형 풀이 | 전부 정상 채점 |
| 관리자 문제 목록·통계 | 이번 변경으로 깨지지 않았다 |
| 브라우저 콘솔 | 전 과정 오류·경고 0건 (`/favicon.ico` 404 는 기존 사항) |

- [ ] **Step 8: 결과 문서화와 커밋**

`docs/qa/` 에 결과를 남긴다. **실측값은 숫자를 그대로** 적는다.

```bash
git add docs/qa/<파일명>
git commit -m "docs: record the source-number design QA results"
```

---

## Self-Review 결과

**Spec 커버리지** — spec 의 D1~D10 을 Task 에 대응시켰다.

| 결정 | Task |
|---|---|
| D1 영역 = 부서, `source_number` 만 추가 | 1 |
| D2 등록·수정 모두 필수 | 1 |
| D3 마지막+1 기본값 | 2, 6 |
| D4 중복 거부 | 1 |
| D5 번호 재사용 안 함(보관 포함) | 2 (`findMaxSourceNumber` 가 상태로 안 거름), 5 (DAO 테스트가 고정) |
| D6 부서 이동 시 자동 재부여 | 3 |
| D7 엑셀 맨 뒤 컬럼, 필수 | 4 |
| D8 유형 배지 옆 회색 배지 | 7 |
| D9 학습자 경로 4곳 | 5, 7 |
| D10 `5 / 10 / 20 / 50` | 7 |

**spec §5 의 미해결 항목** — 셋 다 이 계획서에서 답했다.

1. `NOT NULL` 전환 순서 → **걸지 않는다.** 필수는 서비스가 검증하고 DB 에는 `UNIQUE` 만 건다(Global Constraints 에 근거 기재). `schema.sql` 이 기존 테이블을 바꾸지 못한다는 사실과, DB 제약 위반이 `-1` 로 나간다는 사실이 근거다.
2. 마지막+1 계산 위치 → **서버**(Task 2). 폼이 부서를 고를 때 조회한다. 동시 등록은 `UNIQUE` 가 막고 한국어 메시지로 안내한다(Task 1).
3. 다중빈칸 50문항 → 개별 등록 화면을 쓰고, 그 화면에 번호 칸이 생기므로(Task 6) 별도 작업이 없다.

**플레이스홀더 스캔** — 초안에서 **테스트 헬퍼 이름 세 개를 지어냈던 것을 잡아 고쳤다.** `validMcqRequest()` · `existingMcqProblem(...)` · `activeDepartment(...)` 는 존재하지 않았다. 실제 이름은 아래와 같고 계획서 본문을 이에 맞춰 다시 썼다.

| 파일 | 실제 헬퍼 |
|---|---|
| `ProblemServiceImplTest` | `shortAnswerRequest()`, `shortAnswerRequest(String imageUrl)`, `existingShortAnswer()`(id=5, dept=10), `choice(...)`, `listCaptor()` |
| `ExcelProblemUploadServiceImplTest` | `buildExcel(String[][] rows)` → `MockMultipartFile`, `activeDepartment(Long id)`, 목 `problemProvisioningService` |

같은 검토에서 **`OwningDepartmentResolver` 가 목이 아니라 실물**이라는 것도 확인했다(`setUp()` 주석이 이유를 적어 두었다). `resolve()` 는 부서 관리자면 `departmentDao` 를 조회하지 않고 바로 세션 부서를 돌려주므로, `actor`(DEPT_ADMIN, 부서 10)로 도는 새 테스트들은 부서 스텁이 필요 없다. 이 사실을 Task 1 Step 5 에 적어 두었다 — 모르고 스텁을 넣으면 Mockito 의 불필요한 스텁 검사에 걸릴 수 있다.

엑셀 서비스가 `problemDao.insert` 를 직접 부르지 않고 `ProblemProvisioningService.provisionWithChoices(...)` 를 거친다는 것도 확인했다. Task 4 의 `problem.setSourceNumber(...)` 는 그 서비스에 넘기기 전의 `Problem` 에 넣는 것이 맞다.

**타입 일관성**
- `sourceNumber` 는 백엔드 전 구간 `Integer`(nullable), 프론트엔드 폼 상태는 문자열이고 `buildProblemPayload` 가 `Number` 로 바꾼다.
- `changeDepartment` 반환형 `void → int` 변경이 `ProblemService`·`ProblemServiceImpl`·`ProblemController` 세 곳에 걸쳐 있다. Task 3 Step 5 가 전체 스위트를 돌려 다른 호출부가 없는지 확인한다.
- `findMaxSourceNumber` 는 `Integer`(null 가능) 를 돌려주고 서비스가 `null → 1` 로 바꾼다. `int` 로 받으면 언박싱 NPE 가 난다.
- `SourceBadge` 는 `item` 하나만 받는다. 네 화면이 넘기는 객체(`problem`·`item`)가 모두 `departmentName`·`sourceNumber` 를 갖는지는 Task 5 와 Task 7 Step 5 가 보장한다.

**놓치기 쉬운 지점**
- `GROUP BY` 에 `d.name` 을 빠뜨리면 PostgreSQL 이 거부한다(Task 5 Step 5).
- `createSession` 이 문제를 `{id, type, content}` 로 잘라 담는다 — 필드를 추가해도 결과 요약 화면에 닿지 않는다(Task 7 Step 5).
- 번호가 필수가 되면 **두 테스트 파일의 기존 테스트가 함께 깨진다** — `ProblemServiceImplTest`(Task 1 Step 8)와 `ExcelProblemUploadServiceImplTest`(Task 4 Step 2). 둘 다 "유효한 입력"의 정의가 바뀐 것이지 각 테스트의 의도가 바뀐 게 아니다.
- `changeDepartment` 의 반환형이 `void → int` 로 바뀐다. 컴파일러가 잡아 주지만, Task 3 Step 5 가 전체 스위트를 돌려 확인한다.
- `findMaxSourceNumber` 는 `Integer`(null 가능)다. `int` 로 받으면 첫 문제 등록에서 언박싱 NPE 가 난다.

---

## 이후 범위 (참고)

- **부서 마스터를 12개 실팀으로 정리** — 사용자가 관리 화면에서 직접 (spec D1)
- **722문항 실적재** — 데이터 작업. 이 계획이 끝난 뒤에 하는 편이 낫다. 지금 올리면 653행에 번호를 나중에 손으로 넣어야 한다
- **번호로 검색·필터·정렬** — 표기 전용으로 정했다 (spec §4)
- **관리자 화면(문제 목록·통계)에 번호 표시** — 범위 밖 (spec D9)
