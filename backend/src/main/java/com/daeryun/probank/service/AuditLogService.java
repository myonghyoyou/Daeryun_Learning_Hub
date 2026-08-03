package com.daeryun.probank.service;

public interface AuditLogService {

    /**
     * Records an admin/system action to the audit log.
     * <p>
     * {@code detailJson} must be a JSON string (or null) and must never contain a password or
     * temporary password value — callers are responsible for excluding such values before invoking
     * this method.
     */
    void record(Long actorId, String action, String targetType, Long targetId, String detailJson);
}
