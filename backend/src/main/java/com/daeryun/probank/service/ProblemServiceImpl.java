package com.daeryun.probank.service;

import com.daeryun.probank.common.AuthUser;
import com.daeryun.probank.common.ErrorCode;
import com.daeryun.probank.dao.ProblemAnswerDao;
import com.daeryun.probank.dao.ProblemBlankDao;
import com.daeryun.probank.dao.ProblemChoiceDao;
import com.daeryun.probank.dao.ProblemDao;
import com.daeryun.probank.dao.ProblemTagDao;
import com.daeryun.probank.dao.TagDao;
import com.daeryun.probank.domain.*;
import com.daeryun.probank.dto.problem.BlankInput;
import com.daeryun.probank.dto.problem.ChoiceInput;
import com.daeryun.probank.dto.problem.ProblemCreateRequest;
import com.daeryun.probank.dto.problem.ProblemDetailResponse;
import com.daeryun.probank.dto.problem.ProblemListItem;
import com.daeryun.probank.exception.BizException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.stream.Collectors;

@Service
public class ProblemServiceImpl implements ProblemService {

    private static final int MIN_CHOICES = 2;
    private static final int MAX_CHOICES = 5;
    private static final int MAX_TAGS = 20;
    private static final int MAX_TAG_LENGTH = 100;

    private final ProblemDao problemDao;
    private final ProblemChoiceDao problemChoiceDao;
    private final ProblemAnswerDao problemAnswerDao;
    private final ProblemBlankDao problemBlankDao;
    private final TagDao tagDao;
    private final ProblemTagDao problemTagDao;
    private final AuditLogService auditLogService;

    public ProblemServiceImpl(ProblemDao problemDao, ProblemChoiceDao problemChoiceDao,
                               ProblemAnswerDao problemAnswerDao, ProblemBlankDao problemBlankDao,
                               TagDao tagDao, ProblemTagDao problemTagDao, AuditLogService auditLogService) {
        this.problemDao = problemDao;
        this.problemChoiceDao = problemChoiceDao;
        this.problemAnswerDao = problemAnswerDao;
        this.problemBlankDao = problemBlankDao;
        this.tagDao = tagDao;
        this.problemTagDao = problemTagDao;
        this.auditLogService = auditLogService;
    }

    @Override
    @Transactional
    public void create(ProblemCreateRequest request, AuthUser actor) {
        validate(request);

        Problem problem = new Problem();
        problem.setType(request.getType());
        problem.setContent(request.getContent());
        problem.setImageUrl(request.getImageUrl());
        problem.setReferenceText(request.getReferenceText());
        problem.setExplanation(request.getExplanation());
        problem.setBlankRevealCount(request.getType() == ProblemType.FILL_BLANK ? request.getBlankRevealCount() : null);
        problem.setStatus(ProblemStatus.ACTIVE);
        // 문제는 등록한 관리자의 부서에 귀속된다. 클라이언트가 부서를 지정할 방법이
        // 없도록 ProblemCreateRequest에는 departmentId 필드 자체가 없고, 오직
        // 세션의 AuthUser(actor)에서만 가져온다 — 부서 격리를 서버가 강제한다.
        problem.setDepartmentId(actor.getDepartmentId());
        problem.setCreatedBy(actor.getUserId());
        problemDao.insert(problem);

        saveTypeSpecificData(problem.getId(), request);
        problemTagDao.replaceTags(problem.getId(), tagDao.findOrCreateByNames(normalizeTags(request.getTags())));
        auditLogService.record(actor.getUserId(), "PROBLEM_CREATED", "PROBLEM", problem.getId(),
                "{\"type\":\"" + problem.getType() + "\"}");
    }

    @Override
    @Transactional
    public void update(Long id, ProblemCreateRequest request, AuthUser actor) {
        Problem existing = problemDao.findById(id);
        if (existing == null) {
            throw new BizException(ErrorCode.INPUT_VALUE_INVALID, "존재하지 않는 문제입니다.");
        }
        assertOwnership(existing, actor);
        if (existing.getType() != request.getType()) {
            throw new BizException(ErrorCode.INPUT_VALUE_INVALID, "문제 유형은 수정할 수 없습니다.");
        }
        validate(request);

        existing.setContent(request.getContent());
        existing.setImageUrl(request.getImageUrl());
        existing.setReferenceText(request.getReferenceText());
        existing.setExplanation(request.getExplanation());
        existing.setBlankRevealCount(request.getType() == ProblemType.FILL_BLANK ? request.getBlankRevealCount() : null);
        problemDao.update(existing);

        problemChoiceDao.deleteByProblemId(id);
        problemAnswerDao.deleteByProblemId(id);
        problemBlankDao.deleteByProblemId(id);
        saveTypeSpecificData(id, request);
        problemTagDao.replaceTags(id, tagDao.findOrCreateByNames(normalizeTags(request.getTags())));
        auditLogService.record(actor.getUserId(), "PROBLEM_UPDATED", "PROBLEM", id,
                "{\"type\":\"" + existing.getType() + "\"}");
    }

