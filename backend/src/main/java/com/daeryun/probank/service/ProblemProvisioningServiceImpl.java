package com.daeryun.probank.service;

import com.daeryun.probank.dao.ProblemAnswerDao;
import com.daeryun.probank.dao.ProblemChoiceDao;
import com.daeryun.probank.dao.ProblemDao;
import com.daeryun.probank.dao.ProblemTagDao;
import com.daeryun.probank.dao.TagDao;
import com.daeryun.probank.domain.Problem;
import com.daeryun.probank.domain.ProblemAnswer;
import com.daeryun.probank.domain.ProblemChoice;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Service
public class ProblemProvisioningServiceImpl implements ProblemProvisioningService {

    private final ProblemDao problemDao;
    private final ProblemChoiceDao problemChoiceDao;
    private final ProblemAnswerDao problemAnswerDao;
    private final TagDao tagDao;
    private final ProblemTagDao problemTagDao;
    private final AuditLogService auditLogService;

    public ProblemProvisioningServiceImpl(ProblemDao problemDao, ProblemChoiceDao problemChoiceDao,
                                           ProblemAnswerDao problemAnswerDao, TagDao tagDao,
                                           ProblemTagDao problemTagDao, AuditLogService auditLogService) {
        this.problemDao = problemDao;
        this.problemChoiceDao = problemChoiceDao;
        this.problemAnswerDao = problemAnswerDao;
        this.tagDao = tagDao;
        this.problemTagDao = problemTagDao;
        this.auditLogService = auditLogService;
    }

    /**
     * problemDao.insert -> problemChoiceDao.insertAll -> 태그 연결 -> 감사 로그 순으로 실행한다.
     * REQUIRES_NEW 로 별도 트랜잭션을 열어, 이 행에서 발생한 예외는 이 행만 롤백시키고(문제·보기·태그가
     * 함께 사라진다) 다른 행의 커밋에는 영향을 주지 않는다.
     */
    @Override
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void provisionWithChoices(Problem problem, List<ProblemChoice> choices, List<String> tagNames) {
        problemDao.insert(problem);
        for (ProblemChoice choice : choices) {
            choice.setProblemId(problem.getId());
        }
        problemChoiceDao.insertAll(choices);
        problemTagDao.replaceTags(problem.getId(), tagDao.findOrCreateByNames(tagNames));
        auditLogService.record(problem.getCreatedBy(), "PROBLEM_CREATED_BY_EXCEL", "PROBLEM", problem.getId(),
                "{\"type\":\"" + problem.getType() + "\"}");
    }

    /**
     * problemDao.insert -> problemAnswerDao.insertAll -> 태그 연결 -> 감사 로그 순으로, 같은 REQUIRES_NEW
     * 경계 안에서 서술형(SHORT_ANSWER) 문제 한 건을 영속화한다.
     */
    @Override
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void provisionWithAnswers(Problem problem, List<ProblemAnswer> answers, List<String> tagNames) {
        problemDao.insert(problem);
        for (ProblemAnswer answer : answers) {
            answer.setProblemId(problem.getId());
        }
        problemAnswerDao.insertAll(answers);
        problemTagDao.replaceTags(problem.getId(), tagDao.findOrCreateByNames(tagNames));
        auditLogService.record(problem.getCreatedBy(), "PROBLEM_CREATED_BY_EXCEL", "PROBLEM", problem.getId(),
                "{\"type\":\"" + problem.getType() + "\"}");
    }
}
