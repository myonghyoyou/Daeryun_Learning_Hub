# 랜덤 풀이와 풀이 화면 개선 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 직원이 문제 수와 부서를 정해 무작위로 뽑은 문제 세트를 연달아 풀고 결과 요약을 볼 수 있게 하며, 함께 지적된 태그 선택지·입력칸·Select 화살표 문제를 고친다.

**Architecture:** 무작위 추출은 서버가 한다(`ORDER BY random() LIMIT n`). 뽑힌 문제 ID 목록과 진행 상태는 브라우저 sessionStorage에 두고, 그 상태를 다루는 로직은 alias 없는 순수 함수로 분리해 `node --test`로 검증한다. 기존 단건 풀이 화면(`/solve/:id`)에서 문제 렌더·제출 UI를 표현 컴포넌트로 추출해 세트 진행 화면이 재사용한다 — 풀이 UI가 두 벌이 되는 것을 막는다.

**Tech Stack:** Java 8 / Spring Boot 2.7.3 / MyBatis / PostgreSQL, React 19 / Vite / Tailwind 4 / react-router-dom 7

**근거 문서:** `docs/qa/2026-08-12-plan4-feedback-analysis.md` (피드백 분석 + 확정된 결정 D1~D10)

## Global Constraints

- **현재 기준선: 백엔드 224 통과 / 프론트엔드 226 통과, 프로덕션 빌드 성공.** 하나도 깨뜨리지 않는다.
- **프론트엔드에 jsdom이 없다.** 컴포넌트 단위 테스트를 쓸 수 없다. 순수 로직은 alias 없는 `frontend/src/utils/*.js`에 두고 `.test.js`(`node --test`)로 검증한다. **`@/` alias를 쓴 파일은 `node --test`가 로드하지 못한다** — utils의 import는 상대 경로. `.jsx`에서는 `@/` alias를 쓴다.
- **백엔드 테스트 규율:** `SuperAdminBootstrapRunner`가 `@Profile("!test")`다. 새 `@SpringBootTest`를 만든다면 **반드시 `@ActiveProfiles("test")`**를 붙인다. 빠뜨리면 테스트가 개발 DB에 실 데이터를 쓴다. 서비스 단위 테스트는 `SolveServiceImplTest`처럼 순수 Mockito로 쓰는 것이 이 저장소의 방식이다.
- **응답 규약:** HTTP 상태가 아니라 `ResponseDto`의 숫자 `resultCode`로 결과를 전달한다. 검증 실패는 `BizException(ErrorCode.INPUT_VALUE_INVALID)`를 던진다 — 새 예외 타입이나 핸들러를 만들지 않는다.
- **전사 공통 원칙 유지(D1):** 부서는 접근 제한이 아니라 사용자가 고르는 필터다. 부서를 지정하지 않으면 전 부서 문제가 대상이다. **어떤 경로에서도 "자기 부서 문제만" 강제하지 않는다.**
- **관리자 화면은 건드리지 않는다(D9).** 단 하나의 예외가 `Select.jsx`인데, 이건 공용 컴포넌트라 관리자 화면 외관이 함께 바뀐다(D10). 그 외 관리자 전용 파일은 수정 금지.
- 빈칸 마커 문자 집합은 **`[A-Za-z0-9_-]`** 로 서버 `ProblemServiceImpl.BLANK_MARKER_PATTERN`·지정 모드 `blankSegments.js`·풀이 렌더 `blankContent.js` 세 곳이 이미 일치한다. 이 계획은 그 규칙을 건드리지 않는다.
- 커밋 메시지는 영문 Conventional Commits.

---

## File Structure

### 백엔드 — 신규

| 파일 | 책임 |
|---|---|
| `controller/DepartmentOptionController.java` | 로그인 사용자용 활성 부서 목록 (`GET /api/departments`) |
| `dto/department/DepartmentOption.java` | 부서 선택지 응답 (`id`, `name`, `code`만) |
| `service/DepartmentOptionService.java` / `Impl` | 활성 부서 조회 |

### 백엔드 — 수정

| 파일 | 변경 |
|---|---|
| `controller/SolveController.java` | `GET /api/problems/random` 추가 |
| `controller/TagController.java` | `GET /api/tags/in-use` 추가 |
| `service/SolveService.java` / `SolveServiceImpl.java` | `randomSet(count, departmentId)` |
| `service/TagService.java` / `TagServiceImpl.java` | `listInUse()` |
| `dao/ProblemDao.java` | `findRandomActive(...)` |
| `dao/TagDao.java` | `findInUse()` |
| `dao/DepartmentDao.java` | `findAllActive()` |
| `mappers/probank/ProblemMapper.xml` | 무작위 추출 쿼리 |
| `mappers/probank/TagMapper.xml` | 활성 문제에 붙은 태그 쿼리 |
| `mappers/probank/DepartmentMapper.xml` | 활성 부서 쿼리 |

### 프론트엔드 — 신규

| 파일 | 책임 |
|---|---|
| `utils/solveSession.js` | 세트 진행 상태 순수 함수 (**alias 금지**) |
| `utils/solveSession.test.js` | 위 테스트 |
| `components/solve/ProblemSolveCard.jsx` | 문제 렌더 + 답 입력 + 제출 (표현 전용) |
| `pages/solve/RandomSetupPage.jsx` | 문제 수·부서 선택 |
| `pages/solve/RandomPlayPage.jsx` | 세트 진행 |
| `pages/solve/RandomResultPage.jsx` | 결과 요약 |
| `api/departments.js` | 부서 선택지 조회 |

### 프론트엔드 — 수정

| 파일 | 변경 |
|---|---|
| `components/ui/Select.jsx` | 커스텀 화살표 (D10, **공용 — 관리자 화면 함께 바뀜**) |
| `pages/solve/ProblemSolvePage.jsx` | `ProblemSolveCard` 사용하도록 축소 |
| `pages/solve/SolveHomePage.jsx` | 3갈래 카드 (D7) |
| `pages/solve/SolveProblemListPage.jsx` | 활성 태그 API 사용 |
| `api/solve.js` | 무작위 세트 호출 |
| `api/problems.js` | 활성 태그 호출 |
| `routers/routes.jsx` | 랜덤 3개 라우트 |

---

## Task 1: 스타일 2건 — 빈칸 입력칸 중앙 정렬과 Select 화살표

**Files:**
- Modify: `frontend/src/pages/solve/ProblemSolvePage.jsx`
- Modify: `frontend/src/components/ui/Select.jsx`

**Interfaces:**
- Consumes: 없음
- Produces: 없음 (외관만)

**배경:** 빈칸 입력칸에 정렬 지정이 없어 글자가 왼쪽에 붙는다. `Select`는 브라우저 기본 화살표를 쓰는데 `px-3` 패딩이 글자에만 걸려 화살표가 테두리에 딱 붙고, 모양도 브라우저마다 다르다.

