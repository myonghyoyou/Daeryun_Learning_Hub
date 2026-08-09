# 문제 엑셀 업로드 부서 지정 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 총괄 관리자가 문제 엑셀을 업로드할 때 귀속 부서를 선택할 수 있게 하고, 부서 관리자는 자기 부서로 고정된 채(화면에서는 disabled) 다른 부서를 지정할 수 없게 한다.

**Architecture:** 조회 경로(`ProblemServiceImpl.list`)에 이미 있는 `actor.getRole() == SUPER_ADMIN ? 요청값 : actor.getDepartmentId()` 패턴을 쓰기 경로로 옮긴다. 화면의 `disabled`는 실수 방지용 편의일 뿐이고, **권한 판정은 전적으로 서버가 한다** — 부서 관리자가 요청 파라미터를 위조해도 서버가 값을 버리고 본인 부서로 강제한다. 부서 목록 API는 총괄 관리자 전용이므로, 부서 관리자 화면은 API를 호출하지 않고 세션 응답의 `departmentName`(QA D2 수정분)만으로 라벨을 만든다.

**Tech Stack:** Java 8 / Spring Boot 2.7.3 / MyBatis / PostgreSQL, React 19 / Vite / Tailwind 4. 테스트는 JUnit 5 + Mockito + MockMvc(백엔드), Node 내장 러너 `node --test`(프론트엔드).

**근거 문서:**
- 기능 부재 확인: 이 문서 작성 직전 검토 — `ExcelProblemUploadServiceImpl:219`(문제 귀속)과 `:129`(업로드 이력) 두 곳이 `actor.getDepartmentId()`를 직접 읽으며, 컨트롤러·서비스·API·화면·엑셀 템플릿 어디에도 부서를 지정할 통로가 없다.
- 실투입 회차 결과: [`docs/qa/2026-08-09-question-bank-upload-result.md`](../../qa/2026-08-09-question-bank-upload-result.md)
- 부서 격리 검증 결과(§2 10/10 통과): [`docs/qa/2026-08-07-plan3-result.md`](../../qa/2026-08-07-plan3-result.md)

## Global Constraints

- **`@SpringBootTest`를 쓰는 테스트 클래스에는 반드시 `@ActiveProfiles("test")`를 붙인다.** 붙이지 않으면 `SuperAdminBootstrapRunner`(`@Profile("!test")`)가 기동하며 실제 개발 DB에 행을 기록한다.
- DB 통합 테스트는 `@Transactional`로 롤백한다. 반복 실행해도 결과가 같아야 한다.
- **백엔드 기본 DB 접속 대상은 Docker Postgres(`localhost:5434`)다.** `DB_URL` 없이 `./gradlew test`로 실행된다.
- **`rtk gradlew`는 `--tests` 옵션에서 멈춘다.** 백엔드 테스트는 `rtk proxy ./gradlew test --tests "..."` 형태로 실행한다.
- 백엔드는 `resultCode` 기반 응답 규약을 쓴다. 프런트엔드는 HTTP 상태를 보지 않고 본문 `resultCode`로만 분기한다(`api/client.js`).
- 프론트엔드에는 jsdom이 없다. React 컴포넌트는 렌더링 테스트가 불가능하므로 **순수 로직을 alias 없는 `frontend/src/utils/*.js`로 뽑아 `.test.js`로 검증**한다. `@/` alias를 쓰는 파일은 `node --test`가 로드하지 못한다.
- 현재 테스트 기준선: **백엔드 194개 / 프론트엔드 179개 전부 통과, 프로덕션 빌드 성공.** 하나도 깨뜨리지 않는다.
- 커밋 메시지는 이 저장소의 관례(`fix:`/`feat:`/`test:`/`docs:` 영문 Conventional Commits)를 따른다.

## 이 계획이 PRD를 바꾼다

PRD 섹션 1.4 용어 정의는 *"출제 부서 = 문제를 등록한 관리자의 소속 부서"* 다. 이 계획은 그 등식을 깬다 — `created_by`(실제 등록자)와 `department_id`(귀속 부서)가 분리된다. Task 7에서 PRD를 함께 고친다. 감사 로그에 "누가 어느 부서 명의로 올렸는지"를 남기는 것(Task 3)이 그 분리를 추적 가능하게 만드는 장치다.

## 범위 밖 (의도적으로 제외)

| 항목 | 제외 사유 |
|---|---|
| 개별 등록 화면(`/admin/problems/new`)의 부서 지정 | 총괄 관리자가 한 건씩 넣는 빈도가 낮다. 범위를 넓히면 §2 부서 격리 검증(10항목)을 통째로 재실행해야 한다 |
| 엑셀에 부서코드 열 추가 | 파일이 이미 팀별로 나뉘어 있어 이점이 적고, 행마다 권한 검사가 필요해 복잡하다 |

---

## File Structure

| 파일 | 책임 | Task |
|---|---|---|
| `backend/src/test/java/com/daeryun/probank/service/ExcelProblemUploadServiceImplTest.java` | 역할별 부서 결정 로직을 mock으로 정밀 검증 | 1, 2 |
| `backend/src/main/java/com/daeryun/probank/service/ExcelProblemUploadService.java` | 인터페이스에 `departmentId` 추가 | 1 |
| `backend/src/main/java/com/daeryun/probank/service/ExcelProblemUploadServiceImpl.java` | 유효 부서 1회 결정 + 검증 + 두 지점(문제·이력)에 전달 | 1, 2, 3 |
| `backend/src/main/java/com/daeryun/probank/controller/ProblemController.java` | `departmentId` 쿼리 파라미터 수신 | 1 |
| `backend/src/test/java/com/daeryun/probank/controller/ProblemExcelUploadBindingTest.java` | **신규.** 실제 서블릿 체인에서 파라미터 바인딩·검증 응답 확인 | 2 |
| `frontend/src/utils/uploadDepartmentField.js` | **신규.** 역할별 Select 구성(옵션·disabled·초기값)을 만드는 순수 함수 | 4 |
| `frontend/src/utils/uploadDepartmentField.test.js` | **신규.** 위 함수 고정 | 4 |
| `frontend/src/api/problems.js` | `uploadProblemsExcel(file, departmentId)` | 5 |
| `frontend/src/pages/admin/problems/ProblemExcelUploadPage.jsx` | 부서 Select 배선 | 5 |
| `docs/PRD.md` · `docs/superpowers/plans/2026-07-28-03-problem-bank-management.md` | 출제 부서 정의 갱신 | 7 |

---

### Task 1: 역할별 유효 부서 결정

**Files:**
- Modify: `backend/src/main/java/com/daeryun/probank/service/ExcelProblemUploadService.java`
- Modify: `backend/src/main/java/com/daeryun/probank/service/ExcelProblemUploadServiceImpl.java` (`upload` 시그니처, `processRow` 시그니처, `:129`, `:219`)
- Modify: `backend/src/main/java/com/daeryun/probank/controller/ProblemController.java:84-88`
- Test: `backend/src/test/java/com/daeryun/probank/service/ExcelProblemUploadServiceImplTest.java`

**Interfaces:**
- Consumes: `AuthUser.getRole()`·`getDepartmentId()`(Plan 1), `ProblemProvisioningService.provisionWithChoices/provisionWithAnswers`(Plan 3 Task 6)
- Produces: `ExcelProblemUploadService.upload(MultipartFile file, Long departmentId, AuthUser actor)` — Task 2·3·5가 이 시그니처에 의존한다.

**배경:** 현재 부서는 두 곳에서 각각 `actor.getDepartmentId()`로 읽힌다 — 문제 행(`:219`)과 업로드 이력(`:129`). **한쪽만 고치면 `excel_upload_logs.department_id`와 실제 문제 귀속이 어긋나 QA §8.22가 깨진다.** 유효 부서를 `upload` 진입부에서 한 번만 계산해 두 곳에 같은 값을 흘린다.

기존 테스트의 `actor`는 `new AuthUser(1L, "1001", "관리자", UserRole.DEPT_ADMIN, 10L, false)`로 **부서 관리자**다. 총괄 관리자 fixture를 새로 만든다.

- [x] **Step 1: 실패하는 테스트를 추가한다**

`ExcelProblemUploadServiceImplTest.java`의 클래스 상단 필드 옆에 총괄 관리자 fixture를 추가한다.

