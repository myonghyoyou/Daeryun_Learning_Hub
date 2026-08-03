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

    @RequireRole(UserRole.DEPT_ADMIN)
    static class DeptAdminOnlyController {
        public void inheritsClassRole() {
        }

        @RequireRole(UserRole.SUPER_ADMIN)
        public void overridesWithSuperAdminOnly() {
        }
    }

    private final RoleCheckInterceptor interceptor = new RoleCheckInterceptor();

    private HandlerMethod handlerMethodFor(String methodName) throws NoSuchMethodException {
        Method method = SampleController.class.getMethod(methodName);
        return new HandlerMethod(new SampleController(), method);
    }

    private HandlerMethod deptAdminHandlerMethodFor(String methodName) throws NoSuchMethodException {
        Method method = DeptAdminOnlyController.class.getMethod(methodName);
        return new HandlerMethod(new DeptAdminOnlyController(), method);
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
        BizException exception = assertThrows(BizException.class, () ->
                interceptor.preHandle(request, new MockHttpServletResponse(), handlerMethodFor("superAdminOnly")));
        assertEquals(980, exception.getErrorCode().getCode());
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

    @Test
    void classLevelAnnotation_wrongRole_throwsAccessDenied() throws Exception {
        MockHttpServletRequest request = new MockHttpServletRequest();
        AuthUser authUser = new AuthUser(1L, "1001", "홍길동", UserRole.EMPLOYEE, 1L, false);
        request.getSession(true).setAttribute(SessionKeys.LOGIN_USER, authUser);

        BizException exception = assertThrows(BizException.class, () ->
                interceptor.preHandle(request, new MockHttpServletResponse(), deptAdminHandlerMethodFor("inheritsClassRole")));
        assertEquals(990, exception.getErrorCode().getCode());
    }

    @Test
    void classLevelAnnotation_matchingRole_isAllowed() throws Exception {
        MockHttpServletRequest request = new MockHttpServletRequest();
        AuthUser authUser = new AuthUser(1L, "2001", "김부장", UserRole.DEPT_ADMIN, 1L, false);
        request.getSession(true).setAttribute(SessionKeys.LOGIN_USER, authUser);

        boolean result = interceptor.preHandle(request, new MockHttpServletResponse(), deptAdminHandlerMethodFor("inheritsClassRole"));
        assertTrue(result);
    }

    @Test
    void methodLevelAnnotation_overridesClassLevelAnnotation() throws Exception {
        MockHttpServletRequest request = new MockHttpServletRequest();
        // Has the class-required DEPT_ADMIN role, but the method itself requires SUPER_ADMIN,
        // which must take precedence over the class-level annotation.
        AuthUser authUser = new AuthUser(1L, "2001", "김부장", UserRole.DEPT_ADMIN, 1L, false);
        request.getSession(true).setAttribute(SessionKeys.LOGIN_USER, authUser);

        BizException exception = assertThrows(BizException.class, () ->
                interceptor.preHandle(request, new MockHttpServletResponse(), deptAdminHandlerMethodFor("overridesWithSuperAdminOnly")));
        assertEquals(990, exception.getErrorCode().getCode());
    }
}
