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

    private static final int MIN_PASSWORD_LENGTH = 8;

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
        HttpSession session = rotateSession(request);
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

    @Override
    public void changePassword(String newPassword, HttpServletRequest request) {
        if (isBlank(newPassword) || newPassword.length() < MIN_PASSWORD_LENGTH) {
            throw new BizException(ErrorCode.INPUT_VALUE_INVALID, "비밀번호는 8자 이상이어야 합니다.");
        }
        HttpSession session = request.getSession(false);
        AuthUser current = session == null ? null : (AuthUser) session.getAttribute(SessionKeys.LOGIN_USER);
        if (current == null) {
            throw new BizException(ErrorCode.EMPTY_SESSION);
        }

        userDao.updatePassword(current.getUserId(), passwordEncoder.encode(newPassword));

        AuthUser updated = new AuthUser(
                current.getUserId(), current.getEmployeeNo(), current.getName(), current.getRole(),
                current.getDepartmentId(), false);
        // 비밀번호 변경 전에 탈취된 세션이 변경 이후에도 그대로 살아 있으면 안 되므로,
        // 로그인과 동일하게 세션 ID를 교체한 뒤 새 세션에 주체를 설정한다.
        rotateSession(request).setAttribute(SessionKeys.LOGIN_USER, updated);
    }

    /**
     * 세션 고정(session fixation, CWE-384) 방지: 권한 수준이 바뀌는 시점
     * (로그인 성공 / 비밀번호 변경)에 기존 세션을 파기하고 새 세션 ID를 발급한다.
     * 공격자가 미리 심어 둔 JSESSIONID 가 그대로 인증된 세션으로 승격되는 것을 막는다.
     *
     * 기존 세션의 속성은 의도적으로 옮기지 않는다. 이 시점에 보존해야 할 상태가
     * 없고(로그인 전 세션은 익명 상태), 옮기는 순간 공격자가 심어 둔 속성까지
     * 함께 승격되기 때문이다. 호출부는 새 세션을 받기 전에 기존 세션에서 필요한
     * 값을 모두 읽어 두어야 한다.
     */
    private HttpSession rotateSession(HttpServletRequest request) {
        HttpSession existing = request.getSession(false);
        if (existing != null) {
            existing.invalidate();
        }
        return request.getSession(true);
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
