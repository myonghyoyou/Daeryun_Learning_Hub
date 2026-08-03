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
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.mockito.Mockito;

import java.util.Collections;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

class DepartmentServiceImplTest {

    private DepartmentDao departmentDao;
    private AuditLogService auditLogService;
    private DepartmentServiceImpl service;
    private AuthUser actor;

    @BeforeEach
    void setUp() {
        departmentDao = Mockito.mock(DepartmentDao.class);
        auditLogService = Mockito.mock(AuditLogService.class);
        service = new DepartmentServiceImpl(departmentDao, auditLogService);
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
    void update_recordsAuditDetailWithChangeSummary() throws Exception {
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

        ArgumentCaptor<String> detailCaptor = ArgumentCaptor.forClass(String.class);
        Mockito.verify(auditLogService).record(Mockito.eq(1L), Mockito.eq("DEPARTMENT_UPDATED"),
                Mockito.eq("DEPARTMENT"), Mockito.eq(1L), detailCaptor.capture());

        JsonNode detail = new ObjectMapper().readTree(detailCaptor.getValue());
        assertEquals("DEV", detail.get("code").asText());
        assertEquals("개발본부", detail.get("name").asText());
        assertEquals("INACTIVE", detail.get("status").asText());
    }

    @Test
    void update_withNameContainingQuote_recordsValidEscapedJsonDetail() throws Exception {
        Department existing = new Department();
        existing.setId(1L);
        existing.setName("개발팀");
        existing.setCode("DEV");
        existing.setStatus(Status.ACTIVE);
        Mockito.when(departmentDao.findById(1L)).thenReturn(existing);

        DepartmentUpdateRequest request = new DepartmentUpdateRequest();
        request.setName("개발\"본부\\팀");
        request.setStatus(Status.INACTIVE);

        service.update(1L, request, actor);

        ArgumentCaptor<String> detailCaptor = ArgumentCaptor.forClass(String.class);
        Mockito.verify(auditLogService).record(Mockito.eq(1L), Mockito.eq("DEPARTMENT_UPDATED"),
                Mockito.eq("DEPARTMENT"), Mockito.eq(1L), detailCaptor.capture());

        JsonNode detail = new ObjectMapper().readTree(detailCaptor.getValue());
        assertEquals("개발\"본부\\팀", detail.get("name").asText());
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