```java
    private final AuthUser superAdmin = new AuthUser(2L, "admin", "총괄관리자", UserRole.SUPER_ADMIN, 1L, false);
```

그리고 테스트 메서드 두 개를 추가한다.

```java
    /**
     * 총괄 관리자는 자기 부서가 아닌 부서 명의로 올릴 수 있어야 한다. 초기 문제은행 적재처럼
     * 한 사람이 여러 팀 파일을 넣는 상황이 실제로 있다.
     */
    @Test
    void superAdminUploadsIntoTheRequestedDepartment() throws Exception {
        MockMultipartFile file = buildExcel(new String[][]{
                {"문제유형", "문제내용", "이미지", "참조지문", "보기1", "보기2", "보기3", "보기4", "보기5", "정답", "해설", "태그"},
                {"MCQ_SINGLE", "수도는?", "", "", "서울", "부산", "", "", "", "1", "", ""},
        });

        service.upload(file, 77L, superAdmin);

        ArgumentCaptor<Problem> captor = ArgumentCaptor.forClass(Problem.class);
        Mockito.verify(problemProvisioningService)
                .provisionWithChoices(captor.capture(), Mockito.anyList(), Mockito.anyList());
        assertEquals(77L, captor.getValue().getDepartmentId().longValue());
    }

    /**
     * 화면의 disabled 는 실수 방지일 뿐 보안이 아니다. 부서 관리자가 요청 파라미터를 위조해도
     * 서버가 값을 버리고 본인 부서로 강제해야 한다 — 이 테스트는 그 규칙의 회귀 방지 장치다.
     */
    @Test
    void deptAdminRequestedDepartmentIsIgnored() throws Exception {
        MockMultipartFile file = buildExcel(new String[][]{
                {"문제유형", "문제내용", "이미지", "참조지문", "보기1", "보기2", "보기3", "보기4", "보기5", "정답", "해설", "태그"},
                {"MCQ_SINGLE", "수도는?", "", "", "서울", "부산", "", "", "", "1", "", ""},
        });

        service.upload(file, 999L, actor);

        ArgumentCaptor<Problem> captor = ArgumentCaptor.forClass(Problem.class);
        Mockito.verify(problemProvisioningService)
                .provisionWithChoices(captor.capture(), Mockito.anyList(), Mockito.anyList());
        assertEquals(10L, captor.getValue().getDepartmentId().longValue(), "부서 관리자는 본인 부서로 강제된다");
    }
```

import 두 줄을 추가한다.

```java
import com.daeryun.probank.domain.Problem;
import org.mockito.ArgumentCaptor;
```

> 확인된 시그니처: `void provisionWithChoices(Problem problem, List<ProblemChoice> choices, List<String> tagNames)`. 보기형(MCQ_SINGLE/MCQ_MULTI/OX)은 이 메서드를, SHORT_ANSWER는 `provisionWithAnswers(Problem, List<ProblemAnswer>, List<String>)`를 탄다. 위 테스트는 `MCQ_SINGLE` 행이라 `provisionWithChoices`가 맞다.

- [x] **Step 2: 컴파일 실패를 확인한다 (RED)**

Run: `cd backend && rtk proxy ./gradlew test --tests "com.daeryun.probank.service.ExcelProblemUploadServiceImplTest" --console=plain`

Expected: **컴파일 실패** — `upload(MultipartFile, Long, AuthUser)` 메서드가 없다. 이것이 이 Task의 RED다.

> `deptAdminRequestedDepartmentIsIgnored`는 시그니처만 생기면 **수정 없이도 통과**한다. 의도된 것이다 — 새 기능을 검증하는 테스트가 아니라 기존 보안 규칙이 깨지지 않는지 지키는 회귀 방지 테스트다.

- [x] **Step 3: 인터페이스 시그니처를 바꾼다**

`ExcelProblemUploadService.java`:

```java
public interface ExcelProblemUploadService {
    /**
     * @param departmentId 총괄 관리자가 지정한 귀속 부서. 부서 관리자에게는 무시되고 본인 부서가 쓰인다.
     */
    ExcelUploadResult upload(MultipartFile file, Long departmentId, AuthUser actor);
}
```

- [x] **Step 4: 구현에서 유효 부서를 1회 결정한다**

`ExcelProblemUploadServiceImpl.java`의 `upload` 시그니처를 바꾸고, 확장자 검증 바로 뒤에 결정 로직을 넣는다.

```java
    @Override
    public ExcelUploadResult upload(MultipartFile file, Long departmentId, AuthUser actor) {
        if (file == null || file.isEmpty()) {
            throw new BizException(ErrorCode.FILE_REQUIRED);
        }
        validateExtension(file.getOriginalFilename());
        Long effectiveDepartmentId = resolveDepartmentId(departmentId, actor);
```

같은 클래스에 private 메서드를 추가한다(검증은 Task 2에서 채운다).

```java
    /**
     * 귀속 부서를 정한다. ProblemServiceImpl.list 와 같은 규칙이다 — 총괄 관리자만 요청값을 쓰고,
     * 부서 관리자는 요청값을 무시하고 본인 부서로 강제된다. 화면의 disabled 는 실수 방지일 뿐이므로
     * 파라미터 위조는 여기서 막는다.
     */
    private Long resolveDepartmentId(Long requested, AuthUser actor) {
        if (actor.getRole() != UserRole.SUPER_ADMIN) {
            return actor.getDepartmentId();
        }
        return requested;
    }
```

import를 추가한다.

```java
import com.daeryun.probank.domain.UserRole;
```

- [x] **Step 5: 두 지점에 같은 값을 흘린다**

행 처리 호출(`:106` 부근)을 바꾼다.

```java
                results.add(processRow(row, rowIndex + 1, effectiveDepartmentId, actor, dataFormatter));
```

`processRow` 시그니처와 부서 대입(`:219` 부근)을 바꾼다.

```java
    private RowResult processRow(Row row, int rowNumber, Long departmentId, AuthUser actor,
                                  DataFormatter dataFormatter) {
```

```java
        problem.setDepartmentId(departmentId);
        problem.setCreatedBy(actor.getUserId());
```

업로드 이력(`:127-129`)의 주석과 대입을 바꾼다.

```java
        // 귀속 부서는 총괄 관리자가 지정할 수 있다(부서 관리자는 본인 부서로 강제). 문제 행과 이 이력이
        // 같은 값을 써야 excel_upload_logs 와 실제 귀속이 어긋나지 않는다.
        log.setDepartmentId(effectiveDepartmentId);
```

- [x] **Step 6: 컨트롤러가 파라미터를 받게 한다**

`ProblemController.java:84-88`:

```java
    @PostMapping("/excel-upload")
    public ResponseEntity<ResponseDto<?>> uploadExcel(@RequestParam("file") MultipartFile file,
                                                        @RequestParam(required = false) Long departmentId,
                                                        @LoginUser AuthUser actor) {
        return ResponseEntity.ok(ResponseDto.ok(excelProblemUploadService.upload(file, departmentId, actor)));
    }
```

- [x] **Step 7: 테스트가 통과하는지 확인한다 (GREEN)**

Run: `cd backend && rtk proxy ./gradlew test --tests "com.daeryun.probank.service.ExcelProblemUploadServiceImplTest" --console=plain`
Expected: `BUILD SUCCESSFUL`, 신규 2건 포함 전부 통과.

- [x] **Step 8: 전체 스위트로 회귀를 확인한다**

Run: `cd backend && rtk proxy ./gradlew test --console=plain`
Expected: `BUILD SUCCESSFUL`. 테스트 수 194 → 196.

- [x] **Step 9: Commit**

```bash
git add backend/src/main/java/com/daeryun/probank/service/ExcelProblemUploadService.java \
        backend/src/main/java/com/daeryun/probank/service/ExcelProblemUploadServiceImpl.java \
        backend/src/main/java/com/daeryun/probank/controller/ProblemController.java \
        backend/src/test/java/com/daeryun/probank/service/ExcelProblemUploadServiceImplTest.java
git commit -m "feat: let super admins choose the owning department on problem excel upload"
```

---

### Task 2: 부서 값 검증 3종

**Files:**
- Modify: `backend/src/main/java/com/daeryun/probank/service/ExcelProblemUploadServiceImpl.java` (`resolveDepartmentId`, 생성자)
- Modify: `backend/src/test/java/com/daeryun/probank/service/ExcelProblemUploadServiceImplTest.java` (mock 추가)
- Create: `backend/src/test/java/com/daeryun/probank/controller/ProblemExcelUploadBindingTest.java`

