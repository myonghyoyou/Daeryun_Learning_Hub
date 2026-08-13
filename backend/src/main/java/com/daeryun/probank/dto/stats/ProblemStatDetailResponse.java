package com.daeryun.probank.dto.stats;

import lombok.AllArgsConstructor;
import lombok.Data;

import java.util.List;

/**
 * choiceDistribution 은 객관식·OX 가 아니면 null 이다.
 *
 * excludedAttempts 는 <b>분포에 반영되지 않은 시도 수</b>다. 문제를 수정하면 선택지가 새 ID로
 * 다시 만들어져 그 이전 기록은 현재 보기와 매칭되지 않는다. 이 값을 내려보내지 않으면
 * "분포 합계 ≠ 시도 수"가 버그처럼 보인다.
 */
@Data
@AllArgsConstructor
public class ProblemStatDetailResponse {
    private ProblemStatItem summary;
    private List<ChoiceDistributionItem> choiceDistribution;
    private int excludedAttempts;
    private List<RecentWrongSample> recentWrongSamples;
}
