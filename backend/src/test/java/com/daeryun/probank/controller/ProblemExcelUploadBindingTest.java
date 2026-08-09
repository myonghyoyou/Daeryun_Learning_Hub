package com.daeryun.probank.controller;

import com.daeryun.probank.common.AuthUser;
import com.daeryun.probank.common.SessionKeys;
import com.daeryun.probank.domain.UserRole;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;

/**
 * 서비스 단위 테스트는 upload(...)를 Long 으로 직접 호출하므로 Spring MVC 의 문자열 → Long 변환
 * 단계를 지나가지 않는다. QA D1(등록일 필터)이 정확히 그 공백으로 189개 테스트를 통과했었다.
 * 이 테스트는 실제 서블릿 체인에서 departmentId 가 컨트롤러 시그니처에 바인딩되는지 확인한다.
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Transactional
class ProblemExcelUploadBindingTest {

    @Autowired
    private MockMvc mockMvc;

    private MockHttpSession superAdminSession() {
        MockHttpSession session = new MockHttpSession();
        session.setAttribute(SessionKeys.LOGIN_USER,
                new AuthUser(1L, "admin", "총괄관리자", UserRole.SUPER_ADMIN, 1L, false));
        return session;
    }

    /**
     * upload(...)의 검사 순서는 파일 존재 → 확장자 → 부서 → 워크북 열기다. 부서 검증이 워크북을
     * 열기 전에 끝나므로, 부서 오류를 확인하는 데는 "비어 있지 않은 .xlsx 이름의 바이트"면 충분하다.
     * 비어 있으면 FILE_REQUIRED 로 먼저 걸려 부서 검증에 도달하지 못한다.
     */
    private MockMultipartFile dummyXlsx() {
        return new MockMultipartFile("file", "any.xlsx",
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                new byte[]{0x50, 0x4B, 0x03, 0x04});
    }

    @Test
    void 부서를_지정하지_않으면_입력값_오류로_안내한다() throws Exception {
        mockMvc.perform(multipart("/api/admin/problems/excel-upload")
                        .file(dummyXlsx())
                        .session(superAdminSession()))
                .andExpect(jsonPath("$.resultCode").value(1000));
    }

    @Test
    void 없는_부서를_지정하면_입력값_오류로_안내한다() throws Exception {
        mockMvc.perform(multipart("/api/admin/problems/excel-upload")
                        .file(dummyXlsx())
                        .param("departmentId", "99999999")
                        .session(superAdminSession()))
                .andExpect(jsonPath("$.resultCode").value(1000));
    }
}
