# 문제 은행 Hub — Plan 3: 문제 은행 관리 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 부서 관리자/총괄 관리자가 5개 유형(객관식 단일/다중, OX, 주관식 단답형, 빈칸 채우기)의 문제를 개별 입력 또는 엑셀 일괄 업로드로 등록·수정·보관 처리할 수 있게 한다.

**Architecture:** Plan 1의 계층 구조와 `@RequireRole`, Plan 2의 `excel_upload_logs`(`target_type`) 인프라를 재사용한다. 문제는 등록한 관리자의 부서에 귀속되지만(`department_id` = 등록자 소속 부서), 풀이 대상은 전사 공통이다(Plan 4에서 다룸). 부서 관리자는 자기 부서 문제만 조회/수정/삭제할 수 있고, 총괄 관리자는 전체 부서 문제에 접근한다.

> **후속 변경 (2026-08-09):** 이 Plan 이후 총괄 관리자에 한해 **엑셀 업로드 시 귀속 부서를 지정**하고 **등록 후 다른 부서로 옮기는** 기능이 추가됐다. 즉 `department_id`가 항상 등록자 소속 부서와 같지는 않다. 부서 관리자에게는 여전히 닫혀 있고 서버가 요청 값을 무시한다 — 이 Plan이 세운 부서 격리 규칙 자체는 그대로다. 상세는 [`2026-08-09-excel-upload-department-selection.md`](2026-08-09-excel-upload-department-selection.md) 참고.

**Tech Stack:** Plan 1/2와 동일

**전제 조건:** Plan 1, Plan 2가 완료되어 있어야 한다 (인증, 부서/계정 관리, `excel_upload_logs`).

## 구현 진행 상황 (2026-08-07 기준) — **Plan 3 전체 완료**

- **완료:** Task 1~9 전부. 모든 Step 체크박스가 `- [x]`이다. subagent-driven-development 방식(구현 → 독립 리뷰 → 수정 라운드 → 범위 한정 재검증)으로 진행했고 전부 커밋 완료.
- **테스트:** 백엔드 167개(실제 PostgreSQL 통합 테스트 포함), 프론트엔드 170개, 프로덕션 빌드 성공.
- **작업 브랜치:** `worktree-plan3-problem-bank` (`master`의 `5dc2fd5`에서 분기).

### 구현 중 확정된 사항 (Plan 4~5가 반드시 알아야 함)

- **`problem_choices.is_correct`는 명시적 resultMap으로 매핑한다.** Lombok의 `boolean correct`가 프로퍼티명을 `correct`로 등록하는데, `map-underscore-to-camel-case`는 `is_correct`를 `ISCORRECT`로 정규화해 둘이 절대 매칭되지 않는다. 자동 매핑에 맡기면 **경고도 예외도 없이 정답 여부가 항상 `false`로 읽힌다.** Plan 4의 채점이 이 값을 쓰므로 `resultType`으로 되돌리지 말 것.
- **`assertOwnership(Problem, AuthUser)`가 부서 스코프의 단일 chokepoint다** (`ProblemServiceImpl`). 총괄관리자는 전체, 부서관리자는 자기 부서만. 목록은 서버 측 삼항식으로 `departmentId`를 강제하며 요청 파라미터는 `SUPER_ADMIN`일 때만 존중한다. Plan 4~5도 이 패턴을 복사할 것.
- **엑셀 행 저장은 `ProblemProvisioningService`가 `@Transactional(REQUIRES_NEW)`로 처리한다.** 부분 성공을 위해 행마다 독립 커밋이 필요하기 때문이다. 자기호출(self-invocation)로 대체하면 프록시를 타지 않아 조용히 무효화된다.
- **빈칸 마커 문법은 `{{blank_1}}`(중괄호 2개)로 고정**이며 Task 2 검증, Task 6 엑셀, Task 8 폼이 모두 이 문법을 전제한다.
- **`FILL_BLANK`는 엑셀 업로드를 지원하지 않는다.** 개별 등록 폼에서만 작성한다.
- **빈 보기·빈 정답은 서버·클라이언트 양쪽에서 거부한다.** 중간에 낀 공백도 마찬가지다 — 조용히 압축하면 "정답=2"가 다른 보기를 가리키게 되어 오답 채점으로 이어진다. 이 규칙을 완화하지 말 것.
- **이미지 저장 파일명은 UUID + 허용목록 확장자로만 만든다.** 클라이언트가 보낸 원본 파일명은 경로 구성에 절대 쓰지 않는다(임의 파일 쓰기 취약점). 허용: `png/jpg/jpeg/gif/webp`, 최대 5MB.
- **`GET /api/tags`는 로그인 사용자면 누구나 호출할 수 있다** — 관리자 role 제한을 두지 않는다.
- **`imageUrl`은 `/uploads/images/`로 시작하는 경로만 허용한다.** 판정 규칙(접두어·상위 경로 탈출·길이 상한)은 `ImageUrlValidator` **한 곳에만** 있고 JSON API 경로(`ProblemServiceImpl`)와 엑셀 경로(`ExcelProblemUploadServiceImpl`)가 모두 이를 호출한다. 규칙을 복제하지 말 것 — 이 플랜에서 검증 규칙이 경로별로 어긋나 실제 버그가 된 사례가 두 번 있었다. 엑셀의 이미지 컬럼은 **반드시 비워야 하며**, 이미지는 개별 등록/수정 폼에서만 첨부한다.
- **`/uploads/**`도 세션 검사를 거친다.** `SessionCheckFilter`가 `/api/` 외에 `/uploads/` 접두사도 게이트한다. 인증만 요구하고 부서 소유권은 보지 않는다 — 풀이는 전사 공통이므로 로그인한 직원이면 누구나 문제 이미지를 볼 수 있어야 한다. Plan 4에서 이 필터를 건드릴 때 `/uploads/`를 빠뜨리지 말 것.

### 미해결 — 판단 필요

- **디자인 시스템 해석 차이 2건:** 8.7은 태그 필터를 기본 노출로 두지만 구현은 상세 필터 안에 넣었다(백엔드가 단일 태그 문자열만 받으므로). 8.8은 기존 태그를 고르는 multi-select TagChip을 시사하지만 구현은 콤마 입력 + 읽기 전용 칩 미리보기다(`listTags`는 미사용). Design QA에서 판단할 것.
- **프론트엔드 컴포넌트는 렌더링 검증이 없다.** jsdom이 없어 순수 로직만 테스트했고, 마운트 정상 동작·모달 포커스·1440×1024 레이아웃은 **브라우저 수동 확인이 필요하다**(플랜의 완료 기준에도 Design QA 항목으로 들어 있다). jsdom + React Testing Library 도입은 Plan 4의 인프라 과제로 넘긴다.
- **보관(ARCHIVED) 복원 경로가 없다.** 상태를 되돌리는 API·서비스·UI가 전혀 없어 실수로 보관하면 SQL 없이는 되돌릴 수 없다. 데이터는 보존되므로 유실은 아니다. Plan 4에서 `restore`를 추가하려면 기존 `assertOwnership`을 재사용할 것.
- **404가 `INPUT_VALUE_INVALID`(1000)를 쓴다.** 전용 not-found 코드가 없어, 삭제된 문제의 수정 화면을 열면 프론트가 "다시 시도" 버튼을 보여주지만 눌러도 성공할 수 없다. Plan 4에서 `RESOURCE_NOT_FOUND`를 추가할 때 함께 정리할 것.
- ~~**페이지네이션이 없다.**~~ → **해소됨 (2026-08-09).** [`2026-08-09-admin-list-scroll-and-pagination.md`](2026-08-09-admin-list-scroll-and-pagination.md)로 처리했다. 문제 목록은 서버측 페이징(`ProblemMapper.xml`의 `LIMIT/OFFSET` + `ProblemDao.countAll`), 부서·계정 목록은 클라이언트측 페이징이다.
- **DB 인덱스는 여전히 하나도 없다.** `schema.sql`에 `CREATE INDEX`가 0개다(Plan 1·2도 동일). 목록 쿼리는 태그 `EXISTS` 서브쿼리 + 선행 와일드카드 `ILIKE` + `array_agg GROUP BY`를 쓰고, 페이징이 붙으면서 `countAll`이 매 조회마다 같은 조건으로 한 번 더 돈다. `problems`가 수천 건에 도달할 첫 테이블이므로 Plan 5의 통계 집계가 먼저 체감할 것이다. 최소한 `problems(department_id)`·`problems(created_at)`·`problem_tags(problem_id)`는 검토할 것.

## Global Constraints

- 문제 유형은 MCQ_SINGLE(객관식 단일), MCQ_MULTI(객관식 다중), OX, SHORT_ANSWER(주관식 단답형), FILL_BLANK(빈칸 채우기) 5가지이며, 서술형은 범위 밖이다 (PRD 섹션 4.1).
- 객관식/OX 보기는 최대 5개다 (섹션 4.1).
- 빈칸 채우기는 여러 빈칸 후보를 정의하고, 풀이 시도마다 그중 일부를 무작위로 선택해 노출한다 — 출제(등록) 시점에는 "빈칸 후보 정의 + 출제 시 노출할 개수"만 저장하고, 실제 무작위 선택은 Plan 4(풀이)에서 수행한다 (섹션 4.1.1).
- 문제 내용은 텍스트 외에 이미지(파일 업로드 후 URL 저장)와 참조 지문을 가질 수 있다 (섹션 4.2, 11.1 결정 사항).
- 삭제는 소프트 삭제(상태를 `ARCHIVED`로 변경)이며 기존 풀이 이력은 보존한다 (섹션 4.3).
- 부서 관리자는 자기 부서가 등록한 문제만 목록/수정/삭제 가능, 총괄 관리자는 전체 부서 문제에 접근 가능 (섹션 2.2, 4.3).
- 엑셀 업로드는 부분 성공을 허용한다. **빈칸 채우기 유형은 엑셀 업로드를 지원하지 않으며 개별 입력만 가능하다** — 엑셀에 `FILL_BLANK`가 입력된 행은 실패 처리한다 (섹션 4.2의 오픈 이슈에 대한 구현 결정).

## Design System Implementation Contract

프론트엔드 문제 관리 화면은 `docs/superpowers/specs/2026-07-29-blue-bento-design-system.md`를 단일 기준으로 사용한다. 대상 화면은 디자인 시스템 8.7 문제 목록, 8.8 문제 등록·수정, 8.9 문제 엑셀 업로드와 9.3 관리자 반응형 규칙이다.

- 관리자 Shell은 Plan 2에서 만든 공통 `AdminLayout`을 재사용한다. 문제 목록은 데스크톱 전용 밀도를 유지하되, 필터·테이블·폼의 행 높이와 여백은 디자인 토큰으로 통일한다.
- 문제 목록에는 유형·상태·키워드·태그·등록일 시작·종료일 필터를 제공한다. 태그와 등록일 필터는 기본 화면에서 과도하게 공간을 차지하지 않도록 디자인 시스템의 상세 필터 규칙을 적용한다.
- 문제 등록·수정 폼은 문제 유형별 입력 영역, 보기·정답 검증, 이미지·참조 지문, 태그 입력을 일관된 Field·FieldGroup·ValidationMessage로 표현한다. `FILL_BLANK`는 개별 등록 화면에서만 제공하고 엑셀 화면에는 미지원 안내를 표시한다.
- 목록, 등록·수정, 이미지 업로드, 엑셀 업로드에는 로딩, 결과 없음, 권한 없음, 검증 실패, 저장 성공·실패, 부분 성공 상태를 포함한다. 삭제·보관은 확인 Modal을 거친다.
- 완료 기준에는 PC 1440×1024 기준의 목록·폼·업로드 화면, 모바일 접근 차단, 키보드 포커스, 필터 초기화·조회 동작, 행별 엑셀 오류 표시를 Design QA로 확인하는 항목을 포함한다.

## Approved Amendments (2026-07-29)

- 문제 하나에 여러 태그를 지정할 수 있도록 `tags`/`problem_tags` 도메인·DAO·Mapper를 추가한다. 태그는 문제 등록·수정·상세·목록과 풀이 문제 검색에서 사용한다.
- 문제 목록 API와 화면에 `createdFrom`, `createdTo`, `tag` 필터를 추가한다. 부서 관리자는 자기 부서 스코프를 유지한다.
- 문제 엑셀 템플릿에 `태그` 컬럼을 추가하고, 여러 태그는 콤마로 구분한다.
- 문제 등록·수정·보관·이미지 업로드·엑셀 업로드는 실제 DB `audit_logs`에 기록한다.
- 문제 수정 시 유형은 변경하지 않도록 서버에서도 기존 유형과 요청 유형의 불일치를 거부한다.
- 문제 생성·수정 및 엑셀 행 처리에서 유형 누락, 빈 보기/정답, 중복 빈칸 키, 본문에 없는 빈칸 마커를 검증한다.
- PRD 11.2의 "엑셀 업로드 템플릿의 정확한 컬럼 스펙 및 다운로드 가능한 양식 제공 여부" 오픈 이슈는 이번 범위에서 다음과 같이 확정한다: 컬럼 스펙은 위 `문제유형 | 문제내용 | 이미지 | 참조지문 | 보기1~5 | 정답 | 해설 | 태그` 12개로 확정하되, **다운로드 가능한 `.xlsx` 템플릿 파일은 제공하지 않는다**. 업로드 화면(디자인 시스템 8.9)에는 컬럼 설명 텍스트와 예시 행만 표시하고 템플릿 다운로드 API/버튼은 만들지 않는다. 필요성이 확인되면 별도 Plan에서 재검토한다.

### Task 계약 보완 — 태그/등록일 필터의 최종 계약

