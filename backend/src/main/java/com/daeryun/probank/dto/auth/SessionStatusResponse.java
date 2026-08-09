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
    /**
     * 부서관리자 Topbar 가 부서명을 표시하려면 이 값이 필요하다. 부서 목록 API 는
     * SUPER_ADMIN 전용이라 프런트엔드가 id → 이름 변환을 할 수 없다(QA D2).
     */
    private String departmentName;
    private boolean mustChangePassword;

    public static SessionStatusResponse notLoggedIn() {
        return new SessionStatusResponse(false, null, null, null, null, null, false);
    }
}
