package com.daeryun.probank.dto.solve;

import lombok.AllArgsConstructor;
import lombok.Data;

import java.util.List;

@Data
@AllArgsConstructor
public class AttemptResult {
    private boolean correct;
    private String explanation;
    private List<BlankAnswerResult> blankResults;
}
