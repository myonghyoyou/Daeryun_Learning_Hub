package com.daeryun.probank.dto.auth;

import com.daeryun.probank.domain.UserRole;
import lombok.AllArgsConstructor;
import lombok.Data;

@Data
@AllArgsConstructor
public class LoginResponse {
    private String name;
    private UserRole role;
    private boolean mustChangePassword;
}
