package com.daeryun.probank.service;

import com.daeryun.probank.dao.AuditLogDao;
import com.daeryun.probank.domain.AuditLog;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Service;

import java.util.Iterator;
import java.util.Map;

@Service
public class AuditLogServiceImpl implements AuditLogService {

    private static final String FORBIDDEN_KEY_FRAGMENT = "password";

    private final AuditLogDao auditLogDao;
    private final ObjectMapper objectMapper;

    public AuditLogServiceImpl(AuditLogDao auditLogDao, ObjectMapper objectMapper) {
        this.auditLogDao = auditLogDao;
        this.objectMapper = objectMapper;
    }

    @Override
    public void record(Long actorId, String action, String targetType, Long targetId, String detailJson) {
        rejectPasswordKeys(detailJson);

        AuditLog auditLog = AuditLog.builder()
                .actorId(actorId)
                .action(action)
                .targetType(targetType)
                .targetId(targetId)
                .detail(detailJson)
                .build();
        auditLogDao.insert(auditLog);
    }

    /**
     * Fails closed: a null {@code detailJson} is allowed through (nothing to check), but a non-null
     * value that either contains a password-related JSON key or cannot be parsed as JSON at all is
     * rejected before the DAO is ever called. A parse failure must not silently bypass the guard, so
     * it is treated the same as finding a forbidden key.
     */
    private void rejectPasswordKeys(String detailJson) {
        if (detailJson == null) {
            return;
        }

        JsonNode root;
        try {
            root = objectMapper.readTree(detailJson);
        } catch (JsonProcessingException e) {
            throw new IllegalArgumentException("detailJson is not valid JSON; cannot verify it is free of password keys", e);
        }

        String offendingKey = findPasswordKey(root);
        if (offendingKey != null) {
            throw new IllegalArgumentException("detailJson must not contain a password-related key: '" + offendingKey + "'");
        }
    }

    /**
     * Recursively scans object field names (not values) for anything containing "password"
     * case-insensitively, e.g. {@code password}, {@code tempPassword}, {@code newPassword}. A value
     * that happens to be the string "password" (e.g. {@code {"changedField":"password"}}) is not a
     * match — only the key name matters.
     */
    private String findPasswordKey(JsonNode node) {
        if (node == null) {
            return null;
        }
        if (node.isObject()) {
            Iterator<Map.Entry<String, JsonNode>> fields = node.fields();
            while (fields.hasNext()) {
                Map.Entry<String, JsonNode> field = fields.next();
                if (field.getKey().toLowerCase().contains(FORBIDDEN_KEY_FRAGMENT)) {
                    return field.getKey();
                }
                String nested = findPasswordKey(field.getValue());
                if (nested != null) {
                    return nested;
                }
            }
        } else if (node.isArray()) {
            for (JsonNode element : node) {
                String nested = findPasswordKey(element);
                if (nested != null) {
                    return nested;
                }
            }
        }
        return null;
    }
}
