package com.daeryun.probank.dto.problem;

import com.daeryun.probank.domain.ProblemStatus;
import com.daeryun.probank.domain.ProblemType;
import lombok.Data;

import java.time.LocalDateTime;

@Data
public class ProblemListItem {
    private Long id;
    private ProblemType type;
    private String content;
    private ProblemStatus status;
    private Long departmentId;
    private String departmentName;
    private LocalDateTime createdAt;
    private java.util.List<String> tags;
}
