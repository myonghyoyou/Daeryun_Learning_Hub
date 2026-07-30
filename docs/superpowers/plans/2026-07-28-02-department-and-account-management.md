# 문제 은행 Hub — Plan 2: 부서/계정 관리 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 총괄 관리자가 부서를 생성·관리하고, 직원/부서관리자 계정을 개별 등록 또는 엑셀 일괄 등록으로 생성·관리할 수 있게 한다.

**Architecture:** Plan 1에서 구축한 `controller → service → dao → mapper(XML)` 계층과 `@RequireRole` 인터셉터를 그대로 사용한다. 엑셀 파싱은 Apache POI(`poi-ooxml`)로 처리하고, 업로드 이력은 공용 `excel_upload_logs` 테이블에 `target_type='ACCOUNT'`로 기록한다(Plan 3의 문제 업로드는 `target_type='PROBLEM'`으로 같은 테이블을 공유).

**Tech Stack:** Plan 1과 동일 (Spring Boot/MyBatis/PostgreSQL/Apache POI, React/Vite/Tailwind) + `spring-boot-starter-mail`

**전제 조건:** Plan 1이 완료되어 로그인/세션/역할 라우팅이 동작해야 한다.

## Global Constraints

- 부서/계정 관리는 **총괄 관리자(SUPER_ADMIN) 전용**이다 (PRD 섹션 2.2, 4.4).
- 계정 생성 시 임시 비밀번호를 발급하고 `must_change_password = true`로 설정한다 (섹션 3.1).
- 계정 생성/수정/비활성화와 엑셀 업로드는 감사 로그(누가/언제/무엇을) 대상이며, Plan 1의 `AuditLogService`를 통해 `audit_logs`에 저장한다. 비밀번호와 임시 비밀번호는 로그 detail에 기록하지 않는다.
- 엑셀 업로드는 부분 성공을 허용한다 — 실패 행은 등록하지 않고, 성공/실패 건수와 사유를 반환한다 (섹션 4.2).

## Design System Implementation Contract

프론트엔드 부서·계정 관리 화면은 `docs/superpowers/specs/2026-07-29-blue-bento-design-system.md`를 단일 기준으로 사용한다. 대상 화면은 디자인 시스템 8.6 관리자 Shell, 8.10 부서·계정 관리, 9장의 반응형·상태 규칙이다.

- 관리자 화면은 `220px Sidebar + 76px Topbar + PageContent` 구조와 컴팩트한 밀도를 사용한다. 부서 관리자는 권한 없는 부서·계정 메뉴를 숨기고, 총괄 관리자에게만 해당 메뉴를 노출한다.
- 관리자 화면은 장식적인 Bento 카드를 반복하지 않고 목록·필터·작업 영역을 우선한다. 표, 입력 폼, Modal, Toast, Badge는 디자인 시스템의 공통 토큰과 컴포넌트 규칙을 따른다.
- 부서 목록·생성·수정, 계정 목록·생성·수정, 계정 엑셀 업로드 화면에 로딩, 빈 목록, 필드 검증, 저장 성공·실패, 세션 만료 상태를 구현한다. 엑셀은 부분 성공 요약과 행별 오류를 별도로 표시한다.
- 모바일에서는 관리자 화면을 렌더링하지 않고 `/solve`로 리다이렉트한다. PC 1440×1024와 모바일 390×844에서 라우팅·메뉴 차단을 확인한다.
- 업로드 이력 조회·다운로드 화면은 현재 범위에 포함하지 않는다. 해당 화면을 임의로 추가하지 않고 `excel_upload_logs` 저장 API 계약만 유지한다.
- 완료 기준에는 화면별 Design QA, 키보드 접근, 포커스 표시, 오류 메시지의 인라인 표시, 확인 Modal의 대상·영향·취소·확정 문구 검증을 포함한다.

## Approved Amendments (2026-07-29)

- 사용자 생성·수정·조회 DTO와 DB에 `email`(회사 이메일)을 포함한다. 신규 계정 생성과 계정 엑셀 템플릿의 이메일은 필수값이다.
- 계정 생성 시 생성한 임시 비밀번호를 사용자 회사 이메일로 발송한다. 개별 등록은 발송 성공 여부를 결과에 포함하고, 엑셀 등록은 행별 메일 발송 실패를 해당 행 실패로 처리한다.
- 계정 엑셀 템플릿은 `사번 | 이름 | 회사이메일 | 부서코드 | 역할`이다. 임시 비밀번호는 API 응답이나 업로드 결과 파일에 평문으로 포함하지 않는다.
- 부서·계정 생성/수정/비활성화와 계정 엑셀 업로드는 `audit_logs`에 실제 DB 감사 로그를 남긴다.
- 엑셀 업로드 이력은 `excel_upload_logs`에 저장한다. 이력 조회 API·화면 및 다운로드 형식은 실제 템플릿 확정 후 별도 계획으로 결정한다.

### Task 계약 보완 — 아래 계약을 본문의 기존 예시보다 우선 적용

- `UserCreateRequest`는 `employeeNo`, `name`, `email`, `departmentId`, `role`을 가진다. `UserUpdateRequest`에도 `email`을 포함하고, 회사 이메일 형식·공백·중복(`UserDao.existsByEmail`)을 검증한다.
- `UserCreateResponse`는 `employeeNo`, `name`, `email`, `mailSent`만 반환한다. 임시 비밀번호는 응답·로그·엑셀 결과에 절대 포함하지 않는다.
- `MailService.sendTemporaryPassword(String email, String employeeNo, String temporaryPassword)`를 추가한다. SMTP 발송 실패는 개별 등록 요청 실패로 처리하고, 엑셀은 해당 행 실패로 처리한다. 엑셀 각 행은 독립 트랜잭션으로 처리하여 메일 발송 실패 행의 계정은 커밋하지 않는다.
- 생성/수정/비활성화/엑셀 업로드 서비스 메서드는 `AuthUser actor`를 받아 `AuditLogService.record(...)`를 호출한다. 감사 detail에는 대상 식별자와 변경 요약만 남긴다.
- 부서 생성/수정 서비스도 `create(DepartmentCreateRequest request, AuthUser actor)`, `update(Long id, DepartmentUpdateRequest request, AuthUser actor)` 계약을 사용하며 생성·수정·상태 변경마다 감사 로그를 기록한다.
- 계정 엑셀 컬럼 인덱스는 `0 사번 | 1 이름 | 2 회사이메일 | 3 부서코드 | 4 역할`이며, 빈 값·이메일 중복·사번 중복은 해당 행 실패다.
- 업로드 이력은 저장까지만 구현한다. 이력 목록/화면/다운로드 API 및 결과 파일 템플릿은 실제 엑셀 템플릿 확정 후 별도 Plan으로 결정한다.
- 엑셀 행별 영속화는 `AccountProvisioningService.provision(User, String, Long)`의 `@Transactional(propagation = REQUIRES_NEW)`에서 수행한다. 이 메서드는 사용자 INSERT → 메일 발송 → 감사 로그를 한 트랜잭션으로 처리하고, 예외 발생 시 해당 행만 롤백한다. 업로드 서비스는 예외를 행 실패로 변환한다.

`MailService` 최소 계약:
```java
public interface MailService {
    void sendTemporaryPassword(String email, String employeeNo, String temporaryPassword);
}
```
`MailServiceImpl`은 `JavaMailSender`로 회사 메일 SMTP를 사용하고, 제목/본문에 사번·임시 비밀번호·최초 로그인 시 비밀번호 변경 안내만 포함한다. 비밀번호는 DB/감사 로그에 평문으로 저장하지 않는다.

`AccountProvisioningService` 최소 계약:
```java
public interface AccountProvisioningService {
    void provision(User user, String temporaryPassword, Long actorId);
}
```
구현 메서드에는 `@Transactional(propagation = Propagation.REQUIRES_NEW)`를 붙이고, `userDao.insert(user)` 후 `mailService.sendTemporaryPassword(...)`, `auditLogService.record(...)` 순서로 호출한다. `ExcelAccountUploadServiceImpl`은 이 서비스를 호출하며 직접 INSERT하지 않는다.

---

## Part 1 — 백엔드: 부서 관리

### Task 1: 부서 CRUD API

**Files:**
- Modify: `backend/src/main/java/com/daeryun/probank/dao/DepartmentDao.java`
- Modify: `backend/src/main/resources/mappers/probank/DepartmentMapper.xml`
- Create: `backend/src/main/java/com/daeryun/probank/dto/department/DepartmentCreateRequest.java`
- Create: `backend/src/main/java/com/daeryun/probank/dto/department/DepartmentUpdateRequest.java`
- Create: `backend/src/main/java/com/daeryun/probank/dto/department/DepartmentResponse.java`
- Create: `backend/src/main/java/com/daeryun/probank/service/DepartmentService.java`
- Create: `backend/src/main/java/com/daeryun/probank/service/DepartmentServiceImpl.java`
- Create: `backend/src/main/java/com/daeryun/probank/controller/DepartmentController.java`
- Test: `backend/src/test/java/com/daeryun/probank/service/DepartmentServiceImplTest.java`

**Interfaces:**
- Consumes: `DepartmentDao`(Plan 1 Task 5), `BizException`/`ErrorCode`(Plan 1 Task 3), `@RequireRole`(Plan 1 Task 10)
- Produces: `GET /api/admin/departments`, `POST /api/admin/departments`, `PUT /api/admin/departments/{id}`. `DepartmentService.list/create/update`. Task 2(계정 관리), Task 5(프론트 부서 화면), Plan 3(문제 등록 시 부서 검증)이 사용한다.

