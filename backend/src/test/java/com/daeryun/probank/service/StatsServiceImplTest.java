package com.daeryun.probank.service;

import com.daeryun.probank.common.AuthUser;
import com.daeryun.probank.dao.AttemptChoiceDao;
import com.daeryun.probank.dao.AttemptDao;
import com.daeryun.probank.dao.ProblemChoiceDao;
import com.daeryun.probank.dao.ProblemDao;
import com.daeryun.probank.dao.StatsDao;
import com.daeryun.probank.domain.ProblemStatus;
import com.daeryun.probank.domain.ProblemType;
import com.daeryun.probank.domain.UserRole;
import com.daeryun.probank.dto.stats.ProblemStatItem;
import com.daeryun.probank.dto.stats.ProblemStatPageResponse;
import com.daeryun.probank.dto.stats.ProblemStatRaw;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;

import java.util.Arrays;
import java.util.Collections;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

class StatsServiceImplTest {

    private StatsDao statsDao;
    private AttemptDao attemptDao;
    private AttemptChoiceDao attemptChoiceDao;
    private ProblemDao problemDao;
    private ProblemChoiceDao problemChoiceDao;
    private StatsServiceImpl service;

    private final AuthUser deptAdmin = new AuthUser(1L, "1001", "부서관리자", UserRole.DEPT_ADMIN, 10L, false);
    private final AuthUser superAdmin = new AuthUser(2L, "admin", "총괄관리자", UserRole.SUPER_ADMIN, 1L, false);

    @BeforeEach
    void setUp() {
        statsDao = Mockito.mock(StatsDao.class);
        attemptDao = Mockito.mock(AttemptDao.class);
        attemptChoiceDao = Mockito.mock(AttemptChoiceDao.class);
        problemDao = Mockito.mock(ProblemDao.class);
        problemChoiceDao = Mockito.mock(ProblemChoiceDao.class);
        service = new StatsServiceImpl(statsDao, attemptDao, attemptChoiceDao, problemDao, problemChoiceDao);
    }

    private ProblemStatRaw raw(long id, String content, int total, int correctCount) {
        ProblemStatRaw item = new ProblemStatRaw();
        item.setProblemId(id);
        item.setContent(content);
        item.setType(ProblemType.MCQ_SINGLE);
        item.setStatus(ProblemStatus.ACTIVE);
        item.setDepartmentId(10L);
        item.setDepartmentName("개발팀");
        item.setTotalAttempts(total);
        item.setCorrectAttempts(correctCount);
        return item;
    }

    @Test
    void deptAdmin_alwaysQueriesOwnDepartment_ignoringRequestedValue() {
        Mockito.when(statsDao.findProblemStats(10L, null, 20, 0)).thenReturn(Collections.emptyList());
        Mockito.when(statsDao.countProblemStats(10L, null)).thenReturn(0L);

        service.listProblemStats(deptAdmin, 999L, null, 1, 20);

        Mockito.verify(statsDao).findProblemStats(10L, null, 20, 0);
        Mockito.verify(statsDao).countProblemStats(10L, null);
    }

    @Test
    void superAdmin_usesRequestedDepartmentFilter() {
        Mockito.when(statsDao.findProblemStats(999L, null, 20, 0)).thenReturn(Collections.emptyList());
        Mockito.when(statsDao.countProblemStats(999L, null)).thenReturn(0L);

        service.listProblemStats(superAdmin, 999L, null, 1, 20);

        Mockito.verify(statsDao).findProblemStats(999L, null, 20, 0);
    }

    @Test
    void pageTwo_translatesToOffset() {
        Mockito.when(statsDao.findProblemStats(10L, "ACTIVE", 20, 20)).thenReturn(Collections.emptyList());
        Mockito.when(statsDao.countProblemStats(10L, "ACTIVE")).thenReturn(35L);

        ProblemStatPageResponse response = service.listProblemStats(deptAdmin, null, "ACTIVE", 2, 20);

        Mockito.verify(statsDao).findProblemStats(10L, "ACTIVE", 20, 20);
        assertEquals(35L, response.getTotalCount());
        assertEquals(2, response.getPage());
    }

