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
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.mockito.InOrder;
import org.mockito.Mockito;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;

import static org.junit.jupiter.api.Assertions.*;

class UserAdminServiceImplTest {

    private UserDao userDao;
    private DepartmentDao departmentDao;
    private MailService mailService;
    private AuditLogService auditLogService;
    private UserAdminServiceImpl service;
    private AuthUser actor;

    @BeforeEach
    void setUp() {
        userDao = Mockito.mock(UserDao.class);
        departmentDao = Mockito.mock(DepartmentDao.class);
        mailService = Mockito.mock(MailService.class);
        auditLogService = Mockito.mock(AuditLogService.class);
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
        Mockito.verify(userDao, Mockito.never()).insert(Mockito.any());
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
        Mockito.verify(userDao, Mockito.never()).insert(Mockito.any());
    }

    @Test
    void create_withDuplicateEmail_throwsBizException() {
        Mockito.when(userDao.existsByEmployeeNo("2001")).thenReturn(false);
        Mockito.when(userDao.existsByEmail("kim@company.com")).thenReturn(true);
        UserCreateRequest request = new UserCreateRequest();
        request.setEmployeeNo("2001");
        request.setName("김철수");
        request.setEmail("kim@company.com");
        request.setDepartmentId(10L);
        request.setRole(UserRole.EMPLOYEE);

        assertThrows(BizException.class, () -> service.create(request, actor));
        Mockito.verify(userDao, Mockito.never()).insert(Mockito.any());
    }

    @Test
    void create_withBlankOrInvalidEmail_throwsBizException() {
        UserCreateRequest blank = new UserCreateRequest();
        blank.setEmployeeNo("2001");
        blank.setName("김철수");
        blank.setEmail("  ");
        blank.setDepartmentId(10L);
        blank.setRole(UserRole.EMPLOYEE);
        assertThrows(BizException.class, () -> service.create(blank, actor));

        UserCreateRequest invalid = new UserCreateRequest();
        invalid.setEmployeeNo("2001");
        invalid.setName("김철수");
        invalid.setEmail("not-an-email");
        invalid.setDepartmentId(10L);
        invalid.setRole(UserRole.EMPLOYEE);
        assertThrows(BizException.class, () -> service.create(invalid, actor));

        Mockito.verifyNoInteractions(mailService);
    }

    @Test
    void create_insertsBeforeMailingAndAuditingInThatOrder() {
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

        service.create(request, actor);

        InOrder inOrder = Mockito.inOrder(userDao, mailService, auditLogService);
        inOrder.verify(userDao).insert(Mockito.any(User.class));
        inOrder.verify(mailService).sendTemporaryPassword(Mockito.eq("kim@company.com"), Mockito.eq("2001"), Mockito.anyString());
        inOrder.verify(auditLogService).record(Mockito.any(), Mockito.eq("USER_CREATED"), Mockito.eq("USER"),
                Mockito.any(), Mockito.anyString());
    }

    @Test
    void create_whenMailServiceFails_propagatesAndSkipsAuditLog() {
        Department department = new Department();
        department.setId(10L);
        Mockito.when(departmentDao.findById(10L)).thenReturn(department);
        Mockito.when(userDao.existsByEmployeeNo("2001")).thenReturn(false);
        Mockito.doThrow(new RuntimeException("SMTP 연결 실패"))
                .when(mailService).sendTemporaryPassword(Mockito.anyString(), Mockito.anyString(), Mockito.anyString());

        UserCreateRequest request = new UserCreateRequest();
        request.setEmployeeNo("2001");
        request.setName("김철수");
        request.setEmail("kim@company.com");
        request.setDepartmentId(10L);
        request.setRole(UserRole.EMPLOYEE);

        assertThrows(RuntimeException.class, () -> service.create(request, actor));
        Mockito.verifyNoInteractions(auditLogService);
    }