- [ ] **Step 1: 실패하는 서비스 테스트 작성**

`backend/src/test/java/com/daeryun/probank/service/DepartmentServiceImplTest.java`:
```java
package com.daeryun.probank.service;

import com.daeryun.probank.dao.DepartmentDao;
import com.daeryun.probank.domain.Department;
import com.daeryun.probank.domain.Status;
import com.daeryun.probank.domain.UserRole;
import com.daeryun.probank.dto.department.DepartmentCreateRequest;
import com.daeryun.probank.dto.department.DepartmentResponse;
import com.daeryun.probank.dto.department.DepartmentUpdateRequest;
import com.daeryun.probank.common.AuthUser;
import com.daeryun.probank.exception.BizException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.mockito.Mockito;

import java.util.Collections;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

class DepartmentServiceImplTest {

    private DepartmentDao departmentDao;
    private DepartmentServiceImpl service;
    private AuthUser actor;

    @BeforeEach
    void setUp() {
        departmentDao = Mockito.mock(DepartmentDao.class);
        service = new DepartmentServiceImpl(departmentDao, Mockito.mock(AuditLogService.class));
        actor = new AuthUser(1L, "admin", "관리자", UserRole.SUPER_ADMIN, null, false);
    }

    @Test
    void create_withNewCode_insertsDepartment() {
        Mockito.when(departmentDao.findByCode("DEV")).thenReturn(null);
        DepartmentCreateRequest request = new DepartmentCreateRequest();
        request.setName("개발팀");
        request.setCode("DEV");

        service.create(request, actor);

        ArgumentCaptor<Department> captor = ArgumentCaptor.forClass(Department.class);
        Mockito.verify(departmentDao).insert(captor.capture());
        assertEquals("개발팀", captor.getValue().getName());
        assertEquals(Status.ACTIVE, captor.getValue().getStatus());
    }

    @Test
    void create_withDuplicateCode_throwsBizException() {
        Department existing = new Department();
        existing.setCode("DEV");
        Mockito.when(departmentDao.findByCode("DEV")).thenReturn(existing);
        DepartmentCreateRequest request = new DepartmentCreateRequest();
        request.setName("개발팀");
        request.setCode("DEV");

        assertThrows(BizException.class, () -> service.create(request, actor));
        Mockito.verify(departmentDao, Mockito.never()).insert(Mockito.any());
    }

    @Test
    void update_changesNameAndStatus() {
        Department existing = new Department();
        existing.setId(1L);
        existing.setName("개발팀");
        existing.setCode("DEV");
        existing.setStatus(Status.ACTIVE);
        Mockito.when(departmentDao.findById(1L)).thenReturn(existing);

        DepartmentUpdateRequest request = new DepartmentUpdateRequest();
        request.setName("개발본부");
        request.setStatus(Status.INACTIVE);

        service.update(1L, request, actor);

        ArgumentCaptor<Department> captor = ArgumentCaptor.forClass(Department.class);
        Mockito.verify(departmentDao).update(captor.capture());
        assertEquals("개발본부", captor.getValue().getName());
        assertEquals(Status.INACTIVE, captor.getValue().getStatus());
    }

    @Test
    void list_mapsToResponse() {
        Department department = new Department();
        department.setId(1L);
        department.setName("개발팀");
        department.setCode("DEV");
        department.setStatus(Status.ACTIVE);
        Mockito.when(departmentDao.findAll()).thenReturn(Collections.singletonList(department));

        List<DepartmentResponse> responses = service.list();

        assertEquals(1, responses.size());
        assertEquals("DEV", responses.get(0).getCode());
    }
}
```

- [ ] **Step 2: 테스트 실행하여 실패 확인**

Run: `cd backend && ./gradlew test --tests DepartmentServiceImplTest`
Expected: FAIL — `DepartmentDao.findById/findAll/update`, DTO 클래스, `DepartmentServiceImpl`이 없어 컴파일 오류

- [ ] **Step 3: Dao 확장**

`DepartmentDao`에 메서드 추가:
```java
    Department findById(Long id);
    java.util.List<Department> findAll();
    void update(Department department);
```

`DepartmentMapper.xml`에 추가:
```xml
    <select id="findById" resultType="Department">
        SELECT id, name, code, status, created_at FROM departments WHERE id = #{id}
    </select>

    <select id="findAll" resultType="Department">
        SELECT id, name, code, status, created_at FROM departments ORDER BY name
    </select>

    <update id="update" parameterType="Department">
        UPDATE departments SET name = #{name}, status = #{status} WHERE id = #{id}
    </update>
```

- [ ] **Step 4: DTO/Service/Controller 구현**

`backend/src/main/java/com/daeryun/probank/dto/department/DepartmentCreateRequest.java`:
```java
package com.daeryun.probank.dto.department;

import lombok.Data;

@Data
public class DepartmentCreateRequest {
    private String name;
    private String code;
}
```

`backend/src/main/java/com/daeryun/probank/dto/department/DepartmentUpdateRequest.java`:
```java
package com.daeryun.probank.dto.department;

import com.daeryun.probank.domain.Status;
import lombok.Data;

@Data
public class DepartmentUpdateRequest {
    private String name;
    private Status status;
}
```

`backend/src/main/java/com/daeryun/probank/dto/department/DepartmentResponse.java`:
```java
package com.daeryun.probank.dto.department;

import com.daeryun.probank.domain.Department;
import com.daeryun.probank.domain.Status;
import lombok.AllArgsConstructor;
import lombok.Data;

@Data
@AllArgsConstructor
public class DepartmentResponse {
    private Long id;
    private String name;
    private String code;
    private Status status;

    public static DepartmentResponse from(Department department) {
        return new DepartmentResponse(department.getId(), department.getName(), department.getCode(), department.getStatus());
    }
}
```

`backend/src/main/java/com/daeryun/probank/service/DepartmentService.java`:
```java
package com.daeryun.probank.service;

import com.daeryun.probank.common.AuthUser;
import com.daeryun.probank.dto.department.DepartmentCreateRequest;
import com.daeryun.probank.dto.department.DepartmentResponse;
import com.daeryun.probank.dto.department.DepartmentUpdateRequest;

import java.util.List;

public interface DepartmentService {
    List<DepartmentResponse> list();
    void create(DepartmentCreateRequest request, AuthUser actor);
    void update(Long id, DepartmentUpdateRequest request, AuthUser actor);
}
```

`backend/src/main/java/com/daeryun/probank/service/DepartmentServiceImpl.java`:
```java
package com.daeryun.probank.service;

import com.daeryun.probank.common.ErrorCode;
import com.daeryun.probank.common.AuthUser;
import com.daeryun.probank.dao.DepartmentDao;
import com.daeryun.probank.domain.Department;
import com.daeryun.probank.domain.Status;
import com.daeryun.probank.dto.department.DepartmentCreateRequest;
import com.daeryun.probank.dto.department.DepartmentResponse;
import com.daeryun.probank.dto.department.DepartmentUpdateRequest;
import com.daeryun.probank.exception.BizException;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.stream.Collectors;

@Service
public class DepartmentServiceImpl implements DepartmentService {

    private final DepartmentDao departmentDao;
    private final AuditLogService auditLogService;

    public DepartmentServiceImpl(DepartmentDao departmentDao, AuditLogService auditLogService) {
        this.departmentDao = departmentDao;
        this.auditLogService = auditLogService;
    }

    @Override
    public List<DepartmentResponse> list() {
        return departmentDao.findAll().stream().map(DepartmentResponse::from).collect(Collectors.toList());
    }

    @Override
    public void create(DepartmentCreateRequest request, AuthUser actor) {
        if (departmentDao.findByCode(request.getCode()) != null) {
            throw new BizException(ErrorCode.INPUT_VALUE_INVALID, "이미 존재하는 부서 코드입니다: " + request.getCode());
        }
        Department department = new Department();
        department.setName(request.getName());
        department.setCode(request.getCode());
        department.setStatus(Status.ACTIVE);
        departmentDao.insert(department);
        auditLogService.record(actor.getUserId(), "DEPARTMENT_CREATED", "DEPARTMENT", department.getId(),
                "{\"code\":\"" + department.getCode() + "\"}");
    }

    @Override
    public void update(Long id, DepartmentUpdateRequest request, AuthUser actor) {
        Department department = departmentDao.findById(id);
        if (department == null) {
            throw new BizException(ErrorCode.INPUT_VALUE_INVALID, "존재하지 않는 부서입니다.");
        }
        department.setName(request.getName());
        department.setStatus(request.getStatus());
        departmentDao.update(department);
        auditLogService.record(actor.getUserId(), "DEPARTMENT_UPDATED", "DEPARTMENT", id,
                "{\"code\":\"" + department.getCode() + "\"}");
    }
}
```

