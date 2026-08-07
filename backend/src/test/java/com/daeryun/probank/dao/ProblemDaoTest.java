package com.daeryun.probank.dao;

import com.daeryun.probank.domain.*;
import com.daeryun.probank.dto.problem.ProblemListItem;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.util.Arrays;
import java.util.Collections;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

@SpringBootTest
@ActiveProfiles("test")
@Transactional
class ProblemDaoTest {

    @Autowired private DepartmentDao departmentDao;
    @Autowired private UserDao userDao;
    @Autowired private ProblemDao problemDao;
    @Autowired private ProblemChoiceDao problemChoiceDao;
    @Autowired private ProblemAnswerDao problemAnswerDao;
    @Autowired private ProblemBlankDao problemBlankDao;
    @Autowired private JdbcTemplate jdbcTemplate;

    private Department createDepartment() {
        Department department = new Department();
        department.setName("QA");
        department.setCode("QA-" + System.nanoTime());
        department.setStatus(Status.ACTIVE);
        departmentDao.insert(department);
        return department;
    }

    private User createAuthor(Long departmentId) {
        User author = new User();
        author.setEmployeeNo("author-" + System.nanoTime());
        author.setName("작성자");
        author.setEmail("author-" + System.nanoTime() + "@company.local");
        author.setPasswordHash("hash");
        author.setDepartmentId(departmentId);
        author.setRole(UserRole.DEPT_ADMIN);
        author.setStatus(Status.ACTIVE);
        author.setMustChangePassword(false);
        userDao.insert(author);
        return author;
    }

    private Problem createProblem(Long departmentId, Long createdBy, String content) {
        Problem problem = new Problem();
        problem.setType(ProblemType.MCQ_SINGLE);
        problem.setContent(content);
        problem.setStatus(ProblemStatus.ACTIVE);
        problem.setDepartmentId(departmentId);
        problem.setCreatedBy(createdBy);
        problemDao.insert(problem);
        return problem;
    }

    @Test
    void insertProblemWithChoices_andReadBack() {
        Department department = createDepartment();
        User author = createAuthor(department.getId());

        Problem problem = new Problem();
        problem.setType(ProblemType.MCQ_SINGLE);
        problem.setContent("1 + 1 = ?");
        problem.setStatus(ProblemStatus.ACTIVE);
        problem.setDepartmentId(department.getId());
        problem.setCreatedBy(author.getId());
        problemDao.insert(problem);

        ProblemChoice choice1 = new ProblemChoice();
        choice1.setProblemId(problem.getId());
        choice1.setChoiceText("1");
        choice1.setCorrect(false);
        choice1.setDisplayOrder(1);
        ProblemChoice choice2 = new ProblemChoice();
        choice2.setProblemId(problem.getId());
        choice2.setChoiceText("2");
        choice2.setCorrect(true);
        choice2.setDisplayOrder(2);
        problemChoiceDao.insertAll(Arrays.asList(choice1, choice2));

        Problem found = problemDao.findById(problem.getId());
        assertEquals("1 + 1 = ?", found.getContent());

        List<ProblemChoice> choices = problemChoiceDao.findByProblemId(problem.getId());
        assertEquals(2, choices.size());
        // Regression guard: is_correct must round-trip through the resultMap correctly.
        // Lombok's `boolean correct` registers the MyBatis property name as "correct" (from
        // isCorrect()), not "isCorrect" — relying on auto-mapping against the is_correct
        // column silently mapped every row to correct == false. See ProblemChoiceMapper.xml's
        // problemChoiceMap.
        ProblemChoice persistedChoice1 = choices.stream().filter(c -> "1".equals(c.getChoiceText())).findFirst().orElseThrow(AssertionError::new);
        ProblemChoice persistedChoice2 = choices.stream().filter(c -> "2".equals(c.getChoiceText())).findFirst().orElseThrow(AssertionError::new);
        assertFalse(persistedChoice1.isCorrect());
        assertTrue(persistedChoice2.isCorrect());
    }

