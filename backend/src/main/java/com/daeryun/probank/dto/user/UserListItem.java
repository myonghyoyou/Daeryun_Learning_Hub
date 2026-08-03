package com.daeryun.probank.dto.user;

import com.daeryun.probank.domain.Status;
import com.daeryun.probank.domain.UserRole;
import lombok.Data;

import java.time.LocalDateTime;

@Data
public class UserListItem {
    private Long id;
    private String employeeNo;
    private String name;
    private String email;
    private Long departmentId;
    private String departmentName;
    private UserRole role;
    private Status status;
    private LocalDateTime lastLoginAt;
}
