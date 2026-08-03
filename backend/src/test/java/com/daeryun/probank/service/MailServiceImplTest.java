package com.daeryun.probank.service;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.mockito.Mockito;
import org.springframework.mail.MailSendException;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class MailServiceImplTest {

    private JavaMailSender mailSender;
    private MailServiceImpl service;

    @BeforeEach
    void setUp() {
        mailSender = Mockito.mock(JavaMailSender.class);
        service = new MailServiceImpl(mailSender);
    }

    @Test
    void sendTemporaryPassword_sendsMailWithEmployeeNoAndTemporaryPassword() {
        service.sendTemporaryPassword("kim@company.com", "2001", "Ab12cd34Ef");

        ArgumentCaptor<SimpleMailMessage> captor = ArgumentCaptor.forClass(SimpleMailMessage.class);
        Mockito.verify(mailSender).send(captor.capture());

        SimpleMailMessage message = captor.getValue();
        assertEquals("kim@company.com", message.getTo()[0]);
        assertTrue(message.getSubject().contains("2001"));
        assertTrue(message.getText().contains("2001"));
        assertTrue(message.getText().contains("Ab12cd34Ef"));
        assertTrue(message.getText().contains("최초 로그인"));
    }

    @Test
    void sendTemporaryPassword_whenSendFails_propagatesException() {
        Mockito.doThrow(new MailSendException("연결 실패"))
                .when(mailSender).send(Mockito.any(SimpleMailMessage.class));

        assertThrows(MailSendException.class,
                () -> service.sendTemporaryPassword("kim@company.com", "2001", "Ab12cd34Ef"));
    }
}
