package com.daeryun.probank.dto.user;

import com.daeryun.probank.domain.Status;
import com.daeryun.probank.domain.UserRole;
import lombok.Data;

@Data
public class UserUpdateRequest {
    private String name;
    private String email;
    private Long departmentId;
    private UserRole role;
    private Status status;
}