    @Test
    void sortsLowestAccuracyFirst_andUnattemptedLast() {
        Mockito.when(statsDao.findProblemStats(10L, null, 20, 0)).thenReturn(Arrays.asList(
                raw(1L, "높은 정답률", 10, 9),   // 90%
                raw(2L, "낮은 정답률", 10, 2),   // 20%
                raw(3L, "미응시 문제", 0, 0)
        ));
        Mockito.when(statsDao.countProblemStats(10L, null)).thenReturn(3L);

        List<ProblemStatItem> result = service.listProblemStats(deptAdmin, null, null, 1, 20).getItems();

        assertEquals(3, result.size());
        assertEquals(2L, result.get(0).getProblemId());
        assertEquals(1L, result.get(1).getProblemId());
        assertEquals(3L, result.get(2).getProblemId());
        assertNull(result.get(2).getAccuracyRate());
        assertEquals(0.2, result.get(0).getAccuracyRate(), 0.0001);
    }

    // ProblemServiceImpl.list 와 같은 클램프. size<=0 은 DEFAULT_PAGE_SIZE(20)로,
    // size 상한 초과는 MAX_PAGE_SIZE(100)로 잘려야 한다 — 그렇지 않으면 size=-1 이 DB 에서
    // "LIMIT must not be negative" 500 을, size=0 이 totalCount 는 그대로인 채 빈 목록을 낸다.
    @Test
    void listProblemStats_sizeZeroOrNegative_fallsBackToDefaultPageSize() {
        Mockito.when(statsDao.findProblemStats(10L, null, 20, 0)).thenReturn(Collections.emptyList());
        Mockito.when(statsDao.countProblemStats(10L, null)).thenReturn(0L);

        ProblemStatPageResponse response = service.listProblemStats(deptAdmin, null, null, 1, 0);

        Mockito.verify(statsDao).findProblemStats(10L, null, 20, 0);
        assertEquals(20, response.getSize());
    }

    @Test
    void listProblemStats_sizeAboveMax_clampsToMaxPageSize() {
        Mockito.when(statsDao.findProblemStats(10L, null, 100, 0)).thenReturn(Collections.emptyList());
        Mockito.when(statsDao.countProblemStats(10L, null)).thenReturn(0L);

        ProblemStatPageResponse response = service.listProblemStats(deptAdmin, null, null, 1, 1_000_000);

        Mockito.verify(statsDao).findProblemStats(10L, null, 100, 0);
        assertEquals(100, response.getSize());
    }

    @Test
    void sameAccuracy_breaksTieByProblemId_soOrderIsStable() {
        Mockito.when(statsDao.findProblemStats(10L, null, 20, 0)).thenReturn(Arrays.asList(
                raw(7L, "동률 B", 10, 5),
                raw(3L, "동률 A", 10, 5)
        ));
        Mockito.when(statsDao.countProblemStats(10L, null)).thenReturn(2L);

        List<ProblemStatItem> result = service.listProblemStats(deptAdmin, null, null, 1, 20).getItems();

        assertEquals(3L, result.get(0).getProblemId());
        assertEquals(7L, result.get(1).getProblemId());
    }

    private com.daeryun.probank.domain.Problem problem(long id, ProblemType type, long departmentId) {
        com.daeryun.probank.domain.Problem entity = new com.daeryun.probank.domain.Problem();
        entity.setId(id);
        entity.setType(type);
        entity.setDepartmentId(departmentId);
        entity.setContent("1+1=?");
        entity.setStatus(ProblemStatus.ACTIVE);
        return entity;
    }

    private com.daeryun.probank.domain.ProblemChoice choice(long id, String text) {
        com.daeryun.probank.domain.ProblemChoice entity = new com.daeryun.probank.domain.ProblemChoice();
        entity.setId(id);
        entity.setChoiceText(text);
        return entity;
    }

    private com.daeryun.probank.dto.stats.ChoiceDistributionRaw dist(long choiceId, int count) {
        com.daeryun.probank.dto.stats.ChoiceDistributionRaw entity =
                new com.daeryun.probank.dto.stats.ChoiceDistributionRaw();
        entity.setChoiceId(choiceId);
        entity.setSelectedCount(count);
        return entity;
    }

    @Test
    void getProblemDetail_mcqSingle_mapsDistributionOntoCurrentChoices() {
        Mockito.when(problemDao.findById(1L)).thenReturn(problem(1L, ProblemType.MCQ_SINGLE, 10L));
        Mockito.when(problemChoiceDao.findByProblemId(1L)).thenReturn(Arrays.asList(choice(10L, "1"), choice(11L, "2")));
        Mockito.when(attemptChoiceDao.findDistribution(1L)).thenReturn(Arrays.asList(dist(10L, 1), dist(11L, 2)));
        Mockito.when(attemptChoiceDao.countAnalyzedAttempts(1L)).thenReturn(3);
        Mockito.when(statsDao.findProblemStat(1L)).thenReturn(raw(1L, "1+1=?", 3, 2));
        Mockito.when(attemptDao.findRecentWrong(1L, 5)).thenReturn(Collections.emptyList());

        com.daeryun.probank.dto.stats.ProblemStatDetailResponse detail = service.getProblemDetail(1L, deptAdmin);

        assertEquals(2, detail.getChoiceDistribution().size());
        assertEquals(2, detail.getChoiceDistribution().get(1).getSelectedCount());
        assertEquals(0, detail.getExcludedAttempts());
    }

