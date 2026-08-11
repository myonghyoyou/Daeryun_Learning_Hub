package com.daeryun.probank.dto.solve;

import com.daeryun.probank.domain.ProblemType;
import lombok.Data;

@Data
public class ProblemSolveListItem {
    private Long id;
    private ProblemType type;
    private String content;
    private java.util.List<String> tags;
}
