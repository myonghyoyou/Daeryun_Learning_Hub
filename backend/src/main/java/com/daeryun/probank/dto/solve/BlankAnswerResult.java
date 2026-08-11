package com.daeryun.probank.dto.solve;

import lombok.AllArgsConstructor;
import lombok.Data;

@Data
@AllArgsConstructor
public class BlankAnswerResult {
    private String blankKey;
    private String submittedAnswer;
    private boolean correct;
    private String correctAnswer;
}