`backend/src/main/java/com/daeryun/probank/controller/DepartmentController.java`:
```java
package com.daeryun.probank.controller;

import com.daeryun.probank.common.AuthUser;
import com.daeryun.probank.common.RequireRole;
import com.daeryun.probank.common.ResponseDto;
import com.daeryun.probank.common.SessionKeys;
import com.daeryun.probank.domain.UserRole;
import com.daeryun.probank.dto.department.DepartmentCreateRequest;
import com.daeryun.probank.dto.department.DepartmentUpdateRequest;
import com.daeryun.probank.service.DepartmentService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import javax.servlet.http.HttpServletRequest;

@RestController
@RequestMapping("/api/admin/departments")
@RequireRole(UserRole.SUPER_ADMIN)
public class DepartmentController {

    private final DepartmentService departmentService;

    public DepartmentController(DepartmentService departmentService) {
        this.departmentService = departmentService;
    }

    @GetMapping
    public ResponseEntity<ResponseDto<?>> list() {
        return ResponseEntity.ok(ResponseDto.ok(departmentService.list()));
    }

    @PostMapping
    public ResponseEntity<ResponseDto<?>> create(@RequestBody DepartmentCreateRequest request,
                                                   HttpServletRequest httpRequest) {
        AuthUser actor = (AuthUser) httpRequest.getSession().getAttribute(SessionKeys.LOGIN_USER);
        departmentService.create(request, actor);
        return ResponseEntity.ok(ResponseDto.ok());
    }

    @PutMapping("/{id}")
    public ResponseEntity<ResponseDto<?>> update(@PathVariable Long id, @RequestBody DepartmentUpdateRequest request,
                                                   HttpServletRequest httpRequest) {
        AuthUser actor = (AuthUser) httpRequest.getSession().getAttribute(SessionKeys.LOGIN_USER);
        departmentService.update(id, request, actor);
        return ResponseEntity.ok(ResponseDto.ok());
    }
}
```

- [ ] **Step 5: 테스트 실행하여 통과 확인**

Run: `cd backend && ./gradlew test --tests DepartmentServiceImplTest`
Expected: `BUILD SUCCESSFUL`, 4 tests 통과

- [ ] **Step 6: Commit**

```bash
git add backend/src/main/java/com/daeryun/probank/dao/DepartmentDao.java backend/src/main/resources/mappers/probank/DepartmentMapper.xml backend/src/main/java/com/daeryun/probank/dto/department backend/src/main/java/com/daeryun/probank/service/DepartmentService.java backend/src/main/java/com/daeryun/probank/service/DepartmentServiceImpl.java backend/src/main/java/com/daeryun/probank/controller/DepartmentController.java backend/src/test/java/com/daeryun/probank/service/DepartmentServiceImplTest.java
git commit -m "feat: add department CRUD API"
```

---

## Part 2 — 백엔드: 계정 관리

### Task 2: 계정(User) 개별 CRUD API

**Files:**
- Modify: `backend/src/main/java/com/daeryun/probank/dao/UserDao.java`
- Modify: `backend/src/main/resources/mappers/probank/UserMapper.xml`
- Create: `backend/src/main/java/com/daeryun/probank/dto/user/UserListItem.java`
- Create: `backend/src/main/java/com/daeryun/probank/dto/user/UserCreateRequest.java`
- Create: `backend/src/main/java/com/daeryun/probank/dto/user/UserCreateResponse.java`
- Create: `backend/src/main/java/com/daeryun/probank/dto/user/UserUpdateRequest.java`
- Create: `backend/src/main/java/com/daeryun/probank/service/UserAdminService.java`
- Create: `backend/src/main/java/com/daeryun/probank/service/UserAdminServiceImpl.java`
- Create: `backend/src/main/java/com/daeryun/probank/service/MailService.java`
- Create: `backend/src/main/java/com/daeryun/probank/service/MailServiceImpl.java`
- Create: `backend/src/main/java/com/daeryun/probank/controller/UserAdminController.java`
- Test: `backend/src/test/java/com/daeryun/probank/service/UserAdminServiceImplTest.java`

**Interfaces:**
- Consumes: `UserDao`, `DepartmentDao`(Plan 1 Task 5, Task 1), `PasswordEncoder`(Plan 1 Task 5), `MailService`, `AuditLogService`
- Produces: `GET /api/admin/users?departmentId=`, `POST /api/admin/users`, `PUT /api/admin/users/{id}`. `UserAdminService.generateTempPassword() : String` — Task 4(엑셀 업로드)가 재사용한다. 생성/수정 API는 세션의 `AuthUser`를 서비스까지 전달한다.

- [ ] **Step 1: 실패하는 서비스 테스트 작성**

`backend/src/test/java/com/daeryun/probank/service/UserAdminServiceImplTest.java`:
```java
package com.daeryun.probank.service;

import com.daeryun.probank.dao.DepartmentDao;
import com.daeryun.probank.dao.UserDao;
import com.daeryun.probank.domain.Department;
import com.daeryun.probank.domain.Status;
import com.daeryun.probank.domain.User;
import com.daeryun.probank.domain.UserRole;
import com.daeryun.probank.dto.user.UserCreateRequest;
import com.daeryun.probank.dto.user.UserCreateResponse;
import com.daeryun.probank.dto.user.UserUpdateRequest;
import com.daeryun.probank.common.AuthUser;
import com.daeryun.probank.exception.BizException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.mockito.Mockito;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;

import static org.junit.jupiter.api.Assertions.*;

class UserAdminServiceImplTest {

    private UserDao userDao;
    private DepartmentDao departmentDao;
    private UserAdminServiceImpl service;
    private AuthUser actor;

    @BeforeEach
    void setUp() {
        userDao = Mockito.mock(UserDao.class);
        departmentDao = Mockito.mock(DepartmentDao.class);
        MailService mailService = Mockito.mock(MailService.class);
        AuditLogService auditLogService = Mockito.mock(AuditLogService.class);
        service = new UserAdminServiceImpl(userDao, departmentDao, new BCryptPasswordEncoder(),
                mailService, auditLogService);
        actor = new AuthUser(1L, "admin", "관리자", UserRole.SUPER_ADMIN, null, false);
    }

    @Test
    void create_withExistingDepartment_insertsUserWithTempPassword() {
        Department department = new Department();
        department.setId(10L);
        Mockito.when(departmentDao.findById(10L)).thenReturn(department);
        Mockito.when(userDao.existsByEmployeeNo("2001")).thenReturn(false);

        UserCreateRequest request = new UserCreateRequest();
        request.setEmployeeNo("2001");
        request.setName("김철수");
        request.setEmail("kim@company.com");
        request.setDepartmentId(10L);
        request.setRole(UserRole.EMPLOYEE);

        UserCreateResponse response = service.create(request, actor);

        ArgumentCaptor<User> captor = ArgumentCaptor.forClass(User.class);
        Mockito.verify(userDao).insert(captor.capture());
        assertEquals("2001", captor.getValue().getEmployeeNo());
        assertTrue(captor.getValue().isMustChangePassword());
        assertEquals("2001", response.getEmployeeNo());
        assertEquals("kim@company.com", response.getEmail());
        assertTrue(response.isMailSent());
    }

    @Test
    void create_withDuplicateEmployeeNo_throwsBizException() {
        Mockito.when(userDao.existsByEmployeeNo("2001")).thenReturn(true);
        UserCreateRequest request = new UserCreateRequest();
        request.setEmployeeNo("2001");
        request.setName("김철수");
        request.setEmail("kim@company.com");
        request.setDepartmentId(10L);
        request.setRole(UserRole.EMPLOYEE);

        assertThrows(BizException.class, () -> service.create(request, actor));
    }

    @Test
    void create_withUnknownDepartment_throwsBizException() {
        Mockito.when(userDao.existsByEmployeeNo("2001")).thenReturn(false);
        Mockito.when(departmentDao.findById(99L)).thenReturn(null);
        UserCreateRequest request = new UserCreateRequest();
        request.setEmployeeNo("2001");
        request.setName("김철수");
        request.setEmail("kim@company.com");
        request.setDepartmentId(99L);
        request.setRole(UserRole.EMPLOYEE);

        assertThrows(BizException.class, () -> service.create(request, actor));
    }

    @Test
    void update_changesDepartmentRoleAndStatus() {
        User existing = new User();
        existing.setId(5L);
        existing.setEmployeeNo("2001");
        existing.setRole(UserRole.EMPLOYEE);
        existing.setStatus(Status.ACTIVE);
        Mockito.when(userDao.findById(5L)).thenReturn(existing);
        Department department = new Department();
        department.setId(20L);
        Mockito.when(departmentDao.findById(20L)).thenReturn(department);

        UserUpdateRequest request = new UserUpdateRequest();
        request.setName("김철수2");
        request.setEmail("kim2@company.com");
        request.setDepartmentId(20L);
        request.setRole(UserRole.DEPT_ADMIN);
        request.setStatus(Status.INACTIVE);

        existing.setEmail("kim@company.com");
        service.update(5L, request, actor);

        ArgumentCaptor<User> captor = ArgumentCaptor.forClass(User.class);
        Mockito.verify(userDao).update(captor.capture());
        assertEquals(UserRole.DEPT_ADMIN, captor.getValue().getRole());
        assertEquals(Status.INACTIVE, captor.getValue().getStatus());
        assertEquals(20L, captor.getValue().getDepartmentId());
    }
}
```

- [ ] **Step 2: 테스트 실행하여 실패 확인**

Run: `cd backend && ./gradlew test --tests UserAdminServiceImplTest`
Expected: FAIL — 관련 클래스가 없어 컴파일 오류

- [ ] **Step 3: Dao 확장**

`UserDao`에 메서드 추가:
```java
    boolean existsByEmployeeNo(@Param("employeeNo") String employeeNo);
    boolean existsByEmail(@Param("email") String email);
    User findById(@Param("id") Long id);
    java.util.List<com.daeryun.probank.dto.user.UserListItem> findAll(@Param("departmentId") Long departmentId);
    void update(User user);
```

