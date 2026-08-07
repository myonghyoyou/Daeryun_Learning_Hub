package com.daeryun.probank.domain;

import lombok.Data;

@Data
public class ProblemChoice {
    private Long id;
    private Long problemId;
    private String choiceText;
    private boolean correct;
    private int displayOrder;
}