> ⚠️ `Select.jsx`는 공용 컴포넌트다. 관리자 화면의 부서·계정·문제 필터와 유형 선택이 **전부 함께 바뀐다.** jsdom이 없어 자동 검증이 안 되므로 Task 9에서 육안 확인한다.

- [ ] **Step 1: 빈칸 입력칸을 가운데 정렬한다**

`ProblemSolvePage.jsx`에서 빈칸 `<input>`의 className에 `text-center`를 넣는다. 현재 값은 다음과 같다.

```
mx-1 inline-block w-28 rounded-sm border-0 border-b-2 border-brand-blue bg-surface-blue px-1 py-0.5 text-body text-ink-strong focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-brand-aqua disabled:opacity-60
```

`px-1` 뒤에 `text-center`를 추가한다.

**폭 `w-28`은 그대로 둔다.** 정답 길이에 맞춰 폭을 조절하면 글자 수가 노출돼 힌트가 된다.

- [ ] **Step 2: Select의 기본 화살표를 끄고 직접 배치한다**

`Select.jsx`의 `<select>`를 감싸는 relative 컨테이너를 두고, 기본 화살표를 없앤 뒤 아이콘을 오른쪽에 배치한다.

```jsx
import { CaretDown } from "@phosphor-icons/react";
```

`<select>`를 아래 구조로 바꾼다. `appearance-none`으로 브라우저 기본 화살표를 끄고, 화살표 자리를 `pr-9`로 확보한 뒤 아이콘을 `right-3`에 둔다.

```jsx
      <div className="relative">
        <select
          id={id}
          aria-invalid={Boolean(error)}
          aria-describedby={errorId}
          className={`h-[38px] w-full appearance-none rounded-sm border bg-surface-default pl-3 pr-9 text-body text-ink-strong focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-brand-aqua disabled:cursor-not-allowed disabled:opacity-60 ${
            error ? "border-danger-text" : "border-line-default"
          } ${selectClassName}`}
          {...props}
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        {/* 기본 화살표를 끄고 직접 그린다: 브라우저마다 위치·모양이 달랐고 테두리에 딱 붙었다.
            pointer-events-none 이라야 아이콘을 눌러도 select 가 열린다. */}
        <CaretDown
          size={14}
          aria-hidden="true"
          className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-ink-muted"
        />
      </div>
```

기존 `px-3`은 `pl-3 pr-9`로 나뉜다. 디자인 시스템 §7.5의 좌측 패딩 12px 규정은 `pl-3`으로 유지된다.

- [ ] **Step 3: 빌드와 기존 테스트를 확인한다**

Run: `cd frontend && npm test`
Expected: 226 통과(스타일 변경이라 신규 테스트 없음).

Run: `cd frontend && npm run build`
Expected: 성공.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/solve/ProblemSolvePage.jsx frontend/src/components/ui/Select.jsx
git commit -m "fix: center blank inputs and give Select a controlled caret"
```

---

## Task 2: 활성 문제에 실제로 쓰이는 태그만 내려주는 API

**Files:**
- Modify: `backend/src/main/java/com/daeryun/probank/dao/TagDao.java`
- Modify: `backend/src/main/resources/mappers/probank/TagMapper.xml`
- Modify: `backend/src/main/java/com/daeryun/probank/service/TagService.java`, `TagServiceImpl.java`
- Modify: `backend/src/main/java/com/daeryun/probank/controller/TagController.java`
- Test: `backend/src/test/java/com/daeryun/probank/service/TagServiceImplTest.java` (없으면 신규)

**Interfaces:**
- Produces: `GET /api/tags/in-use` → `Tag[]` (활성 문제에 하나 이상 붙어 있는 태그만)

**배경:** 풀이 화면의 태그 드롭다운이 `GET /api/tags`로 **지금까지 만들어진 모든 태그**를 가져온다. 반면 문제 목록은 활성 문제만 보여준다. 그래서 활성 문제가 0건인 태그(현재 `과학`·`기초`)를 고르면 **반드시** "조건에 맞는 문제가 없습니다"가 뜬다. 고를 수는 있는데 결과가 절대 안 나오는 선택지다.

**기존 `GET /api/tags`는 그대로 둔다(D9).** 관리자 화면은 보관 문제도 다루므로 전체 태그가 맞다.

- [ ] **Step 1: 실패하는 테스트를 먼저 쓴다**

`TagServiceImplTest.java`가 없으면 만든다. `SolveServiceImplTest`와 같은 순수 Mockito 방식이다 — **`@SpringBootTest`를 쓰지 않는다.**

```java
package com.daeryun.probank.service;

import com.daeryun.probank.dao.TagDao;
import com.daeryun.probank.domain.Tag;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;

import java.util.Arrays;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;

class TagServiceImplTest {

    @Test
    void listInUse_returnsOnlyWhatTheDaoReports() {
        TagDao tagDao = Mockito.mock(TagDao.class);
        Tag geography = new Tag();
        geography.setName("지리");
        Mockito.when(tagDao.findInUse()).thenReturn(Arrays.asList(geography));

        List<Tag> result = new TagServiceImpl(tagDao).listInUse();

        assertEquals(1, result.size());
        assertEquals("지리", result.get(0).getName());
        Mockito.verify(tagDao).findInUse();
        Mockito.verify(tagDao, Mockito.never()).findAll();
    }
}
```

마지막 `never()` 검증이 핵심이다 — 전체 태그를 가져다 걸러내는 것이 아니라 **DB에서 좁혀 온다**는 것을 고정한다.

- [ ] **Step 2: 테스트가 실패하는지 확인한다**

Run: `cd backend && ./gradlew test --tests '*TagServiceImplTest'`
Expected: FAIL (컴파일 오류 — `findInUse`·`listInUse` 없음)

- [ ] **Step 3: DAO에 조회 메서드를 추가한다**

`TagDao.java`의 `findAll()` 아래에 넣는다.

```java
    /** 활성(ACTIVE) 문제에 하나 이상 붙어 있는 태그만. 직원 풀이 화면의 필터 선택지용이다. */
    List<Tag> findInUse();
```

- [ ] **Step 4: 매퍼에 쿼리를 추가한다**

`TagMapper.xml`의 `findAll` 아래에 넣는다.

```xml
    <!-- 관리자 화면은 보관 문제도 다루므로 findAll(전체)을 계속 쓴다. 이 쿼리는 직원 풀이
         화면 전용으로, 고르면 반드시 0건이 나오는 선택지가 생기지 않도록 활성 문제 기준으로
         좁힌다. 문제를 보관 처리하면 그 태그가 자동으로 선택지에서 빠진다. -->
    <select id="findInUse" resultType="Tag">
        SELECT DISTINCT t.id, t.name, t.created_at
        FROM tags t
        JOIN problem_tags pt ON pt.tag_id = t.id
        JOIN problems p ON p.id = pt.problem_id
        WHERE p.status = 'ACTIVE'
        ORDER BY t.name
    </select>