- 도메인/DAO/Mapper에 `Tag`, `ProblemTag`, `TagDao`, `ProblemTagDao`를 추가한다. `TagDao.findOrCreateByNames(List<String>)`, `TagDao.findAll`, `ProblemTagDao.replaceTags`, `ProblemTagDao.findTagNamesByProblemId`를 제공한다.
- PostgreSQL `array_agg` 결과를 `List<String> tags`로 매핑하기 위해 `TagArrayTypeHandler`를 추가하고 목록 Mapper의 tags 컬럼에 지정한다. 풀이 목록도 동일한 타입 처리 규칙을 사용한다.
- `TagController`는 `GET /api/tags`를 제공하고 `TagService.list()`를 호출한다. 인증은 Plan 1의 세션 필터가 담당하며 별도 관리자 role 제한은 두지 않는다.
- 태그는 trim 후 빈 값을 제거하고 대소문자 무관 중복을 거부/통합하며, 문제당 최대 20개·태그명 최대 100자로 검증한다. `GET /api/tags`는 로그인 사용자에게 태그 선택지 목록을 제공한다.
- `ProblemDao.findAll`은 `departmentId, type, status, createdFrom, createdTo, tag, keyword`를 받는다. 날짜는 `created_at >= createdFrom 00:00:00` 및 `created_at < createdTo + 1일 00:00:00`으로 처리해 종료일을 포함한다.
- 목록 DTO와 상세 응답에 `List<String> tags`를 포함한다. 생성/수정은 문제 본문 저장과 태그 연결 교체를 하나의 트랜잭션으로 처리하고, 보관·이미지 업로드·엑셀 업로드도 actor 기반 DB 감사 로그를 남긴다.
- 문제 엑셀 컬럼은 `문제유형 | 문제내용 | 이미지 | 참조지문 | 보기1 | 보기2 | 보기3 | 보기4 | 보기5 | 정답 | 해설 | 태그`이며 태그 셀은 콤마 구분이다. 컬럼 인덱스 11을 사용한다.

태그 목록 API 계약:
```java
public interface TagService {
    List<Tag> list();
}

@RestController
@RequestMapping("/api/tags")
public class TagController {
    private final TagService tagService;

    @GetMapping
    public ResponseEntity<ResponseDto<?>> list() {
        return ResponseEntity.ok(ResponseDto.ok(tagService.list()));
    }
}
```

`TagArrayTypeHandler`는 PostgreSQL `java.sql.Array`를 `List<String>`으로 변환하고, INSERT 파라미터에는 사용하지 않는다. `ProblemMapper.xml`과 Plan 4의 풀이 목록 Mapper 모두 `resultMap`의 `tags` 필드에 이 핸들러를 지정한다.

---

## Part 1 — 백엔드: 도메인/Dao

### Task 1: Problem 도메인 및 Dao·Mapper 골격

**Files:**
- Create: `backend/src/main/java/com/daeryun/probank/domain/ProblemType.java`
- Create: `backend/src/main/java/com/daeryun/probank/domain/ProblemStatus.java`
- Create: `backend/src/main/java/com/daeryun/probank/domain/Problem.java`
- Create: `backend/src/main/java/com/daeryun/probank/domain/ProblemChoice.java`
- Create: `backend/src/main/java/com/daeryun/probank/domain/ProblemAnswer.java`
- Create: `backend/src/main/java/com/daeryun/probank/domain/ProblemBlank.java`
- Create: `backend/src/main/java/com/daeryun/probank/domain/Tag.java`
- Create: `backend/src/main/java/com/daeryun/probank/domain/ProblemTag.java`
- Create: `backend/src/main/java/com/daeryun/probank/dao/ProblemDao.java`
- Create: `backend/src/main/java/com/daeryun/probank/dao/ProblemChoiceDao.java`
- Create: `backend/src/main/java/com/daeryun/probank/dao/ProblemAnswerDao.java`
- Create: `backend/src/main/java/com/daeryun/probank/dao/ProblemBlankDao.java`
- Create: `backend/src/main/java/com/daeryun/probank/dao/TagDao.java`
- Create: `backend/src/main/java/com/daeryun/probank/dao/ProblemTagDao.java`
- Create: `backend/src/main/java/com/daeryun/probank/service/TagService.java`
- Create: `backend/src/main/java/com/daeryun/probank/service/TagServiceImpl.java`
- Create: `backend/src/main/java/com/daeryun/probank/controller/TagController.java`
- Create: `backend/src/main/resources/mappers/probank/ProblemMapper.xml`
- Create: `backend/src/main/resources/mappers/probank/ProblemChoiceMapper.xml`
- Create: `backend/src/main/resources/mappers/probank/ProblemAnswerMapper.xml`
- Create: `backend/src/main/resources/mappers/probank/ProblemBlankMapper.xml`
- Create: `backend/src/main/resources/mappers/probank/TagMapper.xml`
- Create: `backend/src/main/resources/mappers/probank/ProblemTagMapper.xml`
- Create: `backend/src/main/java/com/daeryun/probank/config/TagArrayTypeHandler.java`
- Test: `backend/src/test/java/com/daeryun/probank/dao/ProblemDaoTest.java`

**Interfaces:**
- Consumes: Plan 1 Task 2의 `problems`/`problem_choices`/`problem_answers`/`problem_blanks` 테이블
- Produces: `ProblemDao.insert/findById/update/updateStatus/findAll(필터)`, `ProblemChoiceDao.insertAll/findByProblemId/deleteByProblemId`, `ProblemAnswerDao.insertAll/findByProblemId/deleteByProblemId`, `ProblemBlankDao.insertAll/findByProblemId/deleteByProblemId`. Task 2~6, Plan 4·5가 사용한다.

- [x] **Step 1: 도메인 POJO 작성**

`backend/src/main/java/com/daeryun/probank/domain/ProblemType.java`:
```java
package com.daeryun.probank.domain;

public enum ProblemType {
    MCQ_SINGLE,
    MCQ_MULTI,
    OX,
    SHORT_ANSWER,
    FILL_BLANK
}
```

`backend/src/main/java/com/daeryun/probank/domain/ProblemStatus.java`:
```java
package com.daeryun.probank.domain;

public enum ProblemStatus {
    ACTIVE,
    ARCHIVED
}
```

`backend/src/main/java/com/daeryun/probank/domain/Problem.java`:
```java
package com.daeryun.probank.domain;

import lombok.Data;

import java.time.LocalDateTime;

@Data
public class Problem {
    private Long id;
    private ProblemType type;
    private String content;
    private String imageUrl;
    private String referenceText;
    private String explanation;
    private Integer blankRevealCount;
    private ProblemStatus status;
    private Long departmentId;
    private Long createdBy;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}
```

`backend/src/main/java/com/daeryun/probank/domain/ProblemChoice.java`:
```java
package com.daeryun.probank.domain;

import lombok.Data;

@Data
public class ProblemChoice {
    private Long id;
    private Long problemId;
    private String choiceText;
    private boolean correct;
    private int displayOrder;
}
```

`backend/src/main/java/com/daeryun/probank/domain/ProblemAnswer.java`:
```java
package com.daeryun.probank.domain;

import lombok.Data;

@Data
public class ProblemAnswer {
    private Long id;
    private Long problemId;
    private String answerText;
}
```

`backend/src/main/java/com/daeryun/probank/domain/ProblemBlank.java`:
```java
package com.daeryun.probank.domain;

import lombok.Data;

@Data
public class ProblemBlank {
    private Long id;
    private Long problemId;
    private String blankKey;
    private String answerText;
    private int displayOrder;
}
```

- [x] **Step 2: Dao 인터페이스 작성**

`backend/src/main/java/com/daeryun/probank/dao/ProblemDao.java`:
```java
package com.daeryun.probank.dao;

import com.daeryun.probank.domain.Problem;
import com.daeryun.probank.domain.ProblemStatus;
import com.daeryun.probank.dto.problem.ProblemListItem;
import org.apache.ibatis.annotations.Param;

import java.util.List;

public interface ProblemDao {
    void insert(Problem problem);
    Problem findById(@Param("id") Long id);
    void update(Problem problem);
    void updateStatus(@Param("id") Long id, @Param("status") ProblemStatus status);
    List<ProblemListItem> findAll(@Param("departmentId") Long departmentId,
                                   @Param("type") String type,
                                   @Param("status") String status,
                                   @Param("createdFrom") java.time.LocalDate createdFrom,
                                   @Param("createdTo") java.time.LocalDate createdTo,
                                   @Param("tag") String tag,
                                   @Param("keyword") String keyword);
}
```

`backend/src/main/java/com/daeryun/probank/dao/ProblemChoiceDao.java`:
```java
package com.daeryun.probank.dao;

import com.daeryun.probank.domain.ProblemChoice;
import org.apache.ibatis.annotations.Param;

import java.util.List;

public interface ProblemChoiceDao {
    void insertAll(@Param("choices") List<ProblemChoice> choices);
    List<ProblemChoice> findByProblemId(@Param("problemId") Long problemId);
    void deleteByProblemId(@Param("problemId") Long problemId);
}
```

`backend/src/main/java/com/daeryun/probank/dao/ProblemAnswerDao.java`:
```java
package com.daeryun.probank.dao;

import com.daeryun.probank.domain.ProblemAnswer;
import org.apache.ibatis.annotations.Param;

import java.util.List;

public interface ProblemAnswerDao {
    void insertAll(@Param("answers") List<ProblemAnswer> answers);
    List<ProblemAnswer> findByProblemId(@Param("problemId") Long problemId);
    void deleteByProblemId(@Param("problemId") Long problemId);
}
```

`backend/src/main/java/com/daeryun/probank/dao/ProblemBlankDao.java`:
```java
package com.daeryun.probank.dao;

import com.daeryun.probank.domain.ProblemBlank;
import org.apache.ibatis.annotations.Param;

import java.util.List;

public interface ProblemBlankDao {
    void insertAll(@Param("blanks") List<ProblemBlank> blanks);
    List<ProblemBlank> findByProblemId(@Param("problemId") Long problemId);
    void deleteByProblemId(@Param("problemId") Long problemId);
}
```

(참고: `ProblemDao`가 `com.daeryun.probank.dto.problem.ProblemListItem`을 참조하므로, 컴파일을 위해 Task 3에서 해당 DTO를 만들기 전까지는 이 파일만으로 빌드되지 않는다 — Step 3에서 최소 버전을 함께 만든다.)

- [x] **Step 3: `ProblemListItem` 최소 버전 및 Mapper XML 작성**

`backend/src/main/java/com/daeryun/probank/dto/problem/ProblemListItem.java`:
```java
package com.daeryun.probank.dto.problem;

import com.daeryun.probank.domain.ProblemStatus;
import com.daeryun.probank.domain.ProblemType;
import lombok.Data;

import java.time.LocalDateTime;

@Data
public class ProblemListItem {
    private Long id;
    private ProblemType type;
    private String content;
    private ProblemStatus status;
    private Long departmentId;
    private String departmentName;
    private LocalDateTime createdAt;
    private java.util.List<String> tags;
}
```

`backend/src/main/resources/mappers/probank/ProblemMapper.xml`:
```xml
<?xml version="1.0" encoding="UTF-8" ?>
<!DOCTYPE mapper PUBLIC "-//mybatis.org//DTD Mapper 3.0//EN" "http://mybatis.org/dtd/mybatis-3-mapper.dtd">
<mapper namespace="com.daeryun.probank.dao.ProblemDao">

    <resultMap id="problemListItemMap" type="com.daeryun.probank.dto.problem.ProblemListItem">
        <result property="tags" column="tags" typeHandler="com.daeryun.probank.config.TagArrayTypeHandler"/>
    </resultMap>

    <insert id="insert" parameterType="Problem" useGeneratedKeys="true" keyProperty="id">
        INSERT INTO problems
            (type, content, image_url, reference_text, explanation, blank_reveal_count, status, department_id, created_by)
        VALUES
            (#{type}, #{content}, #{imageUrl}, #{referenceText}, #{explanation}, #{blankRevealCount}, #{status}, #{departmentId}, #{createdBy})
    </insert>

    <select id="findById" resultType="Problem">
        SELECT id, type, content, image_url, reference_text, explanation, blank_reveal_count,
               status, department_id, created_by, created_at, updated_at
        FROM problems WHERE id = #{id}
    </select>

    <update id="update" parameterType="Problem">
        UPDATE problems
        SET content = #{content}, image_url = #{imageUrl}, reference_text = #{referenceText},
            explanation = #{explanation}, blank_reveal_count = #{blankRevealCount}, updated_at = now()
        WHERE id = #{id}
    </update>

    <update id="updateStatus">
        UPDATE problems SET status = #{status}, updated_at = now() WHERE id = #{id}
    </update>

    <select id="findAll" resultMap="problemListItemMap">
        SELECT p.id, p.type, p.content, p.status, p.department_id, d.name AS department_name, p.created_at,
               COALESCE(array_agg(DISTINCT t.name) FILTER (WHERE t.name IS NOT NULL), '{}') AS tags
        FROM problems p
        JOIN departments d ON d.id = p.department_id
        LEFT JOIN problem_tags pt ON pt.problem_id = p.id
        LEFT JOIN tags t ON t.id = pt.tag_id
        <where>
            <if test="departmentId != null">AND p.department_id = #{departmentId}</if>
            <if test="type != null">AND p.type = #{type}</if>
            <if test="status != null">AND p.status = #{status}</if>
            <if test="createdFrom != null">AND p.created_at &gt;= #{createdFrom}</if>
            <if test="createdTo != null">AND p.created_at &lt; (#{createdTo} + INTERVAL '1 day')</if>
            <if test="tag != null and tag != ''">AND EXISTS (SELECT 1 FROM problem_tags fpt JOIN tags ft ON ft.id = fpt.tag_id WHERE fpt.problem_id = p.id AND lower(ft.name) = lower(#{tag}))</if>
            <if test="keyword != null and keyword != ''">AND p.content ILIKE CONCAT('%', #{keyword}, '%')</if>
        </where>
        GROUP BY p.id, d.name
        ORDER BY p.created_at DESC
    </select>

</mapper>
```

`backend/src/main/resources/mappers/probank/ProblemChoiceMapper.xml`:
```xml
<?xml version="1.0" encoding="UTF-8" ?>
<!DOCTYPE mapper PUBLIC "-//mybatis.org//DTD Mapper 3.0//EN" "http://mybatis.org/dtd/mybatis-3-mapper.dtd">
<mapper namespace="com.daeryun.probank.dao.ProblemChoiceDao">

    <insert id="insertAll">
        INSERT INTO problem_choices (problem_id, choice_text, is_correct, display_order)
        VALUES
        <foreach collection="choices" item="choice" separator=",">
            (#{choice.problemId}, #{choice.choiceText}, #{choice.correct}, #{choice.displayOrder})
        </foreach>
    </insert>

    <select id="findByProblemId" resultType="ProblemChoice">
        SELECT id, problem_id, choice_text, is_correct, display_order
        FROM problem_choices WHERE problem_id = #{problemId} ORDER BY display_order
    </select>

    <delete id="deleteByProblemId">
        DELETE FROM problem_choices WHERE problem_id = #{problemId}
    </delete>

</mapper>
```

