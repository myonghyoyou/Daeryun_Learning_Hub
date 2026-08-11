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

    @Override
    public AttemptResult submit(Long problemId, AttemptSubmitRequest request, com.daeryun.probank.common.AuthUser actor) {
        Problem problem = problemDao.findById(problemId);
        if (problem == null || problem.getStatus() != ProblemStatus.ACTIVE) {
            throw new BizException(ErrorCode.INPUT_VALUE_INVALID, "존재하지 않거나 보관된 문제입니다.");
        }

        boolean correct;
        List<BlankAnswerResult> blankResults = null;
        String submittedAnswerSummary;

        switch (problem.getType()) {
            case MCQ_SINGLE:
            case MCQ_MULTI:
            case OX: {
                List<ProblemChoice> choices = problemChoiceDao.findByProblemId(problemId);
                java.util.Set<Long> correctIds = choices.stream().filter(ProblemChoice::isCorrect)
                        .map(ProblemChoice::getId).collect(Collectors.toSet());
                java.util.Set<Long> submittedIds = new java.util.HashSet<>(
                        request.getSelectedChoiceIds() == null ? java.util.Collections.emptyList() : request.getSelectedChoiceIds());
                correct = correctIds.equals(submittedIds);
                submittedAnswerSummary = submittedIds.toString();
                break;
            }
            case SHORT_ANSWER: {
                List<String> answers = problemAnswerDao.findByProblemId(problemId).stream()
                        .map(ProblemAnswer::getAnswerText).collect(Collectors.toList());
                correct = answers.stream().anyMatch(a -> normalize(a).equals(normalize(request.getSubmittedText())));
                submittedAnswerSummary = request.getSubmittedText();
                break;
            }
            case FILL_BLANK: {
                List<ProblemBlank> blanks = problemBlankDao.findByProblemId(problemId);
                List<BlankAnswerInput> submitted = request.getBlankAnswers() == null
                        ? java.util.Collections.emptyList() : request.getBlankAnswers();
                java.util.Set<String> submittedKeys = submitted.stream()
                        .map(BlankAnswerInput::getBlankKey).collect(Collectors.toSet());
                java.util.Set<String> definedKeys = blanks.stream()
                        .map(ProblemBlank::getBlankKey).collect(Collectors.toSet());
                if (submittedKeys.size() != submitted.size()
                        || !definedKeys.containsAll(submittedKeys)
                        || submittedKeys.size() != problem.getBlankRevealCount()) {
                    throw new BizException(ErrorCode.INPUT_VALUE_INVALID, "제출한 빈칸 개수가 올바르지 않습니다.");
                }
                java.util.Map<String, String> answerByKey = blanks.stream()
                        .collect(Collectors.toMap(ProblemBlank::getBlankKey, ProblemBlank::getAnswerText));
                blankResults = new ArrayList<>();
                boolean allCorrect = true;
                for (BlankAnswerInput input : submitted) {
                    String correctAnswer = answerByKey.get(input.getBlankKey());
                    boolean blankCorrect = normalize(correctAnswer).equals(normalize(input.getSubmittedAnswer()));
                    allCorrect &= blankCorrect;
                    blankResults.add(new BlankAnswerResult(input.getBlankKey(), input.getSubmittedAnswer(), blankCorrect, correctAnswer));
                }
                correct = allCorrect;
                submittedAnswerSummary = submitted.stream()
                        .map(b -> b.getBlankKey() + "=" + b.getSubmittedAnswer())
                        .collect(Collectors.joining(","));
                break;
            }
            default:
                throw new BizException(ErrorCode.MSG_PROC_FAIL);
        }

        Attempt attempt = new Attempt();
        attempt.setUserId(actor.getUserId());
        attempt.setProblemId(problemId);
        // submitted_answer 는 VARCHAR(500). 매우 긴 주관식/요약은 잘라 넣어 insert 실패를 막는다.
        attempt.setSubmittedAnswer(submittedAnswerSummary != null && submittedAnswerSummary.length() > 500
                ? submittedAnswerSummary.substring(0, 500) : submittedAnswerSummary);
        attempt.setCorrect(correct);
        attemptDao.insert(attempt);

        if (blankResults != null) {
            List<AttemptBlankAnswer> entities = blankResults.stream().map(r -> {
                AttemptBlankAnswer entity = new AttemptBlankAnswer();
                entity.setAttemptId(attempt.getId());
                entity.setBlankKey(r.getBlankKey());
                entity.setSubmittedAnswer(r.getSubmittedAnswer());
                entity.setCorrect(r.isCorrect());
                return entity;
            }).collect(Collectors.toList());
            attemptBlankAnswerDao.insertAll(entities);
        }

        return new AttemptResult(correct, problem.getExplanation(), blankResults);
    }

    private String normalize(String value) {
        return value == null ? "" : value.trim().toLowerCase().replaceAll("\\s+", " ");
    }
}