```

- [ ] **Step 5: 서비스에 메서드를 추가한다**

`TagService.java`:

```java
    List<Tag> listInUse();
```

`TagServiceImpl.java`:

```java
    @Override
    public List<Tag> listInUse() {
        return tagDao.findInUse();
    }
```

- [ ] **Step 6: 컨트롤러에 엔드포인트를 추가한다**

`TagController.java`의 `list()` 아래에 넣는다.

```java
    /** 활성 문제에 실제로 붙어 있는 태그만. 직원 풀이 화면의 필터 선택지에서 쓴다. */
    @GetMapping("/in-use")
    public ResponseEntity<ResponseDto<?>> listInUse() {
        return ResponseEntity.ok(ResponseDto.ok(tagService.listInUse()));
    }
```

- [ ] **Step 7: 테스트 통과를 확인한다**

Run: `cd backend && ./gradlew test`
Expected: 224 + 1 통과.

- [ ] **Step 8: 풀이 화면이 새 API를 쓰게 한다**

`frontend/src/api/problems.js`의 `listTags` 아래에 추가한다.

```javascript
/** 활성 문제에 실제로 붙어 있는 태그만. 직원 풀이 화면 필터용(관리자 화면은 listTags 유지). */
export function listTagsInUse() {
  return apiGet("/api/tags/in-use");
}
```

`SolveProblemListPage.jsx`의 import와 호출을 바꾼다.

```javascript
import { listTagsInUse } from "@/api/problems.js";
```

```javascript
    listTagsInUse()
      .then((rows) => setTags(rows.map((item) => (item.name ?? item))))
      .catch(() => setTags([]));
```

- [ ] **Step 9: 프론트 테스트와 빌드를 확인한다**

Run: `cd frontend && npm test`
Expected: 226 통과.

Run: `cd frontend && npm run build`
Expected: 성공.

- [ ] **Step 10: Commit**

```bash
git add backend/src/main/java/com/daeryun/probank/dao/TagDao.java backend/src/main/resources/mappers/probank/TagMapper.xml backend/src/main/java/com/daeryun/probank/service/TagService.java backend/src/main/java/com/daeryun/probank/service/TagServiceImpl.java backend/src/main/java/com/daeryun/probank/controller/TagController.java backend/src/test/java/com/daeryun/probank/service/TagServiceImplTest.java frontend/src/api/problems.js frontend/src/pages/solve/SolveProblemListPage.jsx
git commit -m "fix: offer only tags attached to active problems in the solve filter"
```

> **데이터 정리는 코드가 아니다.** QA 잔여 태그(`태그`, `수정태그`)는 Task 9에서 화면으로 처리한다.

---

## Task 3: 직원용 부서 선택지 API

**Files:**
- Create: `backend/src/main/java/com/daeryun/probank/dto/department/DepartmentOption.java`
- Create: `backend/src/main/java/com/daeryun/probank/service/DepartmentOptionService.java`
- Create: `backend/src/main/java/com/daeryun/probank/service/DepartmentOptionServiceImpl.java`
- Create: `backend/src/main/java/com/daeryun/probank/controller/DepartmentOptionController.java`
- Create: `backend/src/test/java/com/daeryun/probank/service/DepartmentOptionServiceImplTest.java`
- Modify: `backend/src/main/java/com/daeryun/probank/dao/DepartmentDao.java`
- Modify: `backend/src/main/resources/mappers/probank/DepartmentMapper.xml`

**Interfaces:**
- Produces: `GET /api/departments` → `DepartmentOption[]` (`id`, `name`, `code`)

**배경:** 랜덤 풀이 설정 화면에 부서 드롭다운이 필요한데, 부서 목록을 주는 유일한 API가 `/api/admin/departments`이고 **`@RequireRole(SUPER_ADMIN)`**이다. 부서관리자조차 403이고 직원은 당연히 안 된다. 그래서 **부서 필터는 이 API 없이는 화면 자체를 만들 수 없다.**

`/api/tags`가 이미 "로그인만 하면 누구나 조회"라는 선례를 만들어 뒀다(해당 컨트롤러 주석에 근거가 적혀 있다). 같은 패턴을 따른다.

**응답에 `status`·`created_at`을 넣지 않는다.** 직원에게 필요한 것은 선택지뿐이고, 비활성 부서는 애초에 내려가지 않는다.

- [ ] **Step 1: 실패하는 테스트를 먼저 쓴다**

`DepartmentOptionServiceImplTest.java`:

```java
package com.daeryun.probank.service;

import com.daeryun.probank.dao.DepartmentDao;
import com.daeryun.probank.domain.Department;
import com.daeryun.probank.dto.department.DepartmentOption;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;

import java.util.Arrays;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;

class DepartmentOptionServiceImplTest {

    @Test
    void list_mapsOnlyIdNameCode() {
        DepartmentDao departmentDao = Mockito.mock(DepartmentDao.class);
        Department dev = new Department();
        dev.setId(862L);
        dev.setName("개발팀");
        dev.setCode("DEV");
        Mockito.when(departmentDao.findAllActive()).thenReturn(Arrays.asList(dev));

        List<DepartmentOption> result = new DepartmentOptionServiceImpl(departmentDao).list();

        assertEquals(1, result.size());
        assertEquals(862L, result.get(0).getId());
        assertEquals("개발팀", result.get(0).getName());
        assertEquals("DEV", result.get(0).getCode());
        Mockito.verify(departmentDao).findAllActive();
        Mockito.verify(departmentDao, Mockito.never()).findAll();
    }
}
```

`never()` 검증이 **비활성 부서가 선택지에 새어 나오지 않음**을 고정한다.

- [ ] **Step 2: 테스트가 실패하는지 확인한다**

Run: `cd backend && ./gradlew test --tests '*DepartmentOptionServiceImplTest'`
Expected: FAIL (컴파일 오류)

- [ ] **Step 3: DTO를 만든다**

`dto/department/DepartmentOption.java`:

```java
package com.daeryun.probank.dto.department;

import lombok.AllArgsConstructor;
import lombok.Data;

/** 직원 화면의 부서 선택지. 상태·생성일 같은 내부 값은 담지 않는다. */
@Data
@AllArgsConstructor
public class DepartmentOption {
    private Long id;
    private String name;
    private String code;
}
```

- [ ] **Step 4: DAO와 매퍼에 활성 부서 조회를 추가한다**

`DepartmentDao.java`의 `findAll()` 아래:

```java
    /** 활성 부서만. 직원 화면 선택지용이다 — 비활성 부서는 고를 수 없어야 한다. */
    List<Department> findAllActive();
```

`DepartmentMapper.xml`의 `findAll` 아래:

```xml
    <select id="findAllActive" resultType="Department">
        SELECT id, name, code, status, created_at FROM departments WHERE status = 'ACTIVE' ORDER BY name
    </select>