**Interfaces:**
- Consumes: Task 1의 `upload(file, departmentId, actor)`, `DepartmentDao.findById(Long)`(Plan 2)
- Produces: 없음 (검증 강화). Task 5의 화면이 이 오류 메시지를 그대로 표시한다.

**배경:** 조회 경로는 없는 부서를 넣어도 "0건"으로 끝나 무해했지만, **쓰기 경로는 잘못된 부서에 데이터가 박힌다.** 세 가지를 막는다.

| # | 조건 | 이유 |
|---|---|---|
| V1 | 총괄 관리자인데 `departmentId`가 없음 | 조용히 본인 부서로 떨어지면 653문항이 전부 본사로 들어간다 |
| V2 | 존재하지 않는 부서 ID | FK 위반이 500으로 새어 나간다 |
| V3 | 비활성 부서 | 계정 생성 폼은 비활성 부서를 제외하는데 그 규칙이 `departmentOptions.js` 주석대로 **클라이언트에만 있다**. 서버에서 처음 강제한다 |

**검증은 행 루프 진입 전에 끝나야 한다.** 행마다 `REQUIRES_NEW`로 커밋되므로 중간에 예외가 나면 이미 저장된 문제가 남는다 — 500행 상한을 루프 전에 검사하는 것과 같은 이유다. `resolveDepartmentId`가 `upload` 진입부에 있으므로 이 조건은 이미 만족한다.

- [x] **Step 1: 실패하는 테스트 3건을 추가한다**

`ExcelProblemUploadServiceImplTest.java`에 `DepartmentDao` mock을 추가한다. 필드·`setUp`·헬퍼를 아래처럼 고친다.

```java
    private DepartmentDao departmentDao;

    @BeforeEach
    void setUp() {
        excelUploadLogDao = Mockito.mock(ExcelUploadLogDao.class);
        problemProvisioningService = Mockito.mock(ProblemProvisioningService.class);
        auditLogService = Mockito.mock(AuditLogService.class);
        departmentDao = Mockito.mock(DepartmentDao.class);
        service = new ExcelProblemUploadServiceImpl(excelUploadLogDao, problemProvisioningService,
                auditLogService, departmentDao);
        Mockito.when(departmentDao.findById(Mockito.anyLong())).thenReturn(activeDepartment(77L));
    }

    private Department activeDepartment(Long id) {
        Department department = new Department();
        department.setId(id);
        department.setName("대상팀");
        department.setStatus(Status.ACTIVE);
        return department;
    }
```

테스트 3건을 추가한다.

```java
    @Test
    void superAdminMustPickADepartment() throws Exception {
        MockMultipartFile file = buildExcel(new String[][]{
                {"문제유형", "문제내용", "이미지", "참조지문", "보기1", "보기2", "보기3", "보기4", "보기5", "정답", "해설", "태그"},
                {"MCQ_SINGLE", "수도는?", "", "", "서울", "부산", "", "", "", "1", "", ""},
        });

        BizException thrown = assertThrows(BizException.class, () -> service.upload(file, null, superAdmin));

        assertTrue(thrown.getMessage().contains("부서를 선택"));
        Mockito.verifyNoInteractions(problemProvisioningService);
    }

    @Test
    void unknownDepartmentIsRejected() throws Exception {
        Mockito.when(departmentDao.findById(404L)).thenReturn(null);
        MockMultipartFile file = buildExcel(new String[][]{
                {"문제유형", "문제내용", "이미지", "참조지문", "보기1", "보기2", "보기3", "보기4", "보기5", "정답", "해설", "태그"},
                {"MCQ_SINGLE", "수도는?", "", "", "서울", "부산", "", "", "", "1", "", ""},
        });

        assertThrows(BizException.class, () -> service.upload(file, 404L, superAdmin));
        Mockito.verifyNoInteractions(problemProvisioningService);
    }

    @Test
    void inactiveDepartmentIsRejected() throws Exception {
        Department inactive = activeDepartment(88L);
        inactive.setStatus(Status.INACTIVE);
        Mockito.when(departmentDao.findById(88L)).thenReturn(inactive);
        MockMultipartFile file = buildExcel(new String[][]{
                {"문제유형", "문제내용", "이미지", "참조지문", "보기1", "보기2", "보기3", "보기4", "보기5", "정답", "해설", "태그"},
                {"MCQ_SINGLE", "수도는?", "", "", "서울", "부산", "", "", "", "1", "", ""},
        });

        BizException thrown = assertThrows(BizException.class, () -> service.upload(file, 88L, superAdmin));

        assertTrue(thrown.getMessage().contains("비활성"));
        Mockito.verifyNoInteractions(problemProvisioningService);
    }
```

import를 추가한다.

```java
import com.daeryun.probank.dao.DepartmentDao;
import com.daeryun.probank.domain.Department;
import com.daeryun.probank.domain.Status;
import com.daeryun.probank.exception.BizException;
import static org.junit.jupiter.api.Assertions.assertThrows;
```

- [x] **Step 2: 실패를 확인한다 (RED)**

Run: `cd backend && rtk proxy ./gradlew test --tests "com.daeryun.probank.service.ExcelProblemUploadServiceImplTest" --console=plain`
Expected: **컴파일 실패** — 4인자 생성자가 없다.

- [x] **Step 3: 생성자에 DepartmentDao를 주입하고 검증을 채운다**

`ExcelProblemUploadServiceImpl.java`:

```java
    private final DepartmentDao departmentDao;

    public ExcelProblemUploadServiceImpl(ExcelUploadLogDao excelUploadLogDao,
                                          ProblemProvisioningService problemProvisioningService,
                                          AuditLogService auditLogService,
                                          DepartmentDao departmentDao) {
        this.excelUploadLogDao = excelUploadLogDao;
        this.problemProvisioningService = problemProvisioningService;
        this.auditLogService = auditLogService;
        this.departmentDao = departmentDao;
    }
```

`resolveDepartmentId`를 채운다.

```java
    private Long resolveDepartmentId(Long requested, AuthUser actor) {
        if (actor.getRole() != UserRole.SUPER_ADMIN) {
            return actor.getDepartmentId();
        }
        if (requested == null) {
            throw new BizException(ErrorCode.INPUT_VALUE_INVALID, "업로드할 문제가 귀속될 부서를 선택하세요.");
        }
        Department department = departmentDao.findById(requested);
        if (department == null) {
            throw new BizException(ErrorCode.INPUT_VALUE_INVALID, "존재하지 않는 부서입니다.");
        }
        if (department.getStatus() != Status.ACTIVE) {
            throw new BizException(ErrorCode.INPUT_VALUE_INVALID,
                    "비활성 부서에는 문제를 등록할 수 없습니다: " + department.getName());
        }
        return requested;
    }
```

import를 추가한다.

```java
import com.daeryun.probank.dao.DepartmentDao;
import com.daeryun.probank.domain.Department;
import com.daeryun.probank.domain.Status;
```

- [x] **Step 4: 통과를 확인한다 (GREEN)**

Run: `cd backend && rtk proxy ./gradlew test --tests "com.daeryun.probank.service.ExcelProblemUploadServiceImplTest" --console=plain`
Expected: `BUILD SUCCESSFUL`

- [x] **Step 5: 서블릿 체인 바인딩 테스트를 추가한다**

`backend/src/test/java/com/daeryun/probank/controller/ProblemExcelUploadBindingTest.java`:

