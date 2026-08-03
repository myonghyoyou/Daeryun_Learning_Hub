package com.daeryun.probank.exception;

import ch.qos.logback.classic.Level;
import ch.qos.logback.classic.LoggerContext;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.classic.spi.IThrowableProxy;
import ch.qos.logback.core.read.ListAppender;
import com.daeryun.probank.common.ErrorCode;
import com.daeryun.probank.common.ErrorResponse;
import com.daeryun.probank.common.ResponseDto;
import org.junit.jupiter.api.Test;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

class GlobalExceptionHandlerTest {

    @Test
    void handleBizException_returnsErrorCodeAndMessage() {
        GlobalExceptionHandler handler = new GlobalExceptionHandler();
        BizException exception = new BizException(ErrorCode.ACCESS_AUTH_DENIED);

        ResponseEntity<ResponseDto<?>> response = handler.handleBizException(exception);

        assertEquals(403, response.getStatusCodeValue());
        assertEquals(ErrorCode.ACCESS_AUTH_DENIED.getCode(), response.getBody().getResultCode());
        assertEquals(ErrorCode.ACCESS_AUTH_DENIED.getMessage(), response.getBody().getResultMsg());
    }

    @Test
    void handleUnexpectedException_logsStackTraceAtErrorAndKeepsTheSameResponseBody() {
        GlobalExceptionHandler handler = new GlobalExceptionHandler();
        ch.qos.logback.classic.Logger logger =
                ((LoggerContext) LoggerFactory.getILoggerFactory()).getLogger(GlobalExceptionHandler.class);
        ListAppender<ILoggingEvent> appender = new ListAppender<>();
        appender.start();
        logger.addAppender(appender);

        RuntimeException cause = new IllegalStateException("무언가 크게 잘못되었습니다");
        try {
            ErrorResponse response = handler.handleUnexpectedException(cause);

            // 응답 형태는 이전과 동일해야 한다(프런트엔드가 resultCode 로 분기한다).
            assertEquals(ErrorCode.MSG_PROC_FAIL.getCode(), response.getResultCode());
            assertEquals(ErrorCode.MSG_PROC_FAIL.getMessage(), response.getResultMsg());
            assertNull(response.getErrorList());

            // 스택 트레이스가 실제로 어딘가에 남아야 한다.
            assertEquals(1, appender.list.size());
            ILoggingEvent event = appender.list.get(0);
            assertEquals(Level.ERROR, event.getLevel());
            IThrowableProxy thrown = event.getThrowableProxy();
            assertNotNull(thrown, "예외가 로그에 첨부되지 않으면 스택 트레이스가 남지 않는다");
            assertEquals(IllegalStateException.class.getName(), thrown.getClassName());
            assertEquals("무언가 크게 잘못되었습니다", thrown.getMessage());
            assertTrue(thrown.getStackTraceElementProxyArray().length > 0);
        } finally {
            logger.detachAppender(appender);
            appender.stop();
        }
    }
}
