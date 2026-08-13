package com.daeryun.probank.service;

import com.daeryun.probank.common.AuthUser;
import com.daeryun.probank.common.ErrorCode;
import com.daeryun.probank.dao.AttemptChoiceDao;
import com.daeryun.probank.dao.AttemptDao;
import com.daeryun.probank.dao.ProblemChoiceDao;
import com.daeryun.probank.dao.ProblemDao;
import com.daeryun.probank.dao.StatsDao;
import com.daeryun.probank.domain.Problem;
import com.daeryun.probank.domain.ProblemType;
import com.daeryun.probank.domain.UserRole;
import com.daeryun.probank.dto.stats.*;
import com.daeryun.probank.exception.BizException;
import org.springframework.stereotype.Service;

import java.util.Comparator;
import java.util.List;
import java.util.Map;
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

    private static final java.util.Set<ProblemType> CHOICE_TYPES =
            java.util.EnumSet.of(ProblemType.MCQ_SINGLE, ProblemType.MCQ_MULTI, ProblemType.OX);

    private static final int RECENT_WRONG_LIMIT = 5;

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

    @Override
    public ProblemStatDetailResponse getProblemDetail(Long problemId, AuthUser actor) {
        Problem problem = problemDao.findById(problemId);
        if (problem == null) {
            throw new BizException(ErrorCode.INPUT_VALUE_INVALID, "존재하지 않는 문제입니다.");
        }
        if (actor.getRole() != UserRole.SUPER_ADMIN && !problem.getDepartmentId().equals(actor.getDepartmentId())) {
            throw new BizException(ErrorCode.ACCESS_AUTH_DENIED);
        }

        ProblemStatRaw raw = statsDao.findProblemStat(problemId);
        ProblemStatItem summary = raw != null
                ? ProblemStatItem.from(raw)
                : new ProblemStatItem(problem.getId(), problem.getContent(), problem.getType(), problem.getStatus(),
                        problem.getDepartmentId(), null, 0, 0, null, null);

        List<ChoiceDistributionItem> choiceDistribution = null;
        int excludedAttempts = 0;
        if (CHOICE_TYPES.contains(problem.getType())) {
            Map<Long, Integer> countByChoiceId = attemptChoiceDao.findDistribution(problemId).stream()
                    .collect(Collectors.toMap(ChoiceDistributionRaw::getChoiceId,
                            ChoiceDistributionRaw::getSelectedCount));
            // 한 번도 안 고른 보기도 0회로 남긴다 — 빠지면 "아무도 안 고른 보기"를 볼 수 없다.
            choiceDistribution = problemChoiceDao.findByProblemId(problemId).stream()
                    .map(choice -> new ChoiceDistributionItem(choice.getId(), choice.getChoiceText(),
                            countByChoiceId.getOrDefault(choice.getId(), 0)))
                    .collect(Collectors.toList());
            excludedAttempts = Math.max(0, summary.getTotalAttempts() - attemptChoiceDao.countAnalyzedAttempts(problemId));
        }

        List<RecentWrongSample> recentWrongSamples = attemptDao.findRecentWrong(problemId, RECENT_WRONG_LIMIT);
        return new ProblemStatDetailResponse(summary, choiceDistribution, excludedAttempts, recentWrongSamples);
    }
}