```

- [ ] **Step 5: 서비스를 만든다**

`service/DepartmentOptionService.java`:

```java
package com.daeryun.probank.service;

import com.daeryun.probank.dto.department.DepartmentOption;

import java.util.List;

public interface DepartmentOptionService {
    List<DepartmentOption> list();
}
```

`service/DepartmentOptionServiceImpl.java`:

```java
package com.daeryun.probank.service;

import com.daeryun.probank.dao.DepartmentDao;
import com.daeryun.probank.dto.department.DepartmentOption;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.stream.Collectors;

@Service
public class DepartmentOptionServiceImpl implements DepartmentOptionService {

    private final DepartmentDao departmentDao;

    public DepartmentOptionServiceImpl(DepartmentDao departmentDao) {
        this.departmentDao = departmentDao;
    }

    @Override
    public List<DepartmentOption> list() {
        return departmentDao.findAllActive().stream()
                .map(d -> new DepartmentOption(d.getId(), d.getName(), d.getCode()))
                .collect(Collectors.toList());
    }
}
```

- [ ] **Step 6: 컨트롤러를 만든다**

`controller/DepartmentOptionController.java`:

```java
package com.daeryun.probank.controller;

import com.daeryun.probank.common.ResponseDto;
import com.daeryun.probank.service.DepartmentOptionService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 로그인한 사용자라면 누구나 부서 선택지를 조회할 수 있다 — 랜덤 풀이에서 부서를 고르려면
 * 직원도 목록이 필요한데, 관리자용 /api/admin/departments 는 SUPER_ADMIN 전용이다.
 * TagController 와 같은 방침이며, 인증은 Plan 1의 세션 필터가 담당한다.
 *
 * 부서는 접근 제한이 아니라 사용자가 고르는 필터다(피드백 분석 D1) — 이 목록으로 남의 부서
 * 문제를 막는 것이 아니라, 원하는 부서 문제만 골라 풀 수 있게 한다.
 */
@RestController
@RequestMapping("/api/departments")
public class DepartmentOptionController {

    private final DepartmentOptionService departmentOptionService;

    public DepartmentOptionController(DepartmentOptionService departmentOptionService) {
        this.departmentOptionService = departmentOptionService;
    }

    @GetMapping
    public ResponseEntity<ResponseDto<?>> list() {
        return ResponseEntity.ok(ResponseDto.ok(departmentOptionService.list()));
    }
}
```

- [ ] **Step 7: 테스트 통과를 확인한다**

Run: `cd backend && ./gradlew test`
Expected: 225 + 1 통과.

- [ ] **Step 8: Commit**

```bash
git add backend/src/main/java/com/daeryun/probank/dto/department/DepartmentOption.java backend/src/main/java/com/daeryun/probank/service/DepartmentOptionService.java backend/src/main/java/com/daeryun/probank/service/DepartmentOptionServiceImpl.java backend/src/main/java/com/daeryun/probank/controller/DepartmentOptionController.java backend/src/test/java/com/daeryun/probank/service/DepartmentOptionServiceImplTest.java backend/src/main/java/com/daeryun/probank/dao/DepartmentDao.java backend/src/main/resources/mappers/probank/DepartmentMapper.xml
git commit -m "feat: expose active departments to logged-in users for filtering"
```

---

## Task 4: 무작위 문제 세트 추출 API

**Files:**
- Modify: `backend/src/main/java/com/daeryun/probank/dao/ProblemDao.java`
- Modify: `backend/src/main/resources/mappers/probank/ProblemMapper.xml`
- Modify: `backend/src/main/java/com/daeryun/probank/service/SolveService.java`, `SolveServiceImpl.java`
- Modify: `backend/src/main/java/com/daeryun/probank/controller/SolveController.java`
- Test: `backend/src/test/java/com/daeryun/probank/service/SolveServiceImplTest.java`

**Interfaces:**
- Consumes: 없음
- Produces: `GET /api/problems/random?count={n}&departmentId={id}` → `ProblemSolveListItem[]`
  - `count` 필수, 1~50
  - `departmentId` 선택. 없으면 전 부서 대상
  - 조건에 맞는 문제가 `count`보다 적으면 **있는 만큼만** 반환한다(오류 아님)

**배경:** 무작위 추출을 서버에서 한다(D3). 화면에서 목록 전부를 받아 섞는 방식은 지금(활성 10건)은 되지만 문제 은행이 커지거나 목록에 페이지네이션이 붙는 순간 깨진다. 빈칸 노출 키를 서버가 `SecureRandom`으로 뽑는 선례(`selectRandomBlankKeys`)도 이미 있다.

**이미 푼 문제도 다시 뽑힌다(D6).** `attempts`와 조인하지 않는다 — 반복 학습이 목적이고, 현재 구조가 같은 문제 재제출을 이미 허용한다.

- [ ] **Step 1: 실패하는 테스트를 먼저 쓴다**

`SolveServiceImplTest.java`에 추가한다. 기존 `setUp()`의 mock들을 그대로 쓴다.

```java
    @Test
    void randomSet_rejectsCountBelowOne() {
        assertThrows(BizException.class, () -> service.randomSet(0, null));
    }

    @Test
    void randomSet_rejectsCountAboveLimit() {
        assertThrows(BizException.class, () -> service.randomSet(51, null));
    }

    @Test
    void randomSet_passesCountAndDepartmentToDao() {
        Mockito.when(problemDao.findRandomActive(10, 862L)).thenReturn(Collections.emptyList());

        service.randomSet(10, 862L);

        Mockito.verify(problemDao).findRandomActive(10, 862L);
    }

    @Test
    void randomSet_allowsFewerResultsThanRequested() {
        com.daeryun.probank.dto.solve.ProblemSolveListItem only =
                new com.daeryun.probank.dto.solve.ProblemSolveListItem();
        only.setId(1L);
        Mockito.when(problemDao.findRandomActive(10, null)).thenReturn(Arrays.asList(only));

        assertEquals(1, service.randomSet(10, null).size());
    }
```

마지막 테스트가 **문제가 모자라도 오류가 아님**을 고정한다.

- [ ] **Step 2: 테스트가 실패하는지 확인한다**

Run: `cd backend && ./gradlew test --tests '*SolveServiceImplTest'`
Expected: FAIL (컴파일 오류 — `randomSet`·`findRandomActive` 없음)

- [ ] **Step 3: DAO에 조회 메서드를 추가한다**

`ProblemDao.java`의 `findAllActive` 아래:

```java
    /**
     * 풀이용 무작위 세트: status = ACTIVE 중 무작위 count 건. departmentId 가 null 이면 전 부서.
     * 이미 푼 문제도 다시 뽑힌다(반복 학습이 목적이라 attempts 와 조인하지 않는다).
     */
    List<com.daeryun.probank.dto.solve.ProblemSolveListItem> findRandomActive(@Param("count") int count,
                                                                               @Param("departmentId") Long departmentId);
