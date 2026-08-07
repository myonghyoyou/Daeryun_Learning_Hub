package com.daeryun.probank.filter;

import com.daeryun.probank.common.AuthUser;
import com.daeryun.probank.common.SessionKeys;
import com.daeryun.probank.domain.UserRole;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * SessionCheckFilterTest는 {@code shouldNotFilter}의 판단만 단위로 고정한다. 이 테스트는 그보다
 * 한 겹 위, 즉 <b>실제 서블릿 체인에서</b> 세션 게이트가 {@code /uploads/images/**} 정적 리소스
 * 핸들러보다 먼저 걸리는지를 확인한다 — 필터가 {@code /api/*}에만 매핑돼 있었다면 단위 테스트는
 * 통과해도 실제 요청은 그대로 파일을 내려주기 때문이다.
 * <p>
 * 인증된 경우의 기대값이 404인 것이 핵심이다: 401(필터가 막음)이 아니라 404(리소스 핸들러까지
 * 도달했고 해당 파일이 없을 뿐)라는 것은 필터가 요청을 통과시켰다는 뜻이다. 즉 로그인 사용자의
 * 이미지 미리보기는 그대로 동작한다.
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class UploadedImageAccessIntegrationTest {

    @Autowired
    private MockMvc mockMvc;

    @Test
    void unauthenticatedUploadedImageRequestIsRejected() throws Exception {
        mockMvc.perform(get("/uploads/images/does-not-exist.png"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void authenticatedUploadedImageRequestReachesResourceHandler() throws Exception {
        // 문제 풀이는 전사 공통이므로 관리자가 아닌 일반 임직원도 통과해야 한다.
        MockHttpSession session = new MockHttpSession();
        session.setAttribute(SessionKeys.LOGIN_USER,
                new AuthUser(1L, "1001", "홍길동", UserRole.EMPLOYEE, 1L, false));

        mockMvc.perform(get("/uploads/images/does-not-exist.png").session(session))
                .andExpect(status().isNotFound());
    }
}
