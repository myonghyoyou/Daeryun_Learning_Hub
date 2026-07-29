# 문제 은행 Hub — Plan 4: 문제 풀이 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 전 직원이 전사 공통 문제를 자유롭게 조회·제출하고 즉시 채점 결과를 받을 수 있게 하며, 본인 풀이 이력을 조회할 수 있게 한다.

**Architecture:** Plan 3의 `problems`/`problem_choices`/`problem_answers`/`problem_blanks`를 읽기 전용으로 사용하되, 관리자 조회 API(`ProblemController`)와 달리 **정답을 노출하지 않는** 별도의 풀이 전용 API(`SolveController`)를 둔다. 채점은 서버에서만 수행하고 결과(정답 여부/정답/해설)를 제출 응답에 담아 돌려준다. 빈칸 채우기는 상세 조회 시점에 서버가 무작위로 노출할 빈칸을 선택한다.

**Tech Stack:** Plan 1~3과 동일

**전제 조건:** Plan 1, Plan 3이 완료되어 있어야 한다 (로그인, 문제 데이터).

## Global Constraints

- 풀이는 자유 연습/복습 모드다 — 응시 기간, 제한 시간, 1회성 정식 시험 개념이 없다 (PRD 섹션 6.1).
- 문제는 어느 부서가 등록했든 전사 직원이 공통으로 풀 수 있다. 목록/상세는 `status = ACTIVE`인 문제만 노출한다 (섹션 2.2, 4.3).
- 채점 규칙은 PRD 섹션 6.3을 그대로 따른다: 단일선택/OX는 단일 정답 일치, 다중선택은 정답 집합 완전 일치, 주관식은 정규화(trim/대소문자무시/공백정리) 후 일치, 빈칸 채우기는 노출된 빈칸을 모두 맞혀야 정답이다.
- 빈칸 채우기는 매 시도(문제 상세 조회)마다 정의된 빈칸 후보 중 `blank_reveal_count`개를 무작위로 선택해 노출한다. 선택되지 않은 빈칸은 정답 텍스트를 그대로 보여준다 (섹션 4.1.1). 연습 모드이므로 제출 시 서버는 제출된 빈칸 키 집합이 문제에 정의된 빈칸의 부분집합이고 개수가 `blank_reveal_count`와 일치하는지만 검증한다 — 조회 시 선택된 정확한 조합을 서버가 별도로 기억하지는 않는다(부정행위 방지가 필요 없는 연습 모드이므로 충분하다).
- 직원은 본인의 풀이 이력(시도 일시, 정답 여부, 제출 답안)을 조회할 수 있다 (섹션 6.4).

## Approved Amendments (2026-07-29)

- 풀이 문제 목록은 태그 필터를 지원한다. `GET /api/problems`에 `tag` 선택 파라미터를 추가한다.
- 빈칸 제출 시 제출 키를 `Set`으로 검증하여 중복 키를 거부하고, 정의된 빈칸의 부분집합이며 `blank_reveal_count`와 정확히 일치하는지 확인한다.
- 빈칸 상세 조회 응답의 무작위 선택 조합은 연습 모드 정책에 따라 서버 세션에 보존하지 않는다. 단, 제출 검증은 중복·미정의 키를 반드시 차단한다.

### Task 계약 보완

- `ProblemDao.findAllActive(String keyword, String tag)`와 `GET /api/problems?keyword=&tag=`를 사용한다. 태그는 Plan 3의 `GET /api/tags` 선택지와 동일한 값을 사용한다.
- 풀이 목록 DTO에도 `tags`를 포함하고, 목록 SQL은 `problem_tags`를 통해 대소문자 무관 태그 일치로 필터링한다.
- 빈칸 검증은 제출 목록을 먼저 `Set<String>`으로 만들고, 원소 수가 제출 수와 같은지 확인한 뒤 `definedKeys.containsAll(submittedKeys)` 및 `submittedKeys.size() == blankRevealCount`를 순서대로 검증한다. 실패 시 채점/저장을 하지 않는다.

---

## Part 1 — 백엔드: 풀이 조회 API

### Task 1: 풀이용 문제 목록/상세 조회 API (정답 비노출)

**Files:**
- Create: `backend/src/main/java/com/daeryun/probank/dto/solve/ProblemSolveListItem.java`
- Create: `backend/src/main/java/com/daeryun/probank/dto/solve/ChoiceOption.java`
- Create: `backend/src/main/java/com/daeryun/probank/dto/solve/RevealedBlank.java`
- Create: `backend/src/main/java/com/daeryun/probank/dto/solve/ProblemSolveDetailResponse.java`
- Modify: `backend/src/main/java/com/daeryun/probank/dao/ProblemDao.java`
- Modify: `backend/src/main/resources/mappers/probank/ProblemMapper.xml`
- Create: `backend/src/main/java/com/daeryun/probank/service/SolveService.java`
- Create: `backend/src/main/java/com/daeryun/probank/service/SolveServiceImpl.java`
- Create: `backend/src/main/java/com/daeryun/probank/controller/SolveController.java`
- Test: `backend/src/test/java/com/daeryun/probank/service/SolveServiceImplTest.java`

**Interfaces:**
- Consumes: `ProblemDao/ProblemChoiceDao/ProblemAnswerDao/ProblemBlankDao`(Plan 3 Task 1)
- Produces: `GET /api/problems`(ACTIVE만, 전사 공통), `GET /api/problems/{id}`(유형별 정답 비노출 상세). `SolveService.selectRandomBlankKeys(List<ProblemBlank>, int) : List<String>` — Task 2(제출 검증)가 재사용한다.

- [ ] **Step 1: 실패하는 테스트 작성**

