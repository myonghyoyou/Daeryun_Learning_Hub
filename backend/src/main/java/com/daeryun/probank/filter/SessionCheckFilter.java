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

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        if ("OPTIONS".equalsIgnoreCase(request.getMethod())) {
            return true;
        }
        String uri = request.getRequestURI();
        if (!uri.startsWith("/api/")) {
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