`backend/src/main/resources/mappers/probank/ProblemAnswerMapper.xml`:
```xml
<?xml version="1.0" encoding="UTF-8" ?>
<!DOCTYPE mapper PUBLIC "-//mybatis.org//DTD Mapper 3.0//EN" "http://mybatis.org/dtd/mybatis-3-mapper.dtd">
<mapper namespace="com.daeryun.probank.dao.ProblemAnswerDao">

    <insert id="insertAll">
        INSERT INTO problem_answers (problem_id, answer_text)
        VALUES
        <foreach collection="answers" item="answer" separator=",">
            (#{answer.problemId}, #{answer.answerText})
        </foreach>
    </insert>

    <select id="findByProblemId" resultType="ProblemAnswer">
        SELECT id, problem_id, answer_text FROM problem_answers WHERE problem_id = #{problemId}
    </select>

    <delete id="deleteByProblemId">
        DELETE FROM problem_answers WHERE problem_id = #{problemId}
    </delete>

</mapper>
```

`backend/src/main/resources/mappers/probank/ProblemBlankMapper.xml`:
```xml
<?xml version="1.0" encoding="UTF-8" ?>
<!DOCTYPE mapper PUBLIC "-//mybatis.org//DTD Mapper 3.0//EN" "http://mybatis.org/dtd/mybatis-3-mapper.dtd">
<mapper namespace="com.daeryun.probank.dao.ProblemBlankDao">

    <insert id="insertAll">
        INSERT INTO problem_blanks (problem_id, blank_key, answer_text, display_order)
        VALUES
        <foreach collection="blanks" item="blank" separator=",">
            (#{blank.problemId}, #{blank.blankKey}, #{blank.answerText}, #{blank.displayOrder})
        </foreach>
    </insert>

    <select id="findByProblemId" resultType="ProblemBlank">
        SELECT id, problem_id, blank_key, answer_text, display_order
        FROM problem_blanks WHERE problem_id = #{problemId} ORDER BY display_order
    </select>

    <delete id="deleteByProblemId">
        DELETE FROM problem_blanks WHERE problem_id = #{problemId}
    </delete>

</mapper>
```

- [x] **Step 4: Dao 통합 테스트 작성**

`backend/src/test/java/com/daeryun/probank/dao/ProblemDaoTest.java`:
```java
package com.daeryun.probank.dao;

import com.daeryun.probank.domain.*;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.transaction.annotation.Transactional;

import java.util.Collections;

import static org.junit.jupiter.api.Assertions.assertEquals;

@SpringBootTest
@Transactional
class ProblemDaoTest {

    @Autowired private DepartmentDao departmentDao;
    @Autowired private UserDao userDao;
    @Autowired private ProblemDao problemDao;
    @Autowired private ProblemChoiceDao problemChoiceDao;

    @Test
    void insertProblemWithChoices_andReadBack() {
        Department department = new Department();
        department.setName("QA");
        department.setCode("QA-" + System.nanoTime());
        department.setStatus(Status.ACTIVE);
        departmentDao.insert(department);

        User author = new User();
        author.setEmployeeNo("author-" + System.nanoTime());
        author.setName("작성자");
        author.setEmail("author-" + System.nanoTime() + "@company.local");
        author.setPasswordHash("hash");
        author.setDepartmentId(department.getId());
        author.setRole(UserRole.DEPT_ADMIN);
        author.setStatus(Status.ACTIVE);
        author.setMustChangePassword(false);
        userDao.insert(author);

        Problem problem = new Problem();
        problem.setType(ProblemType.MCQ_SINGLE);
        problem.setContent("1 + 1 = ?");
        problem.setStatus(ProblemStatus.ACTIVE);
        problem.setDepartmentId(department.getId());
        problem.setCreatedBy(author.getId());
        problemDao.insert(problem);

        ProblemChoice choice1 = new ProblemChoice();
        choice1.setProblemId(problem.getId());
        choice1.setChoiceText("1");
        choice1.setCorrect(false);
        choice1.setDisplayOrder(1);
        ProblemChoice choice2 = new ProblemChoice();
        choice2.setProblemId(problem.getId());
        choice2.setChoiceText("2");
        choice2.setCorrect(true);
        choice2.setDisplayOrder(2);
        problemChoiceDao.insertAll(java.util.Arrays.asList(choice1, choice2));

        Problem found = problemDao.findById(problem.getId());
        assertEquals("1 + 1 = ?", found.getContent());
        assertEquals(2, problemChoiceDao.findByProblemId(problem.getId()).size());
    }
}
```

- [x] **Step 5: 테스트 실행**

Run: `cd backend && ./gradlew test --tests ProblemDaoTest`
Expected: `BUILD SUCCESSFUL`

- [x] **Step 6: Commit**

```bash
git add backend/src/main/java/com/daeryun/probank/domain backend/src/main/java/com/daeryun/probank/dao backend/src/main/java/com/daeryun/probank/dto/problem/ProblemListItem.java backend/src/main/resources/mappers/probank/Problem*.xml backend/src/test/java/com/daeryun/probank/dao/ProblemDaoTest.java
git commit -m "feat: add problem domain, dao and mapper skeleton"
```

---

### Task 2: 문제 등록 API (유형별 검증)

**Files:**
- Create: `backend/src/main/java/com/daeryun/probank/dto/problem/ChoiceInput.java`
- Create: `backend/src/main/java/com/daeryun/probank/dto/problem/BlankInput.java`
- Create: `backend/src/main/java/com/daeryun/probank/dto/problem/ProblemCreateRequest.java`
- Create: `backend/src/main/java/com/daeryun/probank/service/ProblemService.java`
- Create: `backend/src/main/java/com/daeryun/probank/service/ProblemServiceImpl.java`
- Create: `backend/src/main/java/com/daeryun/probank/controller/ProblemController.java`
- Test: `backend/src/test/java/com/daeryun/probank/service/ProblemServiceImplTest.java`

**Interfaces:**
- Consumes: `ProblemDao/ProblemChoiceDao/ProblemAnswerDao/ProblemBlankDao`(Task 1), `AuthUser`(Plan 1 Task 4)
- Produces: `ProblemService.create(ProblemCreateRequest, AuthUser)`. `POST /api/admin/problems`. Task 6(엑셀 업로드), Task 8(프론트 등록 폼)이 사용한다.

- [x] **Step 1: 실패하는 테스트 작성**

`backend/src/test/java/com/daeryun/probank/service/ProblemServiceImplTest.java`:
```java
package com.daeryun.probank.service;

import com.daeryun.probank.common.AuthUser;
import com.daeryun.probank.dao.ProblemAnswerDao;
import com.daeryun.probank.dao.ProblemBlankDao;
import com.daeryun.probank.dao.ProblemChoiceDao;
import com.daeryun.probank.dao.ProblemDao;
import com.daeryun.probank.dao.ProblemTagDao;
import com.daeryun.probank.dao.TagDao;
import com.daeryun.probank.domain.ProblemType;
import com.daeryun.probank.domain.UserRole;
import com.daeryun.probank.dto.problem.BlankInput;
import com.daeryun.probank.dto.problem.ChoiceInput;
import com.daeryun.probank.dto.problem.ProblemCreateRequest;
import com.daeryun.probank.exception.BizException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;

import java.util.Arrays;
import java.util.Collections;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertThrows;

class ProblemServiceImplTest {

    private ProblemDao problemDao;
    private ProblemChoiceDao problemChoiceDao;
    private ProblemAnswerDao problemAnswerDao;
    private ProblemBlankDao problemBlankDao;
    private TagDao tagDao;
    private ProblemTagDao problemTagDao;
    private ProblemServiceImpl service;
    private final AuthUser actor = new AuthUser(1L, "1001", "관리자", UserRole.DEPT_ADMIN, 10L, false);

    @BeforeEach
    void setUp() {
        problemDao = Mockito.mock(ProblemDao.class);
        problemChoiceDao = Mockito.mock(ProblemChoiceDao.class);
        problemAnswerDao = Mockito.mock(ProblemAnswerDao.class);
        problemBlankDao = Mockito.mock(ProblemBlankDao.class);
        tagDao = Mockito.mock(TagDao.class);
        problemTagDao = Mockito.mock(ProblemTagDao.class);
        AuditLogService auditLogService = Mockito.mock(AuditLogService.class);
        service = new ProblemServiceImpl(problemDao, problemChoiceDao, problemAnswerDao, problemBlankDao,
                tagDao, problemTagDao, auditLogService);
    }

    private ChoiceInput choice(String text, boolean correct) {
        ChoiceInput input = new ChoiceInput();
        input.setText(text);
        input.setCorrect(correct);
        return input;
    }

    @Test
    void create_mcqSingle_withOneCorrectChoice_succeeds() {
        ProblemCreateRequest request = new ProblemCreateRequest();
        request.setType(ProblemType.MCQ_SINGLE);
        request.setContent("1+1=?");
        request.setChoices(Arrays.asList(choice("1", false), choice("2", true)));

        service.create(request, actor);

        Mockito.verify(problemDao).insert(Mockito.any());
        Mockito.verify(problemChoiceDao).insertAll(Mockito.anyList());
    }

    @Test
    void create_mcqSingle_withTwoCorrectChoices_rejects() {
        ProblemCreateRequest request = new ProblemCreateRequest();
        request.setType(ProblemType.MCQ_SINGLE);
        request.setContent("1+1=?");
        request.setChoices(Arrays.asList(choice("1", true), choice("2", true)));

        assertThrows(BizException.class, () -> service.create(request, actor));
    }

    @Test
    void create_mcqSingle_withSixChoices_rejects() {
        ProblemCreateRequest request = new ProblemCreateRequest();
        request.setType(ProblemType.MCQ_SINGLE);
        request.setContent("1+1=?");
        request.setChoices(Arrays.asList(
                choice("1", false), choice("2", true), choice("3", false),
                choice("4", false), choice("5", false), choice("6", false)));

        assertThrows(BizException.class, () -> service.create(request, actor));
    }

    @Test
    void create_ox_withTwoChoicesOneCorrect_succeeds() {
        ProblemCreateRequest request = new ProblemCreateRequest();
        request.setType(ProblemType.OX);
        request.setContent("지구는 둥글다.");
        request.setChoices(Arrays.asList(choice("O", true), choice("X", false)));

        service.create(request, actor);

        Mockito.verify(problemDao).insert(Mockito.any());
    }

    @Test
    void create_shortAnswer_withoutAnswers_rejects() {
        ProblemCreateRequest request = new ProblemCreateRequest();
        request.setType(ProblemType.SHORT_ANSWER);
        request.setContent("대한민국의 수도는?");
        request.setAnswers(Collections.emptyList());

        assertThrows(BizException.class, () -> service.create(request, actor));
    }

    @Test
    void create_fillBlank_withRevealCountExceedingBlankSize_rejects() {
        ProblemCreateRequest request = new ProblemCreateRequest();
        request.setType(ProblemType.FILL_BLANK);
        request.setContent("{{blank_1}}은 {{blank_2}}의 수도이다.");
        BlankInput blank1 = new BlankInput();
        blank1.setBlankKey("blank_1");
        blank1.setAnswerText("서울");
        request.setBlanks(Collections.singletonList(blank1));
        request.setBlankRevealCount(2);

        assertThrows(BizException.class, () -> service.create(request, actor));
    }

    @Test
    void create_fillBlank_withValidRevealCount_succeeds() {
        ProblemCreateRequest request = new ProblemCreateRequest();
        request.setType(ProblemType.FILL_BLANK);
        request.setContent("{{blank_1}}은 {{blank_2}}의 수도이다.");
        BlankInput blank1 = new BlankInput();
        blank1.setBlankKey("blank_1");
        blank1.setAnswerText("서울");
        BlankInput blank2 = new BlankInput();
        blank2.setBlankKey("blank_2");
        blank2.setAnswerText("대한민국");
        request.setBlanks(Arrays.asList(blank1, blank2));
        request.setBlankRevealCount(1);

        service.create(request, actor);

        Mockito.verify(problemBlankDao).insertAll(Mockito.anyList());
    }
}
```

- [x] **Step 2: 테스트 실행하여 실패 확인**

Run: `cd backend && ./gradlew test --tests ProblemServiceImplTest`
Expected: FAIL — 관련 클래스가 없어 컴파일 오류

- [x] **Step 3: DTO/Service/Controller 구현**

`backend/src/main/java/com/daeryun/probank/dto/problem/ChoiceInput.java`:
```java
package com.daeryun.probank.dto.problem;

import lombok.Data;

@Data
public class ChoiceInput {
    private String text;
    private boolean correct;
}
```

`backend/src/main/java/com/daeryun/probank/dto/problem/BlankInput.java`:
```java
package com.daeryun.probank.dto.problem;

import lombok.Data;

@Data
public class BlankInput {
    private String blankKey;
    private String answerText;
}
```

`backend/src/main/java/com/daeryun/probank/dto/problem/ProblemCreateRequest.java`:
```java
package com.daeryun.probank.dto.problem;

import com.daeryun.probank.domain.ProblemType;
import lombok.Data;

import java.util.List;

@Data
public class ProblemCreateRequest {
    private ProblemType type;
    private String content;
    private String imageUrl;
    private String referenceText;
    private String explanation;
    private List<ChoiceInput> choices;
    private List<String> answers;
    private List<BlankInput> blanks;
    private Integer blankRevealCount;
    private List<String> tags;
}
```

`backend/src/main/java/com/daeryun/probank/service/ProblemService.java`:
```java
package com.daeryun.probank.service;

import com.daeryun.probank.common.AuthUser;
import com.daeryun.probank.dto.problem.ProblemCreateRequest;
import com.daeryun.probank.dto.problem.ProblemListItem;

public interface ProblemService {
    void create(ProblemCreateRequest request, AuthUser actor);
    void update(Long id, ProblemCreateRequest request, AuthUser actor);
    void archive(Long id, AuthUser actor);
    java.util.List<ProblemListItem> list(AuthUser actor, Long departmentId, String type, String status,
                                          java.time.LocalDate createdFrom, java.time.LocalDate createdTo,
                                          String tag, String keyword);
}
```

