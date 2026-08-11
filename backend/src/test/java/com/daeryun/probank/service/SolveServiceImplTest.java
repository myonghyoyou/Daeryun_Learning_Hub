package com.daeryun.probank.service;

import com.daeryun.probank.dao.ProblemAnswerDao;
import com.daeryun.probank.dao.ProblemBlankDao;
import com.daeryun.probank.dao.ProblemChoiceDao;
import com.daeryun.probank.dao.ProblemDao;
import com.daeryun.probank.dao.AttemptDao;
import com.daeryun.probank.dao.AttemptBlankAnswerDao;
import com.daeryun.probank.common.AuthUser;
import com.daeryun.probank.domain.*;
import com.daeryun.probank.dto.solve.AttemptResult;
import com.daeryun.probank.dto.solve.AttemptSubmitRequest;
import com.daeryun.probank.dto.solve.BlankAnswerInput;
import com.daeryun.probank.dto.solve.ProblemSolveDetailResponse;
import com.daeryun.probank.exception.BizException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;

import java.util.Arrays;
import java.util.Collections;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

class SolveServiceImplTest {

    private ProblemDao problemDao;
    private ProblemChoiceDao problemChoiceDao;
    private ProblemAnswerDao problemAnswerDao;
    private ProblemBlankDao problemBlankDao;
    private AttemptDao attemptDao;
    private AttemptBlankAnswerDao attemptBlankAnswerDao;
    private SolveServiceImpl service;

    @BeforeEach
    void setUp() {
        problemDao = Mockito.mock(ProblemDao.class);
        problemChoiceDao = Mockito.mock(ProblemChoiceDao.class);
        problemAnswerDao = Mockito.mock(ProblemAnswerDao.class);
        problemBlankDao = Mockito.mock(ProblemBlankDao.class);
        attemptDao = Mockito.mock(AttemptDao.class);
        attemptBlankAnswerDao = Mockito.mock(AttemptBlankAnswerDao.class);
        service = new SolveServiceImpl(problemDao, problemChoiceDao, problemAnswerDao, problemBlankDao,
                attemptDao, attemptBlankAnswerDao);
    }

    private final AuthUser actor = new AuthUser(1L, "1001", "홍길동", UserRole.EMPLOYEE, 10L, false);

    private ProblemChoice choice(long id, String text, boolean correct, int order) {
        ProblemChoice c = new ProblemChoice();
        c.setId(id);
        c.setChoiceText(text);
        c.setCorrect(correct);
        c.setDisplayOrder(order);
        return c;
    }

    @Test
    void getDetail_mcqSingle_hidesCorrectFlag() {
        Problem problem = new Problem();
        problem.setId(1L);
        problem.setType(ProblemType.MCQ_SINGLE);
        problem.setContent("1+1=?");
        problem.setStatus(ProblemStatus.ACTIVE);
        Mockito.when(problemDao.findById(1L)).thenReturn(problem);
        Mockito.when(problemChoiceDao.findByProblemId(1L)).thenReturn(Arrays.asList(
                choice(10L, "1", false, 1), choice(11L, "2", true, 2)));

        ProblemSolveDetailResponse response = service.getDetail(1L);

        assertEquals(2, response.getChoices().size());
        // ChoiceOption에는 isCorrect 필드 자체가 없어야 하므로 필드 목록을 검증한다.
        boolean hasCorrectField = Arrays.stream(response.getChoices().get(0).getClass().getDeclaredFields())
                .anyMatch(f -> f.getName().toLowerCase().contains("correct"));
        assertFalse(hasCorrectField);
    }

    @Test
    void getDetail_archivedProblem_throwsBizException() {
        Problem archived = new Problem();
        archived.setId(2L);
        archived.setStatus(ProblemStatus.ARCHIVED);
        Mockito.when(problemDao.findById(2L)).thenReturn(archived);

        assertThrows(BizException.class, () -> service.getDetail(2L));
    }

    @Test
    void selectRandomBlankKeys_returnsExactCountFromDefinedBlanks() {
        ProblemBlank b1 = new ProblemBlank();
        b1.setBlankKey("blank_1");
        ProblemBlank b2 = new ProblemBlank();
        b2.setBlankKey("blank_2");
        ProblemBlank b3 = new ProblemBlank();
        b3.setBlankKey("blank_3");
        List<ProblemBlank> blanks = Arrays.asList(b1, b2, b3);

        List<String> selected = service.selectRandomBlankKeys(blanks, 2);

        assertEquals(2, selected.size());
        assertTrue(blanks.stream().map(ProblemBlank::getBlankKey).collect(java.util.stream.Collectors.toList())
                .containsAll(selected));
        assertEquals(2, selected.stream().distinct().count());
    }

    @Test
    void getDetail_fillBlank_revealsNonSelectedBlanksWithAnswerText() {
        Problem problem = new Problem();
        problem.setId(3L);
        problem.setType(ProblemType.FILL_BLANK);
        problem.setContent("{{blank_1}}은 {{blank_2}}의 수도이다.");
        problem.setStatus(ProblemStatus.ACTIVE);
        problem.setBlankRevealCount(1);
        Mockito.when(problemDao.findById(3L)).thenReturn(problem);
        ProblemBlank b1 = new ProblemBlank();
        b1.setBlankKey("blank_1");
        b1.setAnswerText("서울");
        ProblemBlank b2 = new ProblemBlank();
        b2.setBlankKey("blank_2");
        b2.setAnswerText("대한민국");
        Mockito.when(problemBlankDao.findByProblemId(3L)).thenReturn(Arrays.asList(b1, b2));

        ProblemSolveDetailResponse response = service.getDetail(3L);

        assertEquals(1, response.getBlanksToAnswer().size());
        assertEquals(1, response.getRevealedBlanks().size());
    }

