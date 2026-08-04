package com.daeryun.probank.dto.user;

import com.daeryun.probank.domain.UserRole;
import lombok.Data;

@Data
public class UserCreateRequest {
    private String employeeNo;
    private String name;
    private String email;
    private Long departmentId;
    private UserRole role;
}