`backend/src/test/java/com/daeryun/probank/service/SolveServiceImplTest.java`:
```java
package com.daeryun.probank.service;

import com.daeryun.probank.dao.ProblemAnswerDao;
import com.daeryun.probank.dao.ProblemBlankDao;
import com.daeryun.probank.dao.ProblemChoiceDao;
import com.daeryun.probank.dao.ProblemDao;
import com.daeryun.probank.dao.AttemptDao;
import com.daeryun.probank.dao.AttemptBlankAnswerDao;
import com.daeryun.probank.domain.*;
import com.daeryun.probank.dto.solve.ProblemSolveDetailResponse;
import com.daeryun.probank.exception.BizException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;

import java.util.Arrays;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

class SolveServiceImplTest {

    private ProblemDao problemDao;
    private ProblemChoiceDao problemChoiceDao;
    private ProblemAnswerDao problemAnswerDao;
    private ProblemBlankDao problemBlankDao;
    private AttemptDao attemptDao;
    private AttemptBlankAnswerDao attemptBlankAnswerDao;
    private SolveServiceImpl service;

    @BeforeEach
    void setUp() {
        problemDao = Mockito.mock(ProblemDao.class);
        problemChoiceDao = Mockito.mock(ProblemChoiceDao.class);
        problemAnswerDao = Mockito.mock(ProblemAnswerDao.class);
        problemBlankDao = Mockito.mock(ProblemBlankDao.class);
        attemptDao = Mockito.mock(AttemptDao.class);
        attemptBlankAnswerDao = Mockito.mock(AttemptBlankAnswerDao.class);
        service = new SolveServiceImpl(problemDao, problemChoiceDao, problemAnswerDao, problemBlankDao,
                attemptDao, attemptBlankAnswerDao);
    }

    private ProblemChoice choice(long id, String text, boolean correct, int order) {
        ProblemChoice c = new ProblemChoice();
        c.setId(id);
        c.setChoiceText(text);
        c.setCorrect(correct);
        c.setDisplayOrder(order);
        return c;
    }

    @Test
    void getDetail_mcqSingle_hidesCorrectFlag() {
        Problem problem = new Problem();
        problem.setId(1L);
        problem.setType(ProblemType.MCQ_SINGLE);
        problem.setContent("1+1=?");
        problem.setStatus(ProblemStatus.ACTIVE);
        Mockito.when(problemDao.findById(1L)).thenReturn(problem);
        Mockito.when(problemChoiceDao.findByProblemId(1L)).thenReturn(Arrays.asList(
                choice(10L, "1", false, 1), choice(11L, "2", true, 2)));

        ProblemSolveDetailResponse response = service.getDetail(1L);

        assertEquals(2, response.getChoices().size());
        assertNull(response.getChoices().get(0).getClass().getDeclaredFields().length == 0 ? null : null);
        // ChoiceOption에는 isCorrect 필드 자체가 없어야 하므로 필드 목록을 검증한다.
        boolean hasCorrectField = Arrays.stream(response.getChoices().get(0).getClass().getDeclaredFields())
                .anyMatch(f -> f.getName().toLowerCase().contains("correct"));
        assertFalse(hasCorrectField);
    }

    @Test
    void getDetail_archivedProblem_throwsBizException() {
        Problem archived = new Problem();
        archived.setId(2L);
        archived.setStatus(ProblemStatus.ARCHIVED);
        Mockito.when(problemDao.findById(2L)).thenReturn(archived);

        assertThrows(BizException.class, () -> service.getDetail(2L));
    }

    @Test
    void selectRandomBlankKeys_returnsExactCountFromDefinedBlanks() {
        ProblemBlank b1 = new ProblemBlank();
        b1.setBlankKey("blank_1");
        ProblemBlank b2 = new ProblemBlank();
        b2.setBlankKey("blank_2");
        ProblemBlank b3 = new ProblemBlank();
        b3.setBlankKey("blank_3");
        List<ProblemBlank> blanks = Arrays.asList(b1, b2, b3);

        List<String> selected = service.selectRandomBlankKeys(blanks, 2);

        assertEquals(2, selected.size());
        assertTrue(blanks.stream().map(ProblemBlank::getBlankKey).collect(java.util.stream.Collectors.toList())
                .containsAll(selected));
        assertEquals(2, selected.stream().distinct().count());
    }

    @Test
    void getDetail_fillBlank_revealsNonSelectedBlanksWithAnswerText() {
        Problem problem = new Problem();
        problem.setId(3L);
        problem.setType(ProblemType.FILL_BLANK);
        problem.setContent("{{blank_1}}은 {{blank_2}}의 수도이다.");
        problem.setStatus(ProblemStatus.ACTIVE);
        problem.setBlankRevealCount(1);
        Mockito.when(problemDao.findById(3L)).thenReturn(problem);
        ProblemBlank b1 = new ProblemBlank();
        b1.setBlankKey("blank_1");
        b1.setAnswerText("서울");
        ProblemBlank b2 = new ProblemBlank();
        b2.setBlankKey("blank_2");
        b2.setAnswerText("대한민국");
        Mockito.when(problemBlankDao.findByProblemId(3L)).thenReturn(Arrays.asList(b1, b2));

        ProblemSolveDetailResponse response = service.getDetail(3L);

        assertEquals(1, response.getBlanksToAnswer().size());
        assertEquals(1, response.getRevealedBlanks().size());
    }
}
```

- [ ] **Step 2: 테스트 실행하여 실패 확인**

Run: `cd backend && ./gradlew test --tests SolveServiceImplTest`
Expected: FAIL — 관련 클래스가 없어 컴파일 오류

- [ ] **Step 3: `findAllActive` Dao 추가**

`ProblemDao`에 메서드 추가:
```java
    java.util.List<com.daeryun.probank.dto.solve.ProblemSolveListItem> findAllActive(@Param("keyword") String keyword,
                                                                                       @Param("tag") String tag);
```

`ProblemMapper.xml`에 추가:
```xml
    <resultMap id="solveProblemListItemMap" type="com.daeryun.probank.dto.solve.ProblemSolveListItem">
        <result property="tags" column="tags" typeHandler="com.daeryun.probank.config.TagArrayTypeHandler"/>
    </resultMap>

    <select id="findAllActive" resultMap="solveProblemListItemMap">
        SELECT p.id, p.type, p.content,
               COALESCE(array_agg(DISTINCT t.name) FILTER (WHERE t.name IS NOT NULL), '{}') AS tags
        FROM problems p
        LEFT JOIN problem_tags pt ON pt.problem_id = p.id
        LEFT JOIN tags t ON t.id = pt.tag_id
        WHERE p.status = 'ACTIVE'
        <if test="keyword != null and keyword != ''">AND p.content ILIKE CONCAT('%', #{keyword}, '%')</if>
        <if test="tag != null and tag != ''">AND EXISTS (SELECT 1 FROM problem_tags fpt JOIN tags ft ON ft.id = fpt.tag_id WHERE fpt.problem_id = p.id AND lower(ft.name) = lower(#{tag}))</if>
        GROUP BY p.id
        ORDER BY p.created_at DESC
    </select>
```

- [ ] **Step 4: DTO/Service/Controller 구현**

`backend/src/main/java/com/daeryun/probank/dto/solve/ProblemSolveListItem.java`:
```java
package com.daeryun.probank.dto.solve;

import com.daeryun.probank.domain.ProblemType;
import lombok.Data;

@Data
public class ProblemSolveListItem {
    private Long id;
    private ProblemType type;
    private String content;
    private java.util.List<String> tags;
}
```

`backend/src/main/java/com/daeryun/probank/dto/solve/ChoiceOption.java`:
```java
package com.daeryun.probank.dto.solve;

import lombok.AllArgsConstructor;
import lombok.Data;

@Data
@AllArgsConstructor
public class ChoiceOption {
    private Long id;
    private String text;
}
```

`backend/src/main/java/com/daeryun/probank/dto/solve/RevealedBlank.java`:
```java
package com.daeryun.probank.dto.solve;

import lombok.AllArgsConstructor;
import lombok.Data;

@Data
@AllArgsConstructor
public class RevealedBlank {
    private String blankKey;
    private String answerText;
}
```

`backend/src/main/java/com/daeryun/probank/dto/solve/ProblemSolveDetailResponse.java`:
```java
package com.daeryun.probank.dto.solve;

import com.daeryun.probank.domain.ProblemType;
import lombok.AllArgsConstructor;
import lombok.Data;

import java.util.List;

@Data
@AllArgsConstructor
public class ProblemSolveDetailResponse {
    private Long id;
    private ProblemType type;
    private String content;
    private String imageUrl;
    private String referenceText;
    private List<ChoiceOption> choices;
    private List<String> blanksToAnswer;
    private List<RevealedBlank> revealedBlanks;
}
```

`backend/src/main/java/com/daeryun/probank/service/SolveService.java`:
```java
package com.daeryun.probank.service;

import com.daeryun.probank.domain.ProblemBlank;
import com.daeryun.probank.dto.solve.ProblemSolveDetailResponse;
import com.daeryun.probank.dto.solve.ProblemSolveListItem;

import java.util.List;

public interface SolveService {
    List<ProblemSolveListItem> list(String keyword, String tag);
    ProblemSolveDetailResponse getDetail(Long problemId);
    List<String> selectRandomBlankKeys(List<ProblemBlank> blanks, int count);
}
```

