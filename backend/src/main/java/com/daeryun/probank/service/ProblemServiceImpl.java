package com.daeryun.probank.service;

import com.daeryun.probank.common.AuthUser;
import com.daeryun.probank.common.ErrorCode;
import com.daeryun.probank.dao.DepartmentDao;
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
import com.daeryun.probank.dto.problem.ProblemPageResponse;
import com.daeryun.probank.exception.BizException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.stream.Collectors;

@Service
public class ProblemServiceImpl implements ProblemService {

    private static final int DEFAULT_PAGE_SIZE = 20;
    private static final int MAX_PAGE_SIZE = 100;

    private static final int MIN_CHOICES = 2;
    private static final int MAX_CHOICES = 5;
    private static final int MAX_TAGS = 20;
    private static final int MAX_TAG_LENGTH = 100;

    // imageUrl 검증 규칙(접두어/경로 탈출/길이 상한)은 ImageUrlValidator 하나에만 있다. JSON API 경로
    // (이 클래스)와 엑셀 업로드 경로(ExcelProblemUploadServiceImpl) 모두 그 클래스를 호출한다 — 규칙이
    // 한쪽에서만 바뀌는 드리프트를 막기 위해서다. Plan 4 풀이 화면이 이 값을 전사 공통으로 렌더링하므로
    // 두 입력 경로 모두 서버에서 고정한다.

    // 아래 상한은 schema.sql의 컬럼 폭과 1:1로 맞춘다. 어느 쪽도 검증하지 않으면 DB가 던지는
    // DataIntegrityViolationException이 "처리 중 오류가 발생하였습니다" + ERROR 스택트레이스로
    // 새어 나가는데, 평범한 사용자 입력(특히 50자 blank_key)으로 충분히 도달할 수 있다.
    private static final int MAX_CHOICE_TEXT_LENGTH = 500; // problem_choices.choice_text VARCHAR(500)
    private static final int MAX_ANSWER_TEXT_LENGTH = 500; // problem_answers/problem_blanks.answer_text VARCHAR(500)
    private static final int MAX_BLANK_KEY_LENGTH = 50;    // problem_blanks.blank_key VARCHAR(50)

    private final ProblemDao problemDao;
    private final ProblemChoiceDao problemChoiceDao;
    private final ProblemAnswerDao problemAnswerDao;
    private final ProblemBlankDao problemBlankDao;
    private final TagDao tagDao;
    private final ProblemTagDao problemTagDao;
    private final AuditLogService auditLogService;
    private final DepartmentDao departmentDao;
    private final OwningDepartmentResolver owningDepartmentResolver;

    public ProblemServiceImpl(ProblemDao problemDao, ProblemChoiceDao problemChoiceDao,
                               ProblemAnswerDao problemAnswerDao, ProblemBlankDao problemBlankDao,
                               TagDao tagDao, ProblemTagDao problemTagDao, AuditLogService auditLogService,
                               DepartmentDao departmentDao,
                               OwningDepartmentResolver owningDepartmentResolver) {
        this.problemDao = problemDao;
        this.problemChoiceDao = problemChoiceDao;
        this.problemAnswerDao = problemAnswerDao;
        this.problemBlankDao = problemBlankDao;
        this.tagDao = tagDao;
        this.problemTagDao = problemTagDao;
        this.auditLogService = auditLogService;
        this.departmentDao = departmentDao;
        this.owningDepartmentResolver = owningDepartmentResolver;
    }

