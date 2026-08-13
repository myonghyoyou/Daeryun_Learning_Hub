package com.daeryun.probank.service;

import com.daeryun.probank.common.AuthUser;
import com.daeryun.probank.dao.ProblemDao;
import com.daeryun.probank.domain.ProblemStatus;
import com.daeryun.probank.domain.UserRole;
import com.daeryun.probank.dto.dashboard.DashboardSummaryResponse;
import com.daeryun.probank.dto.problem.ProblemListItem;
import com.daeryun.probank.dto.stats.ProblemStatItem;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.stream.Collectors;

@Service
public class DashboardServiceImpl implements DashboardService {

    private static final int MIN_ATTEMPTS_FOR_REVIEW = 5;
    private static final double REVIEW_ACCURACY_THRESHOLD = 0.5;
    private static final int LOW_ACCURACY_LIST_SIZE = 5;
    private static final int RECENT_PROBLEM_LIST_SIZE = 5;

    private final StatsService statsService;
    private final ProblemDao problemDao;

    public DashboardServiceImpl(StatsService statsService, ProblemDao problemDao) {
        this.statsService = statsService;
        this.problemDao = problemDao;
    }

    /**
     * "지금 고쳐야 할 문제"의 단일 정의. 검토 필요 건수와 정답률 낮은 문제 목록이 같은
     * 함수를 쓰지 않으면 "검토 필요 0건"인데 목록은 0% 로 가득 찬 화면이 만들어진다.
     */
    private boolean needsReview(ProblemStatItem item) {
        return item.getStatus() == ProblemStatus.ACTIVE
                && item.getTotalAttempts() >= MIN_ATTEMPTS_FOR_REVIEW
                && item.getAccuracyRate() != null
                && item.getAccuracyRate() < REVIEW_ACCURACY_THRESHOLD;
    }

    @Override
    public DashboardSummaryResponse getSummary(AuthUser actor, Long departmentId) {
        // StatsService 가 부서 스코프를 강제하지만 ProblemDao.findRecent 는 원시 DAO 라
        // 스스로 강제하지 않는다. 같은 규칙으로 유효 부서 ID 를 계산해 넘긴다.
        Long effectiveDepartmentId = actor.getRole() == UserRole.SUPER_ADMIN ? departmentId : actor.getDepartmentId();

        List<ProblemStatItem> allStats = statsService.listAllProblemStats(actor, departmentId);

        int totalAttempts = allStats.stream().mapToInt(ProblemStatItem::getTotalAttempts).sum();
        int totalCorrectAttempts = allStats.stream().mapToInt(ProblemStatItem::getCorrectAttempts).sum();
        Double averageAccuracyRate = totalAttempts == 0 ? null : (double) totalCorrectAttempts / totalAttempts;

        List<ProblemStatItem> reviewTargets = allStats.stream()
                .filter(this::needsReview)
                .collect(Collectors.toList());

        // allStats 는 StatsServiceImpl 에서 이미 정답률 오름차순으로 정렬돼 있으므로 재정렬하지 않는다.
        List<ProblemStatItem> lowAccuracyProblems = reviewTargets.stream()
                .limit(LOW_ACCURACY_LIST_SIZE)
                .collect(Collectors.toList());

        List<ProblemListItem> recentProblems = problemDao.findRecent(effectiveDepartmentId, RECENT_PROBLEM_LIST_SIZE);

        return new DashboardSummaryResponse(
                statsService.countActiveProblems(actor, departmentId),
                reviewTargets.size(),
                totalAttempts,
                totalCorrectAttempts,
                averageAccuracyRate,
                lowAccuracyProblems,
                recentProblems);
    }
}