`backend/src/main/java/com/daeryun/probank/service/ProblemServiceImpl.java`:
```java
package com.daeryun.probank.service;

import com.daeryun.probank.common.AuthUser;
import com.daeryun.probank.common.ErrorCode;
import com.daeryun.probank.dao.ProblemAnswerDao;
import com.daeryun.probank.dao.ProblemBlankDao;
import com.daeryun.probank.dao.ProblemChoiceDao;
import com.daeryun.probank.dao.ProblemDao;
import com.daeryun.probank.domain.*;
import com.daeryun.probank.dto.problem.BlankInput;
import com.daeryun.probank.dto.problem.ChoiceInput;
import com.daeryun.probank.dto.problem.ProblemCreateRequest;
import com.daeryun.probank.exception.BizException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.stream.Collectors;

@Service
public class ProblemServiceImpl implements ProblemService {

    private static final int MIN_CHOICES = 2;
    private static final int MAX_CHOICES = 5;

    private final ProblemDao problemDao;
    private final ProblemChoiceDao problemChoiceDao;
    private final ProblemAnswerDao problemAnswerDao;
    private final ProblemBlankDao problemBlankDao;
    private final TagDao tagDao;
    private final ProblemTagDao problemTagDao;
    private final AuditLogService auditLogService;

    public ProblemServiceImpl(ProblemDao problemDao, ProblemChoiceDao problemChoiceDao,
                               ProblemAnswerDao problemAnswerDao, ProblemBlankDao problemBlankDao,
                               TagDao tagDao, ProblemTagDao problemTagDao, AuditLogService auditLogService) {
        this.problemDao = problemDao;
        this.problemChoiceDao = problemChoiceDao;
        this.problemAnswerDao = problemAnswerDao;
        this.problemBlankDao = problemBlankDao;
        this.tagDao = tagDao;
        this.problemTagDao = problemTagDao;
        this.auditLogService = auditLogService;
    }

    @Override
    @Transactional
    public void create(ProblemCreateRequest request, AuthUser actor) {
        validate(request);

        Problem problem = new Problem();
        problem.setType(request.getType());
        problem.setContent(request.getContent());
        problem.setImageUrl(request.getImageUrl());
        problem.setReferenceText(request.getReferenceText());
        problem.setExplanation(request.getExplanation());
        problem.setBlankRevealCount(request.getType() == ProblemType.FILL_BLANK ? request.getBlankRevealCount() : null);
        problem.setStatus(ProblemStatus.ACTIVE);
        problem.setDepartmentId(actor.getDepartmentId());
        problem.setCreatedBy(actor.getUserId());
        problemDao.insert(problem);

        saveTypeSpecificData(problem.getId(), request);
        problemTagDao.replaceTags(problem.getId(), tagDao.findOrCreateByNames(normalizeTags(request.getTags())));
        auditLogService.record(actor.getUserId(), "PROBLEM_CREATED", "PROBLEM", problem.getId(),
                "{\"type\":\"" + problem.getType() + "\"}");
    }

    private List<String> normalizeTags(List<String> input) {
        if (input == null) return java.util.Collections.emptyList();
        List<String> normalized = input.stream().map(String::trim).filter(s -> !s.isEmpty())
                .map(String::toLowerCase).distinct().collect(Collectors.toList());
        if (normalized.size() > 20 || normalized.stream().anyMatch(s -> s.length() > 100)) {
            throw new BizException(ErrorCode.INPUT_VALUE_INVALID, "태그는 문제당 20개, 태그명은 100자 이하여야 합니다.");
        }
        return normalized;
    }

    private void saveTypeSpecificData(Long problemId, ProblemCreateRequest request) {
        switch (request.getType()) {
            case MCQ_SINGLE:
            case MCQ_MULTI:
            case OX:
                List<ProblemChoice> choices = toChoiceEntities(problemId, request.getChoices());
                problemChoiceDao.insertAll(choices);
                break;
            case SHORT_ANSWER:
                List<ProblemAnswer> answers = request.getAnswers().stream().map(text -> {
                    ProblemAnswer answer = new ProblemAnswer();
                    answer.setProblemId(problemId);
                    answer.setAnswerText(text);
                    return answer;
                }).collect(Collectors.toList());
                problemAnswerDao.insertAll(answers);
                break;
            case FILL_BLANK:
                List<ProblemBlank> blanks = new java.util.ArrayList<>();
                for (int i = 0; i < request.getBlanks().size(); i++) {
                    BlankInput input = request.getBlanks().get(i);
                    ProblemBlank blank = new ProblemBlank();
                    blank.setProblemId(problemId);
                    blank.setBlankKey(input.getBlankKey());
                    blank.setAnswerText(input.getAnswerText());
                    blank.setDisplayOrder(i + 1);
                    blanks.add(blank);
                }
                problemBlankDao.insertAll(blanks);
                break;
        }
    }

    private List<ProblemChoice> toChoiceEntities(Long problemId, List<ChoiceInput> inputs) {
        List<ProblemChoice> choices = new java.util.ArrayList<>();
        for (int i = 0; i < inputs.size(); i++) {
            ChoiceInput input = inputs.get(i);
            ProblemChoice choice = new ProblemChoice();
            choice.setProblemId(problemId);
            choice.setChoiceText(input.getText());
            choice.setCorrect(input.isCorrect());
            choice.setDisplayOrder(i + 1);
            choices.add(choice);
        }
        return choices;
    }

    private void validate(ProblemCreateRequest request) {
        if (isBlank(request.getContent())) {
            throw new BizException(ErrorCode.INPUT_VALUE_INVALID, "문제 내용을 입력하세요.");
        }
        switch (request.getType()) {
            case MCQ_SINGLE:
                validateChoices(request.getChoices(), 1);
                break;
            case MCQ_MULTI:
                validateChoices(request.getChoices(), -1);
                break;
            case OX:
                if (request.getChoices() == null || request.getChoices().size() != 2) {
                    throw new BizException(ErrorCode.INPUT_VALUE_INVALID, "OX 문제는 보기 2개(O/X)가 필요합니다.");
                }
                validateChoices(request.getChoices(), 1);
                break;
            case SHORT_ANSWER:
                if (request.getAnswers() == null || request.getAnswers().isEmpty()) {
                    throw new BizException(ErrorCode.INPUT_VALUE_INVALID, "정답을 최소 1개 입력하세요.");
                }
                break;
            case FILL_BLANK:
                if (request.getBlanks() == null || request.getBlanks().isEmpty()) {
                    throw new BizException(ErrorCode.INPUT_VALUE_INVALID, "빈칸을 최소 1개 정의하세요.");
                }
                if (request.getBlankRevealCount() == null || request.getBlankRevealCount() < 1
                        || request.getBlankRevealCount() > request.getBlanks().size()) {
                    throw new BizException(ErrorCode.INPUT_VALUE_INVALID, "출제할 빈칸 개수가 유효하지 않습니다.");
                }
                break;
        }
    }

    private void validateChoices(List<ChoiceInput> choices, int exactCorrectCount) {
        if (choices == null || choices.size() < MIN_CHOICES || choices.size() > MAX_CHOICES) {
            throw new BizException(ErrorCode.INPUT_VALUE_INVALID, "보기는 2개 이상 5개 이하이어야 합니다.");
        }
        long correctCount = choices.stream().filter(ChoiceInput::isCorrect).count();
        if (exactCorrectCount > 0 && correctCount != exactCorrectCount) {
            throw new BizException(ErrorCode.INPUT_VALUE_INVALID, "정답 개수가 올바르지 않습니다.");
        }
        if (exactCorrectCount < 0 && correctCount < 1) {
            throw new BizException(ErrorCode.INPUT_VALUE_INVALID, "정답을 최소 1개 선택하세요.");
        }
    }

    private boolean isBlank(String value) {
        return value == null || value.trim().isEmpty();
    }
}
```

`backend/src/main/java/com/daeryun/probank/controller/ProblemController.java`:
```java
package com.daeryun.probank.controller;

import com.daeryun.probank.common.AuthUser;
import com.daeryun.probank.common.RequireRole;
import com.daeryun.probank.common.ResponseDto;
import com.daeryun.probank.common.SessionKeys;
import com.daeryun.probank.domain.UserRole;
import com.daeryun.probank.dto.problem.ProblemCreateRequest;
import com.daeryun.probank.service.ProblemService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import javax.servlet.http.HttpServletRequest;

@RestController
@RequestMapping("/api/admin/problems")
@RequireRole({UserRole.SUPER_ADMIN, UserRole.DEPT_ADMIN})
public class ProblemController {

    private final ProblemService problemService;

    public ProblemController(ProblemService problemService) {
        this.problemService = problemService;
    }

    @PostMapping
    public ResponseEntity<ResponseDto<?>> create(@RequestBody ProblemCreateRequest request, HttpServletRequest httpRequest) {
        AuthUser actor = (AuthUser) httpRequest.getSession().getAttribute(SessionKeys.LOGIN_USER);
        problemService.create(request, actor);
        return ResponseEntity.ok(ResponseDto.ok());
    }
}
```

- [x] **Step 4: 테스트 실행하여 통과 확인**

Run: `cd backend && ./gradlew test --tests ProblemServiceImplTest`
Expected: `BUILD SUCCESSFUL`, 7 tests 통과

- [x] **Step 5: Commit**

```bash
git add backend/src/main/java/com/daeryun/probank/dto/problem backend/src/main/java/com/daeryun/probank/service/ProblemService.java backend/src/main/java/com/daeryun/probank/service/ProblemServiceImpl.java backend/src/main/java/com/daeryun/probank/controller/ProblemController.java backend/src/test/java/com/daeryun/probank/service/ProblemServiceImplTest.java
git commit -m "feat: add problem creation API with per-type validation"
```

---

### Task 3: 문제 목록/상세 조회 API (부서 스코프)

**Files:**
- Create: `backend/src/main/java/com/daeryun/probank/dto/problem/ProblemDetailResponse.java`
- Modify: `backend/src/main/java/com/daeryun/probank/service/ProblemService.java`
- Modify: `backend/src/main/java/com/daeryun/probank/service/ProblemServiceImpl.java`
- Modify: `backend/src/main/java/com/daeryun/probank/controller/ProblemController.java`
- Test: `backend/src/test/java/com/daeryun/probank/service/ProblemServiceImplTest.java`

**Interfaces:**
- Consumes: `ProblemDao.findAll/findById`, `ProblemChoiceDao/ProblemAnswerDao/ProblemBlankDao.findByProblemId`(Task 1)
- Produces: `GET /api/admin/problems?type=&status=&keyword=`(부서관리자는 자기 부서로 강제), `GET /api/admin/problems/{id}`. Task 4(수정/삭제), Task 7(프론트 목록)이 사용한다.

- [x] **Step 1: 실패하는 테스트 추가**

`ProblemServiceImplTest`에 아래 테스트 추가 (상단 import에 `com.daeryun.probank.dto.problem.ProblemDetailResponse`, `com.daeryun.probank.dto.problem.ProblemListItem` 추가):
```java
    @Test
    void list_asDeptAdmin_forcesOwnDepartmentRegardlessOfParam() {
        Mockito.when(problemDao.findAll(10L, null, null, null, null, null, null)).thenReturn(Collections.emptyList());

        service.list(actor, 999L, null, null, null);

        Mockito.verify(problemDao).findAll(10L, null, null, null, null, null, null);
    }

    @Test
    void list_asSuperAdmin_usesRequestedDepartmentFilter() {
        AuthUser superAdmin = new AuthUser(2L, "admin", "총괄관리자", UserRole.SUPER_ADMIN, 1L, false);
        Mockito.when(problemDao.findAll(999L, null, null, null, null, null, null)).thenReturn(Collections.emptyList());

        service.list(superAdmin, 999L, null, null, null);

        Mockito.verify(problemDao).findAll(999L, null, null, null, null, null, null);
    }

    @Test
    void getDetail_forOtherDepartmentAsDeptAdmin_throwsAccessDenied() {
        com.daeryun.probank.domain.Problem problem = new com.daeryun.probank.domain.Problem();
        problem.setId(5L);
        problem.setDepartmentId(999L);
        problem.setType(ProblemType.SHORT_ANSWER);
        Mockito.when(problemDao.findById(5L)).thenReturn(problem);

        assertThrows(BizException.class, () -> service.getDetail(5L, actor));
    }
```

- [x] **Step 2: 테스트 실행하여 실패 확인**

Run: `cd backend && ./gradlew test --tests ProblemServiceImplTest`
Expected: FAIL — `list`/`getDetail` 메서드가 없어 컴파일 오류

- [x] **Step 3: 구현**

`backend/src/main/java/com/daeryun/probank/dto/problem/ProblemDetailResponse.java`:
```java
package com.daeryun.probank.dto.problem;

import com.daeryun.probank.domain.Problem;
import com.daeryun.probank.domain.ProblemChoice;
import com.daeryun.probank.domain.ProblemStatus;
import com.daeryun.probank.domain.ProblemType;
import lombok.AllArgsConstructor;
import lombok.Data;

import java.util.List;

@Data
@AllArgsConstructor
public class ProblemDetailResponse {
    private Long id;
    private ProblemType type;
    private String content;
    private String imageUrl;
    private String referenceText;
    private String explanation;
    private Integer blankRevealCount;
    private ProblemStatus status;
    private Long departmentId;
    private List<ProblemChoice> choices;
    private List<String> answers;
    private List<com.daeryun.probank.domain.ProblemBlank> blanks;
    private List<String> tags;

    public static ProblemDetailResponse of(Problem problem, List<ProblemChoice> choices,
                                            List<String> answers, List<com.daeryun.probank.domain.ProblemBlank> blanks,
                                            List<String> tags) {
        return new ProblemDetailResponse(
                problem.getId(), problem.getType(), problem.getContent(), problem.getImageUrl(),
                problem.getReferenceText(), problem.getExplanation(), problem.getBlankRevealCount(),
                problem.getStatus(), problem.getDepartmentId(), choices, answers, blanks, tags);
    }
}
```

`ProblemService`에 메서드 추가:
```java
    java.util.List<com.daeryun.probank.dto.problem.ProblemListItem> list(
            AuthUser actor, Long departmentId, String type, String status, java.time.LocalDate createdFrom,
            java.time.LocalDate createdTo, String tag, String keyword);

    com.daeryun.probank.dto.problem.ProblemDetailResponse getDetail(Long id, AuthUser actor);
```