`backend/src/main/java/com/daeryun/probank/service/SolveServiceImpl.java`:
```java
package com.daeryun.probank.service;

import com.daeryun.probank.common.ErrorCode;
import com.daeryun.probank.dao.*;
import com.daeryun.probank.domain.*;
import com.daeryun.probank.dto.solve.*;
import com.daeryun.probank.exception.BizException;
import org.springframework.stereotype.Service;

import java.security.SecureRandom;
import java.util.ArrayList;
import java.util.List;
import java.util.stream.Collectors;

@Service
public class SolveServiceImpl implements SolveService {

    private final SecureRandom random = new SecureRandom();

    private final ProblemDao problemDao;
    private final ProblemChoiceDao problemChoiceDao;
    private final ProblemAnswerDao problemAnswerDao;
    private final ProblemBlankDao problemBlankDao;
    private final AttemptDao attemptDao;
    private final AttemptBlankAnswerDao attemptBlankAnswerDao;

    public SolveServiceImpl(ProblemDao problemDao, ProblemChoiceDao problemChoiceDao,
                             ProblemAnswerDao problemAnswerDao, ProblemBlankDao problemBlankDao,
                             AttemptDao attemptDao, AttemptBlankAnswerDao attemptBlankAnswerDao) {
        this.problemDao = problemDao;
        this.problemChoiceDao = problemChoiceDao;
        this.problemAnswerDao = problemAnswerDao;
        this.problemBlankDao = problemBlankDao;
        this.attemptDao = attemptDao;
        this.attemptBlankAnswerDao = attemptBlankAnswerDao;
    }

    @Override
    public List<ProblemSolveListItem> list(String keyword, String tag) {
        return problemDao.findAllActive(keyword, tag);
    }

    @Override
    public ProblemSolveDetailResponse getDetail(Long problemId) {
        Problem problem = problemDao.findById(problemId);
        if (problem == null || problem.getStatus() != ProblemStatus.ACTIVE) {
            throw new BizException(ErrorCode.INPUT_VALUE_INVALID, "존재하지 않거나 보관된 문제입니다.");
        }

        List<ChoiceOption> choices = null;
        List<String> blanksToAnswer = null;
        List<RevealedBlank> revealedBlanks = null;

        if (problem.getType() == ProblemType.FILL_BLANK) {
            List<ProblemBlank> blanks = problemBlankDao.findByProblemId(problemId);
            List<String> selected = selectRandomBlankKeys(blanks, problem.getBlankRevealCount());
            blanksToAnswer = selected;
            revealedBlanks = blanks.stream()
                    .filter(b -> !selected.contains(b.getBlankKey()))
                    .map(b -> new RevealedBlank(b.getBlankKey(), b.getAnswerText()))
                    .collect(Collectors.toList());
        } else if (problem.getType() != ProblemType.SHORT_ANSWER) {
            choices = problemChoiceDao.findByProblemId(problemId).stream()
                    .map(c -> new ChoiceOption(c.getId(), c.getChoiceText()))
                    .collect(Collectors.toList());
        }

        return new ProblemSolveDetailResponse(
                problem.getId(), problem.getType(), problem.getContent(), problem.getImageUrl(),
                problem.getReferenceText(), choices, blanksToAnswer, revealedBlanks);
    }

    @Override
    public List<String> selectRandomBlankKeys(List<ProblemBlank> blanks, int count) {
        List<String> keys = new ArrayList<>(blanks.stream().map(ProblemBlank::getBlankKey).collect(Collectors.toList()));
        java.util.Collections.shuffle(keys, random);
        return keys.subList(0, Math.min(count, keys.size()));
    }
}
```

`backend/src/main/java/com/daeryun/probank/controller/SolveController.java`:
```java
package com.daeryun.probank.controller;

import com.daeryun.probank.common.ResponseDto;
import com.daeryun.probank.service.SolveService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/problems")
public class SolveController {

    private final SolveService solveService;

    public SolveController(SolveService solveService) {
        this.solveService = solveService;
    }

    @GetMapping
    public ResponseEntity<ResponseDto<?>> list(@RequestParam(required = false) String keyword,
                                               @RequestParam(required = false) String tag) {
        return ResponseEntity.ok(ResponseDto.ok(solveService.list(keyword, tag)));
    }

    @GetMapping("/{id}")
    public ResponseEntity<ResponseDto<?>> getDetail(@PathVariable Long id) {
        return ResponseEntity.ok(ResponseDto.ok(solveService.getDetail(id)));
    }
}
```

(`AttemptDao`/`AttemptBlankAnswerDao`는 Task 2에서 정의한다 — 이 Task의 생성자는 이를 미리 참조하므로, 컴파일을 위해 Task 2의 Step 1을 먼저 최소 인터페이스로 만들어야 한다. 아래 Step 5에서 최소 버전을 함께 추가한다.)

- [ ] **Step 5: `AttemptDao`/`AttemptBlankAnswerDao` 최소 인터페이스 작성 (Task 2에서 메서드 채움)**

`backend/src/main/java/com/daeryun/probank/dao/AttemptDao.java`:
```java
package com.daeryun.probank.dao;

public interface AttemptDao {
}
```

`backend/src/main/java/com/daeryun/probank/dao/AttemptBlankAnswerDao.java`:
```java
package com.daeryun.probank.dao;

public interface AttemptBlankAnswerDao {
}
```

- [ ] **Step 6: 테스트 실행하여 통과 확인**

Run: `cd backend && ./gradlew test --tests SolveServiceImplTest`
Expected: `BUILD SUCCESSFUL`, 4 tests 통과

- [ ] **Step 7: Commit**

```bash
git add backend/src/main/java/com/daeryun/probank/dto/solve backend/src/main/java/com/daeryun/probank/dao/ProblemDao.java backend/src/main/resources/mappers/probank/ProblemMapper.xml backend/src/main/java/com/daeryun/probank/service/SolveService.java backend/src/main/java/com/daeryun/probank/service/SolveServiceImpl.java backend/src/main/java/com/daeryun/probank/controller/SolveController.java backend/src/main/java/com/daeryun/probank/dao/AttemptDao.java backend/src/main/java/com/daeryun/probank/dao/AttemptBlankAnswerDao.java backend/src/test/java/com/daeryun/probank/service/SolveServiceImplTest.java
git commit -m "feat: add answer-free problem browsing API for solving"
```

---

### Task 2: 제출/채점 API

**Files:**
- Modify: `backend/src/main/java/com/daeryun/probank/dao/AttemptDao.java`
- Modify: `backend/src/main/java/com/daeryun/probank/dao/AttemptBlankAnswerDao.java`
- Create: `backend/src/main/resources/mappers/probank/AttemptMapper.xml`
- Create: `backend/src/main/resources/mappers/probank/AttemptBlankAnswerMapper.xml`
- Create: `backend/src/main/java/com/daeryun/probank/domain/Attempt.java`
- Create: `backend/src/main/java/com/daeryun/probank/domain/AttemptBlankAnswer.java`
- Create: `backend/src/main/java/com/daeryun/probank/dto/solve/AttemptSubmitRequest.java`
- Create: `backend/src/main/java/com/daeryun/probank/dto/solve/BlankAnswerInput.java`
- Create: `backend/src/main/java/com/daeryun/probank/dto/solve/BlankAnswerResult.java`
- Create: `backend/src/main/java/com/daeryun/probank/dto/solve/AttemptResult.java`
- Modify: `backend/src/main/java/com/daeryun/probank/service/SolveService.java`
- Modify: `backend/src/main/java/com/daeryun/probank/service/SolveServiceImpl.java`
- Modify: `backend/src/main/java/com/daeryun/probank/controller/SolveController.java`
- Test: `backend/src/test/java/com/daeryun/probank/service/SolveServiceImplTest.java`

**Interfaces:**
- Consumes: `ProblemChoiceDao/ProblemAnswerDao/ProblemBlankDao`(Plan 3), `AuthUser`(Plan 1 Task 4)
- Produces: `POST /api/problems/{id}/attempts`. `SolveService.submit(Long problemId, AttemptSubmitRequest, AuthUser) : AttemptResult`. Task 3(본인 이력), Plan 5(통계)가 `attempts` 테이블을 사용한다.

- [ ] **Step 1: 실패하는 테스트 추가**

