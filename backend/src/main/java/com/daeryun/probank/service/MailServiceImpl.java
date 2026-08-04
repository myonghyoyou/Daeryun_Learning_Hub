package com.daeryun.probank.service;

import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.stereotype.Service;

@Service
public class MailServiceImpl implements MailService {

    private final JavaMailSender mailSender;

    public MailServiceImpl(JavaMailSender mailSender) {
        this.mailSender = mailSender;
    }

    @Override
    public void sendTemporaryPassword(String email, String employeeNo, String temporaryPassword) {
        SimpleMailMessage message = new SimpleMailMessage();
        message.setTo(email);
        message.setSubject("[Daeryun Learning Hub] 계정이 생성되었습니다 (사번: " + employeeNo + ")");
        message.setText(
                "안녕하세요.\n\n"
                        + "Daeryun Learning Hub 계정이 생성되었습니다.\n\n"
                        + "사번: " + employeeNo + "\n"
                        + "임시 비밀번호: " + temporaryPassword + "\n\n"
                        + "보안을 위해 최초 로그인 시 반드시 비밀번호를 변경해 주세요."
        );
        mailSender.send(message);
    }
}
