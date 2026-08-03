package com.daeryun.probank.dto.auth;

import lombok.Data;

@Data
public class LoginRequest {
    private String employeeNo;
    private String password;
}
