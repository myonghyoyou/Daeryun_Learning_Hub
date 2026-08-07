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
    // 파일은 왔지만 열 수 없는 경우(손상·암호 설정·엑셀이 아닌 바이트·시트 없음).
    // FILE_REQUIRED(1009) 를 재사용하면 "필수 파일이 누락되었습니다"라는 정반대 상황을 안내하게 된다.
    FILE_UNREADABLE("파일을 읽을 수 없습니다.", 1013),
    FILE_TYPE_NOT_ALLOWED("허용되지 않는 파일 형식입니다.", 1014),
    FILE_TOO_LARGE("파일 크기가 허용 범위를 초과했습니다.", 1015),
    EMPTY_SESSION("세션 정보가 없습니다.", 980),
    ACCESS_AUTH_DENIED("접근 권한이 없습니다.", 990);

    private final String message;
    private final int code;

    ErrorCode(String message, int code) {
        this.message = message;
        this.code = code;
    }
}