    @Override
    @Transactional
    public void archive(Long id, AuthUser actor) {
        Problem existing = problemDao.findById(id);
        if (existing == null) {
            throw new BizException(ErrorCode.INPUT_VALUE_INVALID, "존재하지 않는 문제입니다.");
        }
        assertOwnership(existing, actor);
        problemDao.updateStatus(id, ProblemStatus.ARCHIVED);
        auditLogService.record(actor.getUserId(), "PROBLEM_ARCHIVED", "PROBLEM", id, "{}");
    }

    @Override
    public List<ProblemListItem> list(AuthUser actor, Long departmentId, String type, String status,
                                       LocalDate createdFrom, LocalDate createdTo, String tag, String keyword) {
        // 부서관리자는 요청 파라미터의 departmentId를 무시하고 자기 부서로 강제된다.
        // 총괄관리자만 요청한 departmentId(전체 조회를 의미하는 null 포함)를 그대로 사용한다.
        Long effectiveDepartmentId = actor.getRole() == UserRole.SUPER_ADMIN ? departmentId : actor.getDepartmentId();
        return problemDao.findAll(effectiveDepartmentId, type, status, createdFrom, createdTo, tag, keyword);
    }

    @Override
    public ProblemDetailResponse getDetail(Long id, AuthUser actor) {
        Problem problem = problemDao.findById(id);
        if (problem == null) {
            throw new BizException(ErrorCode.INPUT_VALUE_INVALID, "존재하지 않는 문제입니다.");
        }
        assertOwnership(problem, actor);

        List<ProblemChoice> choices = problemChoiceDao.findByProblemId(id);
        List<String> answers = problemAnswerDao.findByProblemId(id).stream()
                .map(ProblemAnswer::getAnswerText).collect(Collectors.toList());
        List<ProblemBlank> blanks = problemBlankDao.findByProblemId(id);
        List<String> tags = problemTagDao.findTagNamesByProblemId(id);
        return ProblemDetailResponse.of(problem, choices, answers, blanks, tags);
    }

    // 부서 스코프 체크의 단일 관문. 총괄관리자는 전체 부서에 접근하고, 부서관리자는
    // 자기 부서가 등록한 문제만 접근할 수 있다. Task 4(수정/보관)도 이 헬퍼를 재사용한다.
    private void assertOwnership(Problem problem, AuthUser actor) {
        if (actor.getRole() != UserRole.SUPER_ADMIN && !problem.getDepartmentId().equals(actor.getDepartmentId())) {
            throw new BizException(ErrorCode.ACCESS_AUTH_DENIED);
        }
    }

    private List<String> normalizeTags(List<String> input) {
        if (input == null) return java.util.Collections.emptyList();
        List<String> normalized = input.stream().map(String::trim).filter(s -> !s.isEmpty())
                .map(String::toLowerCase).distinct().collect(Collectors.toList());
        if (normalized.size() > MAX_TAGS || normalized.stream().anyMatch(s -> s.length() > MAX_TAG_LENGTH)) {
            throw new BizException(ErrorCode.INPUT_VALUE_INVALID, "태그는 문제당 20개, 태그명은 100자 이하여야 합니다.");
        }
        return normalized;
    }

    private void saveTypeSpecificData(Long problemId, ProblemCreateRequest request) {
        switch (request.getType()) {
            case MCQ_SINGLE:
            case MCQ_MULTI:
            case OX:
                List<ProblemChoice> choices = toChoiceEntities(problemId, request.getChoices());
                problemChoiceDao.insertAll(choices);
                break;
            case SHORT_ANSWER:
                List<ProblemAnswer> answers = request.getAnswers().stream().map(text -> {
                    ProblemAnswer answer = new ProblemAnswer();
                    answer.setProblemId(problemId);
                    answer.setAnswerText(text);
                    return answer;
                }).collect(Collectors.toList());
                problemAnswerDao.insertAll(answers);
                break;
            case FILL_BLANK:
                List<ProblemBlank> blanks = new ArrayList<>();
                for (int i = 0; i < request.getBlanks().size(); i++) {
                    BlankInput input = request.getBlanks().get(i);
                    ProblemBlank blank = new ProblemBlank();
                    blank.setProblemId(problemId);
                    blank.setBlankKey(input.getBlankKey());
                    blank.setAnswerText(input.getAnswerText());
                    blank.setDisplayOrder(i + 1);
                    blanks.add(blank);
                }
                problemBlankDao.insertAll(blanks);
                break;
        }
    }