```java
package com.daeryun.probank.controller;

import com.daeryun.probank.common.AuthUser;
import com.daeryun.probank.common.SessionKeys;
import com.daeryun.probank.domain.UserRole;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;

/**
 * 서비스 단위 테스트는 upload(...)를 Long 으로 직접 호출하므로 Spring MVC 의 문자열 → Long 변환
 * 단계를 지나가지 않는다. QA D1(등록일 필터)이 정확히 그 공백으로 189개 테스트를 통과했었다.
 * 이 테스트는 실제 서블릿 체인에서 departmentId 가 컨트롤러 시그니처에 바인딩되는지 확인한다.
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Transactional
class ProblemExcelUploadBindingTest {

    @Autowired
    private MockMvc mockMvc;

    private MockHttpSession superAdminSession() {
        MockHttpSession session = new MockHttpSession();
        session.setAttribute(SessionKeys.LOGIN_USER,
                new AuthUser(1L, "admin", "총괄관리자", UserRole.SUPER_ADMIN, 1L, false));
        return session;
    }

    /**
     * upload(...)의 검사 순서는 파일 존재 → 확장자 → 부서 → 워크북 열기다. 부서 검증이 워크북을
     * 열기 전에 끝나므로, 부서 오류를 확인하는 데는 "비어 있지 않은 .xlsx 이름의 바이트"면 충분하다.
     * 비어 있으면 FILE_REQUIRED 로 먼저 걸려 부서 검증에 도달하지 못한다.
     */
    private MockMultipartFile dummyXlsx() {
        return new MockMultipartFile("file", "any.xlsx",
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                new byte[]{0x50, 0x4B, 0x03, 0x04});
    }

    @Test
    void 부서를_지정하지_않으면_입력값_오류로_안내한다() throws Exception {
        mockMvc.perform(multipart("/api/admin/problems/excel-upload")
                        .file(dummyXlsx())
                        .session(superAdminSession()))
                .andExpect(jsonPath("$.resultCode").value(1000));
    }

    @Test
    void 없는_부서를_지정하면_입력값_오류로_안내한다() throws Exception {
        mockMvc.perform(multipart("/api/admin/problems/excel-upload")
                        .file(dummyXlsx())
                        .param("departmentId", "99999999")
                        .session(superAdminSession()))
                .andExpect(jsonPath("$.resultCode").value(1000));
    }
}
```

> 두 테스트 모두 `ErrorCode.INPUT_VALUE_INVALID`(1000)를 기대한다. 부서 검증이 워크북 열기보다 앞서므로 바이트가 유효한 엑셀일 필요는 없다.

- [x] **Step 6: 실행해 확인한다**

Run: `cd backend && rtk proxy ./gradlew test --tests "com.daeryun.probank.controller.ProblemExcelUploadBindingTest" --console=plain`
Expected: 2건 통과. 실패하면 `.andDo(print())`를 붙여 **실제 응답 본문을 눈으로 확인한 뒤** 원인을 고친다 — 기대값을 결과에 맞추는 방향으로 고치지 않는다.

- [x] **Step 7: 전체 스위트**

Run: `cd backend && rtk proxy ./gradlew test --console=plain`
Expected: `BUILD SUCCESSFUL`, 196 → 201.

- [x] **Step 8: Commit**

```bash
git add backend/src/main/java/com/daeryun/probank/service/ExcelProblemUploadServiceImpl.java \
        backend/src/test/java/com/daeryun/probank/service/ExcelProblemUploadServiceImplTest.java \
        backend/src/test/java/com/daeryun/probank/controller/ProblemExcelUploadBindingTest.java
git commit -m "fix: reject missing, unknown and inactive departments on excel upload"
```

---

### Task 3: 감사 로그에 귀속 부서를 남긴다

**Files:**
- Modify: `backend/src/main/java/com/daeryun/probank/service/ExcelProblemUploadServiceImpl.java` (감사 로그 detail 구성부)
- Modify: `backend/src/test/java/com/daeryun/probank/service/ExcelProblemUploadServiceImplTest.java`

**Interfaces:**
- Consumes: Task 1의 `effectiveDepartmentId`, `AuditLogService.record(actorId, action, targetType, targetId, detail)`(Plan 1)
- Produces: 없음.

**배경:** 이 계획은 PRD의 *"출제 부서 = 등록한 관리자의 소속 부서"* 등식을 깬다. `created_by`와 `department_id`가 갈라지므로 **"누가 어느 부서 명의로 올렸는지"** 가 감사 로그에 남아야 추적이 된다. 현재 detail은 `{"failRows":0,"fileName":"...","totalRows":43,"successRows":43}`이다.

- [x] **Step 1: 실패하는 테스트를 추가한다**

```java
    @Test
    void auditDetailCarriesTheOwningDepartment() throws Exception {
        MockMultipartFile file = buildExcel(new String[][]{
                {"문제유형", "문제내용", "이미지", "참조지문", "보기1", "보기2", "보기3", "보기4", "보기5", "정답", "해설", "태그"},
                {"MCQ_SINGLE", "수도는?", "", "", "서울", "부산", "", "", "", "1", "", ""},
        });

        service.upload(file, 77L, superAdmin);

        ArgumentCaptor<String> detail = ArgumentCaptor.forClass(String.class);
        Mockito.verify(auditLogService).record(Mockito.eq(2L), Mockito.eq("PROBLEM_EXCEL_UPLOADED"),
                Mockito.eq("EXCEL_UPLOAD_LOG"), Mockito.any(), detail.capture());
        assertTrue(detail.getValue().contains("\"departmentId\":77"),
                "귀속 부서가 감사 로그에 남아야 한다: " + detail.getValue());
    }
```

> 확인된 시그니처: `void record(Long actorId, String action, String targetType, Long targetId, String detail)`. 현재 호출은 `record(actor.getUserId(), "PROBLEM_EXCEL_UPLOADED", "EXCEL_UPLOAD_LOG", log.getId(), "{...}")`이다.

- [x] **Step 2: 실패를 확인한다 (RED)**

Run: `cd backend && rtk proxy ./gradlew test --tests "com.daeryun.probank.service.ExcelProblemUploadServiceImplTest" --console=plain`
Expected: `auditDetailCarriesTheOwningDepartment` FAIL — detail에 `departmentId`가 없다.

- [x] **Step 3: detail에 부서를 추가한다**

`ExcelProblemUploadServiceImpl.java:138-140`의 현재 코드는 문자열 연결이다.

```java
        auditLogService.record(actor.getUserId(), "PROBLEM_EXCEL_UPLOADED", "EXCEL_UPLOAD_LOG", log.getId(),
                "{\"fileName\":\"" + escapeJson(log.getFileName()) + "\",\"totalRows\":" + log.getTotalRows()
                        + ",\"successRows\":" + log.getSuccessRows() + ",\"failRows\":" + log.getFailRows() + "}");
```

`departmentId`를 마지막 필드로 넣는다. 숫자라 따옴표를 붙이지 않는다.

```java
        auditLogService.record(actor.getUserId(), "PROBLEM_EXCEL_UPLOADED", "EXCEL_UPLOAD_LOG", log.getId(),
                "{\"fileName\":\"" + escapeJson(log.getFileName()) + "\",\"totalRows\":" + log.getTotalRows()
                        + ",\"successRows\":" + log.getSuccessRows() + ",\"failRows\":" + log.getFailRows()
                        + ",\"departmentId\":" + log.getDepartmentId() + "}");
```

> `log.getDepartmentId()`는 Task 1에서 `effectiveDepartmentId`로 채워졌으므로 `null`이 될 수 없다(총괄 관리자는 Task 2가 `null`을 거부하고, 부서 관리자는 세션 값이 들어간다). 그래도 QA §5.11이 `detail::jsonb` 파싱을 검사하므로, Task 6에서 실제 저장된 값이 유효한 JSON인지 SQL로 확인한다.

- [x] **Step 4: 통과를 확인한다 (GREEN)**

Run: `cd backend && rtk proxy ./gradlew test --tests "com.daeryun.probank.service.ExcelProblemUploadServiceImplTest" --console=plain`
Expected: `BUILD SUCCESSFUL`

- [x] **Step 5: Commit**

```bash
git add backend/src/main/java/com/daeryun/probank/service/ExcelProblemUploadServiceImpl.java \
        backend/src/test/java/com/daeryun/probank/service/ExcelProblemUploadServiceImplTest.java
git commit -m "feat: record the owning department in the excel upload audit log"
```

---

### Task 4: 부서 Select 구성 순수 함수

**Files:**
- Create: `frontend/src/utils/uploadDepartmentField.js`
- Create: `frontend/src/utils/uploadDepartmentField.test.js`

**Interfaces:**
- Consumes: 세션 객체(`useSessionStatus`가 주는 `{ role, departmentId, departmentName }` — `departmentName`은 QA D2 수정분), `listDepartments()` 응답(`{ id, name, code, status }[]`)
- Produces: `buildUploadDepartmentField({ session, departments })` → `{ disabled: boolean, options: {value,label}[], value: string, helpText: string }` — Task 5가 그대로 Select에 꽂는다.

