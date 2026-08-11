package com.daeryun.probank.dto.solve;

import lombok.Data;

import java.util.List;

@Data
public class AttemptSubmitRequest {
    private List<Long> selectedChoiceIds;
    private String submittedText;
    private List<BlankAnswerInput> blankAnswers;
}
