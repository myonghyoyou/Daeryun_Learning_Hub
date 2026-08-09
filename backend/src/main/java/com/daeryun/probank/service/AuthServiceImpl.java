package com.daeryun.probank.service;

import com.daeryun.probank.common.AuthUser;
import com.daeryun.probank.common.ErrorCode;
import com.daeryun.probank.common.SessionKeys;
import com.daeryun.probank.dao.DepartmentDao;
import com.daeryun.probank.dao.UserDao;
import com.daeryun.probank.domain.Department;
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
    private final DepartmentDao departmentDao;
    private final PasswordEncoder passwordEncoder;
    private final int maxFailedAttempts;
    private final int lockoutMinutes;

    public AuthServiceImpl(
            UserDao userDao,
            DepartmentDao departmentDao,
            PasswordEncoder passwordEncoder,
            @Value("${app.auth.max-failed-attempts:5}") int maxFailedAttempts,
            @Value("${app.auth.lockout-minutes:15}") int lockoutMinutes) {
        this.userDao = userDao;
        this.departmentDao = departmentDao;
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
            throw handleFailedAttempt(user);
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
        // 세션에는 departmentId 만 들어 있다. 부서명을 세션에 캐시하지 않고 매번 조회하는 이유는
        // 부서명이 바뀌어도 항상 최신값이 나가야 하기 때문이다. 프런트엔드가 전역 세션 스토어로
        // 중복 호출을 막고 있어 실질 비용은 페이지 로드당 1회다.
        Department department = authUser.getDepartmentId() == null
                ? null
                : departmentDao.findById(authUser.getDepartmentId());
        return new SessionStatusResponse(
                true, authUser.getEmployeeNo(), authUser.getName(), authUser.getRole(),
                authUser.getDepartmentId(), department == null ? null : department.getName(),
                authUser.isMustChangePassword());
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

        // 최초 로그인 강제 변경에서 메일로 받은 임시 비밀번호를 그대로 다시 입력하면
        // 요구사항 자체가 무력화되므로, 현재 저장된 해시와 같은 비밀번호는 거부한다.
        User user = userDao.findByEmployeeNo(current.getEmployeeNo());
        if (user != null && passwordEncoder.matches(newPassword, user.getPasswordHash())) {
            throw new BizException(ErrorCode.INPUT_VALUE_INVALID, "현재 비밀번호와 다른 비밀번호를 입력하세요.");
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

    /**
     * 비밀번호 불일치 시 실패 카운트를 원자적으로 올리고, 이번 시도로 계정이
     * 잠겼는지 여부에 따라 던질 예외를 결정한다.
     *
     * 카운트 증가와 잠금 판정은 모두 SQL 한 문장 안에서 일어난다. Java 에서
     * 읽어 온 failedLoginCount 로 다음 값을 계산하면 동시 요청이 같은 값을 읽고
     * 같은 값을 써서 잠금을 우회할 수 있기 때문이다.
     *
     * 잠금이 걸린 그 시도에서 LOGIN_FAILED 를 던지면 사용자는 방금 잠겼다는
     * 사실을 알 수 없으므로(로그인 화면의 잠금 안내도 뜨지 않는다),
     * ACCOUNT_LOCKED 를 던진다.
     */
    private BizException handleFailedAttempt(User user) {
        LocalDateTime lockedUntil = userDao.incrementFailedLogin(
                user.getId(), maxFailedAttempts, LocalDateTime.now().plusMinutes(lockoutMinutes));
        if (lockedUntil != null && lockedUntil.isAfter(LocalDateTime.now())) {
            return new BizException(ErrorCode.ACCOUNT_LOCKED);
        }
        return new BizException(ErrorCode.LOGIN_FAILED);
    }

    private boolean isBlank(String value) {
        return value == null || value.trim().isEmpty();
    }
}
