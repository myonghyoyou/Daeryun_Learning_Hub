package com.daeryun.probank.service;

import com.daeryun.probank.dto.auth.LoginRequest;
import com.daeryun.probank.dto.auth.LoginResponse;
import com.daeryun.probank.dto.auth.SessionStatusResponse;

import javax.servlet.http.HttpServletRequest;

public interface AuthService {
    LoginResponse login(LoginRequest loginRequest, HttpServletRequest request);

    void logout(HttpServletRequest request);

    SessionStatusResponse getSessionStatus(HttpServletRequest request);

    void changePassword(String newPassword, HttpServletRequest request);
}