    @Test
    void submit_mcqSingle_correctChoice_marksCorrect() {
        Problem problem = new Problem();
        problem.setId(1L);
        problem.setType(ProblemType.MCQ_SINGLE);
        problem.setStatus(ProblemStatus.ACTIVE);
        problem.setExplanation("설명");
        Mockito.when(problemDao.findById(1L)).thenReturn(problem);
        Mockito.when(problemChoiceDao.findByProblemId(1L)).thenReturn(Arrays.asList(
                choice(10L, "1", false, 1), choice(11L, "2", true, 2)));

        AttemptSubmitRequest request = new AttemptSubmitRequest();
        request.setSelectedChoiceIds(Collections.singletonList(11L));

        AttemptResult result = service.submit(1L, request, actor);

        assertTrue(result.isCorrect());
        Mockito.verify(attemptDao).insert(Mockito.any());
    }

    @Test
    void submit_mcqMulti_partialSelection_marksIncorrect() {
        Problem problem = new Problem();
        problem.setId(1L);
        problem.setType(ProblemType.MCQ_MULTI);
        problem.setStatus(ProblemStatus.ACTIVE);
        Mockito.when(problemDao.findById(1L)).thenReturn(problem);
        Mockito.when(problemChoiceDao.findByProblemId(1L)).thenReturn(Arrays.asList(
                choice(10L, "1", true, 1), choice(11L, "2", true, 2), choice(12L, "3", false, 3)));

        AttemptSubmitRequest request = new AttemptSubmitRequest();
        request.setSelectedChoiceIds(Collections.singletonList(10L));

        AttemptResult result = service.submit(1L, request, actor);

        assertFalse(result.isCorrect());
    }

    @Test
    void submit_shortAnswer_normalizesBeforeComparing() {
        Problem problem = new Problem();
        problem.setId(1L);
        problem.setType(ProblemType.SHORT_ANSWER);
        problem.setStatus(ProblemStatus.ACTIVE);
        Mockito.when(problemDao.findById(1L)).thenReturn(problem);
        ProblemAnswer answer = new ProblemAnswer();
        answer.setAnswerText("Seoul");
        Mockito.when(problemAnswerDao.findByProblemId(1L)).thenReturn(Collections.singletonList(answer));

        AttemptSubmitRequest request = new AttemptSubmitRequest();
        request.setSubmittedText("  seoul  ");

        AttemptResult result = service.submit(1L, request, actor);

        assertTrue(result.isCorrect());
    }

    @Test
    void submit_fillBlank_allBlanksCorrect_marksCorrect() {
        Problem problem = new Problem();
        problem.setId(1L);
        problem.setType(ProblemType.FILL_BLANK);
        problem.setStatus(ProblemStatus.ACTIVE);
        problem.setBlankRevealCount(1);
        Mockito.when(problemDao.findById(1L)).thenReturn(problem);
        ProblemBlank blank1 = new ProblemBlank();
        blank1.setBlankKey("blank_1");
        blank1.setAnswerText("서울");
        ProblemBlank blank2 = new ProblemBlank();
        blank2.setBlankKey("blank_2");
        blank2.setAnswerText("대한민국");
        Mockito.when(problemBlankDao.findByProblemId(1L)).thenReturn(Arrays.asList(blank1, blank2));

        BlankAnswerInput input = new BlankAnswerInput();
        input.setBlankKey("blank_1");
        input.setSubmittedAnswer("서울");
        AttemptSubmitRequest request = new AttemptSubmitRequest();
        request.setBlankAnswers(Collections.singletonList(input));

        AttemptResult result = service.submit(1L, request, actor);

        assertTrue(result.isCorrect());
        Mockito.verify(attemptBlankAnswerDao).insertAll(Mockito.anyList());
    }

    @Test
    void submit_fillBlank_wrongBlankCountRejected() {
        Problem problem = new Problem();
        problem.setId(1L);
        problem.setType(ProblemType.FILL_BLANK);
        problem.setStatus(ProblemStatus.ACTIVE);
        problem.setBlankRevealCount(2);
        Mockito.when(problemDao.findById(1L)).thenReturn(problem);
        ProblemBlank blank1 = new ProblemBlank();
        blank1.setBlankKey("blank_1");
        blank1.setAnswerText("서울");
        Mockito.when(problemBlankDao.findByProblemId(1L)).thenReturn(Collections.singletonList(blank1));

        BlankAnswerInput input = new BlankAnswerInput();
        input.setBlankKey("blank_1");
        input.setSubmittedAnswer("서울");
        AttemptSubmitRequest request = new AttemptSubmitRequest();
        request.setBlankAnswers(Collections.singletonList(input));

        assertThrows(BizException.class, () -> service.submit(1L, request, actor));
    }

    @Test
    void myHistory_returnsUserAttemptsOrderedByDaoResult() {
        com.daeryun.probank.dto.solve.AttemptHistoryItem item = new com.daeryun.probank.dto.solve.AttemptHistoryItem();
        item.setProblemId(1L);
        Mockito.when(attemptDao.findByUserId(1L)).thenReturn(Collections.singletonList(item));

        List<com.daeryun.probank.dto.solve.AttemptHistoryItem> history = service.myHistory(actor);

        assertEquals(1, history.size());
        Mockito.verify(attemptDao).findByUserId(1L);
    }
}