**배경:** `DepartmentController`가 `@RequireRole(SUPER_ADMIN)`이라 **부서 관리자는 부서 목록 API를 호출할 수 없다.** 그래서 부서 관리자 화면은 API를 아예 호출하지 않고 세션의 `departmentName`으로 라벨 하나만 만든다(호출하면 403이 콘솔에 찍힌다 — Plan 3 QA에서 실제로 관찰된 현상이다).

**총괄 관리자의 초기값은 빈 문자열이다.** 본인 부서를 자동 선택하면 선택을 잊었을 때 **조용히 본사로 들어간다** — 653문항을 팀별로 넣는 지금 상황에서 가장 위험한 실수다. 서버도 Task 2에서 같은 이유로 `null`을 거부한다.

기존 `buildDepartmentOptions`(`departmentOptions.js`)와 형제 함수지만, 그쪽은 계정 폼 전용(수정 시 비활성 부서를 남기는 규칙)이라 재사용하지 않고 별도로 둔다.

- [x] **Step 1: 실패하는 테스트를 작성한다**

`frontend/src/utils/uploadDepartmentField.test.js`:

```javascript
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildUploadDepartmentField } from "./uploadDepartmentField.js";

const DEPARTMENTS = [
  { id: 1, name: "본사", code: "HQ", status: "ACTIVE" },
  { id: 2, name: "개발팀", code: "DEV", status: "ACTIVE" },
  { id: 3, name: "폐지팀", code: "OLD", status: "INACTIVE" },
];

test("super admin can choose among active departments", () => {
  const field = buildUploadDepartmentField({
    session: { role: "SUPER_ADMIN", departmentId: 1, departmentName: "본사" },
    departments: DEPARTMENTS,
  });

  assert.equal(field.disabled, false);
  assert.deepEqual(
    field.options.map((o) => o.label),
    ["부서 선택", "본사", "개발팀"]
  );
});

// 선택을 잊었을 때 조용히 본인 부서로 들어가면 안 된다. 서버도 같은 이유로 null 을 거부한다.
test("super admin starts with no department selected", () => {
  const field = buildUploadDepartmentField({
    session: { role: "SUPER_ADMIN", departmentId: 1, departmentName: "본사" },
    departments: DEPARTMENTS,
  });

  assert.equal(field.value, "");
});

test("dept admin is locked to their own department", () => {
  const field = buildUploadDepartmentField({
    session: { role: "DEPT_ADMIN", departmentId: 2, departmentName: "개발팀" },
    departments: [],
  });

  assert.equal(field.disabled, true);
  assert.equal(field.value, "2");
  assert.deepEqual(field.options, [{ value: "2", label: "개발팀" }]);
});

// 부서 목록 API 는 총괄 관리자 전용이라 부서 관리자에게는 departments 가 항상 빈 배열로 들어온다.
test("dept admin never sees other departments even if a list is passed", () => {
  const field = buildUploadDepartmentField({
    session: { role: "DEPT_ADMIN", departmentId: 2, departmentName: "개발팀" },
    departments: DEPARTMENTS,
  });

  assert.equal(field.options.length, 1);
  assert.equal(field.disabled, true);
});

test("falls back to a dash when the session has no department name", () => {
  const field = buildUploadDepartmentField({
    session: { role: "DEPT_ADMIN", departmentId: 2 },
    departments: [],
  });

  assert.equal(field.options[0].label, "-");
});
```

- [x] **Step 2: 실패를 확인한다 (RED)**

Run: `cd frontend && node --test src/utils/uploadDepartmentField.test.js`
Expected: `ERR_MODULE_NOT_FOUND` — `uploadDepartmentField.js`가 없다.

- [x] **Step 3: 최소 구현을 작성한다**

`frontend/src/utils/uploadDepartmentField.js`:

```javascript
/**
 * 문제 엑셀 업로드 화면의 "귀속 부서" Select 구성.
 *
 * 총괄 관리자만 부서를 고를 수 있다. 부서 관리자는 자기 부서 하나만 보이고 disabled 다 —
 * 다만 이는 실수 방지용이고, 권한 판정은 서버(ExcelProblemUploadServiceImpl.resolveDepartmentId)가
 * 한다. 파라미터를 위조해도 서버가 본인 부서로 강제한다.
 *
 * 부서 관리자에게 departments 가 빈 배열인 이유: DepartmentController 가 SUPER_ADMIN 전용이라
 * 목록 API 를 호출할 수 없다. 대신 세션 응답의 departmentName 을 쓴다.
 *
 * 총괄 관리자의 초기값이 빈 문자열인 것은 의도다. 본인 부서를 자동 선택하면 선택을 잊었을 때
 * 조용히 그 부서로 등록된다.
 */
export function buildUploadDepartmentField({ session, departments = [] }) {
  if (session?.role === "SUPER_ADMIN") {
    return {
      disabled: false,
      value: "",
      options: [
        { value: "", label: "부서 선택" },
        ...departments
          .filter((department) => department.status === "ACTIVE")
          .map((department) => ({ value: String(department.id), label: department.name })),
      ],
      helpText: "선택한 부서 명의로 등록됩니다.",
    };
  }

  const value = session?.departmentId == null ? "" : String(session.departmentId);
  return {
    disabled: true,
    value,
    options: [{ value, label: session?.departmentName ?? "-" }],
    helpText: "소속 부서로만 등록할 수 있습니다.",
  };
}
```

- [x] **Step 4: 통과를 확인한다 (GREEN)**

Run: `cd frontend && node --test src/utils/uploadDepartmentField.test.js`
Expected: 5건 전부 통과.

- [x] **Step 5: Commit**

```bash
git add frontend/src/utils/uploadDepartmentField.js frontend/src/utils/uploadDepartmentField.test.js
git commit -m "feat: add the upload department field builder"
```

---

### Task 5: 업로드 화면 배선

**Files:**
- Modify: `frontend/src/api/problems.js:36-40`
- Modify: `frontend/src/pages/admin/problems/ProblemExcelUploadPage.jsx`

**Interfaces:**
- Consumes: Task 4의 `buildUploadDepartmentField`, Task 1의 `departmentId` 파라미터, `useSessionStatus()`(Plan 1), `listDepartments()`(Plan 2)
- Produces: 없음 (최종 화면).

**배경:** 현재 이 화면은 `useRef` + `useState` 3개(file/result/uploading)로만 이뤄져 있고 세션도 부서 목록도 쓰지 않는다. Select 하나와 그 데이터 로딩을 더한다.

- [x] **Step 1: API 함수에 부서를 싣는다**

`frontend/src/api/problems.js`:

```javascript
export function uploadProblemsExcel(file, departmentId) {
  const formData = new FormData();
  formData.append("file", file);
  const query = departmentId ? `?departmentId=${encodeURIComponent(departmentId)}` : "";
  return apiPostForm(`/api/admin/problems/excel-upload${query}`, formData);
}
```

> 컨트롤러가 `@RequestParam`으로 받으므로 쿼리스트링으로 보낸다. `FormData`에 넣어도 Spring이 읽지만, 쿼리스트링이 컨트롤러 시그니처와 1:1로 대응해 읽기 쉽다.

- [x] **Step 2: 화면에 세션·부서 목록·선택 상태를 추가한다**

`ProblemExcelUploadPage.jsx` 상단 import에 추가한다.

```javascript
import { useEffect, useMemo, useRef, useState } from "react";
import { listDepartments } from "@/api/departments.js";
import { useSessionStatus } from "@/hooks/useSessionStatus.js";
import { buildUploadDepartmentField } from "@/utils/uploadDepartmentField.js";
import Select from "@/components/ui/Select.jsx";
```

컴포넌트 본문 상단에 추가한다.

```javascript
  const { session } = useSessionStatus();
  const [departments, setDepartments] = useState([]);
  const [departmentId, setDepartmentId] = useState("");

  // 부서 목록 API 는 총괄 관리자 전용이다. 부서 관리자가 호출하면 403 이 콘솔에 찍히므로
  // 역할을 보고 호출 자체를 하지 않는다.
  useEffect(() => {
    if (session?.role !== "SUPER_ADMIN") {
      return;
    }
    listDepartments().then(setDepartments).catch(() => setDepartments([]));
  }, [session?.role]);

  const departmentField = useMemo(
    () => buildUploadDepartmentField({ session, departments }),
    [session, departments],
  );

  // 부서 관리자는 값이 세션에서 고정된다. 총괄 관리자는 빈 값에서 시작해 직접 고른다.
  useEffect(() => {
    if (departmentField.disabled) {
      setDepartmentId(departmentField.value);
    }
  }, [departmentField.disabled, departmentField.value]);
```

