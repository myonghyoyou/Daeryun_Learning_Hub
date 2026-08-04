package com.daeryun.probank.service;

public interface MailService {

    /**
     * 신규 계정의 사번과 임시 비밀번호를 회사 이메일로 발송한다. 발송에 실패하면 예외를 던진다
     * (호출자가 계정 생성 요청 전체를 실패로 처리할 수 있도록).
     */
    void sendTemporaryPassword(String email, String employeeNo, String temporaryPassword);
}