    private List<ProblemChoice> toChoiceEntities(Long problemId, List<ChoiceInput> inputs) {
        List<ProblemChoice> choices = new ArrayList<>();
        for (int i = 0; i < inputs.size(); i++) {
            ChoiceInput input = inputs.get(i);
            ProblemChoice choice = new ProblemChoice();
            choice.setProblemId(problemId);
            choice.setChoiceText(input.getText());
            choice.setCorrect(input.isCorrect());
            choice.setDisplayOrder(i + 1);
            choices.add(choice);
        }
        return choices;
    }

    private void validate(ProblemCreateRequest request) {
        // 유형 누락 검증: 유형이 없으면 이후 switch가 어떤 분기도 타지 않아 검증을
        // 전혀 하지 않고 조용히 통과할 수 있으므로 가장 먼저 막는다.
        if (request.getType() == null) {
            throw new BizException(ErrorCode.INPUT_VALUE_INVALID, "문제 유형을 선택하세요.");
        }
        if (isBlank(request.getContent())) {
            throw new BizException(ErrorCode.INPUT_VALUE_INVALID, "문제 내용을 입력하세요.");
        }
        switch (request.getType()) {
            case MCQ_SINGLE:
                validateChoices(request.getChoices(), 1);
                break;
            case MCQ_MULTI:
                validateChoices(request.getChoices(), -1);
                break;
            case OX:
                if (request.getChoices() == null || request.getChoices().size() != 2) {
                    throw new BizException(ErrorCode.INPUT_VALUE_INVALID, "OX 문제는 보기 2개(O/X)가 필요합니다.");
                }
                validateChoices(request.getChoices(), 1);
                break;
            case SHORT_ANSWER:
                validateAnswers(request.getAnswers());
                break;
            case FILL_BLANK:
                validateBlanks(request.getContent(), request.getBlanks(), request.getBlankRevealCount());
                break;
        }
    }

    private void validateChoices(List<ChoiceInput> choices, int exactCorrectCount) {
        if (choices == null || choices.size() < MIN_CHOICES || choices.size() > MAX_CHOICES) {
            throw new BizException(ErrorCode.INPUT_VALUE_INVALID, "보기는 2개 이상 5개 이하이어야 합니다.");
        }
        if (choices.stream().anyMatch(c -> isBlank(c.getText()))) {
            throw new BizException(ErrorCode.INPUT_VALUE_INVALID, "빈 보기는 입력할 수 없습니다.");
        }
        long correctCount = choices.stream().filter(ChoiceInput::isCorrect).count();
        if (exactCorrectCount > 0 && correctCount != exactCorrectCount) {
            throw new BizException(ErrorCode.INPUT_VALUE_INVALID, "정답 개수가 올바르지 않습니다.");
        }
        if (exactCorrectCount < 0 && correctCount < 1) {
            throw new BizException(ErrorCode.INPUT_VALUE_INVALID, "정답을 최소 1개 선택하세요.");
        }
    }

    private void validateAnswers(List<String> answers) {
        if (answers == null || answers.isEmpty()) {
            throw new BizException(ErrorCode.INPUT_VALUE_INVALID, "정답을 최소 1개 입력하세요.");
        }
        if (answers.stream().anyMatch(this::isBlank)) {
            throw new BizException(ErrorCode.INPUT_VALUE_INVALID, "빈 정답은 입력할 수 없습니다.");
        }
    }

    private void validateBlanks(String content, List<BlankInput> blanks, Integer blankRevealCount) {
        if (blanks == null || blanks.isEmpty()) {
            throw new BizException(ErrorCode.INPUT_VALUE_INVALID, "빈칸을 최소 1개 정의하세요.");
        }
        List<String> keys = new ArrayList<>();
        for (BlankInput blank : blanks) {
            if (isBlank(blank.getBlankKey()) || isBlank(blank.getAnswerText())) {
                throw new BizException(ErrorCode.INPUT_VALUE_INVALID, "빈칸 키와 정답을 모두 입력하세요.");
            }
            keys.add(blank.getBlankKey());
        }
        Set<String> uniqueKeys = new HashSet<>(keys);
        if (uniqueKeys.size() != keys.size()) {
            throw new BizException(ErrorCode.INPUT_VALUE_INVALID, "빈칸 키가 중복되었습니다.");
        }
        for (String key : keys) {
            if (!content.contains("{{" + key + "}}")) {
                throw new BizException(ErrorCode.INPUT_VALUE_INVALID, "본문에 없는 빈칸 마커입니다: " + key);
            }
        }
        if (blankRevealCount == null || blankRevealCount < 1 || blankRevealCount > blanks.size()) {
            throw new BizException(ErrorCode.INPUT_VALUE_INVALID, "출제할 빈칸 개수가 유효하지 않습니다.");
        }
    }

    private boolean isBlank(String value) {
        return value == null || value.trim().isEmpty();
    }
}
