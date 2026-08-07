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
    private Long createdBy;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}