```

- [ ] **Step 4: 매퍼에 쿼리를 추가한다**

`ProblemMapper.xml`의 `findAllActive` 아래. `solveProblemListItemMap`을 그대로 재사용한다.

```xml
    <!-- 무작위 추출을 DB에서 한다. 화면에서 전체를 받아 섞으면 문제 은행이 커질수록 전송량이
         비례해 늘고, 목록에 페이지네이션이 붙는 순간 깨진다. -->
    <select id="findRandomActive" resultMap="solveProblemListItemMap">
        SELECT p.id, p.type, p.content,
               COALESCE(array_agg(DISTINCT t.name) FILTER (WHERE t.name IS NOT NULL), '{}') AS tags
        FROM problems p
        LEFT JOIN problem_tags pt ON pt.problem_id = p.id
        LEFT JOIN tags t ON t.id = pt.tag_id
        WHERE p.status = 'ACTIVE'
        <if test="departmentId != null">AND p.department_id = #{departmentId}</if>
        GROUP BY p.id
        ORDER BY random()
        LIMIT #{count}
    </select>
```

- [ ] **Step 5: 서비스에 메서드를 추가한다**

`SolveService.java`:

```java
    List<ProblemSolveListItem> randomSet(int count, Long departmentId);
```

`SolveServiceImpl.java`. 상수를 클래스 상단(`random` 필드 근처)에 둔다.

```java
    private static final int MAX_RANDOM_COUNT = 50;
```

메서드는 `list()` 아래에 넣는다.

```java
    @Override
    public List<ProblemSolveListItem> randomSet(int count, Long departmentId) {
        if (count < 1 || count > MAX_RANDOM_COUNT) {
            throw new BizException(ErrorCode.INPUT_VALUE_INVALID,
                    "문제 수는 1 이상 " + MAX_RANDOM_COUNT + " 이하여야 합니다.");
        }
        // 조건에 맞는 문제가 요청 수보다 적어도 오류가 아니다 — 있는 만큼 풀게 한다.
        return problemDao.findRandomActive(count, departmentId);
    }
```

- [ ] **Step 6: 컨트롤러에 엔드포인트를 추가한다**

`SolveController.java`. **`/{id}` 매핑보다 위에 둔다** — 아래에 두면 `random`이 `{id}`로 잡혀 숫자 변환 오류가 난다.

```java
    @GetMapping("/random")
    public ResponseEntity<ResponseDto<?>> randomSet(@RequestParam int count,
                                                     @RequestParam(required = false) Long departmentId) {
        return ResponseEntity.ok(ResponseDto.ok(solveService.randomSet(count, departmentId)));
    }
```

- [ ] **Step 7: 테스트 통과를 확인한다**

Run: `cd backend && ./gradlew test`
Expected: 226 + 4 통과.

- [ ] **Step 8: Commit**

```bash
git add backend/src/main/java/com/daeryun/probank/dao/ProblemDao.java backend/src/main/resources/mappers/probank/ProblemMapper.xml backend/src/main/java/com/daeryun/probank/service/SolveService.java backend/src/main/java/com/daeryun/probank/service/SolveServiceImpl.java backend/src/main/java/com/daeryun/probank/controller/SolveController.java backend/src/test/java/com/daeryun/probank/service/SolveServiceImplTest.java
git commit -m "feat: add random problem set endpoint with department filter"
```

---

## Task 5: 세트 진행 상태 순수 함수

**Files:**
- Create: `frontend/src/utils/solveSession.js`
- Create: `frontend/src/utils/solveSession.test.js`

**Interfaces:**
- Produces:
  - `createSession(problemIds)` → `{problemIds, index, results}`
  - `currentProblemId(session)` → `number | null`
  - `recordResult(session, correct)` → 새 session (index +1, results 추가)
  - `isFinished(session)` → `boolean`
  - `summarize(session)` → `{total, correctCount}`
  - `SESSION_STORAGE_KEY` (문자열 상수)

**배경:** 뽑은 세트를 sessionStorage에 둔다(D4). **저장소 접근은 화면이 하고, 이 파일은 상태 계산만 한다** — 그래야 `node --test`로 검증할 수 있다(jsdom이 없어 sessionStorage 자체는 테스트 불가).

> ⚠️ **`@/` alias를 쓰지 말 것.** `utils/*.js`는 `node --test`가 직접 로드하므로 alias가 있으면 테스트가 아예 안 돈다. 이 파일은 import가 없어야 정상이다.

**모든 함수는 순수하다.** 인자를 변형하지 않고 새 객체를 반환한다.

- [ ] **Step 1: 실패하는 테스트를 먼저 쓴다**

`frontend/src/utils/solveSession.test.js`:

```javascript
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createSession,
  currentProblemId,
  recordResult,
  isFinished,
  summarize,
} from "./solveSession.js";

test("createSession: starts at the first problem with no results", () => {
  const session = createSession([11, 22, 33]);
  assert.deepStrictEqual(session.problemIds, [11, 22, 33]);
  assert.strictEqual(session.index, 0);
  assert.deepStrictEqual(session.results, []);
  assert.strictEqual(currentProblemId(session), 11);
  assert.strictEqual(isFinished(session), false);
});

test("recordResult: advances and does not mutate the input", () => {
  const session = createSession([11, 22]);
  const next = recordResult(session, true);

  assert.strictEqual(next.index, 1);
  assert.deepStrictEqual(next.results, [{ problemId: 11, correct: true }]);
  assert.strictEqual(currentProblemId(next), 22);

  // 원본이 그대로여야 한다
  assert.strictEqual(session.index, 0);
  assert.deepStrictEqual(session.results, []);
});

test("isFinished: true only after the last problem is recorded", () => {
  let session = createSession([11, 22]);
  session = recordResult(session, true);
  assert.strictEqual(isFinished(session), false);
  session = recordResult(session, false);
  assert.strictEqual(isFinished(session), true);
  assert.strictEqual(currentProblemId(session), null);
});

test("summarize: counts correct answers", () => {
  let session = createSession([11, 22, 33]);
  session = recordResult(session, true);
  session = recordResult(session, false);
  session = recordResult(session, true);
  assert.deepStrictEqual(summarize(session), { total: 3, correctCount: 2 });
});

test("createSession: an empty set is finished immediately", () => {
  const session = createSession([]);
  assert.strictEqual(isFinished(session), true);
  assert.strictEqual(currentProblemId(session), null);
  assert.deepStrictEqual(summarize(session), { total: 0, correctCount: 0 });
});
```

마지막 테스트가 중요하다 — 조건에 맞는 문제가 0건이면 서버가 빈 배열을 준다. 그때 화면이 무한 대기에 빠지지 않아야 한다.

- [ ] **Step 2: 테스트가 실패하는지 확인한다**

Run: `cd frontend && node --test src/utils/solveSession.test.js`
Expected: FAIL (모듈 없음)

- [ ] **Step 3: 순수 함수를 구현한다**

`frontend/src/utils/solveSession.js`:

```javascript
/**
 * 랜덤 풀이 세트의 진행 상태를 다루는 순수 함수.
 *
 * 세트는 sessionStorage 에 보관한다(새로고침을 견디되 서버 테이블은 만들지 않는다).
 * 저장소 접근은 화면이 하고 이 파일은 상태 계산만 한다 — 이 프로젝트에는 jsdom 이 없어
 * sessionStorage 를 쓰는 코드는 테스트할 수 없기 때문이다. 여기 있는 함수는 인자를 변형하지
 * 않고 새 객체를 반환한다.
 */
