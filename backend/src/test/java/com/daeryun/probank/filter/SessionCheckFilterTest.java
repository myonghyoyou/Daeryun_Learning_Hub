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
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
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

    // 업로드된 문제 이미지(/uploads/images/**)는 StaticResourceConfig가 파일 시스템에서 서빙한다.
    // 세션 게이트를 /api/에만 걸면 URL만 알면 로그인 없이 내려받을 수 있었다 — 아래 두 테스트가
    // "미인증은 막고, 인증은 통과"를 양쪽 분기 모두 고정한다. 게이트 수정 전에는 첫 번째 테스트가
    // 401이 아니라 200 + 체인 통과로 실패한다.
    @Test
    void rejectsUploadedImageWithoutSession() throws Exception {
        MockHttpServletRequest request = new MockHttpServletRequest("GET", "/uploads/images/x.png");
        MockHttpServletResponse response = new MockHttpServletResponse();
        MockFilterChain chain = new MockFilterChain();

        filter.doFilter(request, response, chain);

        assertEquals(401, response.getStatus());
        assertNull(chain.getRequest(), "미인증 요청은 정적 리소스 핸들러까지 도달해서는 안 된다.");
        assertTrue(response.getContentAsString().contains("\"resultCode\":980"));
    }

    @Test
    void allowsUploadedImageWithValidSession() throws Exception {
        MockHttpServletRequest request = new MockHttpServletRequest("GET", "/uploads/images/x.png");
        // 문제 풀이는 전사 공통이므로 부서관리자가 아닌 일반 임직원도 이미지를 볼 수 있어야 한다.
        AuthUser authUser = new AuthUser(1L, "1001", "홍길동", UserRole.EMPLOYEE, 1L, false);
        request.getSession(true).setAttribute(SessionKeys.LOGIN_USER, authUser);
        MockHttpServletResponse response = new MockHttpServletResponse();
        MockFilterChain chain = new MockFilterChain();

        filter.doFilter(request, response, chain);

        assertEquals(200, response.getStatus());
        assertNotNull(chain.getRequest(), "인증된 요청은 정적 리소스 핸들러로 그대로 넘어가야 한다.");
    }
}