`UserMapper.xml`에 추가:
```xml
    <select id="existsByEmployeeNo" resultType="boolean">
        SELECT EXISTS (SELECT 1 FROM users WHERE employee_no = #{employeeNo})
    </select>

    <select id="findById" resultType="User">
        SELECT id, employee_no, name, email, password_hash, department_id, role, status,
               must_change_password, failed_login_count, locked_until, last_login_at, created_at
        FROM users WHERE id = #{id}
    </select>

    <select id="findAll" resultType="com.daeryun.probank.dto.user.UserListItem">
        SELECT u.id, u.employee_no, u.name, u.email, u.department_id, d.name AS department_name,
               u.role, u.status, u.last_login_at
        FROM users u
        JOIN departments d ON d.id = u.department_id
        <where>
            <if test="departmentId != null">AND u.department_id = #{departmentId}</if>
        </where>
        ORDER BY u.employee_no
    </select>

    <select id="existsByEmail" resultType="boolean">
        SELECT EXISTS (SELECT 1 FROM users WHERE lower(email) = lower(#{email}))
    </select>

    <update id="update" parameterType="User">
        UPDATE users
        SET name = #{name}, email = #{email}, department_id = #{departmentId}, role = #{role}, status = #{status}
        WHERE id = #{id}
    </update>
```

- [ ] **Step 4: DTO/Service/Controller 구현**

`backend/src/main/java/com/daeryun/probank/dto/user/UserListItem.java`:
```java
package com.daeryun.probank.dto.user;

import com.daeryun.probank.domain.Status;
import com.daeryun.probank.domain.UserRole;
import lombok.Data;

import java.time.LocalDateTime;

@Data
public class UserListItem {
    private Long id;
    private String employeeNo;
    private String name;
    private String email;
    private Long departmentId;
    private String departmentName;
    private UserRole role;
    private Status status;
    private LocalDateTime lastLoginAt;
}
```

`backend/src/main/java/com/daeryun/probank/dto/user/UserCreateRequest.java`:
```java
package com.daeryun.probank.dto.user;

import com.daeryun.probank.domain.UserRole;
import lombok.Data;

@Data
public class UserCreateRequest {
    private String employeeNo;
    private String name;
    private String email;
    private Long departmentId;
    private UserRole role;
}
```

`backend/src/main/java/com/daeryun/probank/dto/user/UserCreateResponse.java`:
```java
package com.daeryun.probank.dto.user;

import lombok.AllArgsConstructor;
import lombok.Data;

@Data
@AllArgsConstructor
public class UserCreateResponse {
    private String employeeNo;
    private String name;
    private String email;
    private boolean mailSent;
}
```

`backend/src/main/java/com/daeryun/probank/dto/user/UserUpdateRequest.java`:
```java
package com.daeryun.probank.dto.user;

import com.daeryun.probank.domain.Status;
import com.daeryun.probank.domain.UserRole;
import lombok.Data;

@Data
public class UserUpdateRequest {
    private String name;
    private String email;
    private Long departmentId;
    private UserRole role;
    private Status status;
}
```

`backend/src/main/java/com/daeryun/probank/service/UserAdminService.java`:
```java
package com.daeryun.probank.service;

import com.daeryun.probank.dto.user.UserCreateRequest;
import com.daeryun.probank.dto.user.UserCreateResponse;
import com.daeryun.probank.dto.user.UserListItem;
import com.daeryun.probank.dto.user.UserUpdateRequest;

import java.util.List;

public interface UserAdminService {
    List<UserListItem> list(Long departmentId);
    UserCreateResponse create(UserCreateRequest request, AuthUser actor);
    void update(Long id, UserUpdateRequest request, AuthUser actor);
    String generateTempPassword();
}
```

`backend/src/main/java/com/daeryun/probank/service/UserAdminServiceImpl.java`:
```java
package com.daeryun.probank.service;

import com.daeryun.probank.common.ErrorCode;
import com.daeryun.probank.dao.DepartmentDao;
import com.daeryun.probank.dao.UserDao;
import com.daeryun.probank.domain.Department;
import com.daeryun.probank.domain.Status;
import com.daeryun.probank.domain.User;
import com.daeryun.probank.dto.user.*;
import com.daeryun.probank.exception.BizException;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;

import java.security.SecureRandom;
import java.util.List;

@Service
public class UserAdminServiceImpl implements UserAdminService {

    private static final String TEMP_PASSWORD_CHARS = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
    private static final int TEMP_PASSWORD_LENGTH = 10;
    private final SecureRandom random = new SecureRandom();

    private final UserDao userDao;
    private final DepartmentDao departmentDao;
    private final PasswordEncoder passwordEncoder;
    private final MailService mailService;
    private final AuditLogService auditLogService;

    public UserAdminServiceImpl(UserDao userDao, DepartmentDao departmentDao, PasswordEncoder passwordEncoder,
                                MailService mailService, AuditLogService auditLogService) {
        this.userDao = userDao;
        this.departmentDao = departmentDao;
        this.passwordEncoder = passwordEncoder;
        this.mailService = mailService;
        this.auditLogService = auditLogService;
    }

    @Override
    public List<UserListItem> list(Long departmentId) {
        return userDao.findAll(departmentId);
    }

    @Override
    public UserCreateResponse create(UserCreateRequest request, AuthUser actor) {
        validateEmail(request.getEmail());
        if (userDao.existsByEmployeeNo(request.getEmployeeNo())) {
            throw new BizException(ErrorCode.INPUT_VALUE_INVALID, "이미 존재하는 사번입니다: " + request.getEmployeeNo());
        }
        if (userDao.existsByEmail(request.getEmail())) {
            throw new BizException(ErrorCode.INPUT_VALUE_INVALID, "이미 사용 중인 회사 이메일입니다: " + request.getEmail());
        }
        Department department = departmentDao.findById(request.getDepartmentId());
        if (department == null) {
            throw new BizException(ErrorCode.INPUT_VALUE_INVALID, "존재하지 않는 부서입니다.");
        }

        String tempPassword = generateTempPassword();
        mailService.sendTemporaryPassword(request.getEmail(), request.getEmployeeNo(), tempPassword);
        User user = new User();
        user.setEmployeeNo(request.getEmployeeNo());
        user.setName(request.getName());
        user.setEmail(request.getEmail());
        user.setPasswordHash(passwordEncoder.encode(tempPassword));
        user.setDepartmentId(department.getId());
        user.setRole(request.getRole());
        user.setStatus(Status.ACTIVE);
        user.setMustChangePassword(true);
        userDao.insert(user);
        auditLogService.record(actor.getUserId(), "USER_CREATED", "USER", user.getId(),
                "{\"employeeNo\":\"" + user.getEmployeeNo() + "\"}");

        return new UserCreateResponse(user.getEmployeeNo(), user.getName(), user.getEmail(), true);
    }

    @Override
    public void update(Long id, UserUpdateRequest request, AuthUser actor) {
        validateEmail(request.getEmail());
        User user = userDao.findById(id);
        if (user == null) {
            throw new BizException(ErrorCode.INPUT_VALUE_INVALID, "존재하지 않는 계정입니다.");
        }
        if (departmentDao.findById(request.getDepartmentId()) == null) {
            throw new BizException(ErrorCode.INPUT_VALUE_INVALID, "존재하지 않는 부서입니다.");
        }
        if (!request.getEmail().equals(user.getEmail()) && userDao.existsByEmail(request.getEmail())) {
            throw new BizException(ErrorCode.INPUT_VALUE_INVALID, "이미 사용 중인 회사 이메일입니다: " + request.getEmail());
        }
        user.setName(request.getName());
        user.setEmail(request.getEmail());
        user.setDepartmentId(request.getDepartmentId());
        user.setRole(request.getRole());
        user.setStatus(request.getStatus());
        userDao.update(user);
        auditLogService.record(actor.getUserId(), "USER_UPDATED", "USER", id,
                "{\"employeeNo\":\"" + user.getEmployeeNo() + "\"}");
    }

    @Override
    public String generateTempPassword() {
        StringBuilder builder = new StringBuilder(TEMP_PASSWORD_LENGTH);
        for (int i = 0; i < TEMP_PASSWORD_LENGTH; i++) {
            builder.append(TEMP_PASSWORD_CHARS.charAt(random.nextInt(TEMP_PASSWORD_CHARS.length())));
        }
        return builder.toString();
    }

    private void validateEmail(String email) {
        if (email == null || !email.trim().matches("^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$")) {
            throw new BizException(ErrorCode.INPUT_VALUE_INVALID, "유효한 회사 이메일을 입력하세요.");
        }
    }
}
```

`backend/src/main/java/com/daeryun/probank/controller/UserAdminController.java`:
```java
package com.daeryun.probank.controller;

import com.daeryun.probank.common.AuthUser;
import com.daeryun.probank.common.RequireRole;
import com.daeryun.probank.common.ResponseDto;
import com.daeryun.probank.common.SessionKeys;
import com.daeryun.probank.domain.UserRole;
import com.daeryun.probank.dto.user.UserCreateRequest;
import com.daeryun.probank.dto.user.UserUpdateRequest;
import com.daeryun.probank.service.UserAdminService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import javax.servlet.http.HttpServletRequest;

@RestController
@RequestMapping("/api/admin/users")
@RequireRole(UserRole.SUPER_ADMIN)
public class UserAdminController {

    private final UserAdminService userAdminService;

    public UserAdminController(UserAdminService userAdminService) {
        this.userAdminService = userAdminService;
    }

    @GetMapping
    public ResponseEntity<ResponseDto<?>> list(@RequestParam(required = false) Long departmentId) {
        return ResponseEntity.ok(ResponseDto.ok(userAdminService.list(departmentId)));
    }

    @PostMapping
    public ResponseEntity<ResponseDto<?>> create(@RequestBody UserCreateRequest request,
                                                   HttpServletRequest httpRequest) {
        AuthUser actor = (AuthUser) httpRequest.getSession().getAttribute(SessionKeys.LOGIN_USER);
        return ResponseEntity.ok(ResponseDto.ok(userAdminService.create(request, actor)));
    }

    @PutMapping("/{id}")
    public ResponseEntity<ResponseDto<?>> update(@PathVariable Long id, @RequestBody UserUpdateRequest request,
                                                   HttpServletRequest httpRequest) {
        AuthUser actor = (AuthUser) httpRequest.getSession().getAttribute(SessionKeys.LOGIN_USER);
        userAdminService.update(id, request, actor);
        return ResponseEntity.ok(ResponseDto.ok());
    }
}
```

