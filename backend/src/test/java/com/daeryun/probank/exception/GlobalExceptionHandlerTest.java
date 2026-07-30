package com.daeryun.probank.exception;

import com.daeryun.probank.common.ErrorCode;
import com.daeryun.probank.common.ResponseDto;
import org.junit.jupiter.api.Test;
import org.springframework.http.ResponseEntity;

import static org.junit.jupiter.api.Assertions.assertEquals;

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
}