    @Test
    void create_recordsAuditDetailWithEmployeeNoOnlyAndNoPasswordKey() throws Exception {
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

        service.create(request, actor);

        ArgumentCaptor<String> detailCaptor = ArgumentCaptor.forClass(String.class);
        Mockito.verify(auditLogService).record(Mockito.eq(1L), Mockito.eq("USER_CREATED"), Mockito.eq("USER"),
                Mockito.any(), detailCaptor.capture());

        JsonNode detail = new ObjectMapper().readTree(detailCaptor.getValue());
        assertEquals("2001", detail.get("employeeNo").asText());
        assertFalse(detailCaptor.getValue().toLowerCase().contains("password"));
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

    @Test
    void update_withUnknownUser_throwsBizException() {
        Mockito.when(userDao.findById(5L)).thenReturn(null);
        UserUpdateRequest request = new UserUpdateRequest();
        request.setName("김철수2");
        request.setEmail("kim2@company.com");
        request.setDepartmentId(20L);
        request.setRole(UserRole.DEPT_ADMIN);
        request.setStatus(Status.INACTIVE);

        assertThrows(BizException.class, () -> service.update(5L, request, actor));
        Mockito.verify(userDao, Mockito.never()).update(Mockito.any());
    }

    @Test
    void update_withUnknownDepartment_throwsBizException() {
        User existing = new User();
        existing.setId(5L);
        existing.setEmail("kim@company.com");
        Mockito.when(userDao.findById(5L)).thenReturn(existing);
        Mockito.when(departmentDao.findById(99L)).thenReturn(null);

        UserUpdateRequest request = new UserUpdateRequest();
        request.setName("김철수2");
        request.setEmail("kim2@company.com");
        request.setDepartmentId(99L);
        request.setRole(UserRole.DEPT_ADMIN);
        request.setStatus(Status.INACTIVE);

        assertThrows(BizException.class, () -> service.update(5L, request, actor));
        Mockito.verify(userDao, Mockito.never()).update(Mockito.any());
    }

    @Test
    void update_withEmailUsedByAnotherAccount_throwsBizException() {
        User existing = new User();
        existing.setId(5L);
        existing.setEmail("kim@company.com");
        Mockito.when(userDao.findById(5L)).thenReturn(existing);
        Department department = new Department();
        department.setId(20L);
        Mockito.when(departmentDao.findById(20L)).thenReturn(department);
        Mockito.when(userDao.existsByEmail("taken@company.com")).thenReturn(true);

        UserUpdateRequest request = new UserUpdateRequest();
        request.setName("김철수2");
        request.setEmail("taken@company.com");
        request.setDepartmentId(20L);
        request.setRole(UserRole.DEPT_ADMIN);
        request.setStatus(Status.INACTIVE);

        assertThrows(BizException.class, () -> service.update(5L, request, actor));
        Mockito.verify(userDao, Mockito.never()).update(Mockito.any());
    }

    @Test
    void update_withUnchangedEmail_doesNotTreatItAsDuplicate() {
        User existing = new User();
        existing.setId(5L);
        existing.setEmail("kim@company.com");
        Mockito.when(userDao.findById(5L)).thenReturn(existing);
        Department department = new Department();
        department.setId(20L);
        Mockito.when(departmentDao.findById(20L)).thenReturn(department);

        UserUpdateRequest request = new UserUpdateRequest();
        request.setName("김철수2");
        request.setEmail("kim@company.com");
        request.setDepartmentId(20L);
        request.setRole(UserRole.DEPT_ADMIN);
        request.setStatus(Status.ACTIVE);

        service.update(5L, request, actor);

        Mockito.verify(userDao, Mockito.never()).existsByEmail(Mockito.anyString());
        Mockito.verify(userDao).update(Mockito.any(User.class));
    }

    @Test
    void update_recordsAuditDetailWithIdentifierAndChangeSummary() throws Exception {
        User existing = new User();
        existing.setId(5L);
        existing.setEmployeeNo("2001");
        existing.setEmail("kim@company.com");
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

        service.update(5L, request, actor);

        ArgumentCaptor<String> detailCaptor = ArgumentCaptor.forClass(String.class);
        Mockito.verify(auditLogService).record(Mockito.eq(1L), Mockito.eq("USER_UPDATED"), Mockito.eq("USER"),
                Mockito.eq(5L), detailCaptor.capture());

        JsonNode detail = new ObjectMapper().readTree(detailCaptor.getValue());
        assertEquals("2001", detail.get("employeeNo").asText());
        assertEquals("김철수2", detail.get("name").asText());
        assertEquals("kim2@company.com", detail.get("email").asText());
        assertEquals(20L, detail.get("departmentId").asLong());
        assertEquals("DEPT_ADMIN", detail.get("role").asText());
        assertEquals("INACTIVE", detail.get("status").asText());
        assertFalse(detailCaptor.getValue().toLowerCase().contains("password"));
    }

    @Test
    void list_delegatesToDaoWithDepartmentFilter() {
        service.list(20L);
        Mockito.verify(userDao).findAll(20L);
    }
}