- [ ] **Step 5: 테스트 실행하여 통과 확인**

Run: `cd backend && ./gradlew test --tests UserAdminServiceImplTest`
Expected: `BUILD SUCCESSFUL`, 4 tests 통과

- [ ] **Step 6: Commit**

```bash
git add backend/src/main/java/com/daeryun/probank/dao/UserDao.java backend/src/main/resources/mappers/probank/UserMapper.xml backend/src/main/java/com/daeryun/probank/dto/user backend/src/main/java/com/daeryun/probank/service/UserAdminService.java backend/src/main/java/com/daeryun/probank/service/UserAdminServiceImpl.java backend/src/main/java/com/daeryun/probank/service/MailService.java backend/src/main/java/com/daeryun/probank/service/MailServiceImpl.java backend/src/main/java/com/daeryun/probank/controller/UserAdminController.java backend/src/test/java/com/daeryun/probank/service/UserAdminServiceImplTest.java
git commit -m "feat: add user account CRUD API with company email delivery"
```

---

### Task 3: 엑셀 업로드 이력 테이블 확장 (`target_type` 추가)

**Files:**
- Modify: `backend/src/main/resources/schema.sql`
- Create: `backend/src/main/java/com/daeryun/probank/domain/UploadTargetType.java`
- Create: `backend/src/main/java/com/daeryun/probank/domain/ExcelUploadLog.java`
- Create: `backend/src/main/java/com/daeryun/probank/dao/ExcelUploadLogDao.java`
- Create: `backend/src/main/resources/mappers/probank/ExcelUploadLogMapper.xml`

**Interfaces:**
- Consumes: Plan 1 Task 2의 `excel_upload_logs` 테이블
- Produces: `ExcelUploadLogDao.insert(ExcelUploadLog)`, `ExcelUploadLogDao.findAll(UploadTargetType, Long departmentId)`. Task 4(계정 업로드), Plan 3(문제 업로드)이 공유해서 사용한다.

- [ ] **Step 1: schema.sql에 target_type 컬럼 추가**

`backend/src/main/resources/schema.sql` 파일 맨 끝에 추가:
```sql
ALTER TABLE excel_upload_logs ADD COLUMN IF NOT EXISTS target_type VARCHAR(20) NOT NULL DEFAULT 'PROBLEM'
    CHECK (target_type IN ('ACCOUNT', 'PROBLEM'));
```
(`department_id`는 Plan 1 Task 2의 `schema.sql`에서 이미 nullable로 정의되어 있으므로 별도 `ALTER COLUMN`이 필요 없다 — 계정 업로드는 총괄관리자가 여러 부서를 한 파일에 섞어 등록할 수 있어 단일 부서로 강제하지 않기 때문이다. 여기서는 `target_type` 컬럼만 추가한다.)

- [ ] **Step 2: 도메인/Dao/Mapper 작성**

`backend/src/main/java/com/daeryun/probank/domain/UploadTargetType.java`:
```java
package com.daeryun.probank.domain;

public enum UploadTargetType {
    ACCOUNT,
    PROBLEM
}
```

`backend/src/main/java/com/daeryun/probank/domain/ExcelUploadLog.java`:
```java
package com.daeryun.probank.domain;

import lombok.Data;

import java.time.LocalDateTime;

@Data
public class ExcelUploadLog {
    private Long id;
    private Long uploadedBy;
    private Long departmentId;
    private UploadTargetType targetType;
    private String fileName;
    private int totalRows;
    private int successRows;
    private int failRows;
    private String errorDetail;
    private LocalDateTime createdAt;
}
```

`backend/src/main/java/com/daeryun/probank/dao/ExcelUploadLogDao.java`:
```java
package com.daeryun.probank.dao;

import com.daeryun.probank.domain.ExcelUploadLog;
import com.daeryun.probank.domain.UploadTargetType;
import org.apache.ibatis.annotations.Param;

import java.util.List;

public interface ExcelUploadLogDao {
    void insert(ExcelUploadLog log);
    List<ExcelUploadLog> findAll(@Param("targetType") UploadTargetType targetType, @Param("departmentId") Long departmentId);
}
```

`backend/src/main/resources/mappers/probank/ExcelUploadLogMapper.xml`:
```xml
<?xml version="1.0" encoding="UTF-8" ?>
<!DOCTYPE mapper PUBLIC "-//mybatis.org//DTD Mapper 3.0//EN" "http://mybatis.org/dtd/mybatis-3-mapper.dtd">
<mapper namespace="com.daeryun.probank.dao.ExcelUploadLogDao">

    <insert id="insert" parameterType="ExcelUploadLog" useGeneratedKeys="true" keyProperty="id">
        INSERT INTO excel_upload_logs
            (uploaded_by, department_id, target_type, file_name, total_rows, success_rows, fail_rows, error_detail)
        VALUES
            (#{uploadedBy}, #{departmentId}, #{targetType}, #{fileName}, #{totalRows}, #{successRows}, #{failRows}, #{errorDetail})
    </insert>

    <select id="findAll" resultType="ExcelUploadLog">
        SELECT id, uploaded_by, department_id, target_type, file_name, total_rows, success_rows, fail_rows, error_detail, created_at
        FROM excel_upload_logs
        <where>
            AND target_type = #{targetType}
            <if test="departmentId != null">AND department_id = #{departmentId}</if>
        </where>
        ORDER BY created_at DESC
    </select>

</mapper>
```

- [ ] **Step 3: 스키마 반영 확인**

Run: `cd backend && ./gradlew bootRun --args='--spring.profiles.active=dev'` 실행 후 Ctrl+C, 이어서:
```bash
psql -U probank -d probank_dev -c "\d excel_upload_logs"
```
Expected: `target_type` 컬럼 존재, `department_id`가 nullable로 표시됨

- [ ] **Step 4: Commit**

```bash
git add backend/src/main/resources/schema.sql backend/src/main/java/com/daeryun/probank/domain/UploadTargetType.java backend/src/main/java/com/daeryun/probank/domain/ExcelUploadLog.java backend/src/main/java/com/daeryun/probank/dao/ExcelUploadLogDao.java backend/src/main/resources/mappers/probank/ExcelUploadLogMapper.xml
git commit -m "feat: extend excel upload log for account/problem target types"
```

---

### Task 4: 계정 엑셀 일괄 업로드 API

**Files:**
- Create: `backend/src/main/java/com/daeryun/probank/dto/upload/RowResult.java`
- Create: `backend/src/main/java/com/daeryun/probank/dto/upload/ExcelUploadResult.java`
- Create: `backend/src/main/java/com/daeryun/probank/service/ExcelAccountUploadService.java`
- Create: `backend/src/main/java/com/daeryun/probank/service/ExcelAccountUploadServiceImpl.java`
- Create: `backend/src/main/java/com/daeryun/probank/service/AccountProvisioningService.java`
- Create: `backend/src/main/java/com/daeryun/probank/service/AccountProvisioningServiceImpl.java`
- Modify: `backend/src/main/java/com/daeryun/probank/controller/UserAdminController.java`
- Test: `backend/src/test/java/com/daeryun/probank/service/ExcelAccountUploadServiceImplTest.java`

**Interfaces:**
- Consumes: `UserDao`, `DepartmentDao`, `ExcelUploadLogDao`, `PasswordEncoder`, `MailService`, `AuditLogService`, `UserAdminService.generateTempPassword()`(Task 1~3)
- Produces: `POST /api/admin/users/excel-upload` (multipart). 엑셀 템플릿 컬럼: `사번 | 이름 | 회사이메일 | 부서코드 | 역할`(1행은 헤더). Task 6(프론트 계정 업로드 화면)이 사용한다. 업로드 이력 저장까지만 구현한다.

- [ ] **Step 1: 실패하는 테스트 작성 (엑셀 파일을 코드로 직접 생성해 검증)**

