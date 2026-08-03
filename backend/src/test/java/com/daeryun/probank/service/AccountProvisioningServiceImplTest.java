package com.daeryun.probank.service;

import com.daeryun.probank.dao.UserDao;
import com.daeryun.probank.domain.Status;
import com.daeryun.probank.domain.User;
import com.daeryun.probank.domain.UserRole;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.mockito.InOrder;
import org.mockito.Mockito;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;

class AccountProvisioningServiceImplTest {

    private UserDao userDao;
    private MailService mailService;
    private AuditLogService auditLogService;
    private AccountProvisioningServiceImpl service;

    @BeforeEach
    void setUp() {
        userDao = Mockito.mock(UserDao.class);
        mailService = Mockito.mock(MailService.class);
        auditLogService = Mockito.mock(AuditLogService.class);
        service = new AccountProvisioningServiceImpl(userDao, mailService, auditLogService);
    }

    private User newUser() {
        User user = new User();
        user.setEmployeeNo("3001");
        user.setName("박영희");
        user.setEmail("park@company.com");
        user.setPasswordHash("hashed");
        user.setDepartmentId(10L);
        user.setRole(UserRole.EMPLOYEE);
        user.setStatus(Status.ACTIVE);
        user.setMustChangePassword(true);
        return user;
    }

    @Test
    void provision_insertsMailsAndAuditsInThatOrder() {
        User user = newUser();

        service.provision(user, "Temp1234!", 1L);

        InOrder inOrder = Mockito.inOrder(userDao, mailService, auditLogService);
        inOrder.verify(userDao).insert(user);
        inOrder.verify(mailService).sendTemporaryPassword("park@company.com", "3001", "Temp1234!");
        inOrder.verify(auditLogService).record(Mockito.eq(1L), Mockito.eq("USER_CREATED"), Mockito.eq("USER"),
                Mockito.any(), Mockito.anyString());
    }

    @Test
    void provision_whenMailServiceFails_propagatesAndSkipsAuditLog() {
        Mockito.doThrow(new RuntimeException("SMTP 연결 실패"))
                .when(mailService).sendTemporaryPassword(Mockito.anyString(), Mockito.anyString(), Mockito.anyString());

        assertThrows(RuntimeException.class, () -> service.provision(newUser(), "Temp1234!", 1L));
        Mockito.verifyNoInteractions(auditLogService);
    }

    @Test
    void provision_recordsAuditDetailWithEmployeeNoOnlyAndNoPasswordKey() throws Exception {
        service.provision(newUser(), "Temp1234!", 1L);

        ArgumentCaptor<String> detailCaptor = ArgumentCaptor.forClass(String.class);
        Mockito.verify(auditLogService).record(Mockito.eq(1L), Mockito.eq("USER_CREATED"), Mockito.eq("USER"),
                Mockito.any(), detailCaptor.capture());

        JsonNode detail = new ObjectMapper().readTree(detailCaptor.getValue());
        assertEquals("3001", detail.get("employeeNo").asText());
        assertFalse(detailCaptor.getValue().toLowerCase().contains("password"));
        assertFalse(detailCaptor.getValue().contains("Temp1234!"));
    }
}
