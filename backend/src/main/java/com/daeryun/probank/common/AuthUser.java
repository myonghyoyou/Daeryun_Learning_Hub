package com.daeryun.probank.common;

import com.daeryun.probank.domain.UserRole;
import lombok.AllArgsConstructor;
import lombok.Getter;

import java.io.Serializable;

@Getter
@AllArgsConstructor
public class AuthUser implements Serializable {

    private static final long serialVersionUID = 1L;

    private Long userId;
    private String employeeNo;
    private String name;
    private UserRole role;
    private Long departmentId;
    private boolean mustChangePassword;
}
