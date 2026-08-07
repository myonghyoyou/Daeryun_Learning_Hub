package com.daeryun.probank.service;

import com.daeryun.probank.common.AuthUser;
import com.daeryun.probank.dao.ProblemAnswerDao;
import com.daeryun.probank.dao.ProblemBlankDao;
import com.daeryun.probank.dao.ProblemChoiceDao;
import com.daeryun.probank.dao.ProblemDao;
import com.daeryun.probank.dao.ProblemTagDao;
import com.daeryun.probank.dao.TagDao;
import com.daeryun.probank.domain.Problem;
import com.daeryun.probank.domain.ProblemType;
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

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

class ProblemServiceImplTest {

    private ProblemDao problemDao;
    private ProblemChoiceDao problemChoiceDao;
    private ProblemAnswerDao problemAnswerDao;
    private ProblemBlankDao problemBlankDao;
    private TagDao tagDao;
    private ProblemTagDao problemTagDao;
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
        AuditLogService auditLogService = Mockito.mock(AuditLogService.class);
        service = new ProblemServiceImpl(problemDao, problemChoiceDao, problemAnswerDao, problemBlankDao,
                tagDao, problemTagDao, auditLogService);
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
}
