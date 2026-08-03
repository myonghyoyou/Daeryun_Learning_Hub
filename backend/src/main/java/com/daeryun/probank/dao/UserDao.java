package com.daeryun.probank.dao;

import com.daeryun.probank.domain.User;
import org.apache.ibatis.annotations.Param;

import java.time.LocalDateTime;

public interface UserDao {
    User findByEmployeeNo(@Param("employeeNo") String employeeNo);
    boolean existsByEmail(@Param("email") String email);
    boolean existsSuperAdmin();
    void insert(User user);
    void incrementFailedLogin(@Param("userId") Long userId, @Param("failedCount") int failedCount);
    void lockAccount(@Param("userId") Long userId, @Param("lockedUntil") LocalDateTime lockedUntil);
    void resetFailedLogin(@Param("userId") Long userId);
    void updateLastLoginAt(@Param("userId") Long userId, @Param("lastLoginAt") LocalDateTime lastLoginAt);
    void updatePassword(@Param("userId") Long userId, @Param("passwordHash") String passwordHash);
}
