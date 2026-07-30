package com.daeryun.probank.common;

import com.fasterxml.jackson.annotation.JsonInclude;
import lombok.Builder;
import lombok.Getter;

import java.util.ArrayList;
import java.util.List;

@Getter
@JsonInclude(JsonInclude.Include.NON_NULL)
public class ErrorResponse {

    private final int resultCode;
    private final String resultMsg;
    private final List<FieldError> errorList;

    @Builder
    public ErrorResponse(String message, int code, List<FieldError> data) {
        this.resultCode = code;
        this.resultMsg = message;
        this.errorList = data == null ? null : new ArrayList<>(data);
    }

    @Getter
    @Builder
    public static class FieldError {
        private final String field;
        private final String value;
        private final String reason;
    }
}