export const SESSION_STORAGE_KEY = "solve-random-session";

export function createSession(problemIds) {
  return { problemIds: [...problemIds], index: 0, results: [] };
}

export function currentProblemId(session) {
  return session.index < session.problemIds.length ? session.problemIds[session.index] : null;
}

export function isFinished(session) {
  return session.index >= session.problemIds.length;
}

export function recordResult(session, correct) {
  const problemId = currentProblemId(session);
  if (problemId === null) {
    return session;
  }
  return {
    problemIds: session.problemIds,
    index: session.index + 1,
    results: [...session.results, { problemId, correct }],
  };
}

export function summarize(session) {
  return {
    total: session.results.length,
    correctCount: session.results.filter((r) => r.correct).length,
  };
}
```

- [ ] **Step 4: 테스트 통과를 확인한다**

Run: `cd frontend && node --test src/utils/solveSession.test.js`
Expected: PASS (5건)

Run: `cd frontend && npm test`
Expected: 226 + 5 = 231 통과.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/utils/solveSession.js frontend/src/utils/solveSession.test.js
git commit -m "feat: add pure helpers for random solve session progress"
```

---

## Task 6: 문제 풀이 UI를 표현 컴포넌트로 추출

**Files:**
- Create: `frontend/src/components/solve/ProblemSolveCard.jsx`
- Modify: `frontend/src/pages/solve/ProblemSolvePage.jsx`

**Interfaces:**
- Consumes: `parseBlankContent` (기존), `submitAttempt` (기존)
- Produces: `<ProblemSolveCard problem={...} onSubmitted={(result) => {}} />`
  - `problem`: `GET /api/problems/{id}` 응답 그대로
  - `onSubmitted`: 채점 결과를 받은 뒤 호출. 세트 진행 화면이 다음 문제로 넘어가는 데 쓴다

**배경:** 세트 진행 화면도 단건 화면과 **똑같은** 문제 렌더·답 입력·제출 UI가 필요하다. 복사하면 두 벌이 되어 한쪽만 고쳐지는 사고가 난다.

> ⚠️ **이 Task는 동작을 바꾸지 않는 리팩터다.** `/solve/:id`의 화면과 동작이 추출 전후로 동일해야 한다. 새 기능을 끼워 넣지 말 것.

- [ ] **Step 1: 현재 동작을 기록해 둔다**

추출 전에 `ProblemSolvePage.jsx`를 처음부터 끝까지 읽고, 아래를 메모한다. 추출 후 대조할 기준이다.

- 유형별 렌더 분기(객관식/OX·주관식·빈칸)
- 제출 payload 구성 방식(유형마다 다르다)
- 제출 후 비활성화 처리
- 오류 시 toast 문구
- 이미지·참조 지문 렌더 위치

- [ ] **Step 2: 표현 컴포넌트를 만든다**

`frontend/src/components/solve/ProblemSolveCard.jsx`를 만들고, `ProblemSolvePage.jsx`에서 **아래 범위를 그대로** 옮긴다.

- 상태: `selectedChoiceIds`, `submittedText`, `blankInputs`, `result`, `submitting`
- 함수: `toggleChoice`, `handleSubmit`
- 렌더: `<Surface>` 안의 이미지·참조 지문·본문·보기·입력칸·제출 버튼·채점 결과

`problem`이 바뀌면 입력 상태가 초기화되어야 한다. 세트에서 다음 문제로 넘어갈 때 **앞 문제의 답이 남으면 안 된다.**

```jsx
  useEffect(() => {
    setSelectedChoiceIds([]);
    setSubmittedText("");
    setBlankInputs({});
    setResult(null);
  }, [problem.id]);
```

제출 성공 뒤 `onSubmitted`를 호출한다. 단건 화면은 이 콜백을 넘기지 않으므로 선택 호출이다.

```jsx
      const submitted = await submitAttempt(problem.id, payload);
      setResult(submitted);
      if (onSubmitted) {
        onSubmitted(submitted);
      }
```

**목록으로 돌아가는 링크와 페이지 제목은 옮기지 않는다.** 그건 페이지의 몫이다.

- [ ] **Step 3: 페이지를 축소한다**

`ProblemSolvePage.jsx`는 이제 다음만 한다: `id`로 문제를 불러오고, 불러오는 중·실패 상태를 그리고, 성공하면 `<ProblemSolveCard problem={problem} />`을 렌더한다. 목록 링크는 그대로 둔다.

- [ ] **Step 4: 빌드와 기존 테스트를 확인한다**

Run: `cd frontend && npm test`
Expected: 231 통과(컴포넌트라 신규 테스트 없음).

Run: `cd frontend && npm run build`
Expected: 성공, 경고 없음.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/solve/ProblemSolveCard.jsx frontend/src/pages/solve/ProblemSolvePage.jsx
git commit -m "refactor: extract the problem solving card for reuse in sets"
```

---

## Task 7: 학습 홈 3갈래와 랜덤 설정 화면

**Files:**
- Create: `frontend/src/api/departments.js`
- Create: `frontend/src/pages/solve/RandomSetupPage.jsx`
- Modify: `frontend/src/api/solve.js`
- Modify: `frontend/src/pages/solve/SolveHomePage.jsx`
- Modify: `frontend/src/routers/routes.jsx`

**Interfaces:**
- Consumes: Task 3 `GET /api/departments`, Task 4 `GET /api/problems/random`, Task 5 `createSession`·`SESSION_STORAGE_KEY`
- Produces: `/solve/random` 라우트. 세션을 sessionStorage에 저장하고 `/solve/random/play`로 이동

**배경(D7):** 지금 홈에는 카드가 둘뿐이고 "문제 풀기"라는 이름이 모든 방식을 대표하는 것처럼 보인다. 랜덤이 추가되면 이름만으로 구분이 안 되므로 셋으로 나눈다.

디자인 시스템 §8.2에 **"추천 문제 세트는 icon/제목/설명/태그/주 행동 순서"** 규격이 이미 있다. 새로 디자인하지 말고 기존 카드 구조를 그대로 따른다.

- [ ] **Step 1: API 호출 함수를 추가한다**

`frontend/src/api/departments.js` (신규):

```javascript
import { apiGet } from "@/api/client.js";

