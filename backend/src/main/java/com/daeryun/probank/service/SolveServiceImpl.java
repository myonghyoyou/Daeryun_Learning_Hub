package com.daeryun.probank.service;

import com.daeryun.probank.common.ErrorCode;
import com.daeryun.probank.dao.*;
import com.daeryun.probank.domain.*;
import com.daeryun.probank.dto.solve.*;
import com.daeryun.probank.exception.BizException;
import org.springframework.stereotype.Service;

import java.security.SecureRandom;
import java.util.ArrayList;
import java.util.List;
import java.util.stream.Collectors;

@Service
public class SolveServiceImpl implements SolveService {

    private final SecureRandom random = new SecureRandom();

    private final ProblemDao problemDao;
    private final ProblemChoiceDao problemChoiceDao;
    private final ProblemAnswerDao problemAnswerDao;
    private final ProblemBlankDao problemBlankDao;
    private final AttemptDao attemptDao;
    private final AttemptBlankAnswerDao attemptBlankAnswerDao;

    public SolveServiceImpl(ProblemDao problemDao, ProblemChoiceDao problemChoiceDao,
                             ProblemAnswerDao problemAnswerDao, ProblemBlankDao problemBlankDao,
                             AttemptDao attemptDao, AttemptBlankAnswerDao attemptBlankAnswerDao) {
        this.problemDao = problemDao;
        this.problemChoiceDao = problemChoiceDao;
        this.problemAnswerDao = problemAnswerDao;
        this.problemBlankDao = problemBlankDao;
        this.attemptDao = attemptDao;
        this.attemptBlankAnswerDao = attemptBlankAnswerDao;
    }

    @Override
    public List<ProblemSolveListItem> list(String keyword, String tag) {
        return problemDao.findAllActive(keyword, tag);
    }

    @Override
    public ProblemSolveDetailResponse getDetail(Long problemId) {
        Problem problem = problemDao.findById(problemId);
        if (problem == null || problem.getStatus() != ProblemStatus.ACTIVE) {
            throw new BizException(ErrorCode.INPUT_VALUE_INVALID, "존재하지 않거나 보관된 문제입니다.");
        }

        List<ChoiceOption> choices = null;
        List<String> blanksToAnswer = null;
        List<RevealedBlank> revealedBlanks = null;

        if (problem.getType() == ProblemType.FILL_BLANK) {
            List<ProblemBlank> blanks = problemBlankDao.findByProblemId(problemId);
            List<String> selected = selectRandomBlankKeys(blanks, problem.getBlankRevealCount());
            blanksToAnswer = selected;
            revealedBlanks = blanks.stream()
                    .filter(b -> !selected.contains(b.getBlankKey()))
                    .map(b -> new RevealedBlank(b.getBlankKey(), b.getAnswerText()))
                    .collect(Collectors.toList());
        } else if (problem.getType() != ProblemType.SHORT_ANSWER) {
            choices = problemChoiceDao.findByProblemId(problemId).stream()
                    .map(c -> new ChoiceOption(c.getId(), c.getChoiceText()))
                    .collect(Collectors.toList());
        }

        return new ProblemSolveDetailResponse(
                problem.getId(), problem.getType(), problem.getContent(), problem.getImageUrl(),
                problem.getReferenceText(), choices, blanksToAnswer, revealedBlanks);
    }

    @Override
    public List<String> selectRandomBlankKeys(List<ProblemBlank> blanks, int count) {
        List<String> keys = new ArrayList<>(blanks.stream().map(ProblemBlank::getBlankKey).collect(Collectors.toList()));
        java.util.Collections.shuffle(keys, random);
        return keys.subList(0, Math.min(count, keys.size()));
    }
}
