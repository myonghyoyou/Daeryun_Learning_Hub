package com.daeryun.probank.config;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.autoconfigure.web.ServerProperties;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.web.servlet.server.Session;
import org.springframework.test.context.ActiveProfiles;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * 세션 쿠키 보안 속성이 설정 파일에서 실제로 적용되는지 확인한다.
 *
 * secure 플래그가 없으면(이 테스트 이전 상태) 평문 HTTP 로도 JSESSIONID 가
 * 전송되어 세션 탈취 경로가 열린다. 환경별로 켤 수 있도록
 * ${SESSION_COOKIE_SECURE:false} 로 바인딩하며, 운영 환경에서는 true 로 설정해야 한다.
 */
@SpringBootTest
@ActiveProfiles("test")
class SessionCookieConfigTest {

    @Autowired
    private ServerProperties serverProperties;

    @Test
    void sessionCookieHasHttpOnlySameSiteAndAnExplicitSecureFlag() {
        Session.Cookie cookie = serverProperties.getServlet().getSession().getCookie();

        assertEquals(Boolean.TRUE, cookie.getHttpOnly());
        assertEquals("Lax", cookie.getSameSite().attributeValue());

        // secure 는 명시적으로 바인딩되어야 한다(설정 누락 시 null).
        assertNotNull(cookie.getSecure(), "세션 쿠키의 secure 플래그가 설정되어 있지 않다");
        // 기본값은 false 라서 로컬 HTTP 개발이 그대로 동작한다.
        assertFalse(cookie.getSecure());
    }

    @Test
    void sessionTimeoutIs90Minutes() {
        assertNotNull(serverProperties.getServlet().getSession().getTimeout());
        assertTrue(serverProperties.getServlet().getSession().getTimeout().toMinutes() == 90);
    }
}
