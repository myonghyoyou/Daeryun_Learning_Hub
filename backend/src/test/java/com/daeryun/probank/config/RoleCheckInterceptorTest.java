package com.daeryun.probank.config;

import com.daeryun.probank.common.AuthUser;
import com.daeryun.probank.common.RequireRole;
import com.daeryun.probank.common.SessionKeys;
import com.daeryun.probank.domain.UserRole;
import com.daeryun.probank.exception.BizException;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.web.method.HandlerMethod;

import java.lang.reflect.Method;

import static org.junit.jupiter.api.Assertions.*;

class RoleCheckInterceptorTest {

    static class SampleController {
        @RequireRole(UserRole.SUPER_ADMIN)
        public void superAdminOnly() {
        }

        public void anyoneAllowed() {
        }
    }

    private final RoleCheckInterceptor interceptor = new RoleCheckInterceptor();

    private HandlerMethod handlerMethodFor(String methodName) throws NoSuchMethodException {
        Method method = SampleController.class.getMethod(methodName);
        return new HandlerMethod(new SampleController(), method);
    }

    @Test
    void methodWithoutAnnotation_isAllowedWithoutSession() throws Exception {
        MockHttpServletRequest request = new MockHttpServletRequest();
        boolean result = interceptor.preHandle(request, new MockHttpServletResponse(), handlerMethodFor("anyoneAllowed"));
        assertTrue(result);
    }

    @Test
    void methodWithAnnotation_noSession_throwsEmptySession() throws Exception {
        MockHttpServletRequest request = new MockHttpServletRequest();
        assertThrows(BizException.class, () ->
                interceptor.preHandle(request, new MockHttpServletResponse(), handlerMethodFor("superAdminOnly")));
    }

    @Test
    void methodWithAnnotation_wrongRole_throwsAccessDenied() throws Exception {
        MockHttpServletRequest request = new MockHttpServletRequest();
        AuthUser authUser = new AuthUser(1L, "1001", "홍길동", UserRole.EMPLOYEE, 1L, false);
        request.getSession(true).setAttribute(SessionKeys.LOGIN_USER, authUser);

        BizException exception = assertThrows(BizException.class, () ->
                interceptor.preHandle(request, new MockHttpServletResponse(), handlerMethodFor("superAdminOnly")));
        assertEquals(990, exception.getErrorCode().getCode());
    }

    @Test
    void methodWithAnnotation_matchingRole_isAllowed() throws Exception {
        MockHttpServletRequest request = new MockHttpServletRequest();
        AuthUser authUser = new AuthUser(1L, "admin", "총괄관리자", UserRole.SUPER_ADMIN, 1L, false);
        request.getSession(true).setAttribute(SessionKeys.LOGIN_USER, authUser);

        boolean result = interceptor.preHandle(request, new MockHttpServletResponse(), handlerMethodFor("superAdminOnly"));
        assertTrue(result);
    }
}
