package com.daeryun.probank.filter;

import com.daeryun.probank.common.AuthUser;
import com.daeryun.probank.common.SessionKeys;
import com.daeryun.probank.domain.UserRole;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.mock.web.MockFilterChain;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class SessionCheckFilterTest {

    private final SessionCheckFilter filter = new SessionCheckFilter(new ObjectMapper());

    @Test
    void rejectsRequestWithoutSession() throws Exception {
        MockHttpServletRequest request = new MockHttpServletRequest("GET", "/api/departments");
        MockHttpServletResponse response = new MockHttpServletResponse();

        filter.doFilter(request, response, new MockFilterChain());

        assertEquals(401, response.getStatus());
        assertTrue(response.getContentAsString().contains("\"resultCode\":980"));
    }

    @Test
    void allowsLoginPathWithoutSession() throws Exception {
        MockHttpServletRequest request = new MockHttpServletRequest("POST", "/api/auth/login");
        MockHttpServletResponse response = new MockHttpServletResponse();
        MockFilterChain chain = new MockFilterChain();

        filter.doFilter(request, response, chain);

        assertTrue(chain.getRequest() != null);
    }

    @Test
    void requiresPasswordChangeBeforeOtherApis() throws Exception {
        MockHttpServletRequest request = new MockHttpServletRequest("GET", "/api/departments");
        AuthUser authUser = new AuthUser(1L, "1001", "홍길동", UserRole.EMPLOYEE, 1L, true);
        request.getSession(true).setAttribute(SessionKeys.LOGIN_USER, authUser);
        MockHttpServletResponse response = new MockHttpServletResponse();

        filter.doFilter(request, response, new MockFilterChain());

        assertEquals(200, response.getStatus());
        assertTrue(response.getContentAsString().contains("\"resultCode\":1012"));
    }

    @Test
    void allowsRequestWithValidSession() throws Exception {
        MockHttpServletRequest request = new MockHttpServletRequest("GET", "/api/departments");
        AuthUser authUser = new AuthUser(1L, "1001", "홍길동", UserRole.EMPLOYEE, 1L, false);
        request.getSession(true).setAttribute(SessionKeys.LOGIN_USER, authUser);
        MockHttpServletResponse response = new MockHttpServletResponse();
        MockFilterChain chain = new MockFilterChain();

        filter.doFilter(request, response, chain);

        assertTrue(chain.getRequest() != null);
    }
}
