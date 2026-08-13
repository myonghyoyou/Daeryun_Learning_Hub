package com.daeryun.probank.service;

import com.daeryun.probank.common.AuthUser;
import com.daeryun.probank.dao.ProblemDao;
import com.daeryun.probank.domain.ProblemStatus;
import com.daeryun.probank.domain.ProblemType;
import com.daeryun.probank.domain.UserRole;
import com.daeryun.probank.dto.dashboard.DashboardSummaryResponse;
import com.daeryun.probank.dto.stats.ProblemStatItem;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;

import java.util.Arrays;
import java.util.Collections;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

class DashboardServiceImplTest {

    private StatsService statsService;
    private ProblemDao problemDao;
    private DashboardServiceImpl service;
    private final AuthUser deptAdmin = new AuthUser(1L, "1001", "부서관리자", UserRole.DEPT_ADMIN, 10L, false);
    private final AuthUser superAdmin = new AuthUser(2L, "admin", "총괄관리자", UserRole.SUPER_ADMIN, 1L, false);

    @BeforeEach
    void setUp() {
        statsService = Mockito.mock(StatsService.class);
        problemDao = Mockito.mock(ProblemDao.class);
        service = new DashboardServiceImpl(statsService, problemDao);
    }

    private ProblemStatItem stat(long id, int total, int correct, ProblemStatus status) {
        Double rate = total == 0 ? null : (double) correct / total;
        return new ProblemStatItem(id, "문제" + id, ProblemType.MCQ_SINGLE, status, 10L, "개발팀",
                total, correct, rate, null);
    }

    @Test
    void deptAdmin_forcesOwnDepartmentForRecentProblems() {
        Mockito.when(statsService.listAllProblemStats(deptAdmin, 999L)).thenReturn(Collections.emptyList());
        Mockito.when(problemDao.findRecent(10L, 5)).thenReturn(Collections.emptyList());

        service.getSummary(deptAdmin, 999L);

        Mockito.verify(problemDao).findRecent(10L, 5);
    }

    @Test
    void superAdmin_usesRequestedDepartmentForRecentProblems() {
        Mockito.when(statsService.listAllProblemStats(superAdmin, 999L)).thenReturn(Collections.emptyList());
        Mockito.when(problemDao.findRecent(999L, 5)).thenReturn(Collections.emptyList());

        service.getSummary(superAdmin, 999L);

        Mockito.verify(problemDao).findRecent(999L, 5);
    }

    @Test
    void attemptTotalsIncludeArchivedProblems() {
        // 보관 문제의 시도가 빠지면 "보관해도 이력은 보존된다"는 약속과 어긋난다.
        List<ProblemStatItem> stats = Arrays.asList(
                stat(1L, 10, 9, ProblemStatus.ACTIVE),
                stat(2L, 6, 1, ProblemStatus.ARCHIVED)
        );
        Mockito.when(statsService.listAllProblemStats(deptAdmin, null)).thenReturn(stats);
        Mockito.when(statsService.countActiveProblems(deptAdmin, null)).thenReturn(1);
        Mockito.when(problemDao.findRecent(10L, 5)).thenReturn(Collections.emptyList());

        DashboardSummaryResponse response = service.getSummary(deptAdmin, null);

        assertEquals(16, response.getTotalAttempts());
        assertEquals(10, response.getTotalCorrectAttempts());
        assertEquals(10.0 / 16.0, response.getAverageAccuracyRate(), 0.0001);
        // 문제 수는 활성만 센다.
        assertEquals(1, response.getTotalProblems());
    }

    @Test
    void reviewNeeded_excludesArchivedAndSmallSamples() {
        List<ProblemStatItem> stats = Arrays.asList(
                stat(3L, 3, 0, ProblemStatus.ACTIVE),      // 0% 지만 시도 3건 -> 제외
                stat(2L, 8, 2, ProblemStatus.ACTIVE),      // 25%, 시도 8건 -> 검토 필요
                stat(5L, 8, 1, ProblemStatus.ARCHIVED),    // 보관 -> 제외
                stat(1L, 10, 9, ProblemStatus.ACTIVE),     // 90%
                stat(4L, 0, 0, ProblemStatus.ACTIVE)       // 미응시
        );
        Mockito.when(statsService.listAllProblemStats(deptAdmin, null)).thenReturn(stats);
        Mockito.when(statsService.countActiveProblems(deptAdmin, null)).thenReturn(4);
        Mockito.when(problemDao.findRecent(10L, 5)).thenReturn(Collections.emptyList());

        DashboardSummaryResponse response = service.getSummary(deptAdmin, null);

        assertEquals(1, response.getReviewNeededCount());
    }