`SolveServiceImplTest`에 아래 테스트 추가 (상단 import에 `com.daeryun.probank.common.AuthUser`, `com.daeryun.probank.dto.solve.AttemptSubmitRequest`, `com.daeryun.probank.dto.solve.BlankAnswerInput`, `com.daeryun.probank.dto.solve.AttemptResult`, `java.util.Collections` 추가):
```java
    private final AuthUser actor = new AuthUser(1L, "1001", "홍길동", UserRole.EMPLOYEE, 10L, false);

    @Test
    void submit_mcqSingle_correctChoice_marksCorrect() {
        Problem problem = new Problem();
        problem.setId(1L);
        problem.setType(ProblemType.MCQ_SINGLE);
        problem.setExplanation("설명");
        Mockito.when(problemDao.findById(1L)).thenReturn(problem);
        Mockito.when(problemChoiceDao.findByProblemId(1L)).thenReturn(Arrays.asList(
                choice(10L, "1", false, 1), choice(11L, "2", true, 2)));

        AttemptSubmitRequest request = new AttemptSubmitRequest();
        request.setSelectedChoiceIds(Collections.singletonList(11L));

        AttemptResult result = service.submit(1L, request, actor);

        assertTrue(result.isCorrect());
        Mockito.verify(attemptDao).insert(Mockito.any());
    }

    @Test
    void submit_mcqMulti_partialSelection_marksIncorrect() {
        Problem problem = new Problem();
        problem.setId(1L);
        problem.setType(ProblemType.MCQ_MULTI);
        Mockito.when(problemDao.findById(1L)).thenReturn(problem);
        Mockito.when(problemChoiceDao.findByProblemId(1L)).thenReturn(Arrays.asList(
                choice(10L, "1", true, 1), choice(11L, "2", true, 2), choice(12L, "3", false, 3)));

        AttemptSubmitRequest request = new AttemptSubmitRequest();
        request.setSelectedChoiceIds(Collections.singletonList(10L));

        AttemptResult result = service.submit(1L, request, actor);

        assertFalse(result.isCorrect());
    }

    @Test
    void submit_shortAnswer_normalizesBeforeComparing() {
        Problem problem = new Problem();
        problem.setId(1L);
        problem.setType(ProblemType.SHORT_ANSWER);
        Mockito.when(problemDao.findById(1L)).thenReturn(problem);
        ProblemAnswer answer = new ProblemAnswer();
        answer.setAnswerText("Seoul");
        Mockito.when(problemAnswerDao.findByProblemId(1L)).thenReturn(Collections.singletonList(answer));

        AttemptSubmitRequest request = new AttemptSubmitRequest();
        request.setSubmittedText("  seoul  ");

        AttemptResult result = service.submit(1L, request, actor);

        assertTrue(result.isCorrect());
    }

    @Test
    void submit_fillBlank_allBlanksCorrect_marksCorrect() {
        Problem problem = new Problem();
        problem.setId(1L);
        problem.setType(ProblemType.FILL_BLANK);
        problem.setBlankRevealCount(1);
        Mockito.when(problemDao.findById(1L)).thenReturn(problem);
        ProblemBlank blank1 = new ProblemBlank();
        blank1.setBlankKey("blank_1");
        blank1.setAnswerText("서울");
        ProblemBlank blank2 = new ProblemBlank();
        blank2.setBlankKey("blank_2");
        blank2.setAnswerText("대한민국");
        Mockito.when(problemBlankDao.findByProblemId(1L)).thenReturn(Arrays.asList(blank1, blank2));

        BlankAnswerInput input = new BlankAnswerInput();
        input.setBlankKey("blank_1");
        input.setSubmittedAnswer("서울");
        AttemptSubmitRequest request = new AttemptSubmitRequest();
        request.setBlankAnswers(Collections.singletonList(input));

        AttemptResult result = service.submit(1L, request, actor);

        assertTrue(result.isCorrect());
        Mockito.verify(attemptBlankAnswerDao).insertAll(Mockito.anyList());
    }

    @Test
    void submit_fillBlank_wrongBlankCountRejected() {
        Problem problem = new Problem();
        problem.setId(1L);
        problem.setType(ProblemType.FILL_BLANK);
        problem.setBlankRevealCount(2);
        Mockito.when(problemDao.findById(1L)).thenReturn(problem);
        ProblemBlank blank1 = new ProblemBlank();
        blank1.setBlankKey("blank_1");
        blank1.setAnswerText("서울");
        Mockito.when(problemBlankDao.findByProblemId(1L)).thenReturn(Collections.singletonList(blank1));

        BlankAnswerInput input = new BlankAnswerInput();
        input.setBlankKey("blank_1");
        input.setSubmittedAnswer("서울");
        AttemptSubmitRequest request = new AttemptSubmitRequest();
        request.setBlankAnswers(Collections.singletonList(input));

        assertThrows(BizException.class, () -> service.submit(1L, request, actor));
    }
```

- [ ] **Step 2: 테스트 실행하여 실패 확인**

Run: `cd backend && ./gradlew test --tests SolveServiceImplTest`
Expected: FAIL — `submit` 메서드 및 관련 DTO가 없어 컴파일 오류

- [ ] **Step 3: 도메인/Dao/Mapper/DTO/Service 구현**

`backend/src/main/java/com/daeryun/probank/domain/Attempt.java`:
```java
package com.daeryun.probank.domain;

import lombok.Data;

import java.time.LocalDateTime;

@Data
public class Attempt {
    private Long id;
    private Long userId;
    private Long problemId;
    private String submittedAnswer;
    private boolean correct;
    private LocalDateTime submittedAt;
}
```

`backend/src/main/java/com/daeryun/probank/domain/AttemptBlankAnswer.java`:
```java
package com.daeryun.probank.domain;

import lombok.Data;

@Data
public class AttemptBlankAnswer {
    private Long id;
    private Long attemptId;
    private String blankKey;
    private String submittedAnswer;
    private boolean correct;
}
```

`backend/src/main/java/com/daeryun/probank/dao/AttemptDao.java` (전체 교체):
```java
package com.daeryun.probank.dao;

import com.daeryun.probank.domain.Attempt;
import com.daeryun.probank.dto.solve.AttemptHistoryItem;
import org.apache.ibatis.annotations.Param;

import java.util.List;

public interface AttemptDao {
    void insert(Attempt attempt);
    List<AttemptHistoryItem> findByUserId(@Param("userId") Long userId);
}
```

`backend/src/main/java/com/daeryun/probank/dao/AttemptBlankAnswerDao.java` (전체 교체):
```java
package com.daeryun.probank.dao;

import com.daeryun.probank.domain.AttemptBlankAnswer;
import org.apache.ibatis.annotations.Param;

import java.util.List;

public interface AttemptBlankAnswerDao {
    void insertAll(@Param("answers") List<AttemptBlankAnswer> answers);
}
```

(참고: `AttemptHistoryItem`은 Task 3에서 정의한다. 이 Task에서는 `AttemptDao.findByUserId`가 참조하는 타입이 없으면 컴파일이 실패하므로, 아래에 최소 DTO를 함께 만든다.)

`backend/src/main/java/com/daeryun/probank/dto/solve/AttemptHistoryItem.java`:
```java
package com.daeryun.probank.dto.solve;

import lombok.Data;

import java.time.LocalDateTime;

@Data
public class AttemptHistoryItem {
    private Long problemId;
    private String problemContent;
    private String submittedAnswer;
    private boolean correct;
    private LocalDateTime submittedAt;
}
```