- [x] **Step 3: 제출 전 검사와 전송을 고친다**

`handleUpload` 안의 파일 검사 바로 뒤에 부서 검사를 넣고, 호출에 부서를 싣는다.

```javascript
    if (!departmentId) {
      toast.error("업로드할 문제가 귀속될 부서를 선택하세요.");
      return;
    }
```

```javascript
      const uploadResult = await uploadProblemsExcel(file, departmentId);
```

- [x] **Step 4: Select를 렌더링한다**

"파일 업로드" Surface 안, 파일 선택 버튼 **위**에 넣는다.

```jsx
        <Select
          id="problem-excel-department"
          label="귀속 부서"
          required
          value={departmentId}
          disabled={departmentField.disabled || uploading}
          options={departmentField.options}
          onChange={(event) => setDepartmentId(event.target.value)}
          className="mb-4 w-72"
        />
        <p className="mb-4 text-body-small text-ink-muted">{departmentField.helpText}</p>
```

- [x] **Step 5: 테스트와 빌드를 확인한다**

Run: `cd frontend && npm test`
Expected: 179 → 184 통과, 실패 0.

Run: `cd frontend && rtk proxy npm run build`
Expected: 빌드 성공.

- [x] **Step 6: Commit**

```bash
git add frontend/src/api/problems.js frontend/src/pages/admin/problems/ProblemExcelUploadPage.jsx
git commit -m "feat: add the owning department select to the problem excel upload screen"
```

---

### Task 6: 부서 이동 API

**Files:**
- Modify: `backend/src/main/resources/mappers/probank/ProblemMapper.xml`
- Modify: `backend/src/main/java/com/daeryun/probank/dao/ProblemDao.java`
- Modify: `backend/src/main/java/com/daeryun/probank/service/ProblemService.java`
- Modify: `backend/src/main/java/com/daeryun/probank/service/ProblemServiceImpl.java`
- Modify: `backend/src/main/java/com/daeryun/probank/controller/ProblemController.java`
- Create: `backend/src/main/java/com/daeryun/probank/dto/problem/DepartmentChangeRequest.java`
- Test: `backend/src/test/java/com/daeryun/probank/service/ProblemServiceImplTest.java`

**Interfaces:**
- Consumes: `DepartmentDao.findById(Long)`(Plan 2), `AuditLogService.record(Long, String, String, Long, String)`(Plan 1)
- Produces: `ProblemService.changeDepartment(Long id, Long departmentId, AuthUser actor)`, `PATCH /api/admin/problems/{id}/department` — Task 7의 화면이 호출한다.

**배경:** 총괄 관리자가 업로드 시 부서를 잘못 고르면 되돌릴 방법이 지금은 없다. `ProblemMapper.update` SQL에 `department_id`가 없고 `ProblemServiceImpl.update`도 부서를 건드리지 않는다.

**일반 수정(`update`)에 부서를 끼워 넣지 않고 전용 엔드포인트를 만드는 이유:** `ProblemCreateRequest`에는 `departmentId` 필드가 **의도적으로 없다**(`ProblemServiceImpl:83-85` 주석 — 부서 관리자의 파라미터 위조를 원천 차단). 여기에 필드를 추가하면 등록 경로까지 위조 표면이 다시 열린다. 별도 요청 DTO와 별도 엔드포인트로 분리하고, 그 엔드포인트만 총괄 관리자로 막는다.

`RoleCheckInterceptor:27-29`가 **메서드 애너테이션을 먼저 보고 없을 때만 클래스 것을 쓰므로**, 클래스가 `{SUPER_ADMIN, DEPT_ADMIN}`이어도 메서드에 `SUPER_ADMIN`을 달면 부서 관리자는 차단된다.

- [x] **Step 1: 실패하는 테스트를 추가한다**

`ProblemServiceImplTest.java`에 추가한다. 기존 테스트가 쓰는 mock 이름(`problemDao`, `auditLogService`)을 그대로 따르고, `departmentDao` mock이 없으면 `setUp`에 추가한다.

```java
    @Test
    void changeDepartment_movesTheProblemAndRecordsBothSides() {
        Problem existing = new Problem();
        existing.setId(5L);
        existing.setDepartmentId(1L);
        existing.setType(ProblemType.MCQ_SINGLE);
        Mockito.when(problemDao.findById(5L)).thenReturn(existing);
        Department target = new Department();
        target.setId(9L);
        target.setName("영업팀");
        target.setStatus(Status.ACTIVE);
        Mockito.when(departmentDao.findById(9L)).thenReturn(target);
        AuthUser superAdmin = new AuthUser(2L, "admin", "총괄관리자", UserRole.SUPER_ADMIN, 1L, false);

        service.changeDepartment(5L, 9L, superAdmin);

        Mockito.verify(problemDao).updateDepartment(5L, 9L);
        ArgumentCaptor<String> detail = ArgumentCaptor.forClass(String.class);
        Mockito.verify(auditLogService).record(Mockito.eq(2L), Mockito.eq("PROBLEM_DEPARTMENT_CHANGED"),
                Mockito.eq("PROBLEM"), Mockito.eq(5L), detail.capture());
        assertTrue(detail.getValue().contains("\"from\":1"), detail.getValue());
        assertTrue(detail.getValue().contains("\"to\":9"), detail.getValue());
    }

    @Test
    void changeDepartment_rejectsInactiveTarget() {
        Problem existing = new Problem();
        existing.setId(5L);
        existing.setDepartmentId(1L);
        Mockito.when(problemDao.findById(5L)).thenReturn(existing);
        Department target = new Department();
        target.setId(9L);
        target.setName("폐지팀");
        target.setStatus(Status.INACTIVE);
        Mockito.when(departmentDao.findById(9L)).thenReturn(target);
        AuthUser superAdmin = new AuthUser(2L, "admin", "총괄관리자", UserRole.SUPER_ADMIN, 1L, false);

        assertThrows(BizException.class, () -> service.changeDepartment(5L, 9L, superAdmin));
        Mockito.verify(problemDao, Mockito.never()).updateDepartment(Mockito.anyLong(), Mockito.anyLong());
    }
```

- [x] **Step 2: 실패를 확인한다 (RED)**

Run: `cd backend && rtk proxy ./gradlew test --tests "com.daeryun.probank.service.ProblemServiceImplTest" --console=plain`
Expected: **컴파일 실패** — `changeDepartment`와 `updateDepartment`가 없다.

- [x] **Step 3: DAO와 매퍼를 추가한다**

`ProblemDao.java`에 추가한다.

```java
    void updateDepartment(@Param("id") Long id, @Param("departmentId") Long departmentId);
```

`@Param` import가 없으면 추가한다.

```java
import org.apache.ibatis.annotations.Param;
```

`ProblemMapper.xml`의 `updateStatus` 아래에 추가한다.

```xml
    <update id="updateDepartment">
        UPDATE problems SET department_id = #{departmentId}, updated_at = now() WHERE id = #{id}
    </update>
```

- [x] **Step 4: 서비스에 메서드를 추가한다**

`ProblemService.java`에 추가한다.

```java
    void changeDepartment(Long id, Long departmentId, AuthUser actor);
```

`ProblemServiceImpl.java`에 구현을 추가한다(`archive` 메서드 아래).

```java
    /**
     * 문제의 귀속 부서를 옮긴다. 엑셀 업로드에서 부서를 잘못 골랐을 때 화면으로 되돌릴 수 있는
     * 유일한 경로다. 일반 수정(update)과 분리한 이유는 ProblemCreateRequest 에 departmentId 를
     * 넣지 않기 위해서다 — 그 DTO 에 필드가 생기면 등록 경로에도 위조 표면이 열린다.
     * 컨트롤러에서 총괄 관리자로 제한하므로 여기서는 부서 유효성만 본다.
     */
    @Override
    @Transactional
    public void changeDepartment(Long id, Long departmentId, AuthUser actor) {
        Problem existing = problemDao.findById(id);
        if (existing == null) {
            throw new BizException(ErrorCode.INPUT_VALUE_INVALID, "존재하지 않는 문제입니다.");
        }
        if (departmentId == null) {
            throw new BizException(ErrorCode.INPUT_VALUE_INVALID, "옮길 부서를 선택하세요.");
        }
        Department department = departmentDao.findById(departmentId);
        if (department == null) {
            throw new BizException(ErrorCode.INPUT_VALUE_INVALID, "존재하지 않는 부서입니다.");
        }
        if (department.getStatus() != Status.ACTIVE) {
            throw new BizException(ErrorCode.INPUT_VALUE_INVALID,
                    "비활성 부서로는 옮길 수 없습니다: " + department.getName());
        }

        Long from = existing.getDepartmentId();
        problemDao.updateDepartment(id, departmentId);
        auditLogService.record(actor.getUserId(), "PROBLEM_DEPARTMENT_CHANGED", "PROBLEM", id,
                "{\"from\":" + from + ",\"to\":" + departmentId + "}");
    }
```