    @Test
    void getProblemDetail_choiceNeverPicked_stillAppearsWithZero() {
        Mockito.when(problemDao.findById(1L)).thenReturn(problem(1L, ProblemType.MCQ_SINGLE, 10L));
        Mockito.when(problemChoiceDao.findByProblemId(1L)).thenReturn(Arrays.asList(choice(10L, "1"), choice(11L, "2")));
        Mockito.when(attemptChoiceDao.findDistribution(1L)).thenReturn(Collections.singletonList(dist(10L, 3)));
        Mockito.when(attemptChoiceDao.countAnalyzedAttempts(1L)).thenReturn(3);
        Mockito.when(statsDao.findProblemStat(1L)).thenReturn(raw(1L, "1+1=?", 3, 3));
        Mockito.when(attemptDao.findRecentWrong(1L, 5)).thenReturn(Collections.emptyList());

        com.daeryun.probank.dto.stats.ProblemStatDetailResponse detail = service.getProblemDetail(1L, deptAdmin);

        assertEquals(0, detail.getChoiceDistribution().get(1).getSelectedCount());
    }

    @Test
    void getProblemDetail_reportsAttemptsExcludedFromDistribution() {
        Mockito.when(problemDao.findById(1L)).thenReturn(problem(1L, ProblemType.MCQ_SINGLE, 10L));
        Mockito.when(problemChoiceDao.findByProblemId(1L)).thenReturn(Collections.singletonList(choice(10L, "1")));
        Mockito.when(attemptChoiceDao.findDistribution(1L)).thenReturn(Collections.singletonList(dist(10L, 2)));
        // 시도는 5건인데 현재 보기와 매칭되는 것은 2건 — 나머지 3건은 문제 수정 이전 기록이다.
        Mockito.when(attemptChoiceDao.countAnalyzedAttempts(1L)).thenReturn(2);
        Mockito.when(statsDao.findProblemStat(1L)).thenReturn(raw(1L, "1+1=?", 5, 4));
        Mockito.when(attemptDao.findRecentWrong(1L, 5)).thenReturn(Collections.emptyList());

        com.daeryun.probank.dto.stats.ProblemStatDetailResponse detail = service.getProblemDetail(1L, deptAdmin);

        assertEquals(3, detail.getExcludedAttempts());
    }

    @Test
    void getProblemDetail_shortAnswer_hasNoDistribution() {
        Mockito.when(problemDao.findById(1L)).thenReturn(problem(1L, ProblemType.SHORT_ANSWER, 10L));
        Mockito.when(statsDao.findProblemStat(1L)).thenReturn(raw(1L, "수도는?", 2, 1));
        Mockito.when(attemptDao.findRecentWrong(1L, 5)).thenReturn(Collections.emptyList());

        com.daeryun.probank.dto.stats.ProblemStatDetailResponse detail = service.getProblemDetail(1L, deptAdmin);

        assertNull(detail.getChoiceDistribution());
        Mockito.verify(attemptChoiceDao, Mockito.never()).findDistribution(Mockito.anyLong());
    }

    @Test
    void getProblemDetail_otherDepartment_deniedForDeptAdmin() {
        Mockito.when(problemDao.findById(1L)).thenReturn(problem(1L, ProblemType.MCQ_SINGLE, 999L));

        assertThrows(com.daeryun.probank.exception.BizException.class,
                () -> service.getProblemDetail(1L, deptAdmin));
    }

    @Test
    void getProblemDetail_otherDepartment_allowedForSuperAdmin() {
        Mockito.when(problemDao.findById(1L)).thenReturn(problem(1L, ProblemType.SHORT_ANSWER, 999L));
        Mockito.when(statsDao.findProblemStat(1L)).thenReturn(raw(1L, "수도는?", 0, 0));
        Mockito.when(attemptDao.findRecentWrong(1L, 5)).thenReturn(Collections.emptyList());

        assertNotNull(service.getProblemDetail(1L, superAdmin));
    }
}
