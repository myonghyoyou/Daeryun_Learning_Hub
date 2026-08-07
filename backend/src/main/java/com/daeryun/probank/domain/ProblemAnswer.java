package com.daeryun.probank.domain;

import lombok.Data;

@Data
public class ProblemAnswer {
    private Long id;
    private Long problemId;
    private String answerText;
}
