package com.daeryun.probank.service;

public interface AuditLogService {

    /**
     * Records an admin/system action to the audit log.
     * <p>
     * {@code detailJson} must be a JSON string, or null. The implementation enforces — not merely
     * documents — that {@code detailJson} carries no password or temporary password value: any JSON
     * key whose name contains "password" (case-insensitive, e.g. {@code password}, {@code
     * tempPassword}, {@code newPassword}), at any nesting depth, causes this method to throw {@link
     * IllegalArgumentException} before anything is persisted. A {@code detailJson} that is present but
     * not valid JSON is rejected the same way, so a parse failure can never bypass the check. Keys
     * unrelated to "password" and values that merely mention the word (e.g. {@code
     * {"changedField":"password"}}) are unaffected.
     */
    void record(Long actorId, String action, String targetType, Long targetId, String detailJson);
}