`ProblemServiceImpl`에 메서드 추가 (상단 import에 `com.daeryun.probank.domain.ProblemChoice`, `java.util.stream.Collectors` 이미 있음, `com.daeryun.probank.dto.problem.ProblemDetailResponse`, `com.daeryun.probank.dto.problem.ProblemListItem` 추가):
```java
    @Override
    public List<ProblemListItem> list(AuthUser actor, Long departmentId, String type, String status,
                                      LocalDate createdFrom, LocalDate createdTo, String tag, String keyword) {
        Long effectiveDepartmentId = actor.getRole() == UserRole.SUPER_ADMIN ? departmentId : actor.getDepartmentId();
        return problemDao.findAll(effectiveDepartmentId, type, status, createdFrom, createdTo, tag, keyword);
    }

    @Override
    public ProblemDetailResponse getDetail(Long id, AuthUser actor) {
        Problem problem = problemDao.findById(id);
        if (problem == null) {
            throw new BizException(ErrorCode.INPUT_VALUE_INVALID, "존재하지 않는 문제입니다.");
        }
        assertOwnership(problem, actor);

        List<ProblemChoice> choices = problemChoiceDao.findByProblemId(id);
        List<String> answers = problemAnswerDao.findByProblemId(id).stream()
                .map(ProblemAnswer::getAnswerText).collect(Collectors.toList());
        List<ProblemBlank> blanks = problemBlankDao.findByProblemId(id);
        List<String> tags = problemTagDao.findTagNamesByProblemId(id);
        return ProblemDetailResponse.of(problem, choices, answers, blanks, tags);
    }

    private void assertOwnership(Problem problem, AuthUser actor) {
        if (actor.getRole() != UserRole.SUPER_ADMIN && !problem.getDepartmentId().equals(actor.getDepartmentId())) {
            throw new BizException(ErrorCode.ACCESS_AUTH_DENIED);
        }
    }
```
(상단 import에 `import com.daeryun.probank.domain.UserRole;`가 이미 없다면 추가한다.)

`ProblemController`에 엔드포인트 추가:
```java
    @GetMapping
    public ResponseEntity<ResponseDto<?>> list(
            @RequestParam(required = false) Long departmentId,
            @RequestParam(required = false) String type,
            @RequestParam(required = false) String status,
            @RequestParam(required = false) java.time.LocalDate createdFrom,
            @RequestParam(required = false) java.time.LocalDate createdTo,
            @RequestParam(required = false) String tag,
            @RequestParam(required = false) String keyword,
            HttpServletRequest httpRequest) {
        AuthUser actor = (AuthUser) httpRequest.getSession().getAttribute(SessionKeys.LOGIN_USER);
        return ResponseEntity.ok(ResponseDto.ok(problemService.list(actor, departmentId, type, status,
                createdFrom, createdTo, tag, keyword)));
    }

    @GetMapping("/{id}")
    public ResponseEntity<ResponseDto<?>> getDetail(@PathVariable Long id, HttpServletRequest httpRequest) {
        AuthUser actor = (AuthUser) httpRequest.getSession().getAttribute(SessionKeys.LOGIN_USER);
        return ResponseEntity.ok(ResponseDto.ok(problemService.getDetail(id, actor)));
    }
```

- [x] **Step 4: 테스트 실행하여 통과 확인**

Run: `cd backend && ./gradlew test --tests ProblemServiceImplTest`
Expected: `BUILD SUCCESSFUL`, 10 tests 통과

- [x] **Step 5: Commit**

```bash
git add backend/src/main/java/com/daeryun/probank/dto/problem/ProblemDetailResponse.java backend/src/main/java/com/daeryun/probank/service/ProblemService.java backend/src/main/java/com/daeryun/probank/service/ProblemServiceImpl.java backend/src/main/java/com/daeryun/probank/controller/ProblemController.java backend/src/test/java/com/daeryun/probank/service/ProblemServiceImplTest.java
git commit -m "feat: add problem list/detail API with department scoping"
```

---

### Task 4: 문제 수정/보관(삭제) API

**Files:**
- Modify: `backend/src/main/java/com/daeryun/probank/service/ProblemService.java`
- Modify: `backend/src/main/java/com/daeryun/probank/service/ProblemServiceImpl.java`
- Modify: `backend/src/main/java/com/daeryun/probank/controller/ProblemController.java`
- Test: `backend/src/test/java/com/daeryun/probank/service/ProblemServiceImplTest.java`

**Interfaces:**
- Consumes: `assertOwnership`(Task 3), `ProblemDao.update/updateStatus`(Task 1)
- Produces: `PUT /api/admin/problems/{id}`, `DELETE /api/admin/problems/{id}`(소프트 삭제). Task 7(프론트 목록/수정 화면)이 사용한다.

- [x] **Step 1: 실패하는 테스트 추가**

`ProblemServiceImplTest`에 추가:
```java
    @Test
    void update_ownProblem_replacesChoicesAndContent() {
        com.daeryun.probank.domain.Problem existing = new com.daeryun.probank.domain.Problem();
        existing.setId(5L);
        existing.setDepartmentId(10L);
        existing.setType(ProblemType.MCQ_SINGLE);
        Mockito.when(problemDao.findById(5L)).thenReturn(existing);

        ProblemCreateRequest request = new ProblemCreateRequest();
        request.setType(ProblemType.MCQ_SINGLE);
        request.setContent("수정된 문제");
        request.setChoices(Arrays.asList(choice("1", false), choice("2", true)));

        service.update(5L, request, actor);

        Mockito.verify(problemChoiceDao).deleteByProblemId(5L);
        Mockito.verify(problemChoiceDao, Mockito.times(2)).insertAll(Mockito.anyList());
        Mockito.verify(problemDao).update(Mockito.any());
    }

    @Test
    void update_otherDepartmentProblemAsDeptAdmin_throwsAccessDenied() {
        com.daeryun.probank.domain.Problem existing = new com.daeryun.probank.domain.Problem();
        existing.setId(5L);
        existing.setDepartmentId(999L);
        Mockito.when(problemDao.findById(5L)).thenReturn(existing);

        ProblemCreateRequest request = new ProblemCreateRequest();
        request.setType(ProblemType.SHORT_ANSWER);
        request.setContent("x");
        request.setAnswers(Collections.singletonList("y"));

        assertThrows(BizException.class, () -> service.update(5L, request, actor));
    }

    @Test
    void archive_ownProblem_updatesStatusToArchived() {
        com.daeryun.probank.domain.Problem existing = new com.daeryun.probank.domain.Problem();
        existing.setId(5L);
        existing.setDepartmentId(10L);
        Mockito.when(problemDao.findById(5L)).thenReturn(existing);

        service.archive(5L, actor);

        Mockito.verify(problemDao).updateStatus(5L, com.daeryun.probank.domain.ProblemStatus.ARCHIVED);
    }
```
(`update` 테스트는 Task 2에서 이미 있는 `insertAll`이 create 시 1회 호출된 적이 없으므로 이 테스트 파일 안에서는 독립적으로 2회 카운트된다 — `update`가 내부적으로 choice insert를 한 번 더 호출하는 구현이므로 `Mockito.times(2)`가 아니라 `Mockito.times(1)`이 맞다. **주의:** 이 테스트는 새 Mock 인스턴스 기준이므로 `update` 안에서 `insertAll`을 1회만 호출한다. 아래 Step 3 구현에 맞춰 `Mockito.times(1)`로 수정해서 작성한다.)

위 주의사항을 반영해 `update_ownProblem_replacesChoicesAndContent` 테스트의 검증 줄을 다음으로 정정한다:
```java
        Mockito.verify(problemChoiceDao).insertAll(Mockito.anyList());
```

- [x] **Step 2: 테스트 실행하여 실패 확인**

Run: `cd backend && ./gradlew test --tests ProblemServiceImplTest`
Expected: FAIL — `update`/`archive` 메서드가 없어 컴파일 오류

- [x] **Step 3: 구현**

`ProblemService`에 메서드 추가:
```java
    void update(Long id, ProblemCreateRequest request, AuthUser actor);

    void archive(Long id, AuthUser actor);
```

`ProblemServiceImpl`에 메서드 추가:
```java
    @Override
    @Transactional
    public void update(Long id, ProblemCreateRequest request, AuthUser actor) {
        Problem existing = problemDao.findById(id);
        if (existing == null) {
            throw new BizException(ErrorCode.INPUT_VALUE_INVALID, "존재하지 않는 문제입니다.");
        }
        assertOwnership(existing, actor);
        if (existing.getType() != request.getType()) {
            throw new BizException(ErrorCode.INPUT_VALUE_INVALID, "문제 유형은 수정할 수 없습니다.");
        }
        validate(request);

        existing.setContent(request.getContent());
        existing.setImageUrl(request.getImageUrl());
        existing.setReferenceText(request.getReferenceText());
        existing.setExplanation(request.getExplanation());
        existing.setBlankRevealCount(request.getType() == ProblemType.FILL_BLANK ? request.getBlankRevealCount() : null);
        problemDao.update(existing);

        problemChoiceDao.deleteByProblemId(id);
        problemAnswerDao.deleteByProblemId(id);
        problemBlankDao.deleteByProblemId(id);
        saveTypeSpecificData(id, request);
        problemTagDao.replaceTags(id, tagDao.findOrCreateByNames(normalizeTags(request.getTags())));
        auditLogService.record(actor.getUserId(), "PROBLEM_UPDATED", "PROBLEM", id,
                "{\"type\":\"" + existing.getType() + "\"}");
    }

    @Override
    @Transactional
    public void archive(Long id, AuthUser actor) {
        Problem existing = problemDao.findById(id);
        if (existing == null) {
            throw new BizException(ErrorCode.INPUT_VALUE_INVALID, "존재하지 않는 문제입니다.");
        }
        assertOwnership(existing, actor);
        problemDao.updateStatus(id, ProblemStatus.ARCHIVED);
        auditLogService.record(actor.getUserId(), "PROBLEM_ARCHIVED", "PROBLEM", id, "{}");
    }
```

`ProblemController`에 엔드포인트 추가:
```java
    @PutMapping("/{id}")
    public ResponseEntity<ResponseDto<?>> update(@PathVariable Long id, @RequestBody ProblemCreateRequest request,
                                                  HttpServletRequest httpRequest) {
        AuthUser actor = (AuthUser) httpRequest.getSession().getAttribute(SessionKeys.LOGIN_USER);
        problemService.update(id, request, actor);
        return ResponseEntity.ok(ResponseDto.ok());
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<ResponseDto<?>> archive(@PathVariable Long id, HttpServletRequest httpRequest) {
        AuthUser actor = (AuthUser) httpRequest.getSession().getAttribute(SessionKeys.LOGIN_USER);
        problemService.archive(id, actor);
        return ResponseEntity.ok(ResponseDto.ok());
    }
```

- [x] **Step 4: 테스트 실행하여 통과 확인**

Run: `cd backend && ./gradlew test --tests ProblemServiceImplTest`
Expected: `BUILD SUCCESSFUL`, 13 tests 통과

- [x] **Step 5: Commit**

```bash
git add backend/src/main/java/com/daeryun/probank/service/ProblemService.java backend/src/main/java/com/daeryun/probank/service/ProblemServiceImpl.java backend/src/main/java/com/daeryun/probank/controller/ProblemController.java backend/src/test/java/com/daeryun/probank/service/ProblemServiceImplTest.java
git commit -m "feat: add problem update and soft-delete API with ownership check"
```

---

### Task 5: 문제 이미지 업로드 API

**Files:**
- Create: `backend/src/main/java/com/daeryun/probank/dto/problem/ImageUploadResponse.java`
- Create: `backend/src/main/java/com/daeryun/probank/service/ProblemImageService.java`
- Create: `backend/src/main/java/com/daeryun/probank/service/ProblemImageServiceImpl.java`
- Create: `backend/src/main/java/com/daeryun/probank/config/StaticResourceConfig.java`
- Modify: `backend/src/main/java/com/daeryun/probank/controller/ProblemController.java`
- Modify: `backend/src/main/resources/application.yml`
- Test: `backend/src/test/java/com/daeryun/probank/service/ProblemImageServiceImplTest.java`

**Interfaces:**
- Consumes: (없음 — 로컬 파일시스템 저장)
- Produces: `POST /api/admin/problems/images` (multipart) → `{ imageUrl }`. `ProblemImageService.store(MultipartFile, AuthUser) : String`(저장된 파일의 공개 URL, 예: `/uploads/images/{uuid}.png`)이 파일 저장과 DB 감사 로그를 함께 수행한다. Task 8(프론트 등록 폼의 이미지 업로드)이 사용한다.

- [x] **Step 1: 실패하는 테스트 작성**

`backend/src/test/java/com/daeryun/probank/service/ProblemImageServiceImplTest.java`:
```java
package com.daeryun.probank.service;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.mockito.Mockito;
import com.daeryun.probank.common.AuthUser;
import com.daeryun.probank.domain.UserRole;
import org.springframework.mock.web.MockMultipartFile;

import java.io.File;
import java.nio.file.Path;

import static org.junit.jupiter.api.Assertions.assertTrue;

class ProblemImageServiceImplTest {

    @Test
    void store_savesFileAndReturnsUrlUnderUploadDir(@TempDir Path tempDir) throws Exception {
        ProblemImageServiceImpl service = new ProblemImageServiceImpl(tempDir.toString(),
                Mockito.mock(AuditLogService.class));
        MockMultipartFile file = new MockMultipartFile("file", "sample.png", "image/png", new byte[]{1, 2, 3});

        String url = service.store(file, new AuthUser(1L, "1001", "관리자", UserRole.DEPT_ADMIN, 10L, false));

        assertTrue(url.startsWith("/uploads/images/"));
        String savedFileName = url.substring("/uploads/images/".length());
        File savedFile = new File(tempDir.toFile(), savedFileName);
        assertTrue(savedFile.exists());
    }
}
```

- [x] **Step 2: 테스트 실행하여 실패 확인**

Run: `cd backend && ./gradlew test --tests ProblemImageServiceImplTest`
Expected: FAIL — `ProblemImageServiceImpl` 클래스가 없어 컴파일 오류

- [x] **Step 3: 구현**

`backend/src/main/java/com/daeryun/probank/dto/problem/ImageUploadResponse.java`:
```java
package com.daeryun.probank.dto.problem;

import lombok.AllArgsConstructor;
import lombok.Data;

@Data
@AllArgsConstructor
public class ImageUploadResponse {
    private String imageUrl;
}
```

`backend/src/main/java/com/daeryun/probank/service/ProblemImageService.java`:
```java
package com.daeryun.probank.service;

import com.daeryun.probank.common.AuthUser;
import org.springframework.web.multipart.MultipartFile;

public interface ProblemImageService {
    String store(MultipartFile file, AuthUser actor);
}
```

