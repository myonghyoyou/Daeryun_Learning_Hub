package com.daeryun.probank.dto.stats;

import lombok.Data;

@Data
public class ChoiceDistributionRaw {
    private Long choiceId;
    private int selectedCount;
}