    @Test
    void update_persistsEditableFields_andUpdateStatus_persistsStatus() {
        Department department = createDepartment();
        User author = createAuthor(department.getId());
        Problem problem = createProblem(department.getId(), author.getId(), "원본 내용");

        Problem toUpdate = problemDao.findById(problem.getId());
        toUpdate.setContent("수정된 내용");
        toUpdate.setImageUrl("http://example.com/image.png");
        toUpdate.setReferenceText("참고자료");
        toUpdate.setExplanation("해설");
        toUpdate.setBlankRevealCount(2);
        problemDao.update(toUpdate);

        Problem afterUpdate = problemDao.findById(problem.getId());
        assertEquals("수정된 내용", afterUpdate.getContent());
        assertEquals("http://example.com/image.png", afterUpdate.getImageUrl());
        assertEquals("참고자료", afterUpdate.getReferenceText());
        assertEquals("해설", afterUpdate.getExplanation());
        assertEquals(2, afterUpdate.getBlankRevealCount());

        problemDao.updateStatus(problem.getId(), ProblemStatus.ARCHIVED);
        Problem afterArchive = problemDao.findById(problem.getId());
        assertEquals(ProblemStatus.ARCHIVED, afterArchive.getStatus());
    }

    @Test
    void findAll_appliesFilters_andAggregatesTags() {
        Department department = createDepartment();
        User author = createAuthor(department.getId());
        Problem tagged = createProblem(department.getId(), author.getId(), "태그붙은 문제 keyword-abc");
        Problem untagged = createProblem(department.getId(), author.getId(), "태그없는 문제");

        Long tagId = jdbcTemplate.queryForObject(
                "INSERT INTO tags (name) VALUES (?) RETURNING id", Long.class, "자바-" + System.nanoTime());
        jdbcTemplate.update("INSERT INTO problem_tags (problem_id, tag_id) VALUES (?, ?)", tagged.getId(), tagId);
        String tagName = jdbcTemplate.queryForObject("SELECT name FROM tags WHERE id = ?", String.class, tagId);

        List<ProblemListItem> byTag = problemDao.findAll(department.getId(), null, null, null, null, tagName, null);
        assertEquals(1, byTag.size());
        assertEquals(tagged.getId(), byTag.get(0).getId());
        assertTrue(byTag.get(0).getTags().contains(tagName));

        List<ProblemListItem> byKeyword = problemDao.findAll(department.getId(), null, null, null, null, null, "keyword-abc");
        assertEquals(1, byKeyword.size());
        assertEquals(tagged.getId(), byKeyword.get(0).getId());

        List<ProblemListItem> untaggedResult = problemDao.findAll(department.getId(), null, null, null, null, null, "태그없는");
        assertEquals(1, untaggedResult.size());
        assertTrue(untaggedResult.get(0).getTags().isEmpty());

        LocalDate today = LocalDate.now();
        List<ProblemListItem> byDateRange = problemDao.findAll(
                department.getId(), null, null, today, today, null, null);
        assertEquals(2, byDateRange.size());

        List<ProblemListItem> byDateBefore = problemDao.findAll(
                department.getId(), null, null, today.minusDays(2), today.minusDays(1), null, null);
        assertTrue(byDateBefore.isEmpty());

        List<ProblemListItem> byStatus = problemDao.findAll(
                department.getId(), null, "ARCHIVED", null, null, null, null);
        assertTrue(byStatus.isEmpty());

        List<ProblemListItem> byType = problemDao.findAll(
                department.getId(), "MCQ_SINGLE", null, null, null, null, null);
        assertEquals(2, byType.size());
    }

    @Test
    void answerDao_and_blankDao_insertFindDelete() {
        Department department = createDepartment();
        User author = createAuthor(department.getId());
        Problem problem = createProblem(department.getId(), author.getId(), "빈칸/단답 문제");

        ProblemAnswer answer = new ProblemAnswer();
        answer.setProblemId(problem.getId());
        answer.setAnswerText("정답");
        problemAnswerDao.insertAll(Collections.singletonList(answer));
        assertEquals(1, problemAnswerDao.findByProblemId(problem.getId()).size());
        problemAnswerDao.deleteByProblemId(problem.getId());
        assertTrue(problemAnswerDao.findByProblemId(problem.getId()).isEmpty());

        ProblemBlank blank1 = new ProblemBlank();
        blank1.setProblemId(problem.getId());
        blank1.setBlankKey("b1");
        blank1.setAnswerText("답1");
        blank1.setDisplayOrder(1);
        ProblemBlank blank2 = new ProblemBlank();
        blank2.setProblemId(problem.getId());
        blank2.setBlankKey("b2");
        blank2.setAnswerText("답2");
        blank2.setDisplayOrder(2);
        problemBlankDao.insertAll(Arrays.asList(blank1, blank2));
        assertEquals(2, problemBlankDao.findByProblemId(problem.getId()).size());
        problemBlankDao.deleteByProblemId(problem.getId());
        assertTrue(problemBlankDao.findByProblemId(problem.getId()).isEmpty());
    }
}
