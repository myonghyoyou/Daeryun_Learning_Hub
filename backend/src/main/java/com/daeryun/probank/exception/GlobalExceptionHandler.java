package com.daeryun.probank.exception;

import com.daeryun.probank.common.ErrorCode;
import com.daeryun.probank.common.ErrorResponse;
import com.daeryun.probank.common.ResponseDto;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.http.HttpStatus;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.validation.BindException;
import org.springframework.validation.BindingResult;
import org.springframework.validation.FieldError;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ControllerAdvice;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.ResponseBody;
import org.springframework.web.multipart.MultipartException;

import java.util.List;
import java.util.Optional;
import java.util.stream.Collectors;

@ControllerAdvice
@ResponseBody
public class GlobalExceptionHandler {

    private static final Logger log = LoggerFactory.getLogger(GlobalExceptionHandler.class);

    @ExceptionHandler(BizException.class)
    public ResponseEntity<ResponseDto<?>> handleBizException(BizException exception) {
        ErrorCode errorCode = exception.getErrorCode();
        HttpStatus status = errorCode == ErrorCode.EMPTY_SESSION ? HttpStatus.UNAUTHORIZED
                : errorCode == ErrorCode.ACCESS_AUTH_DENIED ? HttpStatus.FORBIDDEN
                : HttpStatus.BAD_REQUEST;
        return ResponseEntity.status(status).body(ResponseDto.ok(errorCode.getCode(), exception.getMessage()));
    }

    @ExceptionHandler({MethodArgumentNotValidException.class, BindException.class})
    public ErrorResponse handleValidationException(Exception exception) {
        BindingResult bindingResult = exception instanceof MethodArgumentNotValidException
                ? ((MethodArgumentNotValidException) exception).getBindingResult()
                : ((BindException) exception).getBindingResult();
        return buildFieldErrors(ErrorCode.INPUT_VALUE_INVALID, bindingResult);
    }

    @ExceptionHandler(HttpMessageNotReadableException.class)
    public ErrorResponse handleMessageNotReadableException() {
        return buildFieldErrors(ErrorCode.INPUT_VALUE_INVALID, null);
    }

    @ExceptionHandler(MultipartException.class)
    public ResponseEntity<ResponseDto<?>> handleMultipartException() {
        return ResponseEntity.ok(ResponseDto.ok(ErrorCode.FILE_REQUIRED.getCode(), "파일을 업로드할 수 없습니다."));
    }

    /**
     * 예상하지 못한 예외를 처리한다. 응답(HTTP 상태/바디)은 이전과 동일하게 유지한다.
     * 프런트엔드가 resultCode 로 분기하고 있어 응답 형태를 바꾸는 것은 별도 논의 대상이다.
     * 다만 이전에는 스택 트레이스가 어디에도 남지 않아 장애가 조용히 사라졌으므로,
     * 여기서 ERROR 레벨로 스택 트레이스를 남긴다.
     */
    @ExceptionHandler(Exception.class)
    public ErrorResponse handleUnexpectedException(Exception exception) {
        log.error("처리되지 않은 예외가 발생했습니다.", exception);
        return buildFieldErrors(ErrorCode.MSG_PROC_FAIL, null);
    }

    private ErrorResponse buildFieldErrors(ErrorCode errorCode, BindingResult bindingResult) {
        List<ErrorResponse.FieldError> errors = bindingResult == null
                ? null
                : bindingResult.getFieldErrors().stream().map(this::toFieldError).collect(Collectors.toList());
        return ErrorResponse.builder().code(errorCode.getCode()).message(errorCode.getMessage()).data(errors).build();
    }

    private ErrorResponse.FieldError toFieldError(FieldError error) {
        return ErrorResponse.FieldError.builder()
                .field(error.getField())
                .value(Optional.ofNullable(error.getRejectedValue()).map(Object::toString).orElse(null))
                .reason(error.getDefaultMessage())
                .build();
    }
}
