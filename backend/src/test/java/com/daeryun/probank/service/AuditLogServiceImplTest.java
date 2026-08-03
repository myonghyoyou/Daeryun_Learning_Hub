package com.daeryun.probank.service;

import com.daeryun.probank.dao.AuditLogDao;
import com.daeryun.probank.domain.AuditLog;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;

class AuditLogServiceImplTest {

    private final AuditLogDao auditLogDao = mock(AuditLogDao.class);
    private final AuditLogServiceImpl service = new AuditLogServiceImpl(auditLogDao);

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

    /**
     * Verification rule from the task brief: password and temporary password values must never end
     * up in audit {@code detail}. {@code detailJson} is an opaque, schema-free string as far as this
     * service is concerned, so the service cannot generically detect or reject a password value
     * hidden inside it — that discipline belongs to the callers (Plan 2~5's admin mutation code)
     * that build the JSON. This test does not assert that the service enforces the rule (it can't);
     * it encodes the rule as an executable check on the test's own fixture data, documenting the
     * expected shape of a password-reset audit entry (who reset whose password) and guarding against
     * that fixture drifting to accidentally include a password/temp-password value later.
     */
    @Test
    void record_passwordResetDetailFixtureNeverCarriesThePasswordValue() {
        Long actorId = 10L;
        String action = "USER_PASSWORD_RESET";
        String targetType = "USER";
        Long targetId = 55L;
        String detailJson = "{\"targetEmployeeNo\":\"1001\",\"resetByAdminId\":10}";

        service.record(actorId, action, targetType, targetId, detailJson);

        ArgumentCaptor<AuditLog> captor = ArgumentCaptor.forClass(AuditLog.class);
        verify(auditLogDao).insert(captor.capture());
        String savedDetail = captor.getValue().getDetail();
        assertFalse(savedDetail.toLowerCase().contains("password"),
                "audit detail fixture must never contain a password or temporary password value");
    }
}
