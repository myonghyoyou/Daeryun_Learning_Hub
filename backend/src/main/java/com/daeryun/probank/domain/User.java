package com.daeryun.probank.domain;

import lombok.Data;

import java.time.LocalDateTime;

@Data
public class User {
    private Long id;
    private String employeeNo;
    private String name;
    private String email;
    private String passwordHash;
    private Long departmentId;
    private UserRole role;
    private Status status;
    private boolean mustChangePassword;
    private int failedLoginCount;
    private LocalDateTime lockedUntil;
    private LocalDateTime lastLoginAt;
    private LocalDateTime createdAt;
}
