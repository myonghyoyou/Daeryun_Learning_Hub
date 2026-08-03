package com.daeryun.probank.common;

import com.fasterxml.jackson.annotation.JsonInclude;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@AllArgsConstructor
@NoArgsConstructor
@JsonInclude(JsonInclude.Include.NON_NULL)
public class ResponseDto<T> {

    private int resultCode;
    private String resultMsg;
    private T data;

    public static ResponseDto<?> ok() {
        return ResponseDto.builder().resultCode(200).resultMsg("정상 처리되었습니다.").build();
    }

    public static <T> ResponseDto<T> ok(T data) {
        return ResponseDto.<T>builder().resultCode(200).resultMsg("정상 처리되었습니다.").data(data).build();
    }

    public static ResponseDto<?> ok(int code, String message) {
        return ResponseDto.builder().resultCode(code).resultMsg(message).build();
    }
}
