package com.daeryun.probank.service;

import com.daeryun.probank.dao.ProblemAnswerDao;
import com.daeryun.probank.dao.ProblemBlankDao;
import com.daeryun.probank.dao.ProblemChoiceDao;
import com.daeryun.probank.dao.ProblemDao;
import com.daeryun.probank.dao.AttemptDao;
import com.daeryun.probank.dao.AttemptBlankAnswerDao;
import com.daeryun.probank.domain.*;
import com.daeryun.probank.dto.solve.ProblemSolveDetailResponse;
import com.daeryun.probank.exception.BizException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;

import java.util.Arrays;
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
}
