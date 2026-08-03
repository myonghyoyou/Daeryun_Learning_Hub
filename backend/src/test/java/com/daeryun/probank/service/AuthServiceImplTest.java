package com.daeryun.probank.service;

import com.daeryun.probank.common.AuthUser;
import com.daeryun.probank.common.SessionKeys;
import com.daeryun.probank.dao.UserDao;
import com.daeryun.probank.domain.Status;
import com.daeryun.probank.domain.User;
import com.daeryun.probank.domain.UserRole;
import com.daeryun.probank.dto.auth.LoginRequest;
import com.daeryun.probank.dto.auth.LoginResponse;
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
}
