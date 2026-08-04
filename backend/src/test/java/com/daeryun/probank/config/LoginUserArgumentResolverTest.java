package com.daeryun.probank.config;

import com.daeryun.probank.common.AuthUser;
import com.daeryun.probank.common.LoginUser;
import com.daeryun.probank.common.SessionKeys;
import com.daeryun.probank.domain.UserRole;
import org.junit.jupiter.api.Test;
import org.springframework.core.MethodParameter;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.web.context.request.NativeWebRequest;
import org.springframework.web.context.request.ServletWebRequest;

import java.lang.reflect.Method;

import static org.junit.jupiter.api.Assertions.*;

class LoginUserArgumentResolverTest {

    static class SampleController {
        public void withLoginUser(@LoginUser AuthUser actor) {
        }

        public void withoutAnnotation(AuthUser actor) {
        }
    }

    private final LoginUserArgumentResolver resolver = new LoginUserArgumentResolver();

    private MethodParameter parameterOf(String methodName) throws NoSuchMethodException {
        Method method = SampleController.class.getMethod(methodName, AuthUser.class);
        return new MethodParameter(method, 0);
    }

    @Test
    void resolveArgument_withSessionUser_returnsAuthUser() throws Exception {
        MockHttpServletRequest request = new MockHttpServletRequest();
        AuthUser authUser = new AuthUser(1L, "admin", "관리자", UserRole.SUPER_ADMIN, null, false);
        request.getSession(true).setAttribute(SessionKeys.LOGIN_USER, authUser);
        NativeWebRequest webRequest = new ServletWebRequest(request);

        Object resolved = resolver.resolveArgument(null, null, webRequest, null);

        assertSame(authUser, resolved);
    }

    @Test
    void resolveArgument_withNoSession_returnsNull() {
        MockHttpServletRequest request = new MockHttpServletRequest();
        NativeWebRequest webRequest = new ServletWebRequest(request);

        Object resolved = resolver.resolveArgument(null, null, webRequest, null);

        assertNull(resolved);
    }

    @Test
    void resolveArgument_withSessionButNoAttribute_returnsNull() {
        MockHttpServletRequest request = new MockHttpServletRequest();
        request.getSession(true);
        NativeWebRequest webRequest = new ServletWebRequest(request);

        Object resolved = resolver.resolveArgument(null, null, webRequest, null);

        assertNull(resolved);
    }

    @Test
    void supportsParameter_withLoginUserAnnotation_returnsTrue() throws Exception {
        assertTrue(resolver.supportsParameter(parameterOf("withLoginUser")));
    }

    @Test
    void supportsParameter_withoutLoginUserAnnotation_returnsFalse() throws Exception {
        assertFalse(resolver.supportsParameter(parameterOf("withoutAnnotation")));
    }
}
