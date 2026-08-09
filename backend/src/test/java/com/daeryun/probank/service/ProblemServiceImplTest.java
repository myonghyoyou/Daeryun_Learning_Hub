package com.daeryun.probank.service;

import com.daeryun.probank.common.AuthUser;
import com.daeryun.probank.dao.DepartmentDao;
import com.daeryun.probank.dao.ProblemAnswerDao;
import com.daeryun.probank.dao.ProblemBlankDao;
import com.daeryun.probank.dao.ProblemChoiceDao;
import com.daeryun.probank.dao.ProblemDao;
import com.daeryun.probank.dao.ProblemTagDao;
import com.daeryun.probank.dao.TagDao;
import com.daeryun.probank.domain.Department;
import com.daeryun.probank.domain.Problem;
import com.daeryun.probank.domain.ProblemAnswer;
import com.daeryun.probank.domain.ProblemBlank;
import com.daeryun.probank.domain.ProblemChoice;
import com.daeryun.probank.domain.ProblemType;
import com.daeryun.probank.domain.Status;
import com.daeryun.probank.domain.UserRole;
import com.daeryun.probank.dto.problem.BlankInput;
import com.daeryun.probank.dto.problem.ChoiceInput;
import com.daeryun.probank.dto.problem.ProblemCreateRequest;
import com.daeryun.probank.dto.problem.ProblemDetailResponse;
import com.daeryun.probank.dto.problem.ProblemListItem;
import com.daeryun.probank.exception.BizException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.mockito.Mockito;

