package com.daeryun.probank.filter;

import com.daeryun.probank.common.AuthUser;
import com.daeryun.probank.common.ErrorCode;
import com.daeryun.probank.common.ResponseDto;
import com.daeryun.probank.common.SessionKeys;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import javax.servlet.FilterChain;
import javax.servlet.ServletException;
import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpServletResponse;
import javax.servlet.http.HttpSession;
import java.io.IOException;

@Component
public class SessionCheckFilter extends OncePerRequestFilter {

    private final ObjectMapper objectMapper;

    public SessionCheckFilter(ObjectMapper objectMapper) {
        this.objectMapper = objectMapper;
    }

    /**
     * 업로드된 문제 이미지의 정적 리소스 경로. {@code StaticResourceConfig}가 이 경로를 파일 시스템에
     * 연결해 서빙하는데, 세션 검사를 {@code /api/}에만 걸면 URL만 알면 누구나 로그인 없이 이미지를
     * 내려받을 수 있다(문제 본문은 부서 단위로 격리되는데 이미지는 무방비). 따라서 이 접두어도
     * 세션 게이트를 통과하게 한다.
     * <p>
     * 여기서 거는 것은 <b>인증</b>이지 부서 <b>인가</b>가 아니다. 플랜 아키텍처상 문제 풀이는 전사
     * 공통이므로 로그인한 모든 임직원이 문제 이미지를 볼 수 있어야 한다 — 소유 부서 검사를 넣으면 안 된다.
     * <p>
     * 로그인 사용자의 {@code <img src="/uploads/images/...">}는 동일 출처 GET이므로 SameSite=Lax
     * 쿠키가 그대로 실려 나가고(vite dev 서버도 /uploads를 백엔드로 프록시한다), 기존 미리보기 동작은
     * 그대로 유지된다.
     */
    private static final String UPLOADS_PREFIX = "/uploads/";

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        if ("OPTIONS".equalsIgnoreCase(request.getMethod())) {
            return true;
        }
        String uri = request.getRequestURI();
        if (!uri.startsWith("/api/") && !uri.startsWith(UPLOADS_PREFIX)) {
            return true;
        }
        return "/api/auth/login".equals(uri) || "/api/auth/session".equals(uri);
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain filterChain)
            throws ServletException, IOException {
        HttpSession session = request.getSession(false);
        AuthUser authUser = session == null ? null : (AuthUser) session.getAttribute(SessionKeys.LOGIN_USER);

        if (authUser == null) {
            writeError(response, ErrorCode.EMPTY_SESSION);
            return;
        }

        boolean isAuthPath = request.getRequestURI().startsWith("/api/auth/");
        if (authUser.isMustChangePassword() && !isAuthPath) {
            writeError(response, ErrorCode.PASSWORD_CHANGE_REQUIRED);
            return;
        }

        filterChain.doFilter(request, response);
    }

    private void writeError(HttpServletResponse response, ErrorCode errorCode) throws IOException {
        if (errorCode == ErrorCode.EMPTY_SESSION) {
            response.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
        }
        // PASSWORD_CHANGE_REQUIRED intentionally returns HTTP 200 so clients can read the structured error
        // via ResponseDto.resultCode (1012). This differs from GlobalExceptionHandler, which maps the same
        // ErrorCode to 400 when raised as BizException elsewhere in the application.
        response.setContentType("application/json;charset=UTF-8");
        objectMapper.writeValue(response.getWriter(), ResponseDto.ok(errorCode.getCode(), errorCode.getMessage()));
    }
}
