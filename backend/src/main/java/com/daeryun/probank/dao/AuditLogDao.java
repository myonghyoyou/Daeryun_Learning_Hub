package com.daeryun.probank.dao;

import com.daeryun.probank.domain.AuditLog;

public interface AuditLogDao {

    void insert(AuditLog auditLog);
}