`DepartmentDao`가 주입돼 있지 않으면 생성자에 추가하고, `ProblemServiceImplTest`의 생성자 호출도 함께 고친다. import를 확인한다.

```java
import com.daeryun.probank.dao.DepartmentDao;
import com.daeryun.probank.domain.Department;
import com.daeryun.probank.domain.Status;
```

- [x] **Step 5: 통과를 확인한다 (GREEN)**

Run: `cd backend && rtk proxy ./gradlew test --tests "com.daeryun.probank.service.ProblemServiceImplTest" --console=plain`
Expected: `BUILD SUCCESSFUL`

- [x] **Step 6: 엔드포인트를 추가한다**

`backend/src/main/java/com/daeryun/probank/dto/problem/DepartmentChangeRequest.java`:

```java
package com.daeryun.probank.dto.problem;

import lombok.Data;

@Data
public class DepartmentChangeRequest {
    private Long departmentId;
}
```

`ProblemController.java`에 추가한다.

```java
    /**
     * 클래스 애너테이션은 {SUPER_ADMIN, DEPT_ADMIN} 이지만 RoleCheckInterceptor 가 메서드 애너테이션을
     * 먼저 보므로, 이 엔드포인트만 총괄 관리자로 좁혀진다. 부서 이동은 문제의 소유권을 옮기는 행위라
     * 부서 관리자에게 열어 주면 자기 부서 문제를 남의 부서로 던져 버릴 수 있다.
     */
    @RequireRole(UserRole.SUPER_ADMIN)
    @PatchMapping("/{id}/department")
    public ResponseEntity<ResponseDto<?>> changeDepartment(@PathVariable Long id,
                                                            @RequestBody DepartmentChangeRequest request,
                                                            @LoginUser AuthUser actor) {
        problemService.changeDepartment(id, request.getDepartmentId(), actor);
        return ResponseEntity.ok(ResponseDto.ok());
    }
```

import를 추가한다.

```java
import com.daeryun.probank.dto.problem.DepartmentChangeRequest;
```

- [x] **Step 7: 전체 스위트**

Run: `cd backend && rtk proxy ./gradlew test --console=plain`
Expected: `BUILD SUCCESSFUL`, 201 → 203.

- [x] **Step 8: Commit**

```bash
git add backend/src/main/java/com/daeryun/probank/dao/ProblemDao.java backend/src/main/resources/mappers/probank/ProblemMapper.xml backend/src/main/java/com/daeryun/probank/service/ProblemService.java backend/src/main/java/com/daeryun/probank/service/ProblemServiceImpl.java backend/src/main/java/com/daeryun/probank/controller/ProblemController.java backend/src/main/java/com/daeryun/probank/dto/problem/DepartmentChangeRequest.java backend/src/test/java/com/daeryun/probank/service/ProblemServiceImplTest.java
git commit -m "feat: let super admins move a problem to another department"
```

---

### Task 7: 부서 이동 화면

**Files:**
- Modify: `frontend/src/api/client.js` (`apiPatch`가 없을 때만)
- Modify: `frontend/src/api/problems.js`
- Modify: `frontend/src/pages/admin/problems/ProblemFormPage.jsx`

**Interfaces:**
- Consumes: Task 6의 `PATCH /api/admin/problems/{id}/department`, Task 4의 `buildUploadDepartmentField`(옵션 구성 재사용), `useSessionStatus()`
- Produces: 없음 (최종 화면).

**배경:** 수정 화면에 두되 **저장 버튼과 분리한다.** 일반 저장(`PUT`)과 부서 이동(`PATCH`)은 별도 API라, 한 버튼으로 묶으면 한쪽만 성공하는 부분 실패가 생긴다. 총괄 관리자에게만 보인다.

- [x] **Step 1: API 함수를 추가한다**

`frontend/src/api/client.js`에 `apiPatch`가 없으면 `apiPut` 아래에 추가한다.

```javascript
export function apiPatch(path, body) {
  return request(path, { method: "PATCH", body: JSON.stringify(body) });
}
```

`frontend/src/api/problems.js`의 import에 `apiPatch`를 넣고 함수를 추가한다.

```javascript
export function changeProblemDepartment(id, departmentId) {
  return apiPatch(`/api/admin/problems/${id}/department`, { departmentId: Number(departmentId) });
}
```

- [x] **Step 2: 수정 화면에 이동 카드를 넣는다**

`ProblemFormPage.jsx`에 import를 추가한다.

```javascript
import { listDepartments } from "@/api/departments.js";
import { useSessionStatus } from "@/hooks/useSessionStatus.js";
import { buildUploadDepartmentField } from "@/utils/uploadDepartmentField.js";
import Select from "@/components/ui/Select.jsx";
```

`changeProblemDepartment`는 기존 `@/api/problems.js` import 목록에 추가한다.

컴포넌트 본문에 상태를 추가한다. 등록 화면에는 옮길 문제가 없으므로 `id`가 있을 때만 동작한다.

```javascript
  const { session } = useSessionStatus();
  const [departments, setDepartments] = useState([]);
  const [moveDepartmentId, setMoveDepartmentId] = useState("");
  const [moving, setMoving] = useState(false);
  const canMoveDepartment = Boolean(id) && session?.role === "SUPER_ADMIN";

  useEffect(() => {
    if (!canMoveDepartment) {
      return;
    }
    listDepartments().then(setDepartments).catch(() => setDepartments([]));
  }, [canMoveDepartment]);

  async function handleMoveDepartment() {
    if (!moveDepartmentId) {
      toast.error("옮길 부서를 선택하세요.");
      return;
    }
    setMoving(true);
    try {
      await changeProblemDepartment(id, moveDepartmentId);
      toast.success("문제의 귀속 부서를 변경했습니다.");
    } catch (error) {
      toast.error(resolveErrorMessage(error, "부서를 변경하지 못했습니다."));
    } finally {
      setMoving(false);
    }
  }
```

폼 하단(저장 버튼 영역 아래)에 카드를 렌더링한다.

```jsx
      {canMoveDepartment && (
        <Surface className="p-5">
          <p className="text-body font-semibold text-ink-strong">귀속 부서 이동</p>
          <p className="mt-1 text-body-small text-ink-muted">
            이 문제를 다른 부서 소유로 옮깁니다. 위 저장과 별개로 즉시 적용됩니다.
          </p>
          <div className="mt-3 flex items-end gap-3">
            <Select
              id="problem-move-department"
              label="옮길 부서"
              value={moveDepartmentId}
              options={buildUploadDepartmentField({ session, departments }).options}
              onChange={(event) => setMoveDepartmentId(event.target.value)}
              className="w-64"
            />
            <Button type="button" variant="secondary" loading={moving} onClick={handleMoveDepartment}>
              부서 이동
            </Button>
          </div>
        </Surface>
      )}
```

- [x] **Step 3: 테스트와 빌드를 확인한다**

Run: `cd frontend && npm test`
Expected: 184건 전부 통과. 신규 테스트는 없다 — 옵션 구성 로직은 Task 4에서 이미 고정했고 이 Task는 배선뿐이다.

Run: `cd frontend && rtk proxy npm run build`
Expected: 빌드 성공.

- [x] **Step 4: Commit**

```bash
git add frontend/src/api/client.js frontend/src/api/problems.js frontend/src/pages/admin/problems/ProblemFormPage.jsx
git commit -m "feat: add the department move card to the problem edit screen"
```

---

### Task 8: 브라우저 검증

**Files:**
- Modify: `docs/qa/2026-08-09-question-bank-upload-result.md` (검증 결과 추가)

**Interfaces:**
- Consumes: Task 1~7의 수정분
- Produces: 갱신된 QA 문서

