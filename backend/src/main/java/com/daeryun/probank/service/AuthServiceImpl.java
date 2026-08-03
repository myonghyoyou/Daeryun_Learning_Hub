package com.daeryun.probank.service;

import com.daeryun.probank.common.AuthUser;
import com.daeryun.probank.common.ErrorCode;
import com.daeryun.probank.common.SessionKeys;
import com.daeryun.probank.dao.UserDao;
import com.daeryun.probank.domain.Status;
import com.daeryun.probank.domain.User;
import com.daeryun.probank.dto.auth.LoginRequest;
import com.daeryun.probank.dto.auth.LoginResponse;
import com.daeryun.probank.dto.auth.SessionStatusResponse;
import com.daeryun.probank.exception.BizException;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;

import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpSession;
import java.time.LocalDateTime;

@Service
public class AuthServiceImpl implements AuthService {

    private final UserDao userDao;
    private final PasswordEncoder passwordEncoder;
    private final int maxFailedAttempts;
    private final int lockoutMinutes;

    public AuthServiceImpl(
            UserDao userDao,
            PasswordEncoder passwordEncoder,
            @Value("${app.auth.max-failed-attempts:5}") int maxFailedAttempts,
            @Value("${app.auth.lockout-minutes:15}") int lockoutMinutes) {
        this.userDao = userDao;
        this.passwordEncoder = passwordEncoder;
        this.maxFailedAttempts = maxFailedAttempts;
        this.lockoutMinutes = lockoutMinutes;
    }

    @Override
    public LoginResponse login(LoginRequest loginRequest, HttpServletRequest request) {
        if (loginRequest == null || isBlank(loginRequest.getEmployeeNo()) || isBlank(loginRequest.getPassword())) {
            throw new BizException(ErrorCode.INPUT_VALUE_INVALID, "사번과 비밀번호를 입력하세요.");
        }

        User user = userDao.findByEmployeeNo(loginRequest.getEmployeeNo());
        if (user == null || user.getStatus() == Status.INACTIVE) {
            throw new BizException(ErrorCode.LOGIN_FAILED);
        }
        if (user.getLockedUntil() != null && user.getLockedUntil().isAfter(LocalDateTime.now())) {
            throw new BizException(ErrorCode.ACCOUNT_LOCKED);
        }
        if (!passwordEncoder.matches(loginRequest.getPassword(), user.getPasswordHash())) {
            handleFailedAttempt(user);
            throw new BizException(ErrorCode.LOGIN_FAILED);
        }

        userDao.resetFailedLogin(user.getId());
        userDao.updateLastLoginAt(user.getId(), LocalDateTime.now());

        AuthUser authUser = new AuthUser(
                user.getId(), user.getEmployeeNo(), user.getName(), user.getRole(),
                user.getDepartmentId(), user.isMustChangePassword());
        HttpSession session = request.getSession(true);
        session.setAttribute(SessionKeys.LOGIN_USER, authUser);

        return new LoginResponse(user.getName(), user.getRole(), user.isMustChangePassword());
    }

    @Override
    public void logout(HttpServletRequest request) {
        HttpSession session = request.getSession(false);
        if (session != null) {
            session.invalidate();
        }
    }

    @Override
    public SessionStatusResponse getSessionStatus(HttpServletRequest request) {
        HttpSession session = request.getSession(false);
        AuthUser authUser = session == null ? null : (AuthUser) session.getAttribute(SessionKeys.LOGIN_USER);
        if (authUser == null) {
            return SessionStatusResponse.notLoggedIn();
        }
        return new SessionStatusResponse(
                true, authUser.getEmployeeNo(), authUser.getName(), authUser.getRole(),
                authUser.getDepartmentId(), authUser.isMustChangePassword());
    }

    private void handleFailedAttempt(User user) {
        int nextFailedCount = user.getFailedLoginCount() + 1;
        if (nextFailedCount >= maxFailedAttempts) {
            userDao.lockAccount(user.getId(), LocalDateTime.now().plusMinutes(lockoutMinutes));
        } else {
            userDao.incrementFailedLogin(user.getId(), nextFailedCount);
        }
    }

    private boolean isBlank(String value) {
        return value == null || value.trim().isEmpty();
    }
}