`backend/src/main/java/com/daeryun/probank/service/ProblemImageServiceImpl.java`:
```java
package com.daeryun.probank.service;

import com.daeryun.probank.common.AuthUser;
import com.daeryun.probank.common.ErrorCode;
import com.daeryun.probank.exception.BizException;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.UUID;

@Service
public class ProblemImageServiceImpl implements ProblemImageService {

    private final Path uploadDir;
    private final AuditLogService auditLogService;

    public ProblemImageServiceImpl(@Value("${app.upload.image-dir}") String uploadDir,
                                   AuditLogService auditLogService) {
        this.uploadDir = Paths.get(uploadDir);
        this.auditLogService = auditLogService;
    }

    @Override
    public String store(MultipartFile file, AuthUser actor) {
        if (file == null || file.isEmpty()) {
            throw new BizException(ErrorCode.FILE_REQUIRED);
        }
        try {
            Files.createDirectories(uploadDir);
            String extension = extractExtension(file.getOriginalFilename());
            String fileName = UUID.randomUUID() + extension;
            file.transferTo(uploadDir.resolve(fileName));
            auditLogService.record(actor.getUserId(), "PROBLEM_IMAGE_UPLOADED", "PROBLEM_IMAGE", null,
                    "{\"fileName\":\"" + fileName + "\"}");
            return "/uploads/images/" + fileName;
        } catch (IOException e) {
            throw new BizException(ErrorCode.MSG_PROC_FAIL, "이미지 업로드에 실패했습니다.");
        }
    }

    private String extractExtension(String originalFilename) {
        if (originalFilename == null || !originalFilename.contains(".")) {
            return "";
        }
        return originalFilename.substring(originalFilename.lastIndexOf('.'));
    }
}
```

`backend/src/main/java/com/daeryun/probank/config/StaticResourceConfig.java`:
```java
package com.daeryun.probank.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.ResourceHandlerRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

@Configuration
public class StaticResourceConfig implements WebMvcConfigurer {

    private final String uploadDir;

    public StaticResourceConfig(@Value("${app.upload.image-dir}") String uploadDir) {
        this.uploadDir = uploadDir;
    }

    @Override
    public void addResourceHandlers(ResourceHandlerRegistry registry) {
        registry.addResourceHandler("/uploads/images/**")
                .addResourceLocations("file:" + uploadDir + "/");
    }
}
```

`application.yml`의 `app:` 블록에 추가:
```yaml
  upload:
    image-dir: ${UPLOAD_IMAGE_DIR:./uploads/images}
```

`ProblemController`에 엔드포인트 추가 (상단 import에 `com.daeryun.probank.dto.problem.ImageUploadResponse`, `com.daeryun.probank.service.ProblemImageService`, `org.springframework.web.multipart.MultipartFile`, `javax.servlet.http.HttpServletRequest` 추가, 생성자에 `ProblemImageService` 주입):
```java
    private final ProblemImageService problemImageService;

    public ProblemController(ProblemService problemService, ProblemImageService problemImageService) {
        this.problemService = problemService;
        this.problemImageService = problemImageService;
    }

    @PostMapping("/images")
    public ResponseEntity<ResponseDto<?>> uploadImage(@RequestParam("file") MultipartFile file,
                                                       HttpServletRequest httpRequest) {
        AuthUser actor = (AuthUser) httpRequest.getSession().getAttribute(SessionKeys.LOGIN_USER);
        return ResponseEntity.ok(ResponseDto.ok(new ImageUploadResponse(problemImageService.store(file, actor))));
    }
```

- [x] **Step 4: 테스트 실행하여 통과 확인**

Run: `cd backend && ./gradlew test --tests ProblemImageServiceImplTest`
Expected: `BUILD SUCCESSFUL`, 1 test 통과

- [x] **Step 5: Commit**

```bash
git add backend/src/main/java/com/daeryun/probank/dto/problem/ImageUploadResponse.java backend/src/main/java/com/daeryun/probank/service/ProblemImageService.java backend/src/main/java/com/daeryun/probank/service/ProblemImageServiceImpl.java backend/src/main/java/com/daeryun/probank/config/StaticResourceConfig.java backend/src/main/java/com/daeryun/probank/controller/ProblemController.java backend/src/main/resources/application.yml backend/src/test/java/com/daeryun/probank/service/ProblemImageServiceImplTest.java
git commit -m "feat: add problem image upload API"
```

---

### Task 6: 문제 엑셀 일괄 업로드 API

**Files:**
- Create: `backend/src/main/java/com/daeryun/probank/service/ExcelProblemUploadService.java`
- Create: `backend/src/main/java/com/daeryun/probank/service/ExcelProblemUploadServiceImpl.java`
- Modify: `backend/src/main/java/com/daeryun/probank/controller/ProblemController.java`
- Test: `backend/src/test/java/com/daeryun/probank/service/ExcelProblemUploadServiceImplTest.java`

**Interfaces:**
- Consumes: `ProblemDao/ProblemChoiceDao/ProblemAnswerDao`, `ExcelUploadLogDao`(Plan 2 Task 3)
- Produces: `POST /api/admin/problems/excel-upload`(multipart). 템플릿 컬럼: `문제유형 | 문제내용 | 이미지 | 참조지문 | 보기1 | 보기2 | 보기3 | 보기4 | 보기5 | 정답 | 해설 | 태그`(1행 헤더, 태그는 콤마 구분). `FILL_BLANK`는 지원하지 않는다. Task 9(프론트 업로드 화면)가 사용한다.

- [x] **Step 1: 실패하는 테스트 작성**

`backend/src/test/java/com/daeryun/probank/service/ExcelProblemUploadServiceImplTest.java`:
```java
package com.daeryun.probank.service;

import com.daeryun.probank.common.AuthUser;
import com.daeryun.probank.dao.ExcelUploadLogDao;
import com.daeryun.probank.dao.ProblemAnswerDao;
import com.daeryun.probank.dao.ProblemChoiceDao;
import com.daeryun.probank.dao.ProblemDao;
import com.daeryun.probank.dao.ProblemTagDao;
import com.daeryun.probank.dao.TagDao;
import com.daeryun.probank.domain.UserRole;
import com.daeryun.probank.dto.upload.ExcelUploadResult;
import org.apache.poi.ss.usermodel.Row;
import org.apache.poi.ss.usermodel.Sheet;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;
import org.springframework.mock.web.MockMultipartFile;

import java.io.ByteArrayOutputStream;

import static org.junit.jupiter.api.Assertions.assertEquals;

class ExcelProblemUploadServiceImplTest {

    private ProblemDao problemDao;
    private ProblemChoiceDao problemChoiceDao;
    private ProblemAnswerDao problemAnswerDao;
    private ExcelUploadLogDao excelUploadLogDao;
    private TagDao tagDao;
    private ProblemTagDao problemTagDao;
    private ExcelProblemUploadServiceImpl service;
    private final AuthUser actor = new AuthUser(1L, "1001", "관리자", UserRole.DEPT_ADMIN, 10L, false);

    @BeforeEach
    void setUp() {
        problemDao = Mockito.mock(ProblemDao.class);
        problemChoiceDao = Mockito.mock(ProblemChoiceDao.class);
        problemAnswerDao = Mockito.mock(ProblemAnswerDao.class);
        excelUploadLogDao = Mockito.mock(ExcelUploadLogDao.class);
        tagDao = Mockito.mock(TagDao.class);
        problemTagDao = Mockito.mock(ProblemTagDao.class);
        AuditLogService auditLogService = Mockito.mock(AuditLogService.class);
        service = new ExcelProblemUploadServiceImpl(problemDao, problemChoiceDao, problemAnswerDao, excelUploadLogDao,
                tagDao, problemTagDao, auditLogService);
    }

    private MockMultipartFile buildExcel(String[][] rows) throws Exception {
        try (XSSFWorkbook workbook = new XSSFWorkbook()) {
            Sheet sheet = workbook.createSheet("problems");
            for (int r = 0; r < rows.length; r++) {
                Row row = sheet.createRow(r);
                for (int c = 0; c < rows[r].length; c++) {
                    row.createCell(c).setCellValue(rows[r][c]);
                }
            }
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            workbook.write(out);
            return new MockMultipartFile("file", "problems.xlsx", "application/vnd.ms-excel", out.toByteArray());
        }
    }

    @Test
    void upload_mcqSingleRow_succeeds() throws Exception {
        MockMultipartFile file = buildExcel(new String[][]{
                {"문제유형", "문제내용", "이미지", "참조지문", "보기1", "보기2", "보기3", "보기4", "보기5", "정답", "해설", "태그"},
                {"MCQ_SINGLE", "1+1=?", "", "", "1", "2", "3", "", "", "2", "기본 연산", "수학,기초"},
        });

        ExcelUploadResult result = service.upload(file, actor);

        assertEquals(1, result.getSuccessRows());
        assertEquals(0, result.getFailRows());
        Mockito.verify(problemDao).insert(Mockito.any());
        Mockito.verify(problemChoiceDao).insertAll(Mockito.anyList());
    }

    @Test
    void upload_shortAnswerRow_succeeds() throws Exception {
        MockMultipartFile file = buildExcel(new String[][]{
                {"문제유형", "문제내용", "이미지", "참조지문", "보기1", "보기2", "보기3", "보기4", "보기5", "정답", "해설", "태그"},
                {"SHORT_ANSWER", "대한민국의 수도는?", "", "", "", "", "", "", "", "서울,Seoul", ""},
        });

        ExcelUploadResult result = service.upload(file, actor);

        assertEquals(1, result.getSuccessRows());
        Mockito.verify(problemAnswerDao).insertAll(Mockito.anyList());
    }

    @Test
    void upload_fillBlankRow_fails() throws Exception {
        MockMultipartFile file = buildExcel(new String[][]{
                {"문제유형", "문제내용", "이미지", "참조지문", "보기1", "보기2", "보기3", "보기4", "보기5", "정답", "해설", "태그"},
                {"FILL_BLANK", "{{blank_1}}은 수도이다.", "", "", "", "", "", "", "", "", ""},
        });

        ExcelUploadResult result = service.upload(file, actor);

        assertEquals(0, result.getSuccessRows());
        assertEquals(1, result.getFailRows());
    }

    @Test
    void upload_invalidAnswerIndex_fails() throws Exception {
        MockMultipartFile file = buildExcel(new String[][]{
                {"문제유형", "문제내용", "이미지", "참조지문", "보기1", "보기2", "보기3", "보기4", "보기5", "정답", "해설", "태그"},
                {"MCQ_SINGLE", "1+1=?", "", "", "1", "2", "", "", "", "5", ""},
        });

        ExcelUploadResult result = service.upload(file, actor);

        assertEquals(0, result.getSuccessRows());
        assertEquals(1, result.getFailRows());
    }
}
```

- [x] **Step 2: 테스트 실행하여 실패 확인**

Run: `cd backend && ./gradlew test --tests ExcelProblemUploadServiceImplTest`
Expected: FAIL — `ExcelProblemUploadServiceImpl` 클래스가 없어 컴파일 오류

- [x] **Step 3: 구현**

`backend/src/main/java/com/daeryun/probank/service/ExcelProblemUploadService.java`:
```java
package com.daeryun.probank.service;

import com.daeryun.probank.common.AuthUser;
import com.daeryun.probank.dto.upload.ExcelUploadResult;
import org.springframework.web.multipart.MultipartFile;

public interface ExcelProblemUploadService {
    ExcelUploadResult upload(MultipartFile file, AuthUser actor);
}
```

