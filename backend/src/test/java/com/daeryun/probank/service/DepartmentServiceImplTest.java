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
    void create_withCodeContainingQuote_recordsValidEscapedJsonDetail() throws Exception {
        Mockito.when(departmentDao.findByCode(Mockito.anyString())).thenReturn(null);
        Mockito.doAnswer(invocation -> {
            ((Department) invocation.getArgument(0)).setId(7L);
            return null;
        }).when(departmentDao).insert(Mockito.any());

        DepartmentCreateRequest request = new DepartmentCreateRequest();
        request.setName("개발팀");
        request.setCode("DE\"V\\1");

        service.create(request, actor);

        ArgumentCaptor<String> detailCaptor = ArgumentCaptor.forClass(String.class);
        Mockito.verify(auditLogService).record(Mockito.eq(1L), Mockito.eq("DEPARTMENT_CREATED"),
                Mockito.eq("DEPARTMENT"), Mockito.eq(7L), detailCaptor.capture());

        // 직접 조립한 JSON 이었다면 여기서 파싱이 깨지고, AuditLogServiceImpl 이 fail-closed 로
        // 거부해 이미 커밋된 부서만 남은 채 요청이 실패한다.
        JsonNode detail = new ObjectMapper().readTree(detailCaptor.getValue());
        assertEquals("DE\"V\\1", detail.get("code").asText());
    }

    @Test
    void create_withBlankNameOrCode_throwsBizExceptionBeforeTouchingTheDao() {
        DepartmentCreateRequest blankName = new DepartmentCreateRequest();
        blankName.setName("   ");
        blankName.setCode("DEV");
        assertThrows(BizException.class, () -> service.create(blankName, actor));

        DepartmentCreateRequest nullName = new DepartmentCreateRequest();
        nullName.setCode("DEV");
        assertThrows(BizException.class, () -> service.create(nullName, actor));

        DepartmentCreateRequest nullCode = new DepartmentCreateRequest();
        nullCode.setName("개발팀");
        assertThrows(BizException.class, () -> service.create(nullCode, actor));

        Mockito.verify(departmentDao, Mockito.never()).findByCode(Mockito.any());
        Mockito.verify(departmentDao, Mockito.never()).insert(Mockito.any());
    }

    @Test
    void create_withOverlongNameOrCode_throwsBizException() {
        DepartmentCreateRequest longName = new DepartmentCreateRequest();
        longName.setName(repeat("가", 101));
        longName.setCode("DEV");
        assertThrows(BizException.class, () -> service.create(longName, actor));

        DepartmentCreateRequest longCode = new DepartmentCreateRequest();
        longCode.setName("개발팀");
        longCode.setCode(repeat("D", 51));
        assertThrows(BizException.class, () -> service.create(longCode, actor));

        Mockito.verify(departmentDao, Mockito.never()).insert(Mockito.any());
    }

    @Test
    void update_withBlankNameOrNullStatus_throwsBizException() {
        DepartmentUpdateRequest blankName = new DepartmentUpdateRequest();
        blankName.setName("  ");
        blankName.setStatus(Status.ACTIVE);
        assertThrows(BizException.class, () -> service.update(1L, blankName, actor));

        DepartmentUpdateRequest nullStatus = new DepartmentUpdateRequest();
        nullStatus.setName("개발본부");
        assertThrows(BizException.class, () -> service.update(1L, nullStatus, actor));

        Mockito.verify(departmentDao, Mockito.never()).update(Mockito.any());
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

    // Java 8 이라 String.repeat 을 쓸 수 없다.
    private static String repeat(String unit, int times) {
        StringBuilder builder = new StringBuilder(unit.length() * times);
        for (int i = 0; i < times; i++) {
            builder.append(unit);
        }
        return builder.toString();
    }
}
