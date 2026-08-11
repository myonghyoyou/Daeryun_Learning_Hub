package com.daeryun.probank.domain;

import lombok.Data;

import java.time.LocalDateTime;

@Data
public class Attempt {
    private Long id;
    private Long userId;
    private Long problemId;
    private String submittedAnswer;
    private boolean correct;
    private LocalDateTime submittedAt;
}
