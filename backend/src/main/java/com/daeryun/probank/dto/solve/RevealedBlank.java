package com.daeryun.probank.dto.solve;

import lombok.AllArgsConstructor;
import lombok.Data;

@Data
@AllArgsConstructor
public class RevealedBlank {
    private String blankKey;
    private String answerText;
}
