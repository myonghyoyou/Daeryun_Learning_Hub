package com.daeryun.probank.dto.auth;

import com.daeryun.probank.domain.UserRole;
import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class SessionStatusResponse {

    @JsonProperty("isLoggedIn")
    private boolean loggedIn;
    private String employeeNo;
    private String name;
    private UserRole role;
    private Long departmentId;
    private boolean mustChangePassword;

    public static SessionStatusResponse notLoggedIn() {
        return new SessionStatusResponse(false, null, null, null, null, false);
    }
}
