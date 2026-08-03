package com.daeryun.probank.service;

import com.daeryun.probank.common.AuthUser;
import com.daeryun.probank.common.SessionKeys;
import com.daeryun.probank.dao.UserDao;
import com.daeryun.probank.domain.Status;
import com.daeryun.probank.domain.User;
import com.daeryun.probank.domain.UserRole;
import com.daeryun.probank.dto.auth.LoginRequest;
import com.daeryun.probank.dto.auth.LoginResponse;
import com.daeryun.probank.dto.auth.SessionStatusResponse;
import com.daeryun.probank.exception.BizException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;

import java.time.LocalDateTime;

import static org.junit.jupiter.api.Assertions.*;

class AuthServiceImplTest {

    private UserDao userDao;
    private PasswordEncoder passwordEncoder;
    private AuthServiceImpl authService;

    @BeforeEach
    void setUp() {
        userDao = Mockito.mock(UserDao.class);
        passwordEncoder = new BCryptPasswordEncoder();
        authService = new AuthServiceImpl(userDao, passwordEncoder, 5, 15);
    }

    private User activeUser(String rawPassword) {
        User user = new User();
        user.setId(1L);
        user.setEmployeeNo("1001");
        user.setName("홍길동");
        user.setPasswordHash(passwordEncoder.encode(rawPassword));
        user.setDepartmentId(10L);
        user.setRole(UserRole.EMPLOYEE);
        user.setStatus(Status.ACTIVE);
        user.setMustChangePassword(false);
        user.setFailedLoginCount(0);
        return user;
    }

    @Test
    void login_success_createsSessionWithAuthUser() {
        User user = activeUser("correct-password");
        Mockito.when(userDao.findByEmployeeNo("1001")).thenReturn(user);
        MockHttpServletRequest request = new MockHttpServletRequest();

        LoginRequest loginRequest = new LoginRequest();
        loginRequest.setEmployeeNo("1001");
        loginRequest.setPassword("correct-password");

        LoginResponse response = authService.login(loginRequest, request);

        assertEquals("홍길동", response.getName());
        assertEquals(UserRole.EMPLOYEE, response.getRole());
        AuthUser sessionUser = (AuthUser) request.getSession().getAttribute(SessionKeys.LOGIN_USER);
        assertNotNull(sessionUser);
        assertEquals("1001", sessionUser.getEmployeeNo());
        Mockito.verify(userDao).resetFailedLogin(1L);
        Mockito.verify(userDao).updateLastLoginAt(Mockito.eq(1L), Mockito.any());
    }

    @Test
    void login_wrongPassword_incrementsFailedCountAndRejects() {
        User user = activeUser("correct-password");
        Mockito.when(userDao.findByEmployeeNo("1001")).thenReturn(user);
        MockHttpServletRequest request = new MockHttpServletRequest();

        LoginRequest loginRequest = new LoginRequest();
        loginRequest.setEmployeeNo("1001");
        loginRequest.setPassword("wrong-password");

        BizException exception = assertThrows(BizException.class, () -> authService.login(loginRequest, request));

        assertEquals(1011, exception.getErrorCode().getCode());
        Mockito.verify(userDao).incrementFailedLogin(1L, 1);
    }

    @Test
    void login_fifthWrongPassword_locksAccount() {
        User user = activeUser("correct-password");
        user.setFailedLoginCount(4);
        Mockito.when(userDao.findByEmployeeNo("1001")).thenReturn(user);
        MockHttpServletRequest request = new MockHttpServletRequest();

        LoginRequest loginRequest = new LoginRequest();
        loginRequest.setEmployeeNo("1001");
        loginRequest.setPassword("wrong-password");

        assertThrows(BizException.class, () -> authService.login(loginRequest, request));

        Mockito.verify(userDao).lockAccount(Mockito.eq(1L), Mockito.any(LocalDateTime.class));
        Mockito.verify(userDao, Mockito.never()).incrementFailedLogin(Mockito.anyLong(), Mockito.anyInt());
    }

    @Test
    void login_lockedAccount_rejectsEvenWithCorrectPassword() {
        User user = activeUser("correct-password");
        user.setLockedUntil(LocalDateTime.now().plusMinutes(10));
        Mockito.when(userDao.findByEmployeeNo("1001")).thenReturn(user);
        MockHttpServletRequest request = new MockHttpServletRequest();

        LoginRequest loginRequest = new LoginRequest();
        loginRequest.setEmployeeNo("1001");
        loginRequest.setPassword("correct-password");

        BizException exception = assertThrows(BizException.class, () -> authService.login(loginRequest, request));

        assertEquals(1010, exception.getErrorCode().getCode());
    }

