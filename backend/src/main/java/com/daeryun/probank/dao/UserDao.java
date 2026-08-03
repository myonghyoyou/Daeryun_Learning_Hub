package com.daeryun.probank.dao;

import com.daeryun.probank.domain.User;
import org.apache.ibatis.annotations.Param;

import java.time.LocalDateTime;

public interface UserDao {
    User findByEmployeeNo(@Param("employeeNo") String employeeNo);
    boolean existsByEmail(@Param("email") String email);
    boolean existsSuperAdmin();
    void insert(User user);
    /**
     * 로그인 실패 카운트를 DB 안에서 원자적으로 1 증가시키고, 그 결과가
     * maxFailedAttempts 이상이면 같은 문장에서 lockedUntil 로 계정을 잠근다.
     *
     * @return 갱신 후의 locked_until (잠기지 않았고 기존 잠금도 없으면 null)
     */
    LocalDateTime incrementFailedLogin(@Param("userId") Long userId,
                                       @Param("maxFailedAttempts") int maxFailedAttempts,
                                       @Param("lockedUntil") LocalDateTime lockedUntil);
    void lockAccount(@Param("userId") Long userId, @Param("lockedUntil") LocalDateTime lockedUntil);
    void resetFailedLogin(@Param("userId") Long userId);
    void updateLastLoginAt(@Param("userId") Long userId, @Param("lastLoginAt") LocalDateTime lastLoginAt);
    void updatePassword(@Param("userId") Long userId, @Param("passwordHash") String passwordHash);
}