`backend/src/main/resources/mappers/probank/AttemptMapper.xml`:
```xml
<?xml version="1.0" encoding="UTF-8" ?>
<!DOCTYPE mapper PUBLIC "-//mybatis.org//DTD Mapper 3.0//EN" "http://mybatis.org/dtd/mybatis-3-mapper.dtd">
<mapper namespace="com.daeryun.probank.dao.AttemptDao">

    <insert id="insert" parameterType="Attempt" useGeneratedKeys="true" keyProperty="id">
        INSERT INTO attempts (user_id, problem_id, submitted_answer, is_correct)
        VALUES (#{userId}, #{problemId}, #{submittedAnswer}, #{correct})
    </insert>

    <select id="findByUserId" resultType="com.daeryun.probank.dto.solve.AttemptHistoryItem">
        SELECT a.problem_id, p.content AS problem_content, a.submitted_answer, a.is_correct, a.submitted_at
        FROM attempts a
        JOIN problems p ON p.id = a.problem_id
        WHERE a.user_id = #{userId}
        ORDER BY a.submitted_at DESC
    </select>

</mapper>
```

`backend/src/main/resources/mappers/probank/AttemptBlankAnswerMapper.xml`:
```xml
<?xml version="1.0" encoding="UTF-8" ?>
<!DOCTYPE mapper PUBLIC "-//mybatis.org//DTD Mapper 3.0//EN" "http://mybatis.org/dtd/mybatis-3-mapper.dtd">
<mapper namespace="com.daeryun.probank.dao.AttemptBlankAnswerDao">

    <insert id="insertAll">
        INSERT INTO attempt_blank_answers (attempt_id, blank_key, submitted_answer, is_correct)
        VALUES
        <foreach collection="answers" item="answer" separator=",">
            (#{answer.attemptId}, #{answer.blankKey}, #{answer.submittedAnswer}, #{answer.correct})
        </foreach>
    </insert>

</mapper>
```

`backend/src/main/java/com/daeryun/probank/dto/solve/BlankAnswerInput.java`:
```java
package com.daeryun.probank.dto.solve;

import lombok.Data;

@Data
public class BlankAnswerInput {
    private String blankKey;
    private String submittedAnswer;
}
```

`backend/src/main/java/com/daeryun/probank/dto/solve/AttemptSubmitRequest.java`:
```java
package com.daeryun.probank.dto.solve;

import lombok.Data;

import java.util.List;

@Data
public class AttemptSubmitRequest {
    private List<Long> selectedChoiceIds;
    private String submittedText;
    private List<BlankAnswerInput> blankAnswers;
}
```

`backend/src/main/java/com/daeryun/probank/dto/solve/BlankAnswerResult.java`:
```java
package com.daeryun.probank.dto.solve;

import lombok.AllArgsConstructor;
import lombok.Data;

@Data
@AllArgsConstructor
public class BlankAnswerResult {
    private String blankKey;
    private String submittedAnswer;
    private boolean correct;
    private String correctAnswer;
}
```

`backend/src/main/java/com/daeryun/probank/dto/solve/AttemptResult.java`:
```java
package com.daeryun.probank.dto.solve;

import lombok.AllArgsConstructor;
import lombok.Data;

import java.util.List;

@Data
@AllArgsConstructor
public class AttemptResult {
    private boolean correct;
    private String explanation;
    private List<BlankAnswerResult> blankResults;
}
```

`SolveService`에 메서드 추가:
```java
    com.daeryun.probank.dto.solve.AttemptResult submit(Long problemId, com.daeryun.probank.dto.solve.AttemptSubmitRequest request,
                                                        com.daeryun.probank.common.AuthUser actor);
```

`SolveServiceImpl`에 필드/생성자/메서드 추가 (기존 생성자 시그니처에 `AttemptDao attemptDao, AttemptBlankAnswerDao attemptBlankAnswerDao`는 이미 Task 1에서 추가되어 있음):
```java
    @Override
    public AttemptResult submit(Long problemId, AttemptSubmitRequest request, com.daeryun.probank.common.AuthUser actor) {
        Problem problem = problemDao.findById(problemId);
        if (problem == null || problem.getStatus() != ProblemStatus.ACTIVE) {
            throw new BizException(ErrorCode.INPUT_VALUE_INVALID, "존재하지 않거나 보관된 문제입니다.");
        }

        boolean correct;
        List<BlankAnswerResult> blankResults = null;
        String submittedAnswerSummary;

        switch (problem.getType()) {
            case MCQ_SINGLE:
            case MCQ_MULTI:
            case OX: {
                List<ProblemChoice> choices = problemChoiceDao.findByProblemId(problemId);
                java.util.Set<Long> correctIds = choices.stream().filter(ProblemChoice::isCorrect)
                        .map(ProblemChoice::getId).collect(Collectors.toSet());
                java.util.Set<Long> submittedIds = new java.util.HashSet<>(
                        request.getSelectedChoiceIds() == null ? java.util.Collections.emptyList() : request.getSelectedChoiceIds());
                correct = correctIds.equals(submittedIds);
                submittedAnswerSummary = submittedIds.toString();
                break;
            }
            case SHORT_ANSWER: {
                List<String> answers = problemAnswerDao.findByProblemId(problemId).stream()
                        .map(ProblemAnswer::getAnswerText).collect(Collectors.toList());
                correct = answers.stream().anyMatch(a -> normalize(a).equals(normalize(request.getSubmittedText())));
                submittedAnswerSummary = request.getSubmittedText();
                break;
            }
            case FILL_BLANK: {
                List<ProblemBlank> blanks = problemBlankDao.findByProblemId(problemId);
                List<BlankAnswerInput> submitted = request.getBlankAnswers() == null
                        ? java.util.Collections.emptyList() : request.getBlankAnswers();
                java.util.Set<String> submittedKeys = submitted.stream()
                        .map(BlankAnswerInput::getBlankKey).collect(Collectors.toSet());
                java.util.Set<String> definedKeys = blanks.stream()
                        .map(ProblemBlank::getBlankKey).collect(Collectors.toSet());
                if (submittedKeys.size() != submitted.size()
                        || !definedKeys.containsAll(submittedKeys)
                        || submittedKeys.size() != problem.getBlankRevealCount()) {
                    throw new BizException(ErrorCode.INPUT_VALUE_INVALID, "제출한 빈칸 개수가 올바르지 않습니다.");
                }
                java.util.Map<String, String> answerByKey = blanks.stream()
                        .collect(Collectors.toMap(ProblemBlank::getBlankKey, ProblemBlank::getAnswerText));
                blankResults = new ArrayList<>();
                boolean allCorrect = true;
                for (BlankAnswerInput input : submitted) {
                    String correctAnswer = answerByKey.get(input.getBlankKey());
                    boolean blankCorrect = normalize(correctAnswer).equals(normalize(input.getSubmittedAnswer()));
                    allCorrect &= blankCorrect;
                    blankResults.add(new BlankAnswerResult(input.getBlankKey(), input.getSubmittedAnswer(), blankCorrect, correctAnswer));
                }
                correct = allCorrect;
                submittedAnswerSummary = submitted.stream()
                        .map(b -> b.getBlankKey() + "=" + b.getSubmittedAnswer())
                        .collect(Collectors.joining(","));
                break;
            }
            default:
                throw new BizException(ErrorCode.MSG_PROC_FAIL);
        }

        Attempt attempt = new Attempt();
        attempt.setUserId(actor.getUserId());
        attempt.setProblemId(problemId);
        attempt.setSubmittedAnswer(submittedAnswerSummary);
        attempt.setCorrect(correct);
        attemptDao.insert(attempt);

        if (blankResults != null) {
            List<AttemptBlankAnswer> entities = blankResults.stream().map(r -> {
                AttemptBlankAnswer entity = new AttemptBlankAnswer();
                entity.setAttemptId(attempt.getId());
                entity.setBlankKey(r.getBlankKey());
                entity.setSubmittedAnswer(r.getSubmittedAnswer());
                entity.setCorrect(r.isCorrect());
                return entity;
            }).collect(Collectors.toList());
            attemptBlankAnswerDao.insertAll(entities);
        }

        return new AttemptResult(correct, problem.getExplanation(), blankResults);
    }

    private String normalize(String value) {
        return value == null ? "" : value.trim().toLowerCase().replaceAll("\\s+", " ");
    }
```
(상단 import에 `com.daeryun.probank.dto.solve.*`, `com.daeryun.probank.domain.AttemptBlankAnswer`, `com.daeryun.probank.dto.solve.BlankAnswerInput`, `com.daeryun.probank.dto.solve.BlankAnswerResult`, `com.daeryun.probank.dto.solve.AttemptResult`, `com.daeryun.probank.dto.solve.AttemptSubmitRequest`가 이미 와일드카드로 포함됨을 확인한다.)