/** 활성 부서 선택지. 랜덤 풀이에서 부서를 고를 때 쓴다. */
export function listDepartmentOptions() {
  return apiGet("/api/departments");
}
```

`frontend/src/api/solve.js`에 추가:

```javascript
export function fetchRandomSet(count, departmentId) {
  const params = new URLSearchParams();
  params.set("count", String(count));
  if (departmentId) params.set("departmentId", String(departmentId));
  return apiGet(`/api/problems/random?${params.toString()}`);
}
```

- [ ] **Step 2: 학습 홈을 3갈래로 바꾼다**

`SolveHomePage.jsx`의 카드 두 개를 셋으로 늘린다. **기존 카드의 구조·클래스를 그대로 복제**하고 내용만 바꾼다.

| 순서 | 링크 | 아이콘 | 제목 | 설명 |
|---|---|---|---|---|
| 1 | `/solve/random` | `Shuffle` | 랜덤으로 풀기 | 문제 수와 부서를 정하면 무작위로 뽑아 드립니다. |
| 2 | `/solve/problems` | `ListChecks` | 골라서 풀기 | 검색·태그로 원하는 문제를 찾아 풉니다. |
| 3 | `/solve/history` | `ClockCounterClockwise` | 내 풀이 이력 | 지금까지 제출한 문제와 정답 여부를 확인합니다. |

`Shuffle`을 `@phosphor-icons/react` import에 추가한다. 그리드는 `md:grid-cols-2`를 `md:grid-cols-3`으로 바꾼다.

**"문제 풀기" → "골라서 풀기"로 이름을 바꾸는 것이 이 Task의 핵심이다.** 랜덤과 구분되지 않으면 카드를 늘린 의미가 없다.

- [ ] **Step 3: 랜덤 설정 화면을 만든다**

`frontend/src/pages/solve/RandomSetupPage.jsx`. `SolveShell`로 감싸고 `Select` 두 개와 시작 버튼을 둔다.

- 문제 수: `5`, `10`, `20` 중 선택 (기본 `10`)
- 부서: "전체 부서" + `listDepartmentOptions()` 결과 (기본 전체)

시작을 누르면 `fetchRandomSet`을 호출하고, 결과가 **0건이면 안내만 하고 이동하지 않는다.**

```jsx
  async function handleStart() {
    setStarting(true);
    try {
      const problems = await fetchRandomSet(Number(count), departmentId || null);
      if (problems.length === 0) {
        toast.info("조건에 맞는 문제가 없습니다. 부서나 문제 수를 바꿔 보세요.");
        return;
      }
      const session = createSession(problems.map((p) => p.id));
      sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
      navigate("/solve/random/play");
    } catch (error) {
      toast.error(resolveErrorMessage(error, "문제를 불러오지 못했습니다."));
    } finally {
      setStarting(false);
    }
  }
```

요청한 수보다 적게 왔을 때는 **막지 않고 그대로 진행한다**(Task 4에서 정한 대로 오류가 아니다). 다만 몇 문제가 준비됐는지 다음 화면에서 보이므로 별도 안내는 하지 않는다.

- [ ] **Step 4: 라우트를 추가한다**

`routes.jsx`의 `/solve` children에 넣는다. **`:id`보다 위에 둔다** — 아래에 두면 `random`이 문제 ID로 잡힌다.

```jsx
          { path: "random", element: <RandomSetupPage /> },
```

- [ ] **Step 5: 빌드와 테스트를 확인한다**

Run: `cd frontend && npm test`
Expected: 231 통과.

Run: `cd frontend && npm run build`
Expected: 성공.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/api/departments.js frontend/src/api/solve.js frontend/src/pages/solve/RandomSetupPage.jsx frontend/src/pages/solve/SolveHomePage.jsx frontend/src/routers/routes.jsx
git commit -m "feat: add random set setup screen and split the learning home"
```

---

## Task 8: 세트 진행과 결과 요약 화면

**Files:**
- Create: `frontend/src/pages/solve/RandomPlayPage.jsx`
- Create: `frontend/src/pages/solve/RandomResultPage.jsx`
- Modify: `frontend/src/routers/routes.jsx`

**Interfaces:**
- Consumes: Task 5 순수 함수, Task 6 `ProblemSolveCard`, 기존 `getSolveProblem`
- Produces: `/solve/random/play`, `/solve/random/result`

**배경(D5):** 세트를 다 풀면 결과 요약을 보여준다. 아무것도 없이 목록으로 돌아가면 세트를 푼 의미가 없다.

- [ ] **Step 1: 진행 화면을 만든다**

`RandomPlayPage.jsx`가 하는 일:

1. sessionStorage에서 세션을 읽는다. **없거나 깨졌으면** `/solve/random`으로 돌려보낸다
2. `isFinished`면 `/solve/random/result`로 보낸다
3. `currentProblemId`로 문제를 불러와 `<ProblemSolveCard>`에 넘긴다
4. 진행률을 보여준다 — `3 / 10`
5. `onSubmitted`를 받으면 "다음 문제" 버튼을 보여준다. 누르면 `recordResult` → sessionStorage 갱신 → 다음 문제

**채점 결과를 확인할 시간을 주는 것이 중요하다.** 제출 즉시 다음으로 넘기면 정답이 무엇이었는지 볼 수 없다. 반드시 사용자가 버튼을 눌러 넘어가게 한다.

세션 읽기는 방어적으로 한다.

```jsx
  function readSession() {
    try {
      const raw = sessionStorage.getItem(SESSION_STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      // 저장소 내용은 사용자가 고칠 수 있다. 최소 형태만 확인한다.
      if (!Array.isArray(parsed?.problemIds) || typeof parsed?.index !== "number") return null;
      return parsed;
    } catch {
      return null;
    }
  }
```

- [ ] **Step 2: 결과 요약 화면을 만든다**

`RandomResultPage.jsx`가 하는 일:

1. 세션을 읽는다. 없으면 `/solve/random`으로
2. `summarize(session)`으로 `10문제 중 7개 정답`을 크게 보여준다
3. 두 가지 행동을 준다 — **다시 랜덤으로 풀기**(`/solve/random`), **학습 홈으로**(`/solve`)
4. 화면을 그린 뒤 sessionStorage의 세션을 **지운다** — 뒤로 가기로 다 푼 세트에 다시 들어가는 것을 막는다

- [ ] **Step 3: 라우트를 추가한다**

```jsx
          { path: "random/play", element: <RandomPlayPage /> },
          { path: "random/result", element: <RandomResultPage /> },
```

**셋 다 `:id`보다 위에 둔다.**

- [ ] **Step 4: 빌드와 테스트를 확인한다**

