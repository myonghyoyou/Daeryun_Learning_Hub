package com.daeryun.probank.domain;

import lombok.Data;

@Data
public class AttemptChoice {
    private Long id;
    private Long attemptId;
    private Long choiceId;
    /** 제출 시점 보기 본문 스냅샷. 문제를 수정해 원본 보기가 사라져도 남는다. */
    private String choiceText;
}