`SolveController`에 엔드포인트 추가 (상단 import에 `com.daeryun.probank.common.AuthUser`, `com.daeryun.probank.common.SessionKeys`, `com.daeryun.probank.dto.solve.AttemptSubmitRequest`, `javax.servlet.http.HttpServletRequest` 추가):
```java
    @PostMapping("/{id}/attempts")
    public ResponseEntity<ResponseDto<?>> submit(@PathVariable Long id, @RequestBody AttemptSubmitRequest request,
                                                  HttpServletRequest httpRequest) {
        AuthUser actor = (AuthUser) httpRequest.getSession().getAttribute(SessionKeys.LOGIN_USER);
        return ResponseEntity.ok(ResponseDto.ok(solveService.submit(id, request, actor)));
    }
```

- [ ] **Step 4: 테스트 실행하여 통과 확인**

Run: `cd backend && ./gradlew test --tests SolveServiceImplTest`
Expected: `BUILD SUCCESSFUL`, 9 tests 통과

- [ ] **Step 5: Commit**

```bash
git add backend/src/main/java/com/daeryun/probank/domain/Attempt.java backend/src/main/java/com/daeryun/probank/domain/AttemptBlankAnswer.java backend/src/main/java/com/daeryun/probank/dao/AttemptDao.java backend/src/main/java/com/daeryun/probank/dao/AttemptBlankAnswerDao.java backend/src/main/resources/mappers/probank/Attempt*.xml backend/src/main/java/com/daeryun/probank/dto/solve backend/src/main/java/com/daeryun/probank/service/SolveService.java backend/src/main/java/com/daeryun/probank/service/SolveServiceImpl.java backend/src/main/java/com/daeryun/probank/controller/SolveController.java backend/src/test/java/com/daeryun/probank/service/SolveServiceImplTest.java
git commit -m "feat: add attempt submission and grading API for all problem types"
```

---

### Task 3: 본인 풀이 이력 API

**Files:**
- Modify: `backend/src/main/java/com/daeryun/probank/service/SolveService.java`
- Modify: `backend/src/main/java/com/daeryun/probank/service/SolveServiceImpl.java`
- Modify: `backend/src/main/java/com/daeryun/probank/controller/SolveController.java`
- Test: `backend/src/test/java/com/daeryun/probank/service/SolveServiceImplTest.java`

**Interfaces:**
- Consumes: `AttemptDao.findByUserId`(Task 2)
- Produces: `GET /api/attempts/me`. Task 5(프론트 이력 화면)가 사용한다.

- [ ] **Step 1: 실패하는 테스트 추가**

`SolveServiceImplTest`에 추가:
```java
    @Test
    void myHistory_returnsUserAttemptsOrderedByDaoResult() {
        com.daeryun.probank.dto.solve.AttemptHistoryItem item = new com.daeryun.probank.dto.solve.AttemptHistoryItem();
        item.setProblemId(1L);
        Mockito.when(attemptDao.findByUserId(1L)).thenReturn(Collections.singletonList(item));

        List<com.daeryun.probank.dto.solve.AttemptHistoryItem> history = service.myHistory(actor);

        assertEquals(1, history.size());
        Mockito.verify(attemptDao).findByUserId(1L);
    }
```

- [ ] **Step 2: 테스트 실행하여 실패 확인**

Run: `cd backend && ./gradlew test --tests SolveServiceImplTest`
Expected: FAIL — `myHistory` 메서드가 없어 컴파일 오류

- [ ] **Step 3: 구현**

`SolveService`에 메서드 추가:
```java
    java.util.List<com.daeryun.probank.dto.solve.AttemptHistoryItem> myHistory(com.daeryun.probank.common.AuthUser actor);
```

`SolveServiceImpl`에 메서드 추가:
```java
    @Override
    public List<com.daeryun.probank.dto.solve.AttemptHistoryItem> myHistory(com.daeryun.probank.common.AuthUser actor) {
        return attemptDao.findByUserId(actor.getUserId());
    }
```

`SolveController`에 엔드포인트 추가:
```java
    @GetMapping("/me")
    @RequestMapping
    public ResponseEntity<ResponseDto<?>> myHistory(HttpServletRequest httpRequest) {
        AuthUser actor = (AuthUser) httpRequest.getSession().getAttribute(SessionKeys.LOGIN_USER);
        return ResponseEntity.ok(ResponseDto.ok(solveService.myHistory(actor)));
    }
```
**주의:** 위 엔드포인트는 클래스 레벨 매핑이 `/api/problems`이므로 그대로 두면 `/api/problems/me`가 되어 버린다. 본인 이력은 문제 하위 리소스가 아니므로 별도 컨트롤러로 분리한다 — 위에서 추가한 `myHistory` 메서드와 `@RequestMapping`은 `SolveController`에 추가하지 말고, 대신 아래처럼 새 컨트롤러를 만든다.

`backend/src/main/java/com/daeryun/probank/controller/AttemptController.java`:
```java
package com.daeryun.probank.controller;

import com.daeryun.probank.common.AuthUser;
import com.daeryun.probank.common.ResponseDto;
import com.daeryun.probank.common.SessionKeys;
import com.daeryun.probank.service.SolveService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import javax.servlet.http.HttpServletRequest;

@RestController
@RequestMapping("/api/attempts")
public class AttemptController {

    private final SolveService solveService;

    public AttemptController(SolveService solveService) {
        this.solveService = solveService;
    }

    @GetMapping("/me")
    public ResponseEntity<ResponseDto<?>> myHistory(HttpServletRequest httpRequest) {
        AuthUser actor = (AuthUser) httpRequest.getSession().getAttribute(SessionKeys.LOGIN_USER);
        return ResponseEntity.ok(ResponseDto.ok(solveService.myHistory(actor)));
    }
}
```
(`SolveController`에는 `myHistory` 엔드포인트를 추가하지 않는다.)

- [ ] **Step 4: 테스트 실행하여 통과 확인**

Run: `cd backend && ./gradlew test --tests SolveServiceImplTest`
Expected: `BUILD SUCCESSFUL`, 10 tests 통과

- [ ] **Step 5: Commit**

```bash
git add backend/src/main/java/com/daeryun/probank/service/SolveService.java backend/src/main/java/com/daeryun/probank/service/SolveServiceImpl.java backend/src/main/java/com/daeryun/probank/controller/AttemptController.java backend/src/test/java/com/daeryun/probank/service/SolveServiceImplTest.java
git commit -m "feat: add personal attempt history API"
```

---

## Part 2 — 프론트엔드: 풀이 화면

### Task 4: 빈칸 콘텐츠 렌더링 유틸 + 학습 홈·문제 목록·상세·제출 화면

**Files:**
- Create: `frontend/src/utils/blankContent.js`
- Create: `frontend/src/utils/blankContent.test.js`
- Create: `frontend/src/api/solve.js`
- Modify: `frontend/src/pages/solve/SolveHomePage.jsx` (Blue Bento 학습 홈으로 교체)
- Create: `frontend/src/pages/solve/ProblemListPage.jsx`
- Create: `frontend/src/pages/solve/ProblemSolvePage.jsx`
- Modify: `frontend/src/routers/routes.jsx`

**Interfaces:**
- Consumes: `apiGet/apiPost`(Plan 1 client.js)
- Produces: `parseBlankContent(content, blankKeys) : Array<{type, value}>` (순수 함수). `/solve`, `/solve/problems`, `/solve/:id` 화면.