**배경:** 서버 테스트는 역할 분기를 증명하지만 화면의 disabled 상태·403 미발생·실제 귀속 결과는 브라우저로만 확인된다. **부서 관리자 계정이 필요하다** — `dev_admin` / `QaPlan3!2026`(정보시스템팀)이 DB에 있다.

- [x] **Step 1: 환경 기동**

```bash
docker start probank-postgres probank-mailhog
cd backend && ./gradlew bootRun     # 8080 점유 확인 후. 기동 로그에서 "Started ProbankApplication" 확인
cd frontend && npm run dev
```

- [x] **Step 2: 총괄 관리자 — 타부서 업로드**

`admin` / `QaAdmin1234!`로 로그인해 `/admin/problems/excel-upload` 진입.

| 확인 | 기대 |
|---|---|
| 귀속 부서 Select | 활성 부서만 보이고 **비활성 부서 없음**, 초기값은 "부서 선택" |
| 부서 미선택 후 업로드 | "부서를 선택하세요" 안내, 업로드되지 않음 |
| `문제_02_기획팀.xlsx`를 **정보시스템팀** 선택 후 업로드 | 61건 성공 |

DB로 귀속을 확인한다.

```sql
SELECT d.name, count(*) FROM problems p JOIN departments d ON d.id = p.department_id
GROUP BY 1 ORDER BY 1;

SELECT target_type, department_id, file_name, success_rows FROM excel_upload_logs ORDER BY id DESC LIMIT 1;

SELECT detail FROM audit_logs WHERE action = 'PROBLEM_EXCEL_UPLOADED' ORDER BY id DESC LIMIT 1;
```

기대: 문제 61건이 정보시스템팀 귀속, `excel_upload_logs.department_id`가 **같은 부서**, 감사 로그 detail에 `departmentId`.

- [x] **Step 3: 부서 관리자 — 고정 확인**

`dev_admin` / `QaPlan3!2026`으로 로그인해 같은 화면 진입.

| 확인 | 기대 |
|---|---|
| Select | **disabled**, 옵션 1개("정보시스템팀") |
| 브라우저 콘솔 | 부서 목록 403 **없음** |
| 업로드 | 자기 부서로 정상 등록 |

- [x] **Step 4: 파라미터 위조 시도 (보안)**

`dev_admin` 세션으로 개발자 도구 콘솔에서 직접 호출한다.

```javascript
const fd = new FormData();
fd.append("file", document.querySelector("#problem-excel-file").files[0]);
await fetch("/api/admin/problems/excel-upload?departmentId=1", { method: "POST", body: fd, credentials: "include" })
  .then((r) => r.json());
```

기대: 요청은 성공하되 **문제가 정보시스템팀에 저장된다**(본사 아님). DB로 확인한다. 본사로 들어가면 **Critical** — 즉시 중단하고 보고한다.

- [x] **Step 5: 부서 이동 확인**

`admin`으로 방금 올린 문제 중 하나의 수정 화면(`/admin/problems/{id}/edit`)에 들어간다.

| 확인 | 기대 |
|---|---|
| "귀속 부서 이동" 카드 | 총괄 관리자에게만 보임 |
| 다른 부서 선택 후 "부서 이동" | 성공 Toast, 목록의 부서 열이 바뀜 |
| `dev_admin`으로 같은 화면 | 카드 **비노출** |
| `dev_admin` 세션으로 `PATCH /api/admin/problems/{id}/department` 직접 호출 | **403 거부** — 통과하면 Critical |

```sql
SELECT detail FROM audit_logs WHERE action = 'PROBLEM_DEPARTMENT_CHANGED' ORDER BY id DESC LIMIT 1;
```

기대: `{"from":1,"to":2}` 형태의 유효한 JSON.

- [x] **Step 6: 결과를 문서에 반영한다**

`docs/qa/2026-08-09-question-bank-upload-result.md` 하단에 `## 부서 지정 기능 검증 (<실행일>)` 절을 추가한다(실행일은 `date +%Y-%m-%d`). Step 2~4의 실제 화면·응답·SQL 결과를 담는다.

- [x] **Step 7: Commit**

```bash
git add docs/qa/2026-08-09-question-bank-upload-result.md
git commit -m "docs: verify department selection on problem excel upload"
```

---

### Task 9: 문서 갱신

**Files:**
- Modify: `docs/PRD.md:33` (용어 정의), `docs/PRD.md:116-127` (섹션 4.2 엑셀 일괄 업로드)
- Modify: `docs/superpowers/plans/2026-07-28-03-problem-bank-management.md` (Architecture 문단)

**Interfaces:**
- Consumes: Task 1~8
- Produces: 갱신된 기준 문서

**배경:** PRD가 *"출제 부서 = 문제를 등록한 관리자의 소속 부서"* 로 못 박고 있어, 이 기능은 현재 문서와 모순된다. 문서를 고치지 않으면 다음 QA가 이 동작을 결함으로 보고한다.

- [x] **Step 1: 용어 정의를 고친다**

`docs/PRD.md:33`을 바꾼다.

```markdown
| 출제 부서 | 문제가 귀속된 부서 (문제의 "소유자" 개념이며, 풀이 접근권한과는 무관). 기본값은 등록한 관리자의 소속 부서이며, **총괄 관리자는 엑셀 일괄 업로드 시 다른 부서를 지정할 수 있다** (등록자는 `created_by`로 따로 남는다) |
```

- [x] **Step 2: 섹션 4.2에 규칙을 추가한다**

`docs/PRD.md`의 "2. **엑셀 일괄 업로드**" 항목 하위에 한 줄을 추가한다.

```markdown
   - 업로드 시 귀속 부서를 지정한다. **총괄 관리자만 선택할 수 있고, 부서 관리자는 자기 부서로 고정된다**(화면에서는 비활성 상태로 표시되며, 서버가 요청 값을 무시하고 소속 부서를 강제한다). 비활성 부서는 지정할 수 없다.
   - 잘못 지정한 경우 **총괄 관리자가 문제 수정 화면에서 귀속 부서를 다른 부서로 옮길 수 있다.** 부서 관리자에게는 열려 있지 않다.
```

- [x] **Step 3: Plan 3 문서의 Architecture를 갱신한다**

`docs/superpowers/plans/2026-07-28-03-problem-bank-management.md`의 Architecture 문단에서 *"문제는 등록한 관리자의 부서에 귀속되지만(`department_id` = 등록자 소속 부서)"* 부분에 단서를 단다.

```markdown
문제는 등록한 관리자의 부서에 귀속된다(`department_id` = 등록자 소속 부서). 다만 엑셀 일괄 업로드에 한해 총괄 관리자가 귀속 부서를 지정할 수 있다 — 상세는 `docs/superpowers/plans/2026-08-09-excel-upload-department-selection.md` 참고.
```

- [x] **Step 4: Commit**

```bash
git add docs/PRD.md docs/superpowers/plans/2026-07-28-03-problem-bank-management.md
git commit -m "docs: allow super admins to pick the owning department in the PRD"
```

---

## 완료 기준

- [x] 백엔드 테스트 194 → **204** 전부 통과 (계획 예측 203 — Task 2 의 MockMvc 테스트가 2건이라 1건 더 늘었다)
- [x] 프론트엔드 테스트 179 → **184** 전부 통과, 프로덕션 빌드 성공
- [x] PRD 용어 정의·섹션 4.2·4.3 과 Plan 3 Architecture 가 실제 동작과 일치

아래는 **Task 8(브라우저 검증)에서 확인한다.** 서버 단위 테스트로는 역할 분기까지만 증명되고, 실제 HTTP 경로·화면 상태·DB 결과는 덮이지 않는다.

- [x] 총괄 관리자가 타부서 명의로 업로드 가능, `excel_upload_logs.department_id`가 문제 귀속과 일치
- [x] 부서 관리자 화면의 Select가 disabled이고 콘솔에 403이 없음
- [x] **부서 관리자가 파라미터를 위조해도 본인 부서로 저장됨** (보안 회귀 방지 — 단위 테스트는 통과, 실제 요청 경로 미확인)
- [x] 총괄 관리자가 수정 화면에서 귀속 부서를 옮길 수 있고, `PROBLEM_DEPARTMENT_CHANGED` 감사 로그가 유효한 JSON 으로 남음
- [x] **부서 관리자가 부서 이동 API 를 직접 호출하면 403** (보안)