    @Override
    @Transactional
    public void create(ProblemCreateRequest request, Long departmentId, AuthUser actor) {
        normalize(request);
        validate(request);
        // 부서 검증은 어떤 행도 쓰기 전에 끝낸다.
        Long owningDepartmentId = owningDepartmentResolver.resolve(departmentId, actor);

        Problem problem = new Problem();
        problem.setType(request.getType());
        problem.setContent(request.getContent());
        problem.setImageUrl(request.getImageUrl());
        problem.setReferenceText(request.getReferenceText());
        problem.setExplanation(request.getExplanation());
        problem.setBlankRevealCount(request.getType() == ProblemType.FILL_BLANK ? request.getBlankRevealCount() : null);
        problem.setStatus(ProblemStatus.ACTIVE);
        // 귀속 부서는 총괄 관리자만 지정할 수 있고, 부서 관리자는 본인 부서로 강제된다
        // (OwningDepartmentResolver). departmentId 를 ProblemCreateRequest 에 넣지 않고 별도
        // 파라미터로 받는 이유: 이 DTO 는 update() 와 공유되므로, 필드를 넣으면 수정 경로에도
        // 부서 지정 표면이 생긴다 — 부서 이동을 전용 엔드포인트로 분리한 이유와 같다.
        problem.setDepartmentId(owningDepartmentId);
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
        normalize(request);
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
    public ProblemPageResponse list(AuthUser actor, Long departmentId, String type, String status,
                                     LocalDate createdFrom, LocalDate createdTo, String tag, String keyword,
                                     int page, int size) {
        // 부서관리자는 요청 파라미터의 departmentId를 무시하고 자기 부서로 강제된다.
        // 총괄관리자만 요청한 departmentId(전체 조회를 의미하는 null 포함)를 그대로 사용한다.
        Long effectiveDepartmentId = actor.getRole() == UserRole.SUPER_ADMIN ? departmentId : actor.getDepartmentId();

        // size 상한은 방어다. 클라이언트가 size=100000 을 보내면 페이징이 없는 것과 같아진다.
        int safeSize = size <= 0 ? DEFAULT_PAGE_SIZE : Math.min(size, MAX_PAGE_SIZE);
        int safePage = Math.max(page, 1);
        long total = problemDao.countAll(effectiveDepartmentId, type, status, createdFrom, createdTo, tag, keyword);
        List<ProblemListItem> items = problemDao.findAll(effectiveDepartmentId, type, status, createdFrom,
                createdTo, tag, keyword, safeSize, (safePage - 1) * safeSize);
        return new ProblemPageResponse(items, total, safePage, safeSize);
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

    /**
     * 저장 전에 요청 값의 앞뒤 공백을 제거한다. 검증만 {@code isBlank()}(내부적으로 trim)로 하고
     * 저장은 원본을 그대로 넣으면 {@code {"answers":["  서울  "]}} 같은 값이 패딩째로 남는다.
     * Plan 4의 주관식 채점은 학습자가 입력한 문자열을 이 저장값과 비교하므로, 패딩 하나가 정답을
     * 오답으로(혹은 그 반대로) 뒤집는다. 엑셀 경로({@code cellValue})와 프런트엔드
     * ({@code buildProblemPayload})는 이미 trim하고 있어 서버가 세 경로 중 가장 약했다.
     * <p>
     * 검증보다 <b>먼저</b> 돌린다 — 그래야 빈칸 마커 검사({@code content.contains("{{" + key + "}}")})가
     * 실제로 저장될 키와 같은 값으로 수행되어 검증과 저장이 어긋나지 않는다.
     */
    private void normalize(ProblemCreateRequest request) {
        request.setContent(trimToNull(request.getContent()));
        request.setImageUrl(trimToNull(request.getImageUrl()));
        request.setReferenceText(trimToNull(request.getReferenceText()));
        request.setExplanation(trimToNull(request.getExplanation()));
        if (request.getChoices() != null) {
            for (ChoiceInput choice : request.getChoices()) {
                choice.setText(trimToNull(choice.getText()));
            }
        }
        if (request.getAnswers() != null) {
            request.setAnswers(request.getAnswers().stream().map(this::trimToNull).collect(Collectors.toList()));
        }
        if (request.getBlanks() != null) {
            for (BlankInput blank : request.getBlanks()) {
                blank.setBlankKey(trimToNull(blank.getBlankKey()));
                blank.setAnswerText(trimToNull(blank.getAnswerText()));
            }
        }
    }

    private String trimToNull(String value) {
        if (value == null) {
            return null;
        }
        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }

    private List<String> normalizeTags(List<String> input) {
        if (input == null) return java.util.Collections.emptyList();
        // Locale.ROOT를 명시한다. 기본 로케일(예: tr-TR)에서는 "I".toLowerCase()가 "ı"가 되어
        // ExcelProblemUploadServiceImpl.normalizeTags(이미 Locale.ROOT 사용)와 결과가 갈리고,
        // 같은 사용자 입력이 tags 테이블에 서로 다른 두 행으로 쌓인다.
        List<String> normalized = input.stream().map(String::trim).filter(s -> !s.isEmpty())
                .map(s -> s.toLowerCase(Locale.ROOT)).distinct().collect(Collectors.toList());
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
        validateImageUrl(request.getImageUrl());
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

    /**
     * imageUrl은 비어 있거나, 이미지 업로드 API가 돌려준 {@code /uploads/images/...} 경로여야 한다.
     * 외부 URL(http/https), 프로토콜 상대 URL, 다른 서버 경로는 모두 거부한다. {@code ..}는 접두어를
     * 통과하고도 상위 경로를 가리킬 수 있으므로 별도로 막는다. 실제 판정 규칙은 ImageUrlValidator에만
     * 있다 — 여기서는 결과에 맞는 메시지만 고른다.
     */
    private void validateImageUrl(String imageUrl) {
        ImageUrlValidator.Result result = ImageUrlValidator.check(imageUrl);
        if (result == ImageUrlValidator.Result.BAD_PREFIX) {
            throw new BizException(ErrorCode.INPUT_VALUE_INVALID,
                    "이미지는 이미지 업로드 API로 등록한 경로(" + ImageUrlValidator.PREFIX + "...)만 사용할 수 있습니다.");
        }
        if (result == ImageUrlValidator.Result.TOO_LONG) {
            throw new BizException(ErrorCode.INPUT_VALUE_INVALID,
                    "이미지 경로는 " + ImageUrlValidator.MAX_LENGTH + "자 이하여야 합니다.");
        }
    }

    private void validateChoices(List<ChoiceInput> choices, int exactCorrectCount) {
        if (choices == null || choices.size() < MIN_CHOICES || choices.size() > MAX_CHOICES) {
            throw new BizException(ErrorCode.INPUT_VALUE_INVALID, "보기는 2개 이상 5개 이하이어야 합니다.");
        }
        if (choices.stream().anyMatch(c -> isBlank(c.getText()))) {
            throw new BizException(ErrorCode.INPUT_VALUE_INVALID, "빈 보기는 입력할 수 없습니다.");
        }
        if (choices.stream().anyMatch(c -> c.getText().length() > MAX_CHOICE_TEXT_LENGTH)) {
            throw new BizException(ErrorCode.INPUT_VALUE_INVALID,
                    "보기는 " + MAX_CHOICE_TEXT_LENGTH + "자 이하여야 합니다.");
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
        if (answers.stream().anyMatch(a -> a.length() > MAX_ANSWER_TEXT_LENGTH)) {
            throw new BizException(ErrorCode.INPUT_VALUE_INVALID,
                    "정답은 " + MAX_ANSWER_TEXT_LENGTH + "자 이하여야 합니다.");
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
            if (blank.getBlankKey().length() > MAX_BLANK_KEY_LENGTH) {
                throw new BizException(ErrorCode.INPUT_VALUE_INVALID,
                        "빈칸 키는 " + MAX_BLANK_KEY_LENGTH + "자 이하여야 합니다.");
            }
            if (blank.getAnswerText().length() > MAX_ANSWER_TEXT_LENGTH) {
                throw new BizException(ErrorCode.INPUT_VALUE_INVALID,
                        "빈칸 정답은 " + MAX_ANSWER_TEXT_LENGTH + "자 이하여야 합니다.");
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

    /**
     * 문제의 귀속 부서를 옮긴다. 엑셀 업로드에서 부서를 잘못 골랐을 때 화면으로 되돌릴 수 있는
     * 유일한 경로다. 일반 수정(update)과 분리한 이유는 ProblemCreateRequest 에 departmentId 를
     * 넣지 않기 위해서다 — 그 DTO 에 필드가 생기면 등록 경로에도 위조 표면이 다시 열린다.
     * 컨트롤러에서 총괄 관리자로 제한하므로 여기서는 부서 유효성만 본다.
     */
    @Override
    @Transactional
    public void changeDepartment(Long id, Long departmentId, AuthUser actor) {
        Problem existing = problemDao.findById(id);
        if (existing == null) {
            throw new BizException(ErrorCode.INPUT_VALUE_INVALID, "존재하지 않는 문제입니다.");
        }
        if (departmentId == null) {
            throw new BizException(ErrorCode.INPUT_VALUE_INVALID, "옮길 부서를 선택하세요.");
        }
        Department department = departmentDao.findById(departmentId);
        if (department == null) {
            throw new BizException(ErrorCode.INPUT_VALUE_INVALID, "존재하지 않는 부서입니다.");
        }
        if (department.getStatus() != Status.ACTIVE) {
            throw new BizException(ErrorCode.INPUT_VALUE_INVALID,
                    "비활성 부서로는 옮길 수 없습니다: " + department.getName());
        }

        Long from = existing.getDepartmentId();
        problemDao.updateDepartment(id, departmentId);
        auditLogService.record(actor.getUserId(), "PROBLEM_DEPARTMENT_CHANGED", "PROBLEM", id,
                "{\"from\":" + from + ",\"to\":" + departmentId + "}");
    }
}
