package com.daeryun.probank.service;

import com.daeryun.probank.dao.ProblemAnswerDao;
import com.daeryun.probank.dao.ProblemChoiceDao;
import com.daeryun.probank.dao.ProblemDao;
import com.daeryun.probank.dao.ProblemTagDao;
import com.daeryun.probank.dao.TagDao;
import com.daeryun.probank.domain.Problem;
import com.daeryun.probank.domain.ProblemAnswer;
import com.daeryun.probank.domain.ProblemChoice;
import com.daeryun.probank.domain.ProblemStatus;
import com.daeryun.probank.domain.ProblemType;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.InOrder;
import org.mockito.Mockito;

import java.util.Arrays;
import java.util.Collections;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

class ProblemProvisioningServiceImplTest {

    private ProblemDao problemDao;
    private ProblemChoiceDao problemChoiceDao;
    private ProblemAnswerDao problemAnswerDao;
    private TagDao tagDao;
    private ProblemTagDao problemTagDao;
    private AuditLogService auditLogService;
    private ProblemProvisioningServiceImpl service;

    @BeforeEach
    void setUp() {
        problemDao = Mockito.mock(ProblemDao.class);
        problemChoiceDao = Mockito.mock(ProblemChoiceDao.class);
        problemAnswerDao = Mockito.mock(ProblemAnswerDao.class);
        tagDao = Mockito.mock(TagDao.class);
        problemTagDao = Mockito.mock(ProblemTagDao.class);
        auditLogService = Mockito.mock(AuditLogService.class);
        service = new ProblemProvisioningServiceImpl(problemDao, problemChoiceDao, problemAnswerDao, tagDao,
                problemTagDao, auditLogService);
    }

    private Problem newProblem(ProblemType type) {
        Problem problem = new Problem();
        problem.setType(type);
        problem.setContent("1+1=?");
        problem.setStatus(ProblemStatus.ACTIVE);
        problem.setDepartmentId(10L);
        problem.setCreatedBy(1L);
        return problem;
    }

    @Test
    void provisionWithChoices_insertsChoicesTagsAndAuditsInThatOrder() {
        Problem problem = newProblem(ProblemType.MCQ_SINGLE);
        Mockito.doAnswer(invocation -> {
            problem.setId(100L);
            return null;
        }).when(problemDao).insert(problem);
        ProblemChoice choice = new ProblemChoice();
        choice.setChoiceText("1");
        Mockito.when(tagDao.findOrCreateByNames(Collections.singletonList("math"))).thenReturn(Arrays.asList(5L));

        service.provisionWithChoices(problem, Arrays.asList(choice), Collections.singletonList("math"));

        InOrder inOrder = Mockito.inOrder(problemDao, problemChoiceDao, problemTagDao, auditLogService);
        inOrder.verify(problemDao).insert(problem);
        inOrder.verify(problemChoiceDao).insertAll(Mockito.anyList());
        inOrder.verify(problemTagDao).replaceTags(100L, Arrays.asList(5L));
        inOrder.verify(auditLogService).record(Mockito.eq(1L), Mockito.eq("PROBLEM_CREATED_BY_EXCEL"),
                Mockito.eq("PROBLEM"), Mockito.eq(100L), Mockito.anyString());
        assertEquals(100L, choice.getProblemId());
    }

    @Test
    void provisionWithAnswers_insertsAnswersTagsAndAuditsInThatOrder() {
        Problem problem = newProblem(ProblemType.SHORT_ANSWER);
        Mockito.doAnswer(invocation -> {
            problem.setId(200L);
            return null;
        }).when(problemDao).insert(problem);
        ProblemAnswer answer = new ProblemAnswer();
        answer.setAnswerText("서울");

        service.provisionWithAnswers(problem, Arrays.asList(answer), Collections.emptyList());

        InOrder inOrder = Mockito.inOrder(problemDao, problemAnswerDao, problemTagDao, auditLogService);
        inOrder.verify(problemDao).insert(problem);
        inOrder.verify(problemAnswerDao).insertAll(Mockito.anyList());
        inOrder.verify(problemTagDao).replaceTags(Mockito.eq(200L), Mockito.anyList());
        inOrder.verify(auditLogService).record(Mockito.eq(1L), Mockito.eq("PROBLEM_CREATED_BY_EXCEL"),
                Mockito.eq("PROBLEM"), Mockito.eq(200L), Mockito.anyString());
        assertEquals(200L, answer.getProblemId());
    }

    @Test
    void provisionWithChoices_whenChoiceInsertFails_propagatesAndSkipsTagsAndAudit() {
        Problem problem = newProblem(ProblemType.MCQ_SINGLE);
        Mockito.doThrow(new RuntimeException("DB 오류"))
                .when(problemChoiceDao).insertAll(Mockito.anyList());
        ProblemChoice choice = new ProblemChoice();
        choice.setChoiceText("1");

        assertThrows(RuntimeException.class,
                () -> service.provisionWithChoices(problem, Arrays.asList(choice), Collections.emptyList()));

        Mockito.verifyNoInteractions(problemTagDao);
        Mockito.verifyNoInteractions(auditLogService);
    }

    @Test
    void provisionMethods_areAnnotatedRequiresNew() throws NoSuchMethodException {
        org.springframework.transaction.annotation.Transactional choicesAnnotation =
                ProblemProvisioningServiceImpl.class
                        .getMethod("provisionWithChoices", Problem.class, List.class, List.class)
                        .getAnnotation(org.springframework.transaction.annotation.Transactional.class);
        org.springframework.transaction.annotation.Transactional answersAnnotation =
                ProblemProvisioningServiceImpl.class
                        .getMethod("provisionWithAnswers", Problem.class, List.class, List.class)
                        .getAnnotation(org.springframework.transaction.annotation.Transactional.class);

        assertEquals(org.springframework.transaction.annotation.Propagation.REQUIRES_NEW,
                choicesAnnotation.propagation());
        assertEquals(org.springframework.transaction.annotation.Propagation.REQUIRES_NEW,
                answersAnnotation.propagation());
    }
}
