package com.daeryun.probank.dto.stats;

import lombok.Data;

import java.time.LocalDateTime;

/**
 * submittedAnswer 는 제출 시점에 이미 사람이 읽는 형태로 저장된다(SolveServiceImpl 참고).
 * 별도의 표시용 변환 필드가 필요 없다.
 */
@Data
public class RecentWrongSample {
    private String submittedAnswer;
    private LocalDateTime submittedAt;
}