    @Test
    void login_unknownEmployeeNo_rejectsWithSameMessageAsWrongPassword() {
        Mockito.when(userDao.findByEmployeeNo("unknown")).thenReturn(null);
        MockHttpServletRequest request = new MockHttpServletRequest();

        LoginRequest loginRequest = new LoginRequest();
        loginRequest.setEmployeeNo("unknown");
        loginRequest.setPassword("anything");

        BizException exception = assertThrows(BizException.class, () -> authService.login(loginRequest, request));

        assertEquals(1011, exception.getErrorCode().getCode());
    }

    @Test
    void login_blankOrNullCredentials_rejectsWithInputValueInvalid() {
        MockHttpServletRequest request = new MockHttpServletRequest();

        LoginRequest nullEmployeeNo = new LoginRequest();
        nullEmployeeNo.setEmployeeNo(null);
        nullEmployeeNo.setPassword("anything");
        assertEquals(1000, assertThrows(BizException.class, () -> authService.login(nullEmployeeNo, request))
                .getErrorCode().getCode());

        LoginRequest blankEmployeeNo = new LoginRequest();
        blankEmployeeNo.setEmployeeNo("  ");
        blankEmployeeNo.setPassword("anything");
        assertEquals(1000, assertThrows(BizException.class, () -> authService.login(blankEmployeeNo, request))
                .getErrorCode().getCode());

        LoginRequest nullPassword = new LoginRequest();
        nullPassword.setEmployeeNo("1001");
        nullPassword.setPassword(null);
        assertEquals(1000, assertThrows(BizException.class, () -> authService.login(nullPassword, request))
                .getErrorCode().getCode());

        LoginRequest blankPassword = new LoginRequest();
        blankPassword.setEmployeeNo("1001");
        blankPassword.setPassword("  ");
        assertEquals(1000, assertThrows(BizException.class, () -> authService.login(blankPassword, request))
                .getErrorCode().getCode());

        Mockito.verifyNoInteractions(userDao);
    }

    @Test
    void login_fourthWrongPassword_incrementsWithoutLocking() {
        User user = activeUser("correct-password");
        user.setFailedLoginCount(3);
        Mockito.when(userDao.findByEmployeeNo("1001")).thenReturn(user);
        MockHttpServletRequest request = new MockHttpServletRequest();

        LoginRequest loginRequest = new LoginRequest();
        loginRequest.setEmployeeNo("1001");
        loginRequest.setPassword("wrong-password");

        assertThrows(BizException.class, () -> authService.login(loginRequest, request));

        Mockito.verify(userDao).incrementFailedLogin(1L, 4);
        Mockito.verify(userDao, Mockito.never()).lockAccount(Mockito.anyLong(), Mockito.any(LocalDateTime.class));
    }

    @Test
    void login_expiredLock_allowsLoginWithCorrectPassword() {
        User user = activeUser("correct-password");
        user.setLockedUntil(LocalDateTime.now().minusMinutes(1));
        Mockito.when(userDao.findByEmployeeNo("1001")).thenReturn(user);
        MockHttpServletRequest request = new MockHttpServletRequest();

        LoginRequest loginRequest = new LoginRequest();
        loginRequest.setEmployeeNo("1001");
        loginRequest.setPassword("correct-password");

        LoginResponse response = authService.login(loginRequest, request);

        assertEquals("홍길동", response.getName());
        AuthUser sessionUser = (AuthUser) request.getSession().getAttribute(SessionKeys.LOGIN_USER);
        assertNotNull(sessionUser);
        Mockito.verify(userDao).resetFailedLogin(1L);
    }

    @Test
    void getSessionStatus_noSession_returnsLoggedInFalse() {
        MockHttpServletRequest request = new MockHttpServletRequest();

        SessionStatusResponse status = authService.getSessionStatus(request);

        assertFalse(status.isLoggedIn());
    }

    @Test
    void logout_invalidatesSession() {
        User user = activeUser("correct-password");
        Mockito.when(userDao.findByEmployeeNo("1001")).thenReturn(user);
        MockHttpServletRequest request = new MockHttpServletRequest();
        LoginRequest loginRequest = new LoginRequest();
        loginRequest.setEmployeeNo("1001");
        loginRequest.setPassword("correct-password");
        authService.login(loginRequest, request);

        authService.logout(request);

        assertNull(request.getSession(false));
    }
}
