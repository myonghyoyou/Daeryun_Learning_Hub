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
import org.mockito.ArgumentCaptor;
import org.mockito.Mockito;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;

import javax.servlet.http.HttpSession;
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
        // 카운트 증가/잠금 판정은 DB 안에서 원자적으로 처리한다.
        // 서비스는 임계값과 잠금 만료시각만 넘기고, 다음 카운트를 계산하지 않는다.
        Mockito.verify(userDao).incrementFailedLogin(Mockito.eq(1L), Mockito.eq(5), Mockito.any(LocalDateTime.class));
    }

    @Test
    void login_wrongPassword_doesNotComputeNextFailedCountInJava() {
        User user = activeUser("correct-password");
        // DB 의 실제 값과 어긋나는(stale) 카운트를 넣어 둔다. 서비스가 이 값을 근거로
        // 다음 카운트를 계산한다면 그 값이 DAO 로 흘러나가고, 동시 요청에서 잠금이 우회된다.
        user.setFailedLoginCount(99);
        Mockito.when(userDao.findByEmployeeNo("1001")).thenReturn(user);
        MockHttpServletRequest request = new MockHttpServletRequest();

        LoginRequest loginRequest = new LoginRequest();
        loginRequest.setEmployeeNo("1001");
        loginRequest.setPassword("wrong-password");

        assertThrows(BizException.class, () -> authService.login(loginRequest, request));

        ArgumentCaptor<Integer> thresholdCaptor = ArgumentCaptor.forClass(Integer.class);
        Mockito.verify(userDao).incrementFailedLogin(
                Mockito.eq(1L), thresholdCaptor.capture(), Mockito.any(LocalDateTime.class));
        assertEquals(5, thresholdCaptor.getValue().intValue());
    }

    @Test
    void login_attemptThatLocksTheAccount_reportsAccountLockedNotLoginFailed() {
        User user = activeUser("correct-password");
        Mockito.when(userDao.findByEmployeeNo("1001")).thenReturn(user);
        // DB 가 "이 시도로 잠겼다"고 알려주는 상황(갱신 후 locked_until 이 미래).
        Mockito.when(userDao.incrementFailedLogin(Mockito.eq(1L), Mockito.anyInt(), Mockito.any(LocalDateTime.class)))
                .thenReturn(LocalDateTime.now().plusMinutes(15));
        MockHttpServletRequest request = new MockHttpServletRequest();

        LoginRequest loginRequest = new LoginRequest();
        loginRequest.setEmployeeNo("1001");
        loginRequest.setPassword("wrong-password");

        BizException exception = assertThrows(BizException.class, () -> authService.login(loginRequest, request));

        assertEquals(1010, exception.getErrorCode().getCode());
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
    void login_wrongPasswordWithoutLocking_reportsLoginFailed() {
        User user = activeUser("correct-password");
        Mockito.when(userDao.findByEmployeeNo("1001")).thenReturn(user);
        // DB 가 잠금을 적용하지 않은 경우(임계값 미만) locked_until 은 null 로 돌아온다.
        Mockito.when(userDao.incrementFailedLogin(Mockito.eq(1L), Mockito.anyInt(), Mockito.any(LocalDateTime.class)))
                .thenReturn(null);
        MockHttpServletRequest request = new MockHttpServletRequest();

        LoginRequest loginRequest = new LoginRequest();
        loginRequest.setEmployeeNo("1001");
        loginRequest.setPassword("wrong-password");

        BizException exception = assertThrows(BizException.class, () -> authService.login(loginRequest, request));

        assertEquals(1011, exception.getErrorCode().getCode());
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

    @Test
    void changePassword_updatesHashAndSessionFlag() {
        User user = activeUser("correct-password");
        user.setMustChangePassword(true);
        Mockito.when(userDao.findByEmployeeNo("1001")).thenReturn(user);
        MockHttpServletRequest request = new MockHttpServletRequest();
        LoginRequest loginRequest = new LoginRequest();
        loginRequest.setEmployeeNo("1001");
        loginRequest.setPassword("correct-password");
        authService.login(loginRequest, request);

        authService.changePassword("new-password-123", request);

        Mockito.verify(userDao).updatePassword(Mockito.eq(1L), Mockito.anyString());
        AuthUser sessionUser = (AuthUser) request.getSession().getAttribute(SessionKeys.LOGIN_USER);
        assertFalse(sessionUser.isMustChangePassword());
    }

    @Test
    void login_rotatesSessionId_soAPlantedSessionIsNeverPromoted() {
        User user = activeUser("correct-password");
        Mockito.when(userDao.findByEmployeeNo("1001")).thenReturn(user);

        MockHttpServletRequest request = new MockHttpServletRequest();
        // 공격자가 미리 심어 둔 세션을 흉내 낸다.
        HttpSession plantedSession = request.getSession(true);
        plantedSession.setAttribute("attacker-planted", "x");
        String plantedSessionId = plantedSession.getId();

        LoginRequest loginRequest = new LoginRequest();
        loginRequest.setEmployeeNo("1001");
        loginRequest.setPassword("correct-password");
        authService.login(loginRequest, request);

        HttpSession newSession = request.getSession(false);
        assertNotNull(newSession);
        assertNotEquals(plantedSessionId, newSession.getId());
        assertNotNull(newSession.getAttribute(SessionKeys.LOGIN_USER));
        // 심어 둔 세션은 파기되었고, 그 속성도 새 세션으로 승격되지 않는다.
        assertTrue(((MockHttpSession) plantedSession).isInvalid());
        assertNull(newSession.getAttribute("attacker-planted"));
    }

    @Test
    void changePassword_rotatesSessionId_soAPreChangeSessionDoesNotSurvive() {
        User user = activeUser("correct-password");
        user.setMustChangePassword(true);
        Mockito.when(userDao.findByEmployeeNo("1001")).thenReturn(user);
        MockHttpServletRequest request = new MockHttpServletRequest();
        LoginRequest loginRequest = new LoginRequest();
        loginRequest.setEmployeeNo("1001");
        loginRequest.setPassword("correct-password");
        authService.login(loginRequest, request);

        HttpSession beforeChange = request.getSession(false);
        String beforeChangeId = beforeChange.getId();

        authService.changePassword("new-password-123", request);

        HttpSession afterChange = request.getSession(false);
        assertNotNull(afterChange);
        assertNotEquals(beforeChangeId, afterChange.getId());
        assertTrue(((MockHttpSession) beforeChange).isInvalid());
        assertNotNull(afterChange.getAttribute(SessionKeys.LOGIN_USER));
    }

    @Test
    void changePassword_tooShort_rejectsBeforeUpdating() {
        MockHttpServletRequest request = new MockHttpServletRequest();
        request.getSession(true);

        assertThrows(BizException.class, () -> authService.changePassword("short", request));
        Mockito.verify(userDao, Mockito.never()).updatePassword(Mockito.anyLong(), Mockito.anyString());
    }
}