import java.util.Arrays;
import java.util.Collections;
import java.util.List;
import java.util.Locale;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class ProblemServiceImplTest {

    private ProblemDao problemDao;
    private ProblemChoiceDao problemChoiceDao;
    private ProblemAnswerDao problemAnswerDao;
    private ProblemBlankDao problemBlankDao;
    private TagDao tagDao;
    private ProblemTagDao problemTagDao;
    private AuditLogService auditLogService;
    private DepartmentDao departmentDao;
    private ProblemServiceImpl service;
    private final AuthUser actor = new AuthUser(1L, "1001", "관리자", UserRole.DEPT_ADMIN, 10L, false);

    @BeforeEach
    void setUp() {
        problemDao = Mockito.mock(ProblemDao.class);
        problemChoiceDao = Mockito.mock(ProblemChoiceDao.class);
        problemAnswerDao = Mockito.mock(ProblemAnswerDao.class);
        problemBlankDao = Mockito.mock(ProblemBlankDao.class);
        tagDao = Mockito.mock(TagDao.class);
        problemTagDao = Mockito.mock(ProblemTagDao.class);
        auditLogService = Mockito.mock(AuditLogService.class);
        departmentDao = Mockito.mock(DepartmentDao.class);
        service = new ProblemServiceImpl(problemDao, problemChoiceDao, problemAnswerDao, problemBlankDao,
                tagDao, problemTagDao, auditLogService, departmentDao);
    }

    // insertAll(List<T>)에 실제로 넘어간 엔티티를 들여다보기 위한 캡터. 제네릭 List에 대한
    // ArgumentCaptor는 타입 리터럴을 만들 수 없어 캐스팅이 불가피하다.
    @SuppressWarnings({"unchecked", "rawtypes"})
    private <T> ArgumentCaptor<List<T>> listCaptor() {
        return (ArgumentCaptor<List<T>>) (ArgumentCaptor) ArgumentCaptor.forClass(List.class);
    }

    private ChoiceInput choice(String text, boolean correct) {
        ChoiceInput input = new ChoiceInput();
        input.setText(text);
        input.setCorrect(correct);
        return input;
    }

    @Test
    void create_mcqSingle_withOneCorrectChoice_succeeds() {
        ProblemCreateRequest request = new ProblemCreateRequest();
        request.setType(ProblemType.MCQ_SINGLE);
        request.setContent("1+1=?");
        request.setChoices(Arrays.asList(choice("1", false), choice("2", true)));

        service.create(request, actor);

        Mockito.verify(problemDao).insert(Mockito.any());
        Mockito.verify(problemChoiceDao).insertAll(Mockito.anyList());
    }

    @Test
    void create_mcqSingle_withTwoCorrectChoices_rejects() {
        ProblemCreateRequest request = new ProblemCreateRequest();
        request.setType(ProblemType.MCQ_SINGLE);
        request.setContent("1+1=?");
        request.setChoices(Arrays.asList(choice("1", true), choice("2", true)));

        assertThrows(BizException.class, () -> service.create(request, actor));
    }

    @Test
    void create_mcqSingle_withSixChoices_rejects() {
        ProblemCreateRequest request = new ProblemCreateRequest();
        request.setType(ProblemType.MCQ_SINGLE);
        request.setContent("1+1=?");
        request.setChoices(Arrays.asList(
                choice("1", false), choice("2", true), choice("3", false),
                choice("4", false), choice("5", false), choice("6", false)));

        assertThrows(BizException.class, () -> service.create(request, actor));
    }

    @Test
    void create_ox_withTwoChoicesOneCorrect_succeeds() {
        ProblemCreateRequest request = new ProblemCreateRequest();
        request.setType(ProblemType.OX);
        request.setContent("지구는 둥글다.");
        request.setChoices(Arrays.asList(choice("O", true), choice("X", false)));

        service.create(request, actor);

        Mockito.verify(problemDao).insert(Mockito.any());
    }

    @Test
    void create_shortAnswer_withoutAnswers_rejects() {
        ProblemCreateRequest request = new ProblemCreateRequest();
        request.setType(ProblemType.SHORT_ANSWER);
        request.setContent("대한민국의 수도는?");
        request.setAnswers(Collections.emptyList());

        assertThrows(BizException.class, () -> service.create(request, actor));
    }

    @Test
    void create_fillBlank_withRevealCountExceedingBlankSize_rejects() {
        ProblemCreateRequest request = new ProblemCreateRequest();
        request.setType(ProblemType.FILL_BLANK);
        request.setContent("{{blank_1}}은 {{blank_2}}의 수도이다.");
        BlankInput blank1 = new BlankInput();
        blank1.setBlankKey("blank_1");
        blank1.setAnswerText("서울");
        request.setBlanks(Collections.singletonList(blank1));
        request.setBlankRevealCount(2);

        assertThrows(BizException.class, () -> service.create(request, actor));
    }

    @Test
    void create_fillBlank_withValidRevealCount_succeeds() {
        ProblemCreateRequest request = new ProblemCreateRequest();
        request.setType(ProblemType.FILL_BLANK);
        request.setContent("{{blank_1}}은 {{blank_2}}의 수도이다.");
        BlankInput blank1 = new BlankInput();
        blank1.setBlankKey("blank_1");
        blank1.setAnswerText("서울");
        BlankInput blank2 = new BlankInput();
        blank2.setBlankKey("blank_2");
        blank2.setAnswerText("대한민국");
        request.setBlanks(Arrays.asList(blank1, blank2));
        request.setBlankRevealCount(1);

        service.create(request, actor);

        Mockito.verify(problemBlankDao).insertAll(Mockito.anyList());
    }

    // --- 아래는 plan의 Approved Amendments("유형 누락, 빈 보기/정답, 중복 빈칸 키,
    // 본문에 없는 빈칸 마커 검증")가 요구하지만 브리핑의 7개 테스트에는 없던 케이스를
    // 추가로 고정한 테스트다. 이 가드가 없으면 통과하지 않는다.

    @Test
    void create_withMissingType_rejects() {
        ProblemCreateRequest request = new ProblemCreateRequest();
        request.setContent("유형이 없는 문제");

        assertThrows(BizException.class, () -> service.create(request, actor));
        Mockito.verify(problemDao, Mockito.never()).insert(Mockito.any());
    }

    @Test
    void create_mcqSingle_withBlankChoiceText_rejects() {
        ProblemCreateRequest request = new ProblemCreateRequest();
        request.setType(ProblemType.MCQ_SINGLE);
        request.setContent("1+1=?");
        request.setChoices(Arrays.asList(choice("  ", false), choice("2", true)));

        assertThrows(BizException.class, () -> service.create(request, actor));
        Mockito.verify(problemDao, Mockito.never()).insert(Mockito.any());
    }

    @Test
    void create_shortAnswer_withBlankAnswerText_rejects() {
        ProblemCreateRequest request = new ProblemCreateRequest();
        request.setType(ProblemType.SHORT_ANSWER);
        request.setContent("대한민국의 수도는?");
        request.setAnswers(Arrays.asList("서울", "   "));

        assertThrows(BizException.class, () -> service.create(request, actor));
        Mockito.verify(problemDao, Mockito.never()).insert(Mockito.any());
    }

    @Test
    void create_fillBlank_withDuplicateBlankKey_rejects() {
        ProblemCreateRequest request = new ProblemCreateRequest();
        request.setType(ProblemType.FILL_BLANK);
        request.setContent("{{blank_1}}은 {{blank_1}}의 수도이다.");
        BlankInput blank1 = new BlankInput();
        blank1.setBlankKey("blank_1");
        blank1.setAnswerText("서울");
        BlankInput blank2 = new BlankInput();
        blank2.setBlankKey("blank_1");
        blank2.setAnswerText("대한민국");
        request.setBlanks(Arrays.asList(blank1, blank2));
        request.setBlankRevealCount(1);

        assertThrows(BizException.class, () -> service.create(request, actor));
        Mockito.verify(problemDao, Mockito.never()).insert(Mockito.any());
    }

    @Test
    void create_fillBlank_withMarkerMissingFromContent_rejects() {
        ProblemCreateRequest request = new ProblemCreateRequest();
        request.setType(ProblemType.FILL_BLANK);
        request.setContent("{{blank_1}}은 수도이다.");
        BlankInput blank1 = new BlankInput();
        blank1.setBlankKey("blank_1");
        blank1.setAnswerText("서울");
        BlankInput blank2 = new BlankInput();
        blank2.setBlankKey("blank_2");
        blank2.setAnswerText("대한민국");
        request.setBlanks(Arrays.asList(blank1, blank2));
        request.setBlankRevealCount(1);

        assertThrows(BizException.class, () -> service.create(request, actor));
        Mockito.verify(problemDao, Mockito.never()).insert(Mockito.any());
    }

    // department_id는 요청 값이 아니라 세션의 AuthUser에서 와야 한다(부서 격리).
    // ProblemCreateRequest에는 애초에 departmentId 필드가 없으므로 클라이언트가
    // 값을 보낼 수조차 없지만, 저장되는 Problem이 실제로 actor.getDepartmentId()에서
    // 왔는지(하드코딩되거나 다른 값으로 새는 회귀가 없는지)를 이 테스트로 고정한다.
    @Test
    void create_setsDepartmentIdAndCreatedByFromActor() {
        AuthUser otherDeptActor = new AuthUser(42L, "2002", "다른부서 관리자", UserRole.DEPT_ADMIN, 77L, false);
        ProblemCreateRequest request = new ProblemCreateRequest();
        request.setType(ProblemType.SHORT_ANSWER);
        request.setContent("대한민국의 수도는?");
        request.setAnswers(Collections.singletonList("서울"));

        service.create(request, otherDeptActor);

        ArgumentCaptor<Problem> captor = ArgumentCaptor.forClass(Problem.class);
        Mockito.verify(problemDao).insert(captor.capture());
        assertEquals(77L, captor.getValue().getDepartmentId());
        assertEquals(42L, captor.getValue().getCreatedBy());
    }

    @Test
    void list_asDeptAdmin_forcesOwnDepartmentRegardlessOfParam() {
        Mockito.when(problemDao.findAll(10L, null, null, null, null, null, null)).thenReturn(Collections.emptyList());

        service.list(actor, 999L, null, null, null, null, null, null);

        Mockito.verify(problemDao).findAll(10L, null, null, null, null, null, null);
    }

    @Test
    void list_asSuperAdmin_usesRequestedDepartmentFilter() {
        AuthUser superAdmin = new AuthUser(2L, "admin", "총괄관리자", UserRole.SUPER_ADMIN, 1L, false);
        Mockito.when(problemDao.findAll(999L, null, null, null, null, null, null)).thenReturn(Collections.emptyList());

        service.list(superAdmin, 999L, null, null, null, null, null, null);

        Mockito.verify(problemDao).findAll(999L, null, null, null, null, null, null);
    }

    @Test
    void getDetail_forOtherDepartmentAsDeptAdmin_throwsAccessDenied() {
        com.daeryun.probank.domain.Problem problem = new com.daeryun.probank.domain.Problem();
        problem.setId(5L);
        problem.setDepartmentId(999L);
        problem.setType(ProblemType.SHORT_ANSWER);
        Mockito.when(problemDao.findById(5L)).thenReturn(problem);

        assertThrows(BizException.class, () -> service.getDetail(5L, actor));
    }

    @Test
    void update_ownProblem_replacesChoicesAndContent() {
        com.daeryun.probank.domain.Problem existing = new com.daeryun.probank.domain.Problem();
        existing.setId(5L);
        existing.setDepartmentId(10L);
        existing.setType(ProblemType.MCQ_SINGLE);
        Mockito.when(problemDao.findById(5L)).thenReturn(existing);

        ProblemCreateRequest request = new ProblemCreateRequest();
        request.setType(ProblemType.MCQ_SINGLE);
        request.setContent("수정된 문제");
        request.setChoices(Arrays.asList(choice("1", false), choice("2", true)));

        service.update(5L, request, actor);

        Mockito.verify(problemChoiceDao).deleteByProblemId(5L);
        Mockito.verify(problemChoiceDao).insertAll(Mockito.anyList());
        Mockito.verify(problemDao).update(Mockito.any());
    }

    @Test
    void update_otherDepartmentProblemAsDeptAdmin_throwsAccessDenied() {
        com.daeryun.probank.domain.Problem existing = new com.daeryun.probank.domain.Problem();
        existing.setId(5L);
        existing.setDepartmentId(999L);
        // 유형을 요청과 동일하게 맞춰서, 이 테스트가 실제로 부서 소유권 검사(assertOwnership)
        // 때문에 실패하는지를 검증하도록 한다. 유형이 다르면(브리핑 원본처럼 existing.type이
        // null인 채로 두면) update_typeMismatchWithinSameDepartment_rejects가 고정하는
        // 유형 불일치 가드가 먼저 던져서, assertOwnership을 제거해도 이 테스트가 계속
        // 통과해버리는 오탐(false positive)이 생긴다.
        existing.setType(ProblemType.SHORT_ANSWER);
        Mockito.when(problemDao.findById(5L)).thenReturn(existing);

        ProblemCreateRequest request = new ProblemCreateRequest();
        request.setType(ProblemType.SHORT_ANSWER);
        request.setContent("x");
        request.setAnswers(Collections.singletonList("y"));

        assertThrows(BizException.class, () -> service.update(5L, request, actor));
    }

    // 브리핑이 제공한 update 테스트 3개 중 어느 것도 "동일 부서 문제인데 요청 유형이 기존
    // 유형과 다른 경우"를 독립적으로 검증하지 않는다.
    // update_otherDepartmentProblemAsDeptAdmin_throwsAccessDenied는 assertOwnership이
    // 먼저 던지므로 유형 불일치 가드를 전혀 통과하지 않는다. 플랜의 Approved Amendments
    // ("서버에서도 기존 유형과 요청 유형의 불일치를 거부한다")를 고정하기 위해 추가한다.
    @Test
    void update_typeMismatchWithinSameDepartment_rejects() {
        com.daeryun.probank.domain.Problem existing = new com.daeryun.probank.domain.Problem();
        existing.setId(5L);
        existing.setDepartmentId(10L);
        existing.setType(ProblemType.MCQ_SINGLE);
        Mockito.when(problemDao.findById(5L)).thenReturn(existing);

        ProblemCreateRequest request = new ProblemCreateRequest();
        request.setType(ProblemType.SHORT_ANSWER);
        request.setContent("x");
        request.setAnswers(Collections.singletonList("y"));

        assertThrows(BizException.class, () -> service.update(5L, request, actor));
        Mockito.verify(problemDao, Mockito.never()).update(Mockito.any());
    }

    // --- imageUrl 검증 (전체 브랜치 리뷰 F2) ---
    // ProblemImageServiceImpl은 확장자/Content-Type 허용목록, 5MB 상한, SVG 제외, UUID 파일명,
    // 경로 탈출 방어를 모두 적용하는데, JSON API가 imageUrl을 자유 문자열로 받아 그대로 저장하면
    // 호출자가 그 검증을 전부 우회한다. create/update 양쪽 경로를 모두 고정한다.

    private ProblemCreateRequest shortAnswerRequest(String imageUrl) {
        ProblemCreateRequest request = new ProblemCreateRequest();
        request.setType(ProblemType.SHORT_ANSWER);
        request.setContent("대한민국의 수도는?");
        request.setAnswers(Collections.singletonList("서울"));
        request.setImageUrl(imageUrl);
        return request;
    }

    private Problem existingShortAnswer() {
        Problem existing = new Problem();
        existing.setId(5L);
        existing.setDepartmentId(10L);
        existing.setType(ProblemType.SHORT_ANSWER);
        return existing;
    }

    @Test
    void create_withExternalImageUrl_rejects() {
        ProblemCreateRequest request = shortAnswerRequest("https://attacker.example/track.gif");

        assertThrows(BizException.class, () -> service.create(request, actor));
        Mockito.verify(problemDao, Mockito.never()).insert(Mockito.any());
    }

    @Test
    void create_withTraversalImageUrl_rejects() {
        ProblemCreateRequest request = shortAnswerRequest("/uploads/images/../../etc/passwd");

        assertThrows(BizException.class, () -> service.create(request, actor));
        Mockito.verify(problemDao, Mockito.never()).insert(Mockito.any());
    }

    @Test
    void create_withUploadedImageUrl_succeeds() {
        ProblemCreateRequest request = shortAnswerRequest("/uploads/images/8b1f0c6e-1111-2222-3333-444455556666.png");

        service.create(request, actor);

        ArgumentCaptor<Problem> captor = ArgumentCaptor.forClass(Problem.class);
        Mockito.verify(problemDao).insert(captor.capture());
        assertEquals("/uploads/images/8b1f0c6e-1111-2222-3333-444455556666.png", captor.getValue().getImageUrl());
    }

    @Test
    void create_withoutImageUrl_succeeds() {
        ProblemCreateRequest request = shortAnswerRequest(null);

        service.create(request, actor);

        Mockito.verify(problemDao).insert(Mockito.any());
    }

    @Test
    void update_withExternalImageUrl_rejects() {
        Mockito.when(problemDao.findById(5L)).thenReturn(existingShortAnswer());
        ProblemCreateRequest request = shortAnswerRequest("https://attacker.example/track.gif");

        assertThrows(BizException.class, () -> service.update(5L, request, actor));
        Mockito.verify(problemDao, Mockito.never()).update(Mockito.any());
    }

    @Test
    void update_withUploadedImageUrl_succeeds() {
        Mockito.when(problemDao.findById(5L)).thenReturn(existingShortAnswer());
        ProblemCreateRequest request = shortAnswerRequest("/uploads/images/a.png");

        service.update(5L, request, actor);

        ArgumentCaptor<Problem> captor = ArgumentCaptor.forClass(Problem.class);
        Mockito.verify(problemDao).update(captor.capture());
        assertEquals("/uploads/images/a.png", captor.getValue().getImageUrl());
    }

    // --- 저장 전 trim (전체 브랜치 리뷰 F3) ---
    // 엑셀 경로(cellValue)와 프런트엔드(buildProblemPayload)는 이미 trim하는데 서버만
    // isBlank()로 "검사"만 trim하고 원본을 그대로 저장하고 있었다. Plan 4의 주관식 채점이
    // 학습자 입력을 이 저장값과 비교하므로 패딩 하나가 정답/오답을 뒤집는다.

    @Test
    void create_shortAnswer_storesTrimmedContentAndAnswer() {
        ProblemCreateRequest request = new ProblemCreateRequest();
        request.setType(ProblemType.SHORT_ANSWER);
        request.setContent("  대한민국의 수도는?  ");
        request.setAnswers(Collections.singletonList("  서울  "));

        service.create(request, actor);

        ArgumentCaptor<Problem> problemCaptor = ArgumentCaptor.forClass(Problem.class);
        Mockito.verify(problemDao).insert(problemCaptor.capture());
        assertEquals("대한민국의 수도는?", problemCaptor.getValue().getContent());

        ArgumentCaptor<List<ProblemAnswer>> answerCaptor = listCaptor();
        Mockito.verify(problemAnswerDao).insertAll(answerCaptor.capture());
        assertEquals("서울", answerCaptor.getValue().get(0).getAnswerText());
    }

    @Test
    void create_mcqSingle_storesTrimmedChoiceText() {
        ProblemCreateRequest request = new ProblemCreateRequest();
        request.setType(ProblemType.MCQ_SINGLE);
        request.setContent("1+1=?");
        request.setChoices(Arrays.asList(choice("  1  ", false), choice("  2  ", true)));

        service.create(request, actor);

        ArgumentCaptor<List<ProblemChoice>> choiceCaptor = listCaptor();
        Mockito.verify(problemChoiceDao).insertAll(choiceCaptor.capture());
        assertEquals("1", choiceCaptor.getValue().get(0).getChoiceText());
        assertEquals("2", choiceCaptor.getValue().get(1).getChoiceText());
    }

    @Test
    void create_fillBlank_storesTrimmedBlankKeyAndAnswer() {
        ProblemCreateRequest request = new ProblemCreateRequest();
        request.setType(ProblemType.FILL_BLANK);
        request.setContent("{{blank_1}}은 대한민국의 수도이다.");
        BlankInput blank = new BlankInput();
        blank.setBlankKey("  blank_1  ");
        blank.setAnswerText("  서울  ");
        request.setBlanks(Collections.singletonList(blank));
        request.setBlankRevealCount(1);

        service.create(request, actor);

        ArgumentCaptor<List<ProblemBlank>> blankCaptor = listCaptor();
        Mockito.verify(problemBlankDao).insertAll(blankCaptor.capture());
        assertEquals("blank_1", blankCaptor.getValue().get(0).getBlankKey());
        assertEquals("서울", blankCaptor.getValue().get(0).getAnswerText());
    }

    @Test
    void update_shortAnswer_storesTrimmedContentAndAnswer() {
        Mockito.when(problemDao.findById(5L)).thenReturn(existingShortAnswer());
        ProblemCreateRequest request = new ProblemCreateRequest();
        request.setType(ProblemType.SHORT_ANSWER);
        request.setContent("  수정된 문제  ");
        request.setAnswers(Collections.singletonList("  부산  "));

        service.update(5L, request, actor);

        ArgumentCaptor<Problem> problemCaptor = ArgumentCaptor.forClass(Problem.class);
        Mockito.verify(problemDao).update(problemCaptor.capture());
        assertEquals("수정된 문제", problemCaptor.getValue().getContent());

        ArgumentCaptor<List<ProblemAnswer>> answerCaptor = listCaptor();
        Mockito.verify(problemAnswerDao).insertAll(answerCaptor.capture());
        assertEquals("부산", answerCaptor.getValue().get(0).getAnswerText());
    }

    // --- 태그 소문자화 로케일 (전체 브랜치 리뷰 F4) ---
    // ProblemServiceImpl은 String::toLowerCase(기본 로케일), ExcelProblemUploadServiceImpl은
    // toLowerCase(Locale.ROOT)를 쓰고 있었다. 터키어 기본 로케일에서 "I"는 각각 "ı"/"i"로
    // 갈라져 같은 사용자 입력이 tags 테이블에 두 행으로 쌓인다.
    @Test
    void create_normalizesTagsWithRootLocaleRegardlessOfDefaultLocale() {
        Locale original = Locale.getDefault();
        try {
            Locale.setDefault(new Locale("tr", "TR"));
            ProblemCreateRequest request = new ProblemCreateRequest();
            request.setType(ProblemType.SHORT_ANSWER);
            request.setContent("대한민국의 수도는?");
            request.setAnswers(Collections.singletonList("서울"));
            request.setTags(Collections.singletonList("I"));

            service.create(request, actor);

            Mockito.verify(tagDao).findOrCreateByNames(Collections.singletonList("i"));
        } finally {
            Locale.setDefault(original);
        }
    }

    // --- 길이 검증 (전체 브랜치 리뷰 F5) ---
    // schema.sql이 choice_text/answer_text VARCHAR(500), blank_key VARCHAR(50)로 강제하는데
    // 어느 검증 경로도 길이를 보지 않아, 평범한 사용자 입력이 DataIntegrityViolationException →
    // "처리 중 오류가 발생하였습니다" + ERROR 스택트레이스로 새어 나갔다.

    private String repeat(char c, int count) {
        StringBuilder sb = new StringBuilder(count);
        for (int i = 0; i < count; i++) {
            sb.append(c);
        }
        return sb.toString();
    }

    @Test
    void create_mcqSingle_withOverlongChoiceText_rejects() {
        ProblemCreateRequest request = new ProblemCreateRequest();
        request.setType(ProblemType.MCQ_SINGLE);
        request.setContent("1+1=?");
        request.setChoices(Arrays.asList(choice(repeat('가', 501), false), choice("2", true)));

        assertThrows(BizException.class, () -> service.create(request, actor));
        Mockito.verify(problemDao, Mockito.never()).insert(Mockito.any());
    }

    @Test
    void create_shortAnswer_withOverlongAnswerText_rejects() {
        ProblemCreateRequest request = new ProblemCreateRequest();
        request.setType(ProblemType.SHORT_ANSWER);
        request.setContent("대한민국의 수도는?");
        request.setAnswers(Collections.singletonList(repeat('가', 501)));

        assertThrows(BizException.class, () -> service.create(request, actor));
        Mockito.verify(problemDao, Mockito.never()).insert(Mockito.any());
    }

    @Test
    void create_fillBlank_withOverlongBlankKey_rejects() {
        String key = repeat('k', 51);
        ProblemCreateRequest request = new ProblemCreateRequest();
        request.setType(ProblemType.FILL_BLANK);
        request.setContent("{{" + key + "}}은 대한민국의 수도이다.");
        BlankInput blank = new BlankInput();
        blank.setBlankKey(key);
        blank.setAnswerText("서울");
        request.setBlanks(Collections.singletonList(blank));
        request.setBlankRevealCount(1);

        assertThrows(BizException.class, () -> service.create(request, actor));
        Mockito.verify(problemDao, Mockito.never()).insert(Mockito.any());
    }

    @Test
    void create_fillBlank_withOverlongBlankAnswerText_rejects() {
        ProblemCreateRequest request = new ProblemCreateRequest();
        request.setType(ProblemType.FILL_BLANK);
        request.setContent("{{blank_1}}은 대한민국의 수도이다.");
        BlankInput blank = new BlankInput();
        blank.setBlankKey("blank_1");
        blank.setAnswerText(repeat('가', 501));
        request.setBlanks(Collections.singletonList(blank));
        request.setBlankRevealCount(1);

        assertThrows(BizException.class, () -> service.create(request, actor));
        Mockito.verify(problemDao, Mockito.never()).insert(Mockito.any());
    }

    @Test
    void create_withOverlongImageUrl_rejects() {
        ProblemCreateRequest request = shortAnswerRequest("/uploads/images/" + repeat('a', 500) + ".png");

        assertThrows(BizException.class, () -> service.create(request, actor));
        Mockito.verify(problemDao, Mockito.never()).insert(Mockito.any());
    }

    @Test
    void archive_ownProblem_updatesStatusToArchived() {
        com.daeryun.probank.domain.Problem existing = new com.daeryun.probank.domain.Problem();
        existing.setId(5L);
        existing.setDepartmentId(10L);
        Mockito.when(problemDao.findById(5L)).thenReturn(existing);

        service.archive(5L, actor);

        Mockito.verify(problemDao).updateStatus(5L, com.daeryun.probank.domain.ProblemStatus.ARCHIVED);
    }

    // 브리핑은 archive의 허용 경로(자기 부서)만 테스트한다. "부서 스코프는 양쪽 분기 모두
    // 테스트가 필요하다(허용 경로만 있는 테스트는 아무것도 증명하지 못한다)"는 태스크
    // 요구사항에 따라 거부 경로를 추가로 고정한다.
    @Test
    void archive_otherDepartmentProblemAsDeptAdmin_throwsAccessDenied() {
        com.daeryun.probank.domain.Problem existing = new com.daeryun.probank.domain.Problem();
        existing.setId(5L);
        existing.setDepartmentId(999L);
        Mockito.when(problemDao.findById(5L)).thenReturn(existing);

        assertThrows(BizException.class, () -> service.archive(5L, actor));
        Mockito.verify(problemDao, Mockito.never()).updateStatus(Mockito.anyLong(), Mockito.any());
    }

    /**
     * 총괄 관리자가 엑셀 업로드에서 부서를 잘못 고르면 되돌릴 방법이 지금은 없다. 이 경로가
     * 화면으로 복구할 수 있는 유일한 수단이다. from/to 를 함께 남겨야 어디서 어디로 옮겼는지
     * 추적된다.
     */
    @Test
    void changeDepartment_movesTheProblemAndRecordsBothSides() {
        Problem existing = new Problem();
        existing.setId(5L);
        existing.setDepartmentId(1L);
        existing.setType(ProblemType.MCQ_SINGLE);
        Mockito.when(problemDao.findById(5L)).thenReturn(existing);
        Department target = new Department();
        target.setId(9L);
        target.setName("영업팀");
        target.setStatus(Status.ACTIVE);
        Mockito.when(departmentDao.findById(9L)).thenReturn(target);
        AuthUser superAdmin = new AuthUser(2L, "admin", "총괄관리자", UserRole.SUPER_ADMIN, 1L, false);

        service.changeDepartment(5L, 9L, superAdmin);

        Mockito.verify(problemDao).updateDepartment(5L, 9L);
        ArgumentCaptor<String> detail = ArgumentCaptor.forClass(String.class);
        Mockito.verify(auditLogService).record(Mockito.eq(2L), Mockito.eq("PROBLEM_DEPARTMENT_CHANGED"),
                Mockito.eq("PROBLEM"), Mockito.eq(5L), detail.capture());
        assertTrue(detail.getValue().contains("\"from\":1"), detail.getValue());
        assertTrue(detail.getValue().contains("\"to\":9"), detail.getValue());
    }

    @Test
    void changeDepartment_rejectsInactiveTarget() {
        Problem existing = new Problem();
        existing.setId(5L);
        existing.setDepartmentId(1L);
        Mockito.when(problemDao.findById(5L)).thenReturn(existing);
        Department target = new Department();
        target.setId(9L);
        target.setName("폐지팀");
        target.setStatus(Status.INACTIVE);
        Mockito.when(departmentDao.findById(9L)).thenReturn(target);
        AuthUser superAdmin = new AuthUser(2L, "admin", "총괄관리자", UserRole.SUPER_ADMIN, 1L, false);

        assertThrows(BizException.class, () -> service.changeDepartment(5L, 9L, superAdmin));
        Mockito.verify(problemDao, Mockito.never()).updateDepartment(Mockito.anyLong(), Mockito.anyLong());
    }
}
