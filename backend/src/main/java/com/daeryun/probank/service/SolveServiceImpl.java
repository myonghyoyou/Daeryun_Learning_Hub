package com.daeryun.probank.service;

import com.daeryun.probank.common.ErrorCode;
import com.daeryun.probank.dao.*;
import com.daeryun.probank.dao.AttemptChoiceDao;
import com.daeryun.probank.domain.*;
import com.daeryun.probank.domain.AttemptChoice;
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
    private static final int MAX_RANDOM_COUNT = 50;

    private final ProblemDao problemDao;
    private final ProblemChoiceDao problemChoiceDao;
    private final ProblemAnswerDao problemAnswerDao;
    private final ProblemBlankDao problemBlankDao;
    private final AttemptDao attemptDao;
    private final AttemptBlankAnswerDao attemptBlankAnswerDao;
    private final AttemptChoiceDao attemptChoiceDao;

    public SolveServiceImpl(ProblemDao problemDao, ProblemChoiceDao problemChoiceDao,
                             ProblemAnswerDao problemAnswerDao, ProblemBlankDao problemBlankDao,
                             AttemptDao attemptDao, AttemptBlankAnswerDao attemptBlankAnswerDao,
                             AttemptChoiceDao attemptChoiceDao) {
        this.problemDao = problemDao;
        this.problemChoiceDao = problemChoiceDao;
        this.problemAnswerDao = problemAnswerDao;
        this.problemBlankDao = problemBlankDao;
        this.attemptDao = attemptDao;
        this.attemptBlankAnswerDao = attemptBlankAnswerDao;
        this.attemptChoiceDao = attemptChoiceDao;
    }

    @Override
    public List<ProblemSolveListItem> list(String keyword, String tag) {
        return problemDao.findAllActive(keyword, tag);
    }

    @Override
    public List<ProblemSolveListItem> randomSet(int count, Long departmentId) {
        if (count < 1 || count > MAX_RANDOM_COUNT) {
            throw new BizException(ErrorCode.INPUT_VALUE_INVALID,
                    "문제 수는 1 이상 " + MAX_RANDOM_COUNT + " 이하여야 합니다.");
        }
        // 조건에 맞는 문제가 요청 수보다 적어도 오류가 아니다 — 있는 만큼 풀게 한다.
        return problemDao.findRandomActive(count, departmentId);
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
        List<ProblemChoice> selectedChoices = java.util.Collections.emptyList();

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
                // 문제에 정의된 순서로 고정한다. 제출 ID 는 Set 이라 순서가 없다.
                selectedChoices = choices.stream()
                        .filter(c -> submittedIds.contains(c.getId()))
                        .collect(Collectors.toList());
                submittedAnswerSummary = describeChoices(choices, submittedIds);
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
                submittedAnswerSummary = describeBlanks(submitted);
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

        // 통계의 보기별 선택 분포가 쓰는 유일한 소스다. submitted_answer 는 이력 화면이
        // 그대로 렌더하는 표시용 텍스트라 집계용으로 파싱하지 않는다.
        if (!selectedChoices.isEmpty()) {
            List<AttemptChoice> attemptChoices = selectedChoices.stream().map(choice -> {
                AttemptChoice entity = new AttemptChoice();
                entity.setAttemptId(attempt.getId());
                entity.setChoiceId(choice.getId());
                entity.setChoiceText(choice.getChoiceText());
                return entity;
            }).collect(Collectors.toList());
            attemptChoiceDao.insertAll(attemptChoices);
        }

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

    @Override
    public List<com.daeryun.probank.dto.solve.AttemptHistoryItem> myHistory(com.daeryun.probank.common.AuthUser actor) {
        return attemptDao.findByUserId(actor.getUserId());
    }

    private String normalize(String value) {
        return value == null ? "" : value.trim().toLowerCase().replaceAll("\\s+", " ");
    }

    /**
     * attempts.submitted_answer 는 풀이 이력 화면이 "제출 답안" 칸에 **그대로 보여주는 값**이다.
     * 그래서 선택지 ID(`[104]`)가 아니라 사람이 읽는 선택지 본문을 남긴다.
     *
     * 순서는 제출 순서가 아니라 문제에 정의된 선택지 순서를 따른다 — 제출 ID는 Set 이라
     * 순서가 보장되지 않고, 사용자가 화면에서 본 순서와 맞추는 편이 읽기에도 자연스럽다.
     *
     * 저장 시점의 스냅샷이라는 점이 중요하다. 나중에 선택지 문구가 수정돼도 "그때 무엇을
     * 골랐는지"는 바뀌지 않는다.
     */
    private String describeChoices(List<ProblemChoice> choices, java.util.Set<Long> submittedIds) {
        return choices.stream()
                .filter(c -> submittedIds.contains(c.getId()))
                .map(ProblemChoice::getChoiceText)
                .collect(Collectors.joining(", "));
    }

    /**
     * 빈칸도 같은 이유로 내부 키(`b1=편성`)가 아니라 입력한 답만 남긴다. 키는 화면 어디에도
     * 노출되지 않는 내부 식별자다. 비워 둔 칸은 채점 결과 화면과 같은 문구로 표시한다.
     */
    private String describeBlanks(List<BlankAnswerInput> submitted) {
        return submitted.stream()
                .map(b -> b.getSubmittedAnswer() == null || b.getSubmittedAnswer().trim().isEmpty()
                        ? "(미입력)" : b.getSubmittedAnswer())
                .collect(Collectors.joining(", "));
    }
}
