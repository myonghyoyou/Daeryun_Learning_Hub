package com.daeryun.probank.domain;

import lombok.Data;

@Data
public class ProblemBlank {
    private Long id;
    private Long problemId;
    private String blankKey;
    private String answerText;
    private int displayOrder;
}
