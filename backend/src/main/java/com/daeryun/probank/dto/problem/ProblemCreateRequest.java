package com.daeryun.probank.dto.problem;

import com.daeryun.probank.domain.ProblemType;
import lombok.Data;

import java.util.List;

@Data
public class ProblemCreateRequest {
    private ProblemType type;
    private String content;
    private String imageUrl;
    private String referenceText;
    private String explanation;
    private List<ChoiceInput> choices;
    private List<String> answers;
    private List<BlankInput> blanks;
    private Integer blankRevealCount;
    private List<String> tags;
    private Integer sourceNumber;
}