Run: `cd frontend && npm test`
Expected: 231 통과.

Run: `cd frontend && npm run build`
Expected: 성공.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/solve/RandomPlayPage.jsx frontend/src/pages/solve/RandomResultPage.jsx frontend/src/routers/routes.jsx
git commit -m "feat: play a random set and show its result summary"
```

---

## Task 9: 브라우저 검증과 데이터 정리

**Files:**
- 없음(검증). 결함 발견 시 해당 파일 수정.

**배경:** **이 계획의 화면 작업은 자동 검증이 0이다.** jsdom이 없어 `ProblemSolveCard`·랜덤 3개 화면·`Select` 변경분을 테스트가 한 줄도 실행하지 않는다. 바로 앞 작업(빈칸 지정 모드)에서 단위 테스트·빌드·코드 리뷰를 **전부 통과한 Critical 결함 2건**이 브라우저에서만 잡힌 전례가 있다. 이 Task를 생략하면 안 된다.

**환경 준비:** `docs/qa/2026-08-12-plan4-solve-qa-manual.md` §0을 따른다. 특히 프론트가 **5173**이어야 하고(아니면 CORS로 로그인 실패), 백엔드는 **재기동**해야 새 API가 뜬다.

계정: `emp001` / `QaPlan3!2026`

- [ ] **Step 1: 랜덤 풀이 정상 흐름**

| 확인 | 기대 |
|---|---|
| 학습 홈 | 카드 3개, 이름이 랜덤/골라서/이력으로 구분됨 |
| 랜덤 설정 진입 | 문제 수·부서 Select가 보임 |
| 부서 드롭다운 | 활성 부서만(본사·개발팀·영업팀). **폐지팀이 없어야 한다** |
| 10문제·전체 부서로 시작 | 진행 화면, 진행률 `1 / N` |
| 문제 풀고 제출 | 채점 결과가 보이고, 다음 버튼이 나타남 |
| 다음 문제 | 앞 문제의 답이 **남아 있지 않다** |
| 새로고침 | 세트가 유지되고 같은 위치에서 이어짐 |
| 끝까지 풀기 | 결과 요약, 정답 수가 실제와 일치 |
| 결과에서 뒤로 가기 | 다 푼 세트로 되돌아가지 않음 |

- [ ] **Step 2: 부서 필터가 사용자 선택인지 확인 (D1)**

`emp001`은 영업팀이다. **개발팀을 골라도 개발팀 문제가 나와야 한다** — 자기 부서로 제한되면 D1 위반이다.

| 확인 | 기대 |
|---|---|
| 부서=개발팀으로 세트 시작 | 개발팀 문제가 나온다 |
| 부서=전체로 세트 시작 | 여러 부서 문제가 섞여 나온다 |

- [ ] **Step 3: 경계 상황**

| 조작 | 기대 |
|---|---|
| 문제가 없는 부서 선택 후 시작 | 안내 문구, 이동하지 않음 |
| `/solve/random/play`에 세션 없이 직접 접근 | 설정 화면으로 돌려보냄 |
| 개발자 도구로 sessionStorage 값을 깨뜨린 뒤 새로고침 | 설정 화면으로 돌려보냄(빈 화면·오류 아님) |
| `/api/problems/random?count=0` 직접 호출 | 거부 |
| `/api/problems/random?count=51` 직접 호출 | 거부 |
| `/api/problems/random?count=3` 직접 호출 두 번 | **두 번의 결과가 다르다**(무작위 확인) |

- [ ] **Step 4: 태그 선택지 (Task 2)**

| 확인 | 기대 |
|---|---|
| 골라서 풀기의 태그 드롭다운 | **`과학`·`기초`가 없다**(활성 문제 0건) |
| 남은 태그를 하나씩 골라 검색 | **어느 것을 골라도 결과가 0건이 아니다** |

- [ ] **Step 5: 스타일 (Task 1)**

| 확인 | 기대 |
|---|---|
| 빈칸 문제의 입력칸 | 글자가 **가운데**에서 시작 |
| 풀이 화면의 Select 화살표 | 오른쪽 테두리에서 떨어져 있음 |
| **관리자 화면의 모든 Select** | 화살표가 같은 위치, 잘림·겹침 없음 |

> 마지막 항목을 반드시 볼 것. `Select.jsx`는 공용이라 부서 관리·계정 관리·문제 관리·문제 등록 폼이 전부 함께 바뀐다. `admin` / `QaAdmin1234!`로 확인한다.

- [ ] **Step 6: 콘솔과 접근성**

| 확인 | 기대 |
|---|---|
| 전 과정 브라우저 콘솔 | React 오류·경고 **0건** |
| 키보드만으로 세트 진행 | 문제 수·부서·시작·답 입력·제출·다음에 모두 도달, 포커스 표시가 보임 |
| 모바일 폭(390×844) | 랜덤 3개 화면이 정상 동작 |

- [ ] **Step 7: QA 잔여 태그 정리**

`admin`으로 로그인해 문제 관리에서 QA 흔적 태그(`태그`, `수정태그`)를 해당 문제에서 제거한다. **화면으로 처리한다** — DB를 직접 고치지 않는다.

정리 후 §Step 4를 다시 확인해 드롭다운에서 사라졌는지 본다.

- [ ] **Step 8: 전체 테스트와 빌드**

```
cd backend && ./gradlew test     # 230 통과 기대
cd frontend && npm test          # 231 통과 기대
cd frontend && npm run build     # 성공
```

- [ ] **Step 9: 결과를 문서로 남기고 커밋**

`docs/qa/`에 검증 결과를 남긴다. 결함을 찾았다면 QA 매뉴얼 §8.2 양식으로 기록한다.

```bash
git add docs/qa/2026-08-12-solve-random-verification.md
git commit -m "docs: record browser verification for the random solve set"
```

---

## 완료 기준

- [ ] 학습 홈이 랜덤/골라서/이력 3갈래로 나뉘고 이름만으로 구분된다
- [ ] 문제 수와 부서를 정해 무작위 세트를 뽑아 연달아 풀 수 있다
- [ ] 부서는 **사용자가 고르는 필터**다 — 자기 부서로 제한되지 않는다 (D1)
- [ ] 새로고침해도 세트가 유지된다 (D4)
- [ ] 다 풀면 결과 요약이 나온다 (D5)
- [ ] 태그 드롭다운에 **고르면 0건이 나오는 선택지가 없다** (D8)
- [ ] 빈칸 입력칸이 가운데 정렬이다
- [ ] Select 화살표가 테두리에 붙지 않고, **관리자 화면 전부**에서 정상이다 (D10)
- [ ] 관리자 화면의 태그 필터는 **바뀌지 않았다** (D9)
- [ ] 백엔드 224 → **230**, 프론트엔드 226 → **231** 전부 통과, 빌드 성공
- [ ] 브라우저 콘솔에 React 오류 없음
