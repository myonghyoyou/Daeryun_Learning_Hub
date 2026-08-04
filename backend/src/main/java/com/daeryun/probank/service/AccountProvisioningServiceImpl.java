package com.daeryun.probank.service;

import com.daeryun.probank.dao.UserDao;
import com.daeryun.probank.domain.User;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.util.LinkedHashMap;
import java.util.Map;

@Service
public class AccountProvisioningServiceImpl implements AccountProvisioningService {

    private static final ObjectMapper OBJECT_MAPPER = new ObjectMapper();

    private final UserDao userDao;
    private final MailService mailService;
    private final AuditLogService auditLogService;

    public AccountProvisioningServiceImpl(UserDao userDao, MailService mailService, AuditLogService auditLogService) {
        this.userDao = userDao;
        this.mailService = mailService;
        this.auditLogService = auditLogService;
    }

    /**
     * userDao.insert -> mailService.sendTemporaryPassword -> auditLogService.record 순서로 실행한다.
     * REQUIRES_NEW 로 별도 트랜잭션을 열어, 메일 발송 실패를 포함해 이 행에서 발생한 예외는 이 행만
     * 롤백시키고 다른 행의 커밋에는 영향을 주지 않는다.
     */
    @Override
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void provision(User user, String temporaryPassword, Long actorId) {
        userDao.insert(user);
        mailService.sendTemporaryPassword(user.getEmail(), user.getEmployeeNo(), temporaryPassword);
        auditLogService.record(actorId, "USER_CREATED", "USER", user.getId(), buildCreateDetail(user));
    }

    private String buildCreateDetail(User user) {
        Map<String, Object> detail = new LinkedHashMap<>();
        detail.put("employeeNo", user.getEmployeeNo());
        try {
            return OBJECT_MAPPER.writeValueAsString(detail);
        } catch (JsonProcessingException e) {
            throw new IllegalStateException("Failed to serialize user create audit detail", e);
        }
    }
}
