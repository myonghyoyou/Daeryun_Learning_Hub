package com.daeryun.probank.domain;

import lombok.Data;

import java.time.LocalDateTime;

@Data
public class Problem {
    private Long id;
    private ProblemType type;
    private String content;
    private String imageUrl;
    private String referenceText;
    private String explanation;
    private Integer blankRevealCount;
    private ProblemStatus status;
    private Long departmentId;
    /** 출처(종이 문제은행)에서의 문항 번호. 영역은 departmentId 가 겸한다. */
    private Integer sourceNumber;
    private Long createdBy;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}