- [ ] **Step 1: 실패하는 순수 함수 테스트 작성**

`frontend/src/utils/blankContent.test.js`:
```javascript
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseBlankContent } from "./blankContent.js";

test("splits content into text and input segments for blanks to answer", () => {
  const segments = parseBlankContent("{{blank_1}}은 {{blank_2}}의 수도이다.", ["blank_1"], { blank_2: "대한민국" });

  assert.deepEqual(segments, [
    { type: "input", blankKey: "blank_1" },
    { type: "text", value: "은 " },
    { type: "reveal", blankKey: "blank_2", value: "대한민국" },
    { type: "text", value: "의 수도이다." },
  ]);
});

test("plain text without markers returns single text segment", () => {
  const segments = parseBlankContent("빈칸이 없는 문제입니다.", [], {});
  assert.deepEqual(segments, [{ type: "text", value: "빈칸이 없는 문제입니다." }]);
});
```

- [ ] **Step 2: 테스트 실행하여 실패 확인**

Run: `cd frontend && npm test`
Expected: FAIL — `blankContent.js` 파일이 없음

- [ ] **Step 3: 순수 함수 구현**

`frontend/src/utils/blankContent.js`:
```javascript
const BLANK_MARKER_PATTERN = /\{\{(\w+)\}\}/g;

/**
 * @param {string} content
 * @param {string[]} blanksToAnswer
 * @param {Record<string, string>} revealedAnswers
 * @returns {Array<{type: "text", value: string} | {type: "input", blankKey: string} | {type: "reveal", blankKey: string, value: string}>}
 */
export function parseBlankContent(content, blanksToAnswer, revealedAnswers) {
  const segments = [];
  let lastIndex = 0;
  let match;

  BLANK_MARKER_PATTERN.lastIndex = 0;
  while ((match = BLANK_MARKER_PATTERN.exec(content)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ type: "text", value: content.slice(lastIndex, match.index) });
    }
    const blankKey = match[1];
    if (blanksToAnswer.includes(blankKey)) {
      segments.push({ type: "input", blankKey });
    } else {
      segments.push({ type: "reveal", blankKey, value: revealedAnswers[blankKey] ?? "" });
    }
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < content.length) {
    segments.push({ type: "text", value: content.slice(lastIndex) });
  }
  return segments;
}
```

- [ ] **Step 4: 테스트 실행하여 통과 확인**

Run: `cd frontend && npm test`
Expected: 모든 테스트 통과

- [ ] **Step 5: solve API 래퍼 작성**

`frontend/src/api/solve.js`:
```javascript
import { apiGet, apiPost } from "@/api/client.js";

export function listSolveProblems(keyword, tag) {
  const params = new URLSearchParams();
  if (keyword) params.set("keyword", keyword);
  if (tag) params.set("tag", tag);
  const query = params.toString() ? `?${params.toString()}` : "";
  return apiGet(`/api/problems${query}`);
}

export function getSolveProblem(id) {
  return apiGet(`/api/problems/${id}`);
}

export function submitAttempt(id, payload) {
  return apiPost(`/api/problems/${id}/attempts`, payload);
}

export function myAttemptHistory() {
  return apiGet("/api/attempts/me");
}
```

- [ ] **Step 6: 직원 학습 홈 화면 작성 (`SolveHomePage`)**

`frontend/src/pages/solve/SolveHomePage.jsx`는 디자인 시스템의 Blue Bento Learning 구조를 사용한다.

- 상단: 인사말·학습 요약·내 풀이 이력 링크
- 1행: `ContinueLearning` 8열 + `ProgressPanel` 4열
- 2행: `RecommendedProblemSet` 8열 + `RecentActivity` 4열
- 3행: `RoutinePanel` 12열
- `학습 이어가기`는 최근 학습으로 이동하고, `문제 풀기`는 `/solve/problems`로 이동한다.
- 모바일에서는 상기 영역을 이어서 학습하기 → 학습 현황 → 추천 문제 → 최근 활동 순서의 1열로 배치한다.

```javascript
import { Link } from "react-router-dom";

export default function SolveHomePage() {
  return (
    <main className="solve-home">
      <section className="continue-learning">
        <h1>이어서 학습하기</h1>
        <Link to="/solve/problems">문제 풀기</Link>
      </section>
      <section className="progress-panel">나의 학습 현황</section>
      <section className="recommended-problems">추천 문제 세트</section>
      <section className="recent-activity">최근 학습 활동</section>
    </main>
  );
}
```

- [ ] **Step 7: 문제 목록 화면 작성 (`ProblemListPage`)**

`frontend/src/pages/solve/ProblemListPage.jsx`:
```javascript
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "react-toastify";
import { listSolveProblems } from "@/api/solve.js";
import { listTags } from "@/api/problems.js";
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
  const [tag, setTag] = useState("");
  const [tags, setTags] = useState([]);

  useEffect(() => {
    listTags().then(setTags).catch(() => setTags([]));
  }, []);

  async function refresh() {
    try {
      setProblems(await listSolveProblems(keyword, tag));
    } catch (error) {
      toast.error(resolveErrorMessage(error, "문제 목록을 불러오지 못했습니다."));
    }
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-4 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">문제 풀이</h1>
        <Link to="/solve/history" className="text-sm text-blue-600 underline">
          내 풀이 이력
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
        <select className="rounded border px-3 py-2" value={tag} onChange={(event) => setTag(event.target.value)}>
          <option value="">전체 태그</option>
          {tags.map((item) => <option key={item.id ?? item} value={item.name ?? item}>{item.name ?? item}</option>)}
        </select>
        <button type="submit" className="rounded border px-4 py-2">
          검색
        </button>
      </form>

      <ul className="space-y-2">
        {problems.map((problem) => (
          <li key={problem.id}>
            <Link to={`/solve/${problem.id}`} className="block rounded border p-3 hover:bg-gray-50">
              <span className="mr-2 rounded bg-gray-100 px-2 py-1 text-xs">{TYPE_LABELS[problem.type]}</span>
              {problem.content}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
```

- [ ] **Step 8: 문제 풀이 상세/제출 화면 작성**

