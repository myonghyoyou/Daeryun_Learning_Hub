package com.daeryun.probank.dto.stats;

import com.daeryun.probank.domain.ProblemStatus;
import com.daeryun.probank.domain.ProblemType;
import lombok.Data;

import java.time.LocalDateTime;

@Data
public class ProblemStatRaw {
    private Long problemId;
    private String content;
    private ProblemType type;
    private ProblemStatus status;
    private Long departmentId;
    private String departmentName;
    private int totalAttempts;
    private int correctAttempts;
    private LocalDateTime lastAttemptAt;
}
