package com.daeryun.probank.dto.user;

import lombok.AllArgsConstructor;
import lombok.Data;

@Data
@AllArgsConstructor
public class UserCreateResponse {
    private String employeeNo;
    private String name;
    private String email;
    private boolean mailSent;
}