`frontend/src/pages/solve/ProblemSolvePage.jsx`:
```javascript
import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { toast } from "react-toastify";
import { getSolveProblem, submitAttempt } from "@/api/solve.js";
import { resolveErrorMessage } from "@/api/client.js";
import { parseBlankContent } from "@/utils/blankContent.js";

export default function ProblemSolvePage() {
  const { id } = useParams();
  const [problem, setProblem] = useState(null);
  const [selectedChoiceIds, setSelectedChoiceIds] = useState([]);
  const [submittedText, setSubmittedText] = useState("");
  const [blankInputs, setBlankInputs] = useState({});
  const [result, setResult] = useState(null);

  useEffect(() => {
    setResult(null);
    setSelectedChoiceIds([]);
    setSubmittedText("");
    setBlankInputs({});
    getSolveProblem(id).then(setProblem).catch((error) => {
      toast.error(resolveErrorMessage(error, "문제를 불러오지 못했습니다."));
    });
  }, [id]);

  if (!problem) {
    return <div className="p-6">불러오는 중...</div>;
  }

  function toggleChoice(choiceId) {
    if (problem.type === "MCQ_MULTI") {
      setSelectedChoiceIds((prev) =>
        prev.includes(choiceId) ? prev.filter((c) => c !== choiceId) : [...prev, choiceId]
      );
    } else {
      setSelectedChoiceIds([choiceId]);
    }
  }

  async function handleSubmit() {
    try {
      let payload = {};
      if (problem.type === "SHORT_ANSWER") {
        payload = { submittedText };
      } else if (problem.type === "FILL_BLANK") {
        payload = {
          blankAnswers: problem.blanksToAnswer.map((key) => ({ blankKey: key, submittedAnswer: blankInputs[key] ?? "" })),
        };
      } else {
        payload = { selectedChoiceIds };
      }
      const attemptResult = await submitAttempt(id, payload);
      setResult(attemptResult);
    } catch (error) {
      toast.error(resolveErrorMessage(error, "제출에 실패했습니다."));
    }
  }

  return (
    <div className="max-w-2xl space-y-4 p-6">
      {problem.imageUrl && <img src={problem.imageUrl} alt="문제 이미지" className="max-h-60" />}
      {problem.referenceText && <p className="rounded bg-gray-50 p-3 text-sm">{problem.referenceText}</p>}

      {problem.type === "FILL_BLANK" ? (
        <p className="text-base leading-relaxed">
          {parseBlankContent(problem.content, problem.blanksToAnswer, Object.fromEntries(
            problem.revealedBlanks.map((b) => [b.blankKey, b.answerText])
          )).map((segment, index) => {
            if (segment.type === "text") return <span key={index}>{segment.value}</span>;
            if (segment.type === "reveal") return <strong key={index}>{segment.value}</strong>;
            return (
              <input
                key={index}
                className="mx-1 w-24 border-b px-1"
                value={blankInputs[segment.blankKey] ?? ""}
                onChange={(event) => setBlankInputs({ ...blankInputs, [segment.blankKey]: event.target.value })}
              />
            );
          })}
        </p>
      ) : (
        <p className="text-base">{problem.content}</p>
      )}

      {(problem.type === "MCQ_SINGLE" || problem.type === "MCQ_MULTI" || problem.type === "OX") && (
        <ul className="space-y-2">
          {problem.choices.map((choice) => (
            <li key={choice.id}>
              <label className="flex items-center gap-2">
                <input
                  type={problem.type === "MCQ_MULTI" ? "checkbox" : "radio"}
                  name="choice"
                  checked={selectedChoiceIds.includes(choice.id)}
                  onChange={() => toggleChoice(choice.id)}
                />
                {choice.text}
              </label>
            </li>
          ))}
        </ul>
      )}

      {problem.type === "SHORT_ANSWER" && (
        <input
          className="w-full rounded border px-3 py-2"
          value={submittedText}
          onChange={(event) => setSubmittedText(event.target.value)}
        />
      )}

      <button onClick={handleSubmit} className="rounded bg-blue-600 px-4 py-2 text-white">
        제출
      </button>

      {result && (
        <div className={`rounded border p-4 ${result.correct ? "bg-green-50" : "bg-red-50"}`}>
          <p className="font-semibold">{result.correct ? "정답입니다!" : "오답입니다."}</p>
          {result.explanation && <p className="mt-2 text-sm">{result.explanation}</p>}
          {result.blankResults && (
            <ul className="mt-2 text-sm">
              {result.blankResults.map((b) => (
                <li key={b.blankKey}>
                  {b.blankKey}: {b.submittedAnswer} ({b.correct ? "정답" : `오답, 정답은 ${b.correctAnswer}`})
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 9: 라우터에 연결**

`routes.jsx`의 `/solve` 라우트를 아래 구조로 교체:
```javascript
      {
        path: "/solve",
        children: [
          { index: true, element: <SolveHomePage /> },
          { path: "problems", element: <ProblemListPage /> },
          { path: ":id", element: <ProblemSolvePage /> },
        ],
      },
```
상단 import 추가:
```javascript
import ProblemListPage from "@/pages/solve/ProblemListPage.jsx";
import ProblemSolvePage from "@/pages/solve/ProblemSolvePage.jsx";
```

- [ ] **Step 10: Commit**

```bash
git add frontend/src/utils/blankContent.js frontend/src/utils/blankContent.test.js frontend/src/api/solve.js frontend/src/pages/solve/SolveHomePage.jsx frontend/src/pages/solve/ProblemListPage.jsx frontend/src/pages/solve/ProblemSolvePage.jsx frontend/src/routers/routes.jsx
git commit -m "feat: add problem solving list/detail/submit screens"
```

---

### Task 5: 본인 풀이 이력 화면

**Files:**
- Create: `frontend/src/pages/solve/AttemptHistoryPage.jsx`
- Modify: `frontend/src/routers/routes.jsx`

**Interfaces:**
- Consumes: `myAttemptHistory`(Task 4)
- Produces: `/solve/history` 화면.

- [ ] **Step 1: 이력 화면 작성**

`frontend/src/pages/solve/AttemptHistoryPage.jsx`:
```javascript
import { useEffect, useState } from "react";
import { toast } from "react-toastify";
import { myAttemptHistory } from "@/api/solve.js";
import { resolveErrorMessage } from "@/api/client.js";

export default function AttemptHistoryPage() {
  const [history, setHistory] = useState([]);

  useEffect(() => {
    myAttemptHistory()
      .then(setHistory)
      .catch((error) => toast.error(resolveErrorMessage(error, "이력을 불러오지 못했습니다.")));
  }, []);

  return (
    <div className="space-y-4 p-6">
      <h1 className="text-lg font-semibold">내 풀이 이력</h1>
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b">
            <th className="py-2">문제</th>
            <th className="py-2">제출 답안</th>
            <th className="py-2">결과</th>
            <th className="py-2">일시</th>
          </tr>
        </thead>
        <tbody>
          {history.map((item, index) => (
            <tr key={index} className="border-b">
              <td className="max-w-xs truncate py-2">{item.problemContent}</td>
              <td className="py-2">{item.submittedAnswer}</td>
              <td className="py-2">{item.correct ? "정답" : "오답"}</td>
              <td className="py-2">{new Date(item.submittedAt).toLocaleString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 2: 라우터에 연결**

`routes.jsx`의 `/solve` children에 추가:
```javascript
          { path: "history", element: <AttemptHistoryPage /> },
```
상단 import 추가:
```javascript
import AttemptHistoryPage from "@/pages/solve/AttemptHistoryPage.jsx";
```

- [ ] **Step 3: 수동 확인**

Run: 직원 계정으로 로그인 → 문제 풀이 → 결과 확인 → `/solve/history`에서 방금 푼 이력 확인

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/solve/AttemptHistoryPage.jsx frontend/src/routers/routes.jsx
git commit -m "feat: add personal attempt history screen"
```

---

## Self-Review 결과

- **Spec 커버리지:** PRD 6.1(자유 연습 모드) → Task 1(응시기간/제한시간 없음, 반복 풀이 가능한 구조); 6.2(화면 흐름) → Task 4; 6.3(채점 로직 5개 유형) → Task 2; 6.4(본인 이력) → Task 3, 5; 4.1.1(빈칸 무작위 노출) → Task 1.
- **플레이스홀더 스캔:** 없음. Task 3의 "주의" 문구는 라우팅 충돌을 피하기 위해 별도 컨트롤러로 분리하라는 구체적 지시이며 실제 코드로 반영되어 있다.
- **타입 일관성:** `AttemptSubmitRequest`/`AttemptResult`/`BlankAnswerInput`/`BlankAnswerResult`(Task 2)가 프론트 `ProblemSolvePage.jsx`(Task 4)의 payload/응답 처리와 필드명 일치. `parseBlankContent`의 시그니처(`content, blanksToAnswer, revealedAnswers`)가 Task 4 테스트와 실제 사용처(`ProblemSolvePage.jsx`)에서 동일하게 사용됨.
- **추가 결정 반영:** 풀이 목록의 `tag` 필터와 태그 선택 UI가 Plan 3의 태그 API를 재사용하고, 빈칸 제출은 중복·미정의 키를 저장 전에 차단하며 무작위 노출 조합을 세션에 저장하지 않는다.

## 다음 Plan

- Plan 5: 통계 (이 Plan에서 쌓이는 `attempts`/`attempt_blank_answers` 데이터를 문제별 정답률로 집계)