`backend/src/test/java/com/daeryun/probank/service/ExcelAccountUploadServiceImplTest.java`:
```java
package com.daeryun.probank.service;

import com.daeryun.probank.dao.DepartmentDao;
import com.daeryun.probank.dao.ExcelUploadLogDao;
import com.daeryun.probank.dao.UserDao;
import com.daeryun.probank.domain.Department;
import com.daeryun.probank.dto.upload.ExcelUploadResult;
import org.apache.poi.ss.usermodel.Row;
import org.apache.poi.ss.usermodel.Sheet;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.mockito.Mockito;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;

import java.io.ByteArrayOutputStream;

import static org.junit.jupiter.api.Assertions.assertEquals;

class ExcelAccountUploadServiceImplTest {

    private UserDao userDao;
    private DepartmentDao departmentDao;
    private ExcelUploadLogDao excelUploadLogDao;
    private ExcelAccountUploadServiceImpl service;

    @BeforeEach
    void setUp() {
        userDao = Mockito.mock(UserDao.class);
        departmentDao = Mockito.mock(DepartmentDao.class);
        excelUploadLogDao = Mockito.mock(ExcelUploadLogDao.class);
        AccountProvisioningService accountProvisioningService = Mockito.mock(AccountProvisioningService.class);
        service = new ExcelAccountUploadServiceImpl(userDao, departmentDao, new BCryptPasswordEncoder(),
                excelUploadLogDao, accountProvisioningService);
    }

    private MockMultipartFile buildExcel(String[][] rows) throws Exception {
        try (XSSFWorkbook workbook = new XSSFWorkbook()) {
            Sheet sheet = workbook.createSheet("accounts");
            for (int r = 0; r < rows.length; r++) {
                Row row = sheet.createRow(r);
                for (int c = 0; c < rows[r].length; c++) {
                    row.createCell(c).setCellValue(rows[r][c]);
                }
            }
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            workbook.write(out);
            return new MockMultipartFile("file", "accounts.xlsx", "application/vnd.ms-excel", out.toByteArray());
        }
    }

    @Test
    void upload_withValidAndInvalidRows_partiallySucceeds() throws Exception {
        Department department = new Department();
        department.setId(10L);
        Mockito.when(departmentDao.findByCode("DEV")).thenReturn(department);
        Mockito.when(departmentDao.findByCode("UNKNOWN")).thenReturn(null);
        Mockito.when(userDao.existsByEmployeeNo(Mockito.anyString())).thenReturn(false);

        MockMultipartFile file = buildExcel(new String[][]{
                {"사번", "이름", "회사이메일", "부서코드", "역할"},
                {"3001", "박영희", "park@company.com", "DEV", "EMPLOYEE"},
                {"3002", "이민호", "lee@company.com", "UNKNOWN", "EMPLOYEE"},
                {"", "", "", "", ""},
        });

        ExcelUploadResult result = service.upload(file, 1L);

        assertEquals(3, result.getTotalRows());
        assertEquals(1, result.getSuccessRows());
        assertEquals(2, result.getFailRows());
        Mockito.verify(userDao, Mockito.times(1)).insert(Mockito.any());
        ArgumentCaptor<com.daeryun.probank.domain.ExcelUploadLog> logCaptor =
                ArgumentCaptor.forClass(com.daeryun.probank.domain.ExcelUploadLog.class);
        Mockito.verify(excelUploadLogDao).insert(logCaptor.capture());
        assertEquals(1, logCaptor.getValue().getSuccessRows());
    }

    @Test
    void upload_withDuplicateEmployeeNoWithinSameFile_failsSecondOccurrence() throws Exception {
        Department department = new Department();
        department.setId(10L);
        Mockito.when(departmentDao.findByCode("DEV")).thenReturn(department);
        Mockito.when(userDao.existsByEmployeeNo("3001")).thenReturn(false);

        MockMultipartFile file = buildExcel(new String[][]{
                {"사번", "이름", "회사이메일", "부서코드", "역할"},
                {"3001", "박영희", "park@company.com", "DEV", "EMPLOYEE"},
                {"3001", "박영희2", "park2@company.com", "DEV", "EMPLOYEE"},
        });

        ExcelUploadResult result = service.upload(file, 1L);

        assertEquals(1, result.getSuccessRows());
        assertEquals(1, result.getFailRows());
    }
}
```

- [ ] **Step 2: 테스트 실행하여 실패 확인**

Run: `cd backend && ./gradlew test --tests ExcelAccountUploadServiceImplTest`
Expected: FAIL — 관련 클래스가 없어 컴파일 오류

- [ ] **Step 3: DTO/Service 구현**

`backend/src/main/java/com/daeryun/probank/dto/upload/RowResult.java`:
```java
package com.daeryun.probank.dto.upload;

import lombok.Getter;

@Getter
public class RowResult {
    private final int rowNumber;
    private final boolean success;
    private final String reason;

    private RowResult(int rowNumber, boolean success, String reason) {
        this.rowNumber = rowNumber;
        this.success = success;
        this.reason = reason;
    }

    public static RowResult success(int rowNumber) {
        return new RowResult(rowNumber, true, null);
    }

    public static RowResult fail(int rowNumber, String reason) {
        return new RowResult(rowNumber, false, reason);
    }
}
```

`backend/src/main/java/com/daeryun/probank/dto/upload/ExcelUploadResult.java`:
```java
package com.daeryun.probank.dto.upload;

import lombok.AllArgsConstructor;
import lombok.Data;

@Data
@AllArgsConstructor
public class ExcelUploadResult {
    private int totalRows;
    private int successRows;
    private int failRows;
    private String errorDetail;
}
```

`backend/src/main/java/com/daeryun/probank/service/ExcelAccountUploadService.java`:
```java
package com.daeryun.probank.service;

import com.daeryun.probank.dto.upload.ExcelUploadResult;
import org.springframework.web.multipart.MultipartFile;

public interface ExcelAccountUploadService {
    ExcelUploadResult upload(MultipartFile file, Long uploadedByUserId);
}
```

`backend/src/main/java/com/daeryun/probank/service/ExcelAccountUploadServiceImpl.java`:
```java
package com.daeryun.probank.service;

import com.daeryun.probank.common.ErrorCode;
import com.daeryun.probank.dao.DepartmentDao;
import com.daeryun.probank.dao.ExcelUploadLogDao;
import com.daeryun.probank.dao.UserDao;
import com.daeryun.probank.domain.*;
import com.daeryun.probank.dto.upload.ExcelUploadResult;
import com.daeryun.probank.dto.upload.RowResult;
import com.daeryun.probank.exception.BizException;
import org.apache.poi.ss.usermodel.Row;
import org.apache.poi.ss.usermodel.Sheet;
import org.apache.poi.ss.usermodel.Workbook;
import org.apache.poi.ss.usermodel.WorkbookFactory;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.security.SecureRandom;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.stream.Collectors;

@Service
public class ExcelAccountUploadServiceImpl implements ExcelAccountUploadService {

    private static final String TEMP_PASSWORD_CHARS = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
    private static final int TEMP_PASSWORD_LENGTH = 10;
    private static final int HEADER_ROW_COUNT = 1;
    private final SecureRandom random = new SecureRandom();

    private final UserDao userDao;
    private final DepartmentDao departmentDao;
    private final PasswordEncoder passwordEncoder;
    private final ExcelUploadLogDao excelUploadLogDao;
    private final AccountProvisioningService accountProvisioningService;

    public ExcelAccountUploadServiceImpl(UserDao userDao, DepartmentDao departmentDao,
                                          PasswordEncoder passwordEncoder, ExcelUploadLogDao excelUploadLogDao,
                                          AccountProvisioningService accountProvisioningService) {
        this.userDao = userDao;
        this.departmentDao = departmentDao;
        this.passwordEncoder = passwordEncoder;
        this.excelUploadLogDao = excelUploadLogDao;
        this.accountProvisioningService = accountProvisioningService;
    }

    @Override
    public ExcelUploadResult upload(MultipartFile file, Long uploadedByUserId) {
        List<RowResult> results = new ArrayList<>();
        Set<String> seenEmployeeNos = new HashSet<>();

        try (Workbook workbook = WorkbookFactory.create(file.getInputStream())) {
            Sheet sheet = workbook.getSheetAt(0);
            for (int rowIndex = HEADER_ROW_COUNT; rowIndex <= sheet.getLastRowNum(); rowIndex++) {
                Row row = sheet.getRow(rowIndex);
                if (row == null) {
                    continue;
                }
                results.add(processRow(row, rowIndex + 1, seenEmployeeNos, uploadedByUserId));
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
        log.setUploadedBy(uploadedByUserId);
        log.setDepartmentId(null);
        log.setTargetType(UploadTargetType.ACCOUNT);
        log.setFileName(file.getOriginalFilename());
        log.setTotalRows(results.size());
        log.setSuccessRows(successRows);
        log.setFailRows(failRows);
        log.setErrorDetail(errorDetail.isEmpty() ? null : errorDetail);
        excelUploadLogDao.insert(log);

        return new ExcelUploadResult(results.size(), successRows, failRows, log.getErrorDetail());
    }

    private RowResult processRow(Row row, int rowNumber, Set<String> seenEmployeeNos, Long uploadedByUserId) {
        String employeeNo = cellValue(row, 0);
        String name = cellValue(row, 1);
        String email = cellValue(row, 2);
        String departmentCode = cellValue(row, 3);
        String roleText = cellValue(row, 4);

        if (isBlank(employeeNo) || isBlank(name) || isBlank(email) || isBlank(departmentCode) || isBlank(roleText)) {
            return RowResult.fail(rowNumber, "필수값이 누락되었습니다.");
        }
        if (!email.matches("^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$")) {
            return RowResult.fail(rowNumber, "유효한 회사 이메일 형식이 아닙니다.");
        }
        if (seenEmployeeNos.contains(employeeNo) || userDao.existsByEmployeeNo(employeeNo)) {
            return RowResult.fail(rowNumber, "이미 존재하는 사번입니다: " + employeeNo);
        }
        if (userDao.existsByEmail(email)) {
            return RowResult.fail(rowNumber, "이미 사용 중인 회사 이메일입니다: " + email);
        }
        Department department = departmentDao.findByCode(departmentCode);
        if (department == null) {
            return RowResult.fail(rowNumber, "존재하지 않는 부서코드입니다: " + departmentCode);
        }
        UserRole role;
        try {
            role = UserRole.valueOf(roleText.trim());
        } catch (IllegalArgumentException e) {
            return RowResult.fail(rowNumber, "유효하지 않은 역할입니다: " + roleText);
        }

        String tempPassword = generateTempPassword();
        User user = new User();
        user.setEmployeeNo(employeeNo);
        user.setName(name);
        user.setEmail(email);
        user.setPasswordHash(passwordEncoder.encode(tempPassword));
        user.setDepartmentId(department.getId());
        user.setRole(role);
        user.setStatus(Status.ACTIVE);
        user.setMustChangePassword(true);
        try {
            accountProvisioningService.provision(user, tempPassword, uploadedByUserId);
        } catch (RuntimeException e) {
            return RowResult.fail(rowNumber, "계정 저장 또는 회사 이메일 발송에 실패했습니다.");
        }

        seenEmployeeNos.add(employeeNo);
        return RowResult.success(rowNumber);
    }

    private String generateTempPassword() {
        StringBuilder builder = new StringBuilder(TEMP_PASSWORD_LENGTH);
        for (int i = 0; i < TEMP_PASSWORD_LENGTH; i++) {
            builder.append(TEMP_PASSWORD_CHARS.charAt(random.nextInt(TEMP_PASSWORD_CHARS.length())));
        }
        return builder.toString();
    }

    private String cellValue(Row row, int cellIndex) {
        org.apache.poi.ss.usermodel.Cell cell = row.getCell(cellIndex);
        if (cell == null) {
            return "";
        }
        cell.setCellType(org.apache.poi.ss.usermodel.CellType.STRING);
        return cell.getStringCellValue().trim();
    }

    private boolean isBlank(String value) {
        return value == null || value.trim().isEmpty();
    }
}
```

