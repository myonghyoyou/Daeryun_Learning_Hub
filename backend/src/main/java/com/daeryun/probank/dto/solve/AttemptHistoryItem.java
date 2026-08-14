package com.daeryun.probank.dto.solve;

import lombok.Data;

import java.time.LocalDateTime;

@Data
public class AttemptHistoryItem {
    private Long problemId;
    private String problemContent;
    private String submittedAnswer;
    private boolean correct;
    private LocalDateTime submittedAt;
    private String departmentName;
    private Integer sourceNumber;
}
