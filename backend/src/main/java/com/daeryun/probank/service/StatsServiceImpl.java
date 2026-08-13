package com.daeryun.probank.service;

import com.daeryun.probank.common.AuthUser;
import com.daeryun.probank.dao.AttemptChoiceDao;
import com.daeryun.probank.dao.AttemptDao;
import com.daeryun.probank.dao.ProblemChoiceDao;
import com.daeryun.probank.dao.ProblemDao;
import com.daeryun.probank.dao.StatsDao;
import com.daeryun.probank.domain.UserRole;
import com.daeryun.probank.dto.stats.ProblemStatItem;
import com.daeryun.probank.dto.stats.ProblemStatPageResponse;
import org.springframework.stereotype.Service;

import java.util.Comparator;
import java.util.List;
import java.util.stream.Collectors;

@Service
public class StatsServiceImpl implements StatsService {

    /**
     * 정답률 오름차순, 미응시(null)는 맨 뒤, 동률은 problemId 로 끊는다.
     *
     * <b>정렬의 근거는 SQL 이다</b>(StatsMapper 의 accuracyOrder). 페이징이 그 순서 위에서
     * 잘리기 때문에 자바에서만 정렬하면 페이지 안에서만 맞고 전체로는 틀린다. 이 비교자는
     * 같은 규칙을 자바로 다시 적어 <b>의도를 단위 테스트로 고정</b>하는 역할이며, 이미 정렬된
     * 페이지에 다시 적용해도 결과가 바뀌지 않는다(no-op).
     *
     * 두 곳 중 한쪽만 고치면 페이지 안과 밖의 순서가 어긋난다. 반드시 함께 고쳐라.
     */
    private static final Comparator<ProblemStatItem> LOWEST_ACCURACY_FIRST =
            Comparator.comparing(ProblemStatItem::getAccuracyRate, Comparator.nullsLast(Comparator.naturalOrder()))
                    .thenComparing(ProblemStatItem::getProblemId);

    private final StatsDao statsDao;
    private final AttemptDao attemptDao;
    private final AttemptChoiceDao attemptChoiceDao;
    private final ProblemDao problemDao;
    private final ProblemChoiceDao problemChoiceDao;

    public StatsServiceImpl(StatsDao statsDao, AttemptDao attemptDao, AttemptChoiceDao attemptChoiceDao,
                            ProblemDao problemDao, ProblemChoiceDao problemChoiceDao) {
        this.statsDao = statsDao;
        this.attemptDao = attemptDao;
        this.attemptChoiceDao = attemptChoiceDao;
        this.problemDao = problemDao;
        this.problemChoiceDao = problemChoiceDao;
    }

    /**
     * 총괄 관리자는 요청한 부서를, 부서 관리자는 요청값을 무시하고 자기 부서를 쓴다.
     * 이 스코프는 UI 가 아니라 여기서 강제된다.
     */
    private Long effectiveDepartmentId(AuthUser actor, Long requested) {
        return actor.getRole() == UserRole.SUPER_ADMIN ? requested : actor.getDepartmentId();
    }

    @Override
    public ProblemStatPageResponse listProblemStats(AuthUser actor, Long departmentId, String status, int page, int size) {
        Long scope = effectiveDepartmentId(actor, departmentId);
        int safePage = Math.max(1, page);
        List<ProblemStatItem> items = statsDao.findProblemStats(scope, status, size, (safePage - 1) * size).stream()
                .map(ProblemStatItem::from)
                .sorted(LOWEST_ACCURACY_FIRST)
                .collect(Collectors.toList());
        return new ProblemStatPageResponse(items, statsDao.countProblemStats(scope, status), safePage, size);
    }

    @Override
    public List<ProblemStatItem> listAllProblemStats(AuthUser actor, Long departmentId) {
        return statsDao.findAllProblemStats(effectiveDepartmentId(actor, departmentId)).stream()
                .map(ProblemStatItem::from)
                .sorted(LOWEST_ACCURACY_FIRST)
                .collect(Collectors.toList());
    }

    @Override
    public int countActiveProblems(AuthUser actor, Long departmentId) {
        return statsDao.countActiveProblems(effectiveDepartmentId(actor, departmentId));
    }
}
