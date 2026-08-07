package com.daeryun.probank.service;

import com.daeryun.probank.domain.Problem;
import com.daeryun.probank.domain.ProblemAnswer;
import com.daeryun.probank.domain.ProblemChoice;

import java.util.List;

public interface ProblemProvisioningService {

    /**
     * problemDao.insert -> problemChoiceDao.insertAll -> tagDao.findOrCreateByNames ->
     * problemTagDao.replaceTags -> auditLogService.record 순서로, 새 트랜잭션(REQUIRES_NEW)에서
     * 보기형 문제(MCQ_SINGLE/MCQ_MULTI/OX) 한 건을 영속화한다. 엑셀 업로드처럼 여러 행을 순회하며
     * 호출하는 경우 한 행의 실패가 다른 행의 커밋에 영향을 주지 않도록 하기 위함이다. choices의
     * problemId는 problem insert 이후 이 메서드가 채운다.
     */
    void provisionWithChoices(Problem problem, List<ProblemChoice> choices, List<String> tagNames);

    /**
     * 서술형(SHORT_ANSWER) 문제 한 건을 같은 방식(REQUIRES_NEW)으로 영속화한다.
     */
    void provisionWithAnswers(Problem problem, List<ProblemAnswer> answers, List<String> tagNames);
}
