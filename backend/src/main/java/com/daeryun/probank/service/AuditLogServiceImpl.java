package com.daeryun.probank.service;

import com.daeryun.probank.dao.AuditLogDao;
import com.daeryun.probank.domain.AuditLog;
import org.springframework.stereotype.Service;

@Service
public class AuditLogServiceImpl implements AuditLogService {

    private final AuditLogDao auditLogDao;

    public AuditLogServiceImpl(AuditLogDao auditLogDao) {
        this.auditLogDao = auditLogDao;
    }

    @Override
    public void record(Long actorId, String action, String targetType, Long targetId, String detailJson) {
        AuditLog auditLog = AuditLog.builder()
                .actorId(actorId)
                .action(action)
                .targetType(targetType)
                .targetId(targetId)
                .detail(detailJson)
                .build();
        auditLogDao.insert(auditLog);
    }
}
