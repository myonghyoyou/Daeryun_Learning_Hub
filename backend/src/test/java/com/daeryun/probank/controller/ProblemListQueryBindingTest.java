package com.daeryun.probank.controller;

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
import org.springframework.transaction.annotation.Transactional;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * ProblemServiceImplTest는 ProblemService.list(...)를 LocalDate 객체로 직접 호출한다.
 * 즉 Spring MVC의 문자열 → LocalDate 변환 단계를 통째로 건너뛰므로, 쿼리 파라미터
 * 바인딩이 깨져도 서비스 단위 테스트는 전부 통과한다. 실제로 그 공백 때문에
 * 등록일 필터가 동작하지 않는 결함(QA D1)이 189개 테스트를 지나갔다.
 * <p>
 * 이 테스트는 그보다 한 겹 위, <b>실제 서블릿 체인</b>에서 쿼리 파라미터가 문자열로
 * 들어왔을 때 컨트롤러 시그니처에 바인딩되는지를 확인한다.
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Transactional
class ProblemListQueryBindingTest {

    @Autowired
    private MockMvc mockMvc;

    private MockHttpSession superAdminSession() {
        MockHttpSession session = new MockHttpSession();
        session.setAttribute(SessionKeys.LOGIN_USER,
                new AuthUser(1L, "admin", "총괄관리자", UserRole.SUPER_ADMIN, 1L, false));
        return session;
    }

    @Test
    void 날짜_필터가_ISO_문자열로_들어와도_바인딩된다() throws Exception {
        mockMvc.perform(get("/api/admin/problems")
                        .param("createdFrom", "2026-08-01")
                        .param("createdTo", "2026-12-31")
                        .session(superAdminSession()))
                .andExpect(jsonPath("$.resultCode").value(200));
    }

    @Test
    void 날짜_필터_없이도_정상_조회된다() throws Exception {
        mockMvc.perform(get("/api/admin/problems").session(superAdminSession()))
                .andExpect(jsonPath("$.resultCode").value(200));
    }

    /**
     * 화면의 등록일 입력은 {@code <input type="date">}라 브라우저가 잘못된 형식을 만들어 내지
     * 않는다. 이 테스트가 지키는 것은 API 를 직접 호출하는 경로다 — 전용 핸들러가 없으면
     * catch-all 로 떨어져 사용자에게는 "처리 중 오류"만 보이고, 평범한 입력 오류에 ERROR
     * 레벨 스택 트레이스가 쌓인다.
     * <p>
     * HTTP 400 을 함께 단언하는 이유: ErrorResponse 를 그냥 반환하는 기존 핸들러들은 HTTP 200
     * 으로 나가는데, 이 핸들러는 handleBizException 과 같은 400 규약을 택했다. 그 결정이
     * 조용히 되돌아가지 않도록 상태까지 고정한다.
     */
    @Test
    void 잘못된_날짜_형식은_입력값_오류로_안내한다() throws Exception {
        mockMvc.perform(get("/api/admin/problems")
                        .param("createdFrom", "2026-13-99")
                        .session(superAdminSession()))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.resultCode").value(1000));
    }
}
