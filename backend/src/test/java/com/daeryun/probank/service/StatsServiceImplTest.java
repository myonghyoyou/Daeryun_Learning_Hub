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
}