`backend/src/main/java/com/daeryun/probank/service/ExcelProblemUploadServiceImpl.java`:
```java
package com.daeryun.probank.service;

import com.daeryun.probank.common.AuthUser;
import com.daeryun.probank.common.ErrorCode;
import com.daeryun.probank.dao.ExcelUploadLogDao;
import com.daeryun.probank.dao.ProblemAnswerDao;
import com.daeryun.probank.dao.ProblemChoiceDao;
import com.daeryun.probank.dao.ProblemDao;
import com.daeryun.probank.domain.*;
import com.daeryun.probank.dto.upload.ExcelUploadResult;
import com.daeryun.probank.dto.upload.RowResult;
import com.daeryun.probank.exception.BizException;
import org.apache.poi.ss.usermodel.Cell;
import org.apache.poi.ss.usermodel.CellType;
import org.apache.poi.ss.usermodel.Row;
import org.apache.poi.ss.usermodel.Sheet;
import org.apache.poi.ss.usermodel.Workbook;
import org.apache.poi.ss.usermodel.WorkbookFactory;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.stream.Collectors;

@Service
public class ExcelProblemUploadServiceImpl implements ExcelProblemUploadService {

    private static final int HEADER_ROW_COUNT = 1;
    private static final int MAX_CHOICE_COLUMNS = 5;
    private static final int COL_TYPE = 0;
    private static final int COL_CONTENT = 1;
    private static final int COL_IMAGE = 2;
    private static final int COL_REFERENCE = 3;
    private static final int COL_CHOICE_START = 4;
    private static final int COL_ANSWER = 9;
    private static final int COL_EXPLANATION = 10;
    private static final int COL_TAGS = 11;

    private final ProblemDao problemDao;
    private final ProblemChoiceDao problemChoiceDao;
    private final ProblemAnswerDao problemAnswerDao;
    private final ExcelUploadLogDao excelUploadLogDao;
    private final TagDao tagDao;
    private final ProblemTagDao problemTagDao;
    private final AuditLogService auditLogService;

    public ExcelProblemUploadServiceImpl(ProblemDao problemDao, ProblemChoiceDao problemChoiceDao,
                                          ProblemAnswerDao problemAnswerDao, ExcelUploadLogDao excelUploadLogDao,
                                          TagDao tagDao, ProblemTagDao problemTagDao, AuditLogService auditLogService) {
        this.problemDao = problemDao;
        this.problemChoiceDao = problemChoiceDao;
        this.problemAnswerDao = problemAnswerDao;
        this.excelUploadLogDao = excelUploadLogDao;
        this.tagDao = tagDao;
        this.problemTagDao = problemTagDao;
        this.auditLogService = auditLogService;
    }

    @Override
    public ExcelUploadResult upload(MultipartFile file, AuthUser actor) {
        List<RowResult> results = new ArrayList<>();

        try (Workbook workbook = WorkbookFactory.create(file.getInputStream())) {
            Sheet sheet = workbook.getSheetAt(0);
            for (int rowIndex = HEADER_ROW_COUNT; rowIndex <= sheet.getLastRowNum(); rowIndex++) {
                Row row = sheet.getRow(rowIndex);
                if (row == null) {
                    continue;
                }
                results.add(processRow(row, rowIndex + 1, actor));
            }
        } catch (IOException e) {
            throw new BizException(ErrorCode.FILE_REQUIRED, "엑셀 파일을 읽을 수 없습니다.");
        }

        int successRows = (int) results.stream().filter(RowResult::isSuccess).count();
        int failRows = results.size() - successRows;
        String errorDetail = results.stream()
                .filter(r -> !r.isSuccess())
                .map(r -> "행 " + r.getRowNumber() + ": " + r.getReason())
                .collect(Collectors.joining("\n"));

        ExcelUploadLog log = new ExcelUploadLog();
        log.setUploadedBy(actor.getUserId());
        log.setDepartmentId(actor.getDepartmentId());
        log.setTargetType(UploadTargetType.PROBLEM);
        log.setFileName(file.getOriginalFilename());
        log.setTotalRows(results.size());
        log.setSuccessRows(successRows);
        log.setFailRows(failRows);
        log.setErrorDetail(errorDetail.isEmpty() ? null : errorDetail);
        excelUploadLogDao.insert(log);

        return new ExcelUploadResult(results.size(), successRows, failRows, log.getErrorDetail());
    }

    private RowResult processRow(Row row, int rowNumber, AuthUser actor) {
        String typeText = cellValue(row, COL_TYPE);
        String content = cellValue(row, COL_CONTENT);

        if (isBlank(typeText) || isBlank(content)) {
            return RowResult.fail(rowNumber, "문제유형과 문제내용은 필수입니다.");
        }
        if ("FILL_BLANK".equalsIgnoreCase(typeText.trim())) {
            return RowResult.fail(rowNumber, "빈칸 채우기는 엑셀 업로드를 지원하지 않습니다. 개별 입력을 이용하세요.");
        }

        ProblemType type;
        try {
            type = ProblemType.valueOf(typeText.trim());
        } catch (IllegalArgumentException e) {
            return RowResult.fail(rowNumber, "유효하지 않은 문제유형입니다: " + typeText);
        }

        String answerText = cellValue(row, COL_ANSWER);
        List<String> tags = Arrays.stream(cellValue(row, COL_TAGS).split(","))
                .map(String::trim).filter(s -> !s.isEmpty()).distinct().collect(Collectors.toList());
        if (isBlank(answerText)) {
            return RowResult.fail(rowNumber, "정답은 필수입니다.");
        }

        List<String> choiceTexts = new ArrayList<>();
        for (int i = 0; i < MAX_CHOICE_COLUMNS; i++) {
            String choiceText = cellValue(row, COL_CHOICE_START + i);
            if (!isBlank(choiceText)) {
                choiceTexts.add(choiceText);
            }
        }

        Problem problem = new Problem();
        problem.setType(type);
        problem.setContent(content);
        problem.setImageUrl(emptyToNull(cellValue(row, COL_IMAGE)));
        problem.setReferenceText(emptyToNull(cellValue(row, COL_REFERENCE)));
        problem.setExplanation(emptyToNull(cellValue(row, COL_EXPLANATION)));
        problem.setStatus(ProblemStatus.ACTIVE);
        problem.setDepartmentId(actor.getDepartmentId());
        problem.setCreatedBy(actor.getUserId());

        if (type == ProblemType.SHORT_ANSWER) {
            List<String> answers = Arrays.stream(answerText.split(",")).map(String::trim)
                    .filter(s -> !s.isEmpty()).collect(Collectors.toList());
            if (answers.isEmpty()) {
                return RowResult.fail(rowNumber, "정답 형식이 올바르지 않습니다.");
            }
            problemDao.insert(problem);
            List<ProblemAnswer> answerEntities = answers.stream().map(text -> {
                ProblemAnswer answer = new ProblemAnswer();
                answer.setProblemId(problem.getId());
                answer.setAnswerText(text);
                return answer;
            }).collect(Collectors.toList());
            problemAnswerDao.insertAll(answerEntities);
            problemTagDao.replaceTags(problem.getId(), tagDao.findOrCreateByNames(tags));
            auditLogService.record(actor.getUserId(), "PROBLEM_CREATED_BY_EXCEL", "PROBLEM", problem.getId(),
                    "{\"type\":\"SHORT_ANSWER\"}");
            return RowResult.success(rowNumber);
        }

        // MCQ_SINGLE, MCQ_MULTI, OX
        if (choiceTexts.size() < 2 || choiceTexts.size() > MAX_CHOICE_COLUMNS) {
            return RowResult.fail(rowNumber, "보기는 2개 이상 5개 이하이어야 합니다.");
        }
        List<Integer> correctIndexes;
        try {
            correctIndexes = Arrays.stream(answerText.split(","))
                    .map(String::trim).map(Integer::parseInt).collect(Collectors.toList());
        } catch (NumberFormatException e) {
            return RowResult.fail(rowNumber, "정답은 보기 번호(1부터 시작)여야 합니다: " + answerText);
        }
        for (Integer index : correctIndexes) {
            if (index < 1 || index > choiceTexts.size()) {
                return RowResult.fail(rowNumber, "정답 번호가 보기 범위를 벗어났습니다: " + index);
            }
        }
        if (type != ProblemType.MCQ_MULTI && correctIndexes.size() != 1) {
            return RowResult.fail(rowNumber, "이 유형은 정답이 1개여야 합니다.");
        }

        problemDao.insert(problem);
        List<ProblemChoice> choices = new ArrayList<>();
        for (int i = 0; i < choiceTexts.size(); i++) {
            ProblemChoice choice = new ProblemChoice();
            choice.setProblemId(problem.getId());
            choice.setChoiceText(choiceTexts.get(i));
            choice.setCorrect(correctIndexes.contains(i + 1));
            choice.setDisplayOrder(i + 1);
            choices.add(choice);
        }
        problemChoiceDao.insertAll(choices);
        problemTagDao.replaceTags(problem.getId(), tagDao.findOrCreateByNames(tags));
        auditLogService.record(actor.getUserId(), "PROBLEM_CREATED_BY_EXCEL", "PROBLEM", problem.getId(),
                "{\"type\":\"" + type + "\"}");
        return RowResult.success(rowNumber);
    }

    private String cellValue(Row row, int cellIndex) {
        Cell cell = row.getCell(cellIndex);
        if (cell == null) {
            return "";
        }
        cell.setCellType(CellType.STRING);
        return cell.getStringCellValue().trim();
    }

    private String emptyToNull(String value) {
        return isBlank(value) ? null : value;
    }

    private boolean isBlank(String value) {
        return value == null || value.trim().isEmpty();
    }
}
```

- [x] **Step 4: 컨트롤러에 업로드 엔드포인트 추가**

`ProblemController`에 추가 (상단 import에 `com.daeryun.probank.service.ExcelProblemUploadService` 추가, 생성자에 주입):
```java
    private final ExcelProblemUploadService excelProblemUploadService;

    public ProblemController(ProblemService problemService, ProblemImageService problemImageService,
                              ExcelProblemUploadService excelProblemUploadService) {
        this.problemService = problemService;
        this.problemImageService = problemImageService;
        this.excelProblemUploadService = excelProblemUploadService;
    }

    @PostMapping("/excel-upload")
    public ResponseEntity<ResponseDto<?>> uploadExcel(@RequestParam("file") MultipartFile file,
                                                        HttpServletRequest httpRequest) {
        AuthUser actor = (AuthUser) httpRequest.getSession().getAttribute(SessionKeys.LOGIN_USER);
        return ResponseEntity.ok(ResponseDto.ok(excelProblemUploadService.upload(file, actor)));
    }
```

- [x] **Step 5: 테스트 실행하여 통과 확인**

Run: `cd backend && ./gradlew test --tests ExcelProblemUploadServiceImplTest`
Expected: `BUILD SUCCESSFUL`, 4 tests 통과

- [x] **Step 6: Commit**

```bash
git add backend/src/main/java/com/daeryun/probank/service/ExcelProblemUploadService.java backend/src/main/java/com/daeryun/probank/service/ExcelProblemUploadServiceImpl.java backend/src/main/java/com/daeryun/probank/controller/ProblemController.java backend/src/test/java/com/daeryun/probank/service/ExcelProblemUploadServiceImplTest.java
git commit -m "feat: add excel bulk problem upload excluding fill-blank type"
```

---

## Part 2 — 프론트엔드: 문제 관리 화면

### Task 7: 문제 목록 화면

**Files:**
- Create: `frontend/src/api/problems.js`
- Create: `frontend/src/pages/admin/problems/ProblemListPage.jsx`
- Modify: `frontend/src/pages/admin/AdminLayout.jsx`
- Modify: `frontend/src/routers/routes.jsx`

**Interfaces:**
- Consumes: `apiGet/apiPost/apiPut/apiDelete/apiPostForm`(Plan 1/2 client.js — `apiDelete` 추가 필요)
- Produces: `/admin/problems` 화면. Task 8이 등록/수정 폼을 추가한다.

- [x] **Step 1: client.js에 apiDelete 추가**

`frontend/src/api/client.js`의 `apiPut` 아래에 추가:
```javascript
export function apiDelete(path) {
  return request(path, { method: "DELETE" });
}
```

- [x] **Step 2: problems API 래퍼 작성**

`frontend/src/api/problems.js`:
```javascript
import { apiGet, apiPost, apiPostForm, apiPut, apiDelete } from "@/api/client.js";

export function listProblems(params = {}) {
  const query = new URLSearchParams(
    Object.entries(params).filter(([, value]) => value !== undefined && value !== "")
  ).toString();
  return apiGet(`/api/admin/problems${query ? `?${query}` : ""}`);
}

export function listTags() {
  return apiGet("/api/tags");
}

export function getProblem(id) {
  return apiGet(`/api/admin/problems/${id}`);
}

export function createProblem(payload) {
  return apiPost("/api/admin/problems", payload);
}

export function updateProblem(id, payload) {
  return apiPut(`/api/admin/problems/${id}`, payload);
}

export function archiveProblem(id) {
  return apiDelete(`/api/admin/problems/${id}`);
}

export function uploadProblemImage(file) {
  const formData = new FormData();
  formData.append("file", file);
  return apiPostForm("/api/admin/problems/images", formData);
}

export function uploadProblemsExcel(file) {
  const formData = new FormData();
  formData.append("file", file);
  return apiPostForm("/api/admin/problems/excel-upload", formData);
}
```

- [x] **Step 3: 목록 화면 작성**

`frontend/src/pages/admin/problems/ProblemListPage.jsx`:
```javascript
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "react-toastify";
import { archiveProblem, listProblems, listTags } from "@/api/problems.js";
import { resolveErrorMessage } from "@/api/client.js";

const TYPE_LABELS = {
  MCQ_SINGLE: "객관식(단일)",
  MCQ_MULTI: "객관식(다중)",
  OX: "OX",
  SHORT_ANSWER: "주관식",
  FILL_BLANK: "빈칸 채우기",
};

export default function ProblemListPage() {
  const [problems, setProblems] = useState([]);
  const [keyword, setKeyword] = useState("");
  const [createdFrom, setCreatedFrom] = useState("");
  const [createdTo, setCreatedTo] = useState("");
  const [tag, setTag] = useState("");
  const [tags, setTags] = useState([]);

  useEffect(() => {
    listTags().then(setTags).catch(() => setTags([]));
  }, []);

  async function refresh() {
    try {
      setProblems(await listProblems({ keyword, createdFrom, createdTo, tag }));
    } catch (error) {
      toast.error(resolveErrorMessage(error, "문제 목록을 불러오지 못했습니다."));
    }
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleArchive(id) {
    try {
      await archiveProblem(id);
      toast.success("문제가 보관 처리되었습니다.");
      refresh();
    } catch (error) {
      toast.error(resolveErrorMessage(error, "삭제에 실패했습니다."));
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">문제 관리</h1>
        <Link to="/admin/problems/new" className="rounded bg-blue-600 px-4 py-2 text-white">
          문제 등록
        </Link>
      </div>

      <form
        onSubmit={(event) => {
          event.preventDefault();
          refresh();
        }}
        className="flex flex-wrap gap-2"
      >
        <input
          className="rounded border px-3 py-2"
          placeholder="문제 내용 검색"
          value={keyword}
          onChange={(event) => setKeyword(event.target.value)}
        />
        <input type="date" className="rounded border px-3 py-2" value={createdFrom} onChange={(event) => setCreatedFrom(event.target.value)} />
        <input type="date" className="rounded border px-3 py-2" value={createdTo} onChange={(event) => setCreatedTo(event.target.value)} />
        <select className="rounded border px-3 py-2" value={tag} onChange={(event) => setTag(event.target.value)}>
          <option value="">전체 태그</option>
          {tags.map((item) => <option key={item.id ?? item} value={item.name ?? item}>{item.name ?? item}</option>)}
        </select>
        <button type="submit" className="rounded border px-4 py-2">
          검색
        </button>
      </form>

      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b">
            <th className="py-2">유형</th>
            <th className="py-2">내용</th>
            <th className="py-2">부서</th>
            <th className="py-2">상태</th>
            <th className="py-2">태그</th>
            <th className="py-2">관리</th>
          </tr>
        </thead>
        <tbody>
          {problems.map((problem) => (
            <tr key={problem.id} className="border-b">
              <td className="py-2">{TYPE_LABELS[problem.type]}</td>
              <td className="py-2 max-w-xs truncate">{problem.content}</td>
              <td className="py-2">{problem.departmentName}</td>
              <td className="py-2">{problem.status}</td>
              <td className="py-2">{problem.tags?.join(", ")}</td>
              <td className="py-2 space-x-2">
                <Link to={`/admin/problems/${problem.id}/edit`} className="text-blue-600 underline">
                  수정
                </Link>
                <button className="text-red-600 underline" onClick={() => handleArchive(problem.id)}>
                  보관
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

- [x] **Step 4: 네비게이션/라우터에 연결**

`AdminLayout.jsx`의 `NAV_ITEMS`에 추가:
```javascript
  { to: "/admin/problems", label: "문제 관리" },
```

`routes.jsx`의 `/admin` 하위에 추가:
```javascript
              { path: "problems", element: <ProblemListPage /> },
