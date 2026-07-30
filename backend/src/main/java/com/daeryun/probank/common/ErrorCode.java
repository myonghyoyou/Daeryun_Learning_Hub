package com.daeryun.probank.common;

import lombok.Getter;

@Getter
public enum ErrorCode {

    MSG_PROC_FAIL("처리 중 오류가 발생하였습니다.", -1),
    INPUT_VALUE_INVALID("잘못된 파라미터를 입력했습니다.", 1000),
    FILE_REQUIRED("필수 파일이 누락되었습니다.", 1009),
    ACCOUNT_LOCKED("계정이 잠겼습니다. 잠시 후 다시 시도하세요.", 1010),
    LOGIN_FAILED("사번 또는 비밀번호가 올바르지 않습니다.", 1011),
    PASSWORD_CHANGE_REQUIRED("비밀번호 변경이 필요합니다.", 1012),
    EMPTY_SESSION("세션 정보가 없습니다.", 980),
    ACCESS_AUTH_DENIED("접근 권한이 없습니다.", 990);

    private final String message;
    private final int code;

    ErrorCode(String message, int code) {
        this.message = message;
        this.code = code;
    }
}
