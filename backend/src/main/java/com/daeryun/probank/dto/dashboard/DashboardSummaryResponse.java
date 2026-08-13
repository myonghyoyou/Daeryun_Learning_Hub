package com.daeryun.probank.dto.dashboard;

import com.daeryun.probank.dto.problem.ProblemListItem;
import com.daeryun.probank.dto.stats.ProblemStatItem;
import lombok.AllArgsConstructor;
import lombok.Data;

import java.util.List;

/**
 * 지표별 적용 범위가 다르다(계획서 Global Constraints 참고).
 *   totalProblems       : 활성 문제만
 *   totalAttempts       : 활성 + 보관 (학습 활동 총량)
 *   totalCorrectAttempts: 활성 + 보관
 *   averageAccuracyRate : 활성 + 보관, 시도가 0건이면 null
 *   reviewNeededCount   : 활성 + 시도 5회 이상 + 정답률 50% 미만
 *   lowAccuracyProblems : reviewNeededCount 와 같은 조건, 정답률 오름차순 최대 5건
 * 화면은 이 차이를 문구로 밝혀야 한다.
 */
@Data
@AllArgsConstructor
public class DashboardSummaryResponse {
    private int totalProblems;
    private int reviewNeededCount;
    private int totalAttempts;
    private int totalCorrectAttempts;
    private Double averageAccuracyRate;
    private List<ProblemStatItem> lowAccuracyProblems;
    private List<ProblemListItem> recentProblems;
}