- [ ] **Step 4: 컨트롤러에 업로드 엔드포인트 추가**

`UserAdminController`에 추가 (상단 import에 `org.springframework.web.multipart.MultipartFile`, `com.daeryun.probank.service.ExcelAccountUploadService`, `com.daeryun.probank.common.AuthUser`, `com.daeryun.probank.common.SessionKeys`, `javax.servlet.http.HttpServletRequest` 추가):
```java
    private final ExcelAccountUploadService excelAccountUploadService;

    public UserAdminController(UserAdminService userAdminService, ExcelAccountUploadService excelAccountUploadService) {
        this.userAdminService = userAdminService;
        this.excelAccountUploadService = excelAccountUploadService;
    }

    @PostMapping("/excel-upload")
    public ResponseEntity<ResponseDto<?>> uploadExcel(@RequestParam("file") MultipartFile file,
                                                        HttpServletRequest request) {
        AuthUser authUser = (AuthUser) request.getSession().getAttribute(SessionKeys.LOGIN_USER);
        return ResponseEntity.ok(ResponseDto.ok(excelAccountUploadService.upload(file, authUser.getUserId())));
    }
```
(기존 생성자를 대체하며, 기존 필드 `userAdminService` 선언은 유지한다.)

- [ ] **Step 5: 테스트 실행하여 통과 확인**

Run: `cd backend && ./gradlew test --tests ExcelAccountUploadServiceImplTest`
Expected: `BUILD SUCCESSFUL`, 2 tests 통과

- [ ] **Step 6: Commit**

```bash
git add backend/src/main/java/com/daeryun/probank/dto/upload backend/src/main/java/com/daeryun/probank/service/ExcelAccountUploadService.java backend/src/main/java/com/daeryun/probank/service/ExcelAccountUploadServiceImpl.java backend/src/main/java/com/daeryun/probank/service/AccountProvisioningService.java backend/src/main/java/com/daeryun/probank/service/AccountProvisioningServiceImpl.java backend/src/main/java/com/daeryun/probank/controller/UserAdminController.java backend/src/test/java/com/daeryun/probank/service/ExcelAccountUploadServiceImplTest.java
git commit -m "feat: add excel bulk account upload with partial success"
```

---

## Part 3 — 프론트엔드: 부서/계정 관리 화면

### Task 5: 관리자 레이아웃 + 부서 관리 화면

**Files:**
- Create: `frontend/src/api/departments.js`
- Create: `frontend/src/pages/admin/AdminLayout.jsx`
- Modify: `frontend/src/pages/admin/AdminHomePage.jsx` (삭제하고 아래 페이지들로 대체)
- Create: `frontend/src/pages/admin/departments/DepartmentListPage.jsx`
- Modify: `frontend/src/routers/routes.jsx`

**Interfaces:**
- Consumes: `apiGet/apiPost/apiPut`(Task 12 client.js — `apiPut` 추가 필요), `AdminRoute`(Plan 1 Task 15)
- Produces: `/admin/departments` 화면. Task 6이 같은 `AdminLayout` 아래에 `/admin/users`를 추가한다.

- [ ] **Step 1: client.js에 apiPut 추가**

`frontend/src/api/client.js`의 `apiPostForm` 함수 아래에 추가:
```javascript
export function apiPut(path, body) {
  return request(path, { method: "PUT", body: JSON.stringify(body) });
}
```

- [ ] **Step 2: departments API 래퍼 작성**

`frontend/src/api/departments.js`:
```javascript
import { apiGet, apiPost, apiPut } from "@/api/client.js";

export function listDepartments() {
  return apiGet("/api/admin/departments");
}

export function createDepartment({ name, code }) {
  return apiPost("/api/admin/departments", { name, code });
}

export function updateDepartment(id, { name, status }) {
  return apiPut(`/api/admin/departments/${id}`, { name, status });
}
```

- [ ] **Step 3: AdminLayout 작성 (네비게이션)**

`frontend/src/pages/admin/AdminLayout.jsx`:
```javascript
import { NavLink, Outlet } from "react-router-dom";

const NAV_ITEMS = [
  { to: "/admin/departments", label: "부서 관리" },
  { to: "/admin/users", label: "계정 관리" },
];

export default function AdminLayout() {
  return (
    <div className="flex h-screen">
      <nav className="w-52 border-r p-4">
        <ul className="space-y-2">
          {NAV_ITEMS.map((item) => (
            <li key={item.to}>
              <NavLink
                to={item.to}
                className={({ isActive }) =>
                  `block rounded px-3 py-2 text-sm ${isActive ? "bg-blue-100 font-medium" : "hover:bg-gray-100"}`
                }
              >
                {item.label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
      <main className="flex-1 overflow-y-auto p-6">
        <Outlet />
      </main>
    </div>
  );
}
```

- [ ] **Step 4: 부서 목록/생성/수정 화면 작성**

`frontend/src/pages/admin/departments/DepartmentListPage.jsx`:
```javascript
import { useEffect, useState } from "react";
import { toast } from "react-toastify";
import { createDepartment, listDepartments, updateDepartment } from "@/api/departments.js";
import { resolveErrorMessage } from "@/api/client.js";

export default function DepartmentListPage() {
  const [departments, setDepartments] = useState([]);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");

  async function refresh() {
    try {
      setDepartments(await listDepartments());
    } catch (error) {
      toast.error(resolveErrorMessage(error, "부서 목록을 불러오지 못했습니다."));
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  async function handleCreate(event) {
    event.preventDefault();
    try {
      await createDepartment({ name, code });
      setName("");
      setCode("");
      toast.success("부서가 생성되었습니다.");
      refresh();
    } catch (error) {
      toast.error(resolveErrorMessage(error, "부서 생성에 실패했습니다."));
    }
  }

  async function handleToggleStatus(department) {
    const nextStatus = department.status === "ACTIVE" ? "INACTIVE" : "ACTIVE";
    try {
      await updateDepartment(department.id, { name: department.name, status: nextStatus });
      toast.success("부서 상태가 변경되었습니다.");
      refresh();
    } catch (error) {
      toast.error(resolveErrorMessage(error, "부서 상태 변경에 실패했습니다."));
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-lg font-semibold">부서 관리</h1>

      <form onSubmit={handleCreate} className="flex gap-2">
        <input
          className="rounded border px-3 py-2"
          placeholder="부서명"
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
        <input
          className="rounded border px-3 py-2"
          placeholder="부서코드"
          value={code}
          onChange={(event) => setCode(event.target.value)}
        />
        <button type="submit" className="rounded bg-blue-600 px-4 py-2 text-white">
          부서 생성
        </button>
      </form>

      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b">
            <th className="py-2">부서명</th>
            <th className="py-2">코드</th>
            <th className="py-2">상태</th>
            <th className="py-2">관리</th>
          </tr>
        </thead>
        <tbody>
          {departments.map((department) => (
            <tr key={department.id} className="border-b">
              <td className="py-2">{department.name}</td>
              <td className="py-2">{department.code}</td>
              <td className="py-2">{department.status}</td>
              <td className="py-2">
                <button className="text-blue-600 underline" onClick={() => handleToggleStatus(department)}>
                  {department.status === "ACTIVE" ? "비활성화" : "활성화"}
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

- [ ] **Step 5: 라우터에 연결 (`AdminHomePage`를 `AdminLayout` + 부서 라우트로 교체)**

`frontend/src/routers/routes.jsx`의 `/admin` 부분을 아래로 교체:
```javascript
      {
        path: "/admin",
        element: <AdminRoute />,
        children: [
          {
            element: <AdminLayout />,
            children: [
              { index: true, element: <Navigate to="/admin/departments" replace /> },
              { path: "departments", element: <DepartmentListPage /> },
            ],
          },
        ],
      },
