package com.daeryun.probank.dto.solve;

import com.daeryun.probank.domain.ProblemType;
import lombok.AllArgsConstructor;
import lombok.Data;

import java.util.List;

@Data
@AllArgsConstructor
public class ProblemSolveDetailResponse {
    private Long id;
    private ProblemType type;
    private String content;
    private String imageUrl;
    private String referenceText;
    private List<ChoiceOption> choices;
    private List<String> blanksToAnswer;
    private List<RevealedBlank> revealedBlanks;
    private String departmentName;
    private Integer sourceNumber;
}
