package com.daeryun.probank.domain;

import lombok.Data;

@Data
public class AttemptBlankAnswer {
    private Long id;
    private Long attemptId;
    private String blankKey;
    private String submittedAnswer;
    private boolean correct;
}
