package com.daeryun.probank.exception;

import com.daeryun.probank.common.ErrorCode;
import com.daeryun.probank.common.ErrorResponse;
import com.daeryun.probank.common.ResponseDto;
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

    @ExceptionHandler(Exception.class)
    public ErrorResponse handleUnexpectedException() {
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
