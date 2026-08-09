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
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;
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

    /**
     * 쿼리 파라미터·경로 변수의 타입 변환 실패를 처리한다. 예: createdFrom=2026-13-99.
     * 전용 핸들러가 없으면 catch-all 로 떨어져 사용자에게는 "처리 중 오류"만 보이고,
     * 평범한 입력 오류에 ERROR 스택 트레이스가 쌓인다(QA D1 에서 실제로 그랬다).
     * <p>
     * 이 핸들러만 HTTP 400 을 낸다. ErrorResponse 를 그대로 반환하는 다른 핸들러들은 200 으로
     * 나가지만, 입력 오류에 200 을 주는 것은 handleBizException(400) 과도 어긋나고 프록시·
     * 모니터링에서 실패가 성공으로 집계된다. 프런트엔드는 HTTP 상태를 보지 않고 본문의
     * resultCode 로만 분기하므로(api/client.js) 화면 동작에는 영향이 없다.
     */
    @ExceptionHandler(MethodArgumentTypeMismatchException.class)
    public ResponseEntity<ErrorResponse> handleTypeMismatchException(MethodArgumentTypeMismatchException exception) {
        log.warn("요청 파라미터 타입이 올바르지 않습니다: name={}, value={}",
                exception.getName(), exception.getValue());
        return ResponseEntity.badRequest().body(ErrorResponse.builder()
                .code(ErrorCode.INPUT_VALUE_INVALID.getCode())
                .message("요청 값의 형식이 올바르지 않습니다: " + exception.getName())
                .data(null)
                .build());
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
