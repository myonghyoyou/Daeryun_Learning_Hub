package com.daeryun.probank.service;

import com.daeryun.probank.dao.AuditLogDao;
import com.daeryun.probank.domain.AuditLog;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;

class AuditLogServiceImplTest {

    private final AuditLogDao auditLogDao = mock(AuditLogDao.class);
    private final AuditLogServiceImpl service = new AuditLogServiceImpl(auditLogDao, new ObjectMapper());

    @Test
    void record_passesActorActionTargetDetailToDaoUnchanged() {
        Long actorId = 1L;
        String action = "USER_UPDATE";
        String targetType = "USER";
        Long targetId = 42L;
        String detailJson = "{\"name\":\"홍길동\",\"departmentId\":3}";

        service.record(actorId, action, targetType, targetId, detailJson);

        ArgumentCaptor<AuditLog> captor = ArgumentCaptor.forClass(AuditLog.class);
        verify(auditLogDao).insert(captor.capture());
        AuditLog saved = captor.getValue();
        assertEquals(actorId, saved.getActorId());
        assertEquals(action, saved.getAction());
        assertEquals(targetType, saved.getTargetType());
        assertEquals(targetId, saved.getTargetId());
        assertEquals(detailJson, saved.getDetail());
    }

    @Test
    void record_rejectsTopLevelPasswordKey_andNeverCallsDao() {
        String detailJson = "{\"password\":\"secret123\"}";

        IllegalArgumentException exception = assertThrows(IllegalArgumentException.class,
                () -> service.record(1L, "USER_PASSWORD_RESET", "USER", 1L, detailJson));

        assertTrue(exception.getMessage().contains("password"));
        verifyNoInteractions(auditLogDao);
    }

    @Test
    void record_rejectsPasswordLikeKey_caseInsensitiveAndNested() {
        // "TempPassword" (mixed case) nested inside a sub-object -- both the case-insensitivity and
        // the recursive-scan requirements are exercised by this one payload.
        String detailJson = "{\"target\":{\"employeeNo\":\"1001\",\"TempPassword\":\"a8Xk29\"}}";

        assertThrows(IllegalArgumentException.class,
                () -> service.record(1L, "USER_PASSWORD_RESET", "USER", 1L, detailJson));

        verifyNoInteractions(auditLogDao);
    }

    @Test
    void record_acceptsLegitimateEntryWherePasswordIsOnlyAValueNotAKey() {
        // {"changedField":"password"} describes *that* the password field was changed, without
        // carrying any secret value. The key name "changedField" does not match "password", so this
        // must be accepted -- a naive substring check over the whole payload would wrongly reject it.
        String detailJson = "{\"changedField\":\"password\"}";

        service.record(1L, "USER_UPDATE", "USER", 1L, detailJson);

        ArgumentCaptor<AuditLog> captor = ArgumentCaptor.forClass(AuditLog.class);
        verify(auditLogDao).insert(captor.capture());
        assertEquals(detailJson, captor.getValue().getDetail());
    }

    @Test
    void record_allowsNullDetailJson() {
        service.record(1L, "USER_CREATE", "USER", 1L, null);

        ArgumentCaptor<AuditLog> captor = ArgumentCaptor.forClass(AuditLog.class);
        verify(auditLogDao).insert(captor.capture());
        assertNull(captor.getValue().getDetail());
    }

    @Test
    void record_rejectsNonJsonDetailJson_failsClosedRatherThanSkippingTheGuard() {
        String detailJson = "not valid json";

        assertThrows(IllegalArgumentException.class,
                () -> service.record(1L, "USER_UPDATE", "USER", 1L, detailJson));

        verifyNoInteractions(auditLogDao);
    }
}
