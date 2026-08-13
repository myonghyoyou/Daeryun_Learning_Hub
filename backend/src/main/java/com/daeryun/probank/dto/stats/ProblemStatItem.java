package com.daeryun.probank.dto.stats;

import com.daeryun.probank.domain.ProblemStatus;
import com.daeryun.probank.domain.ProblemType;
import lombok.AllArgsConstructor;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * accuracyRate 는 nullable 이고 <b>null 은 "미응시"</b>를 뜻한다(0% 가 아니다).
 * 정렬·필터·화면 표기 모두 이 규칙을 따른다.
 */
@Data
@AllArgsConstructor
public class ProblemStatItem {
    private Long problemId;
    private String content;
    private ProblemType type;
    private ProblemStatus status;
    private Long departmentId;
    private String departmentName;
    private int totalAttempts;
    private int correctAttempts;
    private Double accuracyRate;
    private LocalDateTime lastAttemptAt;

    public static ProblemStatItem from(ProblemStatRaw raw) {
        Double accuracyRate = raw.getTotalAttempts() == 0
                ? null
                : (double) raw.getCorrectAttempts() / raw.getTotalAttempts();
        return new ProblemStatItem(raw.getProblemId(), raw.getContent(), raw.getType(), raw.getStatus(),
                raw.getDepartmentId(), raw.getDepartmentName(), raw.getTotalAttempts(), raw.getCorrectAttempts(),
                accuracyRate, raw.getLastAttemptAt());
    }
}
