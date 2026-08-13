package com.daeryun.probank.dto.stats;

import lombok.AllArgsConstructor;
import lombok.Data;

@Data
@AllArgsConstructor
public class ChoiceDistributionItem {
    private Long choiceId;
    private String choiceText;
    private int selectedCount;
}