```
상단 import 추가:
```javascript
import ProblemListPage from "@/pages/admin/problems/ProblemListPage.jsx";
```

- [x] **Step 5: Commit**

```bash
git add frontend/src/api/problems.js frontend/src/api/client.js frontend/src/pages/admin/problems/ProblemListPage.jsx frontend/src/pages/admin/AdminLayout.jsx frontend/src/routers/routes.jsx
git commit -m "feat: add problem list screen"
```

---

### Task 8: 문제 등록/수정 폼 (유형별 동적 필드)

**Files:**
- Create: `frontend/src/pages/admin/problems/ProblemFormPage.jsx`
- Modify: `frontend/src/routers/routes.jsx`

**Interfaces:**
- Consumes: `createProblem/updateProblem/getProblem/uploadProblemImage`(Task 7)
- Produces: `/admin/problems/new`, `/admin/problems/:id/edit` 화면.

- [x] **Step 1: 등록/수정 폼 작성**

`frontend/src/pages/admin/problems/ProblemFormPage.jsx`:
```javascript
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "react-toastify";
import { createProblem, getProblem, updateProblem, uploadProblemImage } from "@/api/problems.js";
import { resolveErrorMessage } from "@/api/client.js";

const TYPES = ["MCQ_SINGLE", "MCQ_MULTI", "OX", "SHORT_ANSWER", "FILL_BLANK"];

function emptyChoice() {
  return { text: "", correct: false };
}

function emptyBlank() {
  return { blankKey: "", answerText: "" };
}

export default function ProblemFormPage() {
  const { id } = useParams();
  const isEdit = Boolean(id);
  const navigate = useNavigate();

  const [type, setType] = useState("MCQ_SINGLE");
  const [content, setContent] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [referenceText, setReferenceText] = useState("");
  const [explanation, setExplanation] = useState("");
  const [choices, setChoices] = useState([emptyChoice(), emptyChoice()]);
  const [answers, setAnswers] = useState([""]);
  const [blanks, setBlanks] = useState([emptyBlank()]);
  const [blankRevealCount, setBlankRevealCount] = useState(1);
  const [tags, setTags] = useState("");

  useEffect(() => {
    if (!isEdit) return;
    getProblem(id).then((problem) => {
      setType(problem.type);
      setContent(problem.content);
      setImageUrl(problem.imageUrl ?? "");
      setReferenceText(problem.referenceText ?? "");
      setExplanation(problem.explanation ?? "");
      setTags((problem.tags ?? []).join(", "));
      if (problem.choices?.length) {
        setChoices(problem.choices.map((c) => ({ text: c.choiceText, correct: c.correct })));
      }
      if (problem.answers?.length) {
        setAnswers(problem.answers);
      }
      if (problem.blanks?.length) {
        setBlanks(problem.blanks.map((b) => ({ blankKey: b.blankKey, answerText: b.answerText })));
        setBlankRevealCount(problem.blankRevealCount ?? 1);
      }
    });
  }, [id, isEdit]);

  async function handleImageChange(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const response = await uploadProblemImage(file);
      setImageUrl(response.imageUrl);
      toast.success("이미지가 업로드되었습니다.");
    } catch (error) {
      toast.error(resolveErrorMessage(error, "이미지 업로드에 실패했습니다."));
    }
  }

  function buildPayload() {
    const base = { type, content, imageUrl: imageUrl || null, referenceText: referenceText || null, explanation: explanation || null,
      tags: tags.split(",").map((tag) => tag.trim()).filter(Boolean) };
    if (type === "SHORT_ANSWER") {
      return { ...base, answers: answers.filter((a) => a.trim() !== "") };
    }
    if (type === "FILL_BLANK") {
      return { ...base, blanks, blankRevealCount: Number(blankRevealCount) };
    }
    return { ...base, choices };
  }

  async function handleSubmit(event) {
    event.preventDefault();
    try {
      const payload = buildPayload();
      if (isEdit) {
        await updateProblem(id, payload);
        toast.success("문제가 수정되었습니다.");
      } else {
        await createProblem(payload);
        toast.success("문제가 등록되었습니다.");
      }
      navigate("/admin/problems");
    } catch (error) {
      toast.error(resolveErrorMessage(error, "저장에 실패했습니다."));
    }
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-2xl space-y-4">
      <h1 className="text-lg font-semibold">{isEdit ? "문제 수정" : "문제 등록"}</h1>

      <select
        className="w-full rounded border px-3 py-2"
        value={type}
        onChange={(event) => setType(event.target.value)}
        disabled={isEdit}
      >
        {TYPES.map((t) => (
          <option key={t} value={t}>
            {t}
          </option>
        ))}
      </select>

      <input
        className="w-full rounded border px-3 py-2"
        placeholder="태그 (콤마로 구분)"
        value={tags}
        onChange={(event) => setTags(event.target.value)}
      />

      <textarea
        className="w-full rounded border px-3 py-2"
        placeholder="문제 내용 (빈칸 채우기는 {{blank_1}} 형식으로 마커 포함)"
        value={content}
        onChange={(event) => setContent(event.target.value)}
        rows={4}
      />

      <div>
        <input type="file" accept="image/*" onChange={handleImageChange} />
        {imageUrl && <img src={imageUrl} alt="문제 이미지" className="mt-2 max-h-40" />}
      </div>

      <textarea
        className="w-full rounded border px-3 py-2"
        placeholder="참조 지문 (선택)"
        value={referenceText}
        onChange={(event) => setReferenceText(event.target.value)}
        rows={2}
      />

      {(type === "MCQ_SINGLE" || type === "MCQ_MULTI" || type === "OX") && (
        <div className="space-y-2">
          <p className="text-sm font-medium">보기 (최대 5개)</p>
          {choices.map((choice, index) => (
            <div key={index} className="flex items-center gap-2">
              <input
                className="flex-1 rounded border px-3 py-2"
                value={choice.text}
                onChange={(event) => {
                  const next = [...choices];
                  next[index] = { ...next[index], text: event.target.value };
                  setChoices(next);
                }}
              />
              <label className="flex items-center gap-1 text-sm">
                <input
                  type={type === "MCQ_MULTI" ? "checkbox" : "radio"}
                  name="correctChoice"
                  checked={choice.correct}
                  onChange={() => {
                    const next = choices.map((c, i) => ({
                      ...c,
                      correct: type === "MCQ_MULTI" ? (i === index ? !c.correct : c.correct) : i === index,
                    }));
                    setChoices(next);
                  }}
                />
                정답
              </label>
            </div>
          ))}
          {choices.length < 5 && (
            <button type="button" className="text-sm text-blue-600 underline" onClick={() => setChoices([...choices, emptyChoice()])}>
              보기 추가
            </button>
          )}
        </div>
      )}

      {type === "SHORT_ANSWER" && (
        <div className="space-y-2">
          <p className="text-sm font-medium">정답 (복수 허용)</p>
          {answers.map((answer, index) => (
            <input
              key={index}
              className="w-full rounded border px-3 py-2"
              value={answer}
              onChange={(event) => {
                const next = [...answers];
                next[index] = event.target.value;
                setAnswers(next);
              }}
            />
          ))}
          <button type="button" className="text-sm text-blue-600 underline" onClick={() => setAnswers([...answers, ""])}>
            정답 추가
          </button>
        </div>
      )}

      {type === "FILL_BLANK" && (
        <div className="space-y-2">
          <p className="text-sm font-medium">빈칸 후보</p>
          {blanks.map((blank, index) => (
            <div key={index} className="flex gap-2">
              <input
                className="w-32 rounded border px-3 py-2"
                placeholder="blank_1"
                value={blank.blankKey}
                onChange={(event) => {
                  const next = [...blanks];
                  next[index] = { ...next[index], blankKey: event.target.value };
                  setBlanks(next);
                }}
              />
              <input
                className="flex-1 rounded border px-3 py-2"
                placeholder="정답"
                value={blank.answerText}
                onChange={(event) => {
                  const next = [...blanks];
                  next[index] = { ...next[index], answerText: event.target.value };
                  setBlanks(next);
                }}
              />
            </div>
          ))}
          <button type="button" className="text-sm text-blue-600 underline" onClick={() => setBlanks([...blanks, emptyBlank()])}>
            빈칸 추가
          </button>
          <div>
            <label className="text-sm">출제 시 노출할 빈칸 개수: </label>
            <input
              type="number"
              min={1}
              max={blanks.length}
              className="w-20 rounded border px-2 py-1"
              value={blankRevealCount}
              onChange={(event) => setBlankRevealCount(event.target.value)}
            />
          </div>
        </div>
      )}

      <textarea
        className="w-full rounded border px-3 py-2"
        placeholder="해설 (선택)"
        value={explanation}
        onChange={(event) => setExplanation(event.target.value)}
        rows={2}
      />

      <button type="submit" className="rounded bg-blue-600 px-4 py-2 text-white">
        {isEdit ? "수정 저장" : "등록"}
      </button>
    </form>
  );
}
```

- [x] **Step 2: 라우터에 연결**

`routes.jsx`의 `/admin` 하위에 추가:
```javascript
              { path: "problems/new", element: <ProblemFormPage /> },
              { path: "problems/:id/edit", element: <ProblemFormPage /> },
```
상단 import 추가:
```javascript
import ProblemFormPage from "@/pages/admin/problems/ProblemFormPage.jsx";
```

- [x] **Step 3: 수동 확인**

Run: 부서관리자로 로그인 → `/admin/problems/new`에서 5개 유형 각각 등록 시도 → 목록에서 수정/보관 동작 확인

- [x] **Step 4: Commit**

```bash
git add frontend/src/pages/admin/problems/ProblemFormPage.jsx frontend/src/routers/routes.jsx
git commit -m "feat: add problem create/edit form with per-type dynamic fields"
```

---

### Task 9: 문제 엑셀 업로드 화면

**Files:**
- Create: `frontend/src/pages/admin/problems/ProblemExcelUploadPage.jsx`
- Modify: `frontend/src/pages/admin/AdminLayout.jsx`
- Modify: `frontend/src/routers/routes.jsx`

**Interfaces:**
- Consumes: `uploadProblemsExcel`(Task 7)
- Produces: `/admin/problems/excel-upload` 화면.

- [x] **Step 1: 업로드 화면 작성**

`frontend/src/pages/admin/problems/ProblemExcelUploadPage.jsx`:
```javascript
import { useState } from "react";
import { toast } from "react-toastify";
import { uploadProblemsExcel } from "@/api/problems.js";
import { resolveErrorMessage } from "@/api/client.js";

export default function ProblemExcelUploadPage() {
  const [file, setFile] = useState(null);
  const [result, setResult] = useState(null);
  const [uploading, setUploading] = useState(false);

  async function handleUpload() {
    if (!file) {
      toast.error("업로드할 엑셀 파일을 선택하세요.");
      return;
    }
    setUploading(true);
    try {
      const uploadResult = await uploadProblemsExcel(file);
      setResult(uploadResult);
      toast.success(`업로드 완료: 성공 ${uploadResult.successRows}건 / 실패 ${uploadResult.failRows}건`);
    } catch (error) {
      toast.error(resolveErrorMessage(error, "업로드에 실패했습니다."));
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold">문제 엑셀 일괄 등록</h1>
      <p className="text-sm text-gray-500">
        템플릿 컬럼: 문제유형 | 문제내용 | 이미지 | 참조지문 | 보기1~5 | 정답 | 해설 | 태그(콤마 구분)
        <br />
        정답: 객관식/OX는 보기 번호(1부터, 복수는 콤마 구분), 주관식은 콤마로 구분된 허용 정답
        <br />
        빈칸 채우기(FILL_BLANK)는 엑셀 업로드를 지원하지 않습니다 — 개별 입력을 이용하세요.
      </p>
      <input type="file" accept=".xlsx" onChange={(event) => setFile(event.target.files?.[0] ?? null)} />
      <button
        onClick={handleUpload}
        disabled={uploading}
        className="rounded bg-blue-600 px-4 py-2 text-white disabled:opacity-50"
      >
        업로드
      </button>
      {result && (
        <div className="rounded border p-4 text-sm">
          <p>전체 {result.totalRows}건 / 성공 {result.successRows}건 / 실패 {result.failRows}건</p>
          {result.errorDetail && <pre className="mt-2 whitespace-pre-wrap text-red-600">{result.errorDetail}</pre>}
        </div>
      )}
    </div>
  );
}
```

- [x] **Step 2: 네비게이션/라우터에 연결**

`AdminLayout.jsx`의 `NAV_ITEMS`에 추가:
```javascript
  { to: "/admin/problems/excel-upload", label: "문제 일괄 등록" },
```

`routes.jsx`의 `/admin` 하위에 추가:
```javascript
              { path: "problems/excel-upload", element: <ProblemExcelUploadPage /> },
```
상단 import 추가:
```javascript
import ProblemExcelUploadPage from "@/pages/admin/problems/ProblemExcelUploadPage.jsx";
```

- [x] **Step 3: 수동 확인**

Run: 샘플 엑셀(문제유형/문제내용/보기1~5/정답 컬럼)을 만들어 업로드 → 성공/실패 건수와 사유 확인

- [x] **Step 4: Commit**

```bash
git add frontend/src/pages/admin/problems/ProblemExcelUploadPage.jsx frontend/src/pages/admin/AdminLayout.jsx frontend/src/routers/routes.jsx
git commit -m "feat: add problem excel upload screen"
```

---

## Self-Review 결과

- **Spec 커버리지:** PRD 4.1(5개 유형) → Task 2; 4.1.1(빈칸 채우기 규칙) → Task 2, 8; 4.2(개별입력+엑셀, 이미지/참조지문, 보기5개) → Task 2,5,6,8,9; 4.3(문제 관리, 소프트삭제, 부서 스코프) → Task 3,4,7.
- **플레이스홀더 스캔:** 없음. Task 4의 테스트 설명 중 "주의" 문구는 Mock 호출 횟수 정정 안내이며 실제 코드에는 반영되어 있다.
- **타입 일관성:** `ProblemCreateRequest`(Task 2)가 Task 4(update), Task 8(프론트 폼 payload)에서 동일한 필드명(`choices`, `answers`, `blanks`, `blankRevealCount`)으로 일관되게 사용됨. `ExcelUploadResult`(Plan 2 Task 4에서 정의)를 Task 6에서 재사용.
- **추가 결정 반영:** `tags`가 생성/수정/상세/목록/풀이 검색/엑셀 컬럼에 연결되고, `createdFrom`/`createdTo`가 DAO·서비스·관리자 화면까지 전달된다. 태그/문제태그와 문제 변경 감사 로그는 실제 DB 저장을 전제로 한다.

## 다음 Plan

- Plan 4: 문제 풀이 (직원용 풀이 화면 — 이 Plan의 문제/보기/정답/빈칸 데이터를 읽어 무작위 빈칸 선택 및 채점 수행)
- Plan 5: 통계 (문제별 정답률 — Plan 4에서 쌓이는 `attempts` 데이터를 집계)