```
> 이 index 리다이렉트는 임시 값이다. Plan 5 Task 5가 관리자 대시보드 화면을 추가하면서 `index`의 대상을 `/admin/departments`에서 `/admin/dashboard`로 교체한다. `/admin/departments`는 총괄 관리자 전용 API이므로, 이 임시 상태에서 부서 관리자가 PC로 로그인하면 403을 만나게 된다 — Plan 5까지 마쳐야 이 문제가 해소된다.
파일 상단 import를 교체:
```javascript
import AdminLayout from "@/pages/admin/AdminLayout.jsx";
import DepartmentListPage from "@/pages/admin/departments/DepartmentListPage.jsx";
```
(기존 `import AdminHomePage from "@/pages/admin/AdminHomePage.jsx";`는 제거하고, `frontend/src/pages/admin/AdminHomePage.jsx` 파일도 삭제한다.)

- [ ] **Step 6: 수동 확인**

Run: 백엔드/프론트 동시 실행 후 총괄관리자로 로그인 → `/admin/departments`에서 부서 생성/비활성화 동작 확인

- [ ] **Step 7: Commit**

```bash
git add frontend/src/api/departments.js frontend/src/api/client.js frontend/src/pages/admin frontend/src/routers/routes.jsx
git rm frontend/src/pages/admin/AdminHomePage.jsx
git commit -m "feat: add department management screen"
```

---

### Task 6: 계정 관리 화면 (개별 등록 + 엑셀 업로드)

**Files:**
- Create: `frontend/src/api/users.js`
- Create: `frontend/src/pages/admin/users/UserListPage.jsx`
- Create: `frontend/src/pages/admin/users/UserExcelUploadPage.jsx`
- Modify: `frontend/src/pages/admin/AdminLayout.jsx`
- Modify: `frontend/src/routers/routes.jsx`

**Interfaces:**
- Consumes: `apiGet/apiPost/apiPut/apiPostForm`(Task 12, 5), `listDepartments`(Task 5)
- Produces: `/admin/users`, `/admin/users/excel-upload` 화면.

- [ ] **Step 1: users API 래퍼 작성**

`frontend/src/api/users.js`:
```javascript
import { apiGet, apiPost, apiPostForm, apiPut } from "@/api/client.js";

export function listUsers(departmentId) {
  const query = departmentId ? `?departmentId=${departmentId}` : "";
  return apiGet(`/api/admin/users${query}`);
}

export function createUser({ employeeNo, name, email, departmentId, role }) {
  return apiPost("/api/admin/users", { employeeNo, name, email, departmentId, role });
}

export function updateUser(id, { name, email, departmentId, role, status }) {
  return apiPut(`/api/admin/users/${id}`, { name, email, departmentId, role, status });
}

export function uploadUsersExcel(file) {
  const formData = new FormData();
  formData.append("file", file);
  return apiPostForm("/api/admin/users/excel-upload", formData);
}
```

- [ ] **Step 2: 계정 목록/생성 화면 작성**

`frontend/src/pages/admin/users/UserListPage.jsx`:
```javascript
import { useEffect, useState } from "react";
import { toast } from "react-toastify";
import { createUser, listUsers } from "@/api/users.js";
import { listDepartments } from "@/api/departments.js";
import { resolveErrorMessage } from "@/api/client.js";

const ROLES = ["SUPER_ADMIN", "DEPT_ADMIN", "EMPLOYEE"];

export default function UserListPage() {
  const [users, setUsers] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [form, setForm] = useState({ employeeNo: "", name: "", email: "", departmentId: "", role: "EMPLOYEE" });

  async function refresh() {
    try {
      const [userList, departmentList] = await Promise.all([listUsers(), listDepartments()]);
      setUsers(userList);
      setDepartments(departmentList);
    } catch (error) {
      toast.error(resolveErrorMessage(error, "목록을 불러오지 못했습니다."));
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  async function handleCreate(event) {
    event.preventDefault();
    try {
      const response = await createUser({ ...form, departmentId: Number(form.departmentId) });
      toast.success(`${response.email}로 임시 비밀번호를 발송했습니다.`);
      setForm({ employeeNo: "", name: "", email: "", departmentId: "", role: "EMPLOYEE" });
      refresh();
    } catch (error) {
      toast.error(resolveErrorMessage(error, "계정 생성에 실패했습니다."));
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-lg font-semibold">계정 관리</h1>

      <form onSubmit={handleCreate} className="flex flex-wrap gap-2">
        <input
          className="rounded border px-3 py-2"
          placeholder="사번"
          value={form.employeeNo}
          onChange={(event) => setForm({ ...form, employeeNo: event.target.value })}
        />
        <input
          className="rounded border px-3 py-2"
          placeholder="이름"
          value={form.name}
          onChange={(event) => setForm({ ...form, name: event.target.value })}
        />
        <input
          className="rounded border px-3 py-2"
          type="email"
          placeholder="회사 이메일"
          value={form.email}
          onChange={(event) => setForm({ ...form, email: event.target.value })}
        />
        <select
          className="rounded border px-3 py-2"
          value={form.departmentId}
          onChange={(event) => setForm({ ...form, departmentId: event.target.value })}
        >
          <option value="">부서 선택</option>
          {departments.map((department) => (
            <option key={department.id} value={department.id}>
              {department.name}
            </option>
          ))}
        </select>
        <select
          className="rounded border px-3 py-2"
          value={form.role}
          onChange={(event) => setForm({ ...form, role: event.target.value })}
        >
          {ROLES.map((role) => (
            <option key={role} value={role}>
              {role}
            </option>
          ))}
        </select>
        <button type="submit" className="rounded bg-blue-600 px-4 py-2 text-white">
          계정 생성
        </button>
      </form>

      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b">
            <th className="py-2">사번</th>
            <th className="py-2">이름</th>
            <th className="py-2">회사 이메일</th>
            <th className="py-2">부서</th>
            <th className="py-2">역할</th>
            <th className="py-2">상태</th>
          </tr>
        </thead>
        <tbody>
          {users.map((user) => (
            <tr key={user.id} className="border-b">
              <td className="py-2">{user.employeeNo}</td>
              <td className="py-2">{user.name}</td>
              <td className="py-2">{user.email}</td>
              <td className="py-2">{user.departmentName}</td>
              <td className="py-2">{user.role}</td>
              <td className="py-2">{user.status}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 3: 엑셀 업로드 화면 작성**

`frontend/src/pages/admin/users/UserExcelUploadPage.jsx`:
```javascript
import { useState } from "react";
import { toast } from "react-toastify";
import { uploadUsersExcel } from "@/api/users.js";
import { resolveErrorMessage } from "@/api/client.js";

export default function UserExcelUploadPage() {
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
      const uploadResult = await uploadUsersExcel(file);
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
      <h1 className="text-lg font-semibold">계정 엑셀 일괄 등록</h1>
      <p className="text-sm text-gray-500">템플릿 컬럼: 사번 | 이름 | 회사이메일 | 부서코드 | 역할(SUPER_ADMIN/DEPT_ADMIN/EMPLOYEE)</p>
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

- [ ] **Step 4: 네비게이션/라우터에 연결**

`AdminLayout.jsx`의 `NAV_ITEMS`를 교체:
```javascript
const NAV_ITEMS = [
  { to: "/admin/departments", label: "부서 관리" },
  { to: "/admin/users", label: "계정 관리" },
  { to: "/admin/users/excel-upload", label: "계정 일괄 등록" },
];
```

`routes.jsx`의 `/admin` 하위 children에 두 라우트를 추가:
```javascript
              { path: "users", element: <UserListPage /> },
              { path: "users/excel-upload", element: <UserExcelUploadPage /> },
```
파일 상단 import 추가:
```javascript
import UserListPage from "@/pages/admin/users/UserListPage.jsx";
import UserExcelUploadPage from "@/pages/admin/users/UserExcelUploadPage.jsx";
```

- [ ] **Step 5: 수동 확인**

Run: 총괄관리자로 로그인 → `/admin/users`에서 회사 이메일을 포함해 계정 생성(메일 발송 안내 확인) → `/admin/users/excel-upload`에서 샘플 엑셀 업로드 후 성공/실패 건수 확인

- [ ] **Step 6: Commit**

```bash
git add frontend/src/api/users.js frontend/src/pages/admin/users frontend/src/pages/admin/AdminLayout.jsx frontend/src/routers/routes.jsx
git commit -m "feat: add account management and excel upload screens"
```

---

## Self-Review 결과

- **Spec 커버리지:** PRD 4.4(부서 생성/수정/비활성화, 계정 생성/수정/비활성화, 개별+엑셀) → Task 1,2,4,5,6. 9.2(서버 측 권한 검증) → 모든 컨트롤러에 `@RequireRole(SUPER_ADMIN)` 적용.
- **플레이스홀더 스캔:** 없음.
- **타입 일관성:** `UserListItem`, `UserCreateResponse` 필드명이 프론트 `users.js`/`UserListPage.jsx`와 일치. `ExcelUploadLog.targetType`이 Task 3(도메인)과 Task 4(서비스)에서 동일하게 `UploadTargetType.ACCOUNT` 사용.
- **추가 결정 반영:** 회사 이메일 필수·SMTP 발송·평문 임시 비밀번호 비노출, 계정/부서/엑셀 업로드 DB 감사 로그, 업로드 이력 저장 후 조회/다운로드 보류가 Task 2~6의 계약과 테스트에 반영되었다.

## 다음 Plan

- Plan 3: 문제 은행 관리 (5개 문제 유형 CRUD, 엑셀 업로드 — 이 Plan의 `excel_upload_logs`/`target_type` 인프라를 재사용)
- Plan 4: 문제 풀이
- Plan 5: 통계