    @Test
    void lowAccuracyList_usesTheSameThresholdAsReviewNeeded() {
        // 두 지표가 다른 기준을 쓰면 "검토 필요 0건"인데 목록은 0% 로 가득 찬 화면이 나온다.
        List<ProblemStatItem> stats = Arrays.asList(
                stat(3L, 3, 0, ProblemStatus.ACTIVE),      // 표본 부족 -> 목록에서도 제외
                stat(2L, 8, 2, ProblemStatus.ACTIVE),
                stat(5L, 8, 1, ProblemStatus.ARCHIVED)     // 보관 -> 목록에서도 제외
        );
        Mockito.when(statsService.listAllProblemStats(deptAdmin, null)).thenReturn(stats);
        Mockito.when(statsService.countActiveProblems(deptAdmin, null)).thenReturn(2);
        Mockito.when(problemDao.findRecent(10L, 5)).thenReturn(Collections.emptyList());

        DashboardSummaryResponse response = service.getSummary(deptAdmin, null);

        assertEquals(1, response.getLowAccuracyProblems().size());
        assertEquals(2L, response.getLowAccuracyProblems().get(0).getProblemId());
        assertEquals(response.getReviewNeededCount(), response.getLowAccuracyProblems().size());
    }

    // LOW_ACCURACY_LIST_SIZE(=5) 로 자르는 limit(5) 는 allStats 가 이미 정답률 오름차순으로
    // 왔다는 전제에 기댄다(getSummary 의 주석 참고). statsService 를 목으로 대체하는 이상
    // 그 전제 자체는 이 테스트도 강제할 수 없지만, 목이 그 계약대로 "이미 정렬된" 7건을 주었을 때
    // limit(5)가 정확히 앞 5건만, 순서를 보존한 채 잘라내는지는 고정할 수 있다 — 정렬이 깨지면
    // (예: limit 앞에서 재정렬을 빠뜨리거나 순서를 뒤집으면) 이 테스트가 잡는다.
    @Test
    void lowAccuracyList_truncatesToFiveWorst_preservingAscendingOrder() {
        List<ProblemStatItem> stats = Arrays.asList(
                stat(101L, 20, 1, ProblemStatus.ACTIVE),  // 5%
                stat(102L, 20, 2, ProblemStatus.ACTIVE),  // 10%
                stat(103L, 20, 3, ProblemStatus.ACTIVE),  // 15%
                stat(104L, 20, 4, ProblemStatus.ACTIVE),  // 20%
                stat(105L, 20, 5, ProblemStatus.ACTIVE),  // 25%
                stat(106L, 20, 6, ProblemStatus.ACTIVE),  // 30%
                stat(107L, 20, 7, ProblemStatus.ACTIVE)   // 35%
        );
        Mockito.when(statsService.listAllProblemStats(deptAdmin, null)).thenReturn(stats);
        Mockito.when(statsService.countActiveProblems(deptAdmin, null)).thenReturn(7);
        Mockito.when(problemDao.findRecent(10L, 5)).thenReturn(Collections.emptyList());

        DashboardSummaryResponse response = service.getSummary(deptAdmin, null);

        assertEquals(7, response.getReviewNeededCount());
        List<ProblemStatItem> lowAccuracyProblems = response.getLowAccuracyProblems();
        assertEquals(5, lowAccuracyProblems.size());
        assertEquals(
                Arrays.asList(101L, 102L, 103L, 104L, 105L),
                lowAccuracyProblems.stream().map(ProblemStatItem::getProblemId).collect(java.util.stream.Collectors.toList()));
    }

    @Test
    void withNoAttempts_averageAccuracyIsNull() {
        Mockito.when(statsService.listAllProblemStats(deptAdmin, null))
                .thenReturn(Collections.singletonList(stat(1L, 0, 0, ProblemStatus.ACTIVE)));
        Mockito.when(statsService.countActiveProblems(deptAdmin, null)).thenReturn(1);
        Mockito.when(problemDao.findRecent(10L, 5)).thenReturn(Collections.emptyList());

        DashboardSummaryResponse response = service.getSummary(deptAdmin, null);

        assertNull(response.getAverageAccuracyRate());
        assertEquals(0, response.getTotalAttempts());
        assertEquals(0, response.getReviewNeededCount());
        assertEquals(0, response.getLowAccuracyProblems().size());
    }
}
