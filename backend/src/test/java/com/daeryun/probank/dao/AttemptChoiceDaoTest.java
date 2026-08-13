package com.daeryun.probank.dao;

import com.daeryun.probank.domain.Attempt;
import com.daeryun.probank.domain.AttemptChoice;
import com.daeryun.probank.domain.Department;
import com.daeryun.probank.domain.Problem;
import com.daeryun.probank.domain.ProblemChoice;
import com.daeryun.probank.domain.ProblemStatus;
import com.daeryun.probank.domain.ProblemType;
import com.daeryun.probank.domain.Status;
import com.daeryun.probank.domain.User;
import com.daeryun.probank.domain.UserRole;
import com.daeryun.probank.dto.stats.ChoiceDistributionRaw;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.annotation.Transactional;

import java.util.Arrays;
import java.util.Collections;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;

/**
 * AttemptChoiceMapper.xml 의 SQL 은 서비스 단위 테스트에서 attemptChoiceDao 를 목으로 대체하므로
 * 한 번도 실행된 적이 없다. 특히 countAnalyzedAttempts 는 attempt_choices.choice_id 가 FK 없이
 * 저장되는(원본 보기가 지워져도 남는) 설계를 전제로 problem_choices 와 조인해 "지금 존재하는
 * 보기"만 세는데, 그 조인 조건이 틀리면 excludedAttempts 전체가 조용히 틀려진다.
 */
@SpringBootTest
@ActiveProfiles("test")
@Transactional
class AttemptChoiceDaoTest {

    @Autowired
    private DepartmentDao departmentDao;

    @Autowired
    private UserDao userDao;

    @Autowired
    private ProblemDao problemDao;

    @Autowired
    private ProblemChoiceDao problemChoiceDao;

    @Autowired
    private AttemptDao attemptDao;

    @Autowired
    private AttemptChoiceDao attemptChoiceDao;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Test
    void insertAll_roundTripsAttemptIdChoiceIdAndChoiceTextSnapshot() {
        Department department = insertDepartment();
        User user = insertUser(department);
        Problem problem = insertProblem(department, user);
        List<ProblemChoice> choices = insertChoices(problem, "보기1", "보기2");
        Attempt attempt = insertAttempt(user, problem, true);

        AttemptChoice attemptChoice = new AttemptChoice();
        attemptChoice.setAttemptId(attempt.getId());
        attemptChoice.setChoiceId(choices.get(0).getId());
        attemptChoice.setChoiceText("보기1");
        attemptChoiceDao.insertAll(Collections.singletonList(attemptChoice));

        Map<String, Object> row = jdbcTemplate.queryForMap(
                "SELECT attempt_id, choice_id, choice_text FROM attempt_choices WHERE attempt_id = ?",
                attempt.getId());

        assertEquals(attempt.getId(), ((Number) row.get("attempt_id")).longValue());
        assertEquals(choices.get(0).getId(), ((Number) row.get("choice_id")).longValue());
        assertEquals("보기1", row.get("choice_text"));
    }

    @Test
    void findDistribution_groupsBySameChoice() {
        Department department = insertDepartment();
        User user = insertUser(department);
        Problem problem = insertProblem(department, user);
        List<ProblemChoice> choices = insertChoices(problem, "보기1", "보기2");

        Attempt attempt1 = insertAttempt(user, problem, true);
        Attempt attempt2 = insertAttempt(user, problem, true);
        attemptChoiceDao.insertAll(Arrays.asList(
                choiceOf(attempt1.getId(), choices.get(0)),
                choiceOf(attempt2.getId(), choices.get(0))));

        List<ChoiceDistributionRaw> distribution = attemptChoiceDao.findDistribution(problem.getId());

        assertEquals(1, distribution.size());
        assertEquals(choices.get(0).getId(), distribution.get(0).getChoiceId());
        assertEquals(2, distribution.get(0).getSelectedCount());
    }

    // excludedAttempts 전체가 이 판정 하나에 기댄다: 지금 존재하는 보기와 매칭되는 attempt_choices
    // 행이 있는 시도만 "분석됨"으로 센다. choice_id 는 FK 가 없으므로 존재하지 않는 값도 그대로
    // 저장되며, 그 orphan 행은 여기서 반드시 제외되어야 한다. 완전히 없는 id(전역적으로 어떤
    // problem_choices 행과도 매칭되지 않는 값)는 c.id = ac.choice_id 조건 하나만으로도 걸러지므로
    // c.problem_id = a.problem_id 조건의 존재 여부와 무관하게 항상 제외된다 — 그래서 진짜
    // 판별력은 choice_id 가 "다른 문제의" 실제 보기를 가리키는 경우에서 나온다: 그 id 는
    // problem_choices 에 진짜로 존재하므로 c.id 조건은 통과하고, c.problem_id 조건이 없으면
    // 이 문제의 분석 대상으로 잘못 세어진다.
    @Test
    void countAnalyzedAttempts_excludesChoiceIdBelongingToAnotherProblem() {
        Department department = insertDepartment();
        User user = insertUser(department);
        Problem problem = insertProblem(department, user);
        List<ProblemChoice> choices = insertChoices(problem, "보기1", "보기2");

        Problem otherProblem = insertProblem(department, user);
        List<ProblemChoice> otherChoices = insertChoices(otherProblem, "다른문제 보기1", "다른문제 보기2");

        Attempt validAttempt = insertAttempt(user, problem, true);
        Attempt crossProblemAttempt = insertAttempt(user, problem, false);

        AttemptChoice validChoice = choiceOf(validAttempt.getId(), choices.get(0));
        // 다른 문제의 실제 보기 id 를 가리킨다 — problem_choices 에 존재하긴 하지만 이 문제의 것이 아니다.
        AttemptChoice crossProblemChoice = new AttemptChoice();
        crossProblemChoice.setAttemptId(crossProblemAttempt.getId());
        crossProblemChoice.setChoiceId(otherChoices.get(0).getId());
        crossProblemChoice.setChoiceText(otherChoices.get(0).getChoiceText());

        attemptChoiceDao.insertAll(Arrays.asList(validChoice, crossProblemChoice));

        assertEquals(1, attemptChoiceDao.countAnalyzedAttempts(problem.getId()),
                "다른 문제의 보기를 가리키는 attempt_choices 행은 이 문제의 분석 대상에서 빠져야 한다");
    }

    // F1 이 명시한 시나리오: choice_id 가 problem_choices 어디에도 없는 완전한 orphan.
    @Test
    void countAnalyzedAttempts_excludesChoiceIdNotInProblemChoicesAtAll() {
        Department department = insertDepartment();
        User user = insertUser(department);
        Problem problem = insertProblem(department, user);
        List<ProblemChoice> choices = insertChoices(problem, "보기1", "보기2");

        Attempt validAttempt = insertAttempt(user, problem, true);
        Attempt orphanAttempt = insertAttempt(user, problem, false);

        AttemptChoice validChoice = choiceOf(validAttempt.getId(), choices.get(0));
        AttemptChoice orphanChoice = new AttemptChoice();
        orphanChoice.setAttemptId(orphanAttempt.getId());
        orphanChoice.setChoiceId(choices.get(1).getId() + 999_999L); // problem_choices 에 없는 id
        orphanChoice.setChoiceText("삭제된 보기");

        attemptChoiceDao.insertAll(Arrays.asList(validChoice, orphanChoice));

        assertEquals(1, attemptChoiceDao.countAnalyzedAttempts(problem.getId()),
                "존재하지 않는 choice_id 를 가리키는 attempt_choices 행은 분석 대상에서 빠져야 한다");
    }

    @Test
    void countAnalyzedAttempts_excludesAttemptWithNoChoiceRows() {
        Department department = insertDepartment();
        User user = insertUser(department);
        Problem problem = insertProblem(department, user);
        insertChoices(problem, "보기1", "보기2");

        insertAttempt(user, problem, true); // attempt_choices 행이 전혀 없음

        assertEquals(0, attemptChoiceDao.countAnalyzedAttempts(problem.getId()));
    }

    private AttemptChoice choiceOf(Long attemptId, ProblemChoice choice) {
        AttemptChoice attemptChoice = new AttemptChoice();
        attemptChoice.setAttemptId(attemptId);
        attemptChoice.setChoiceId(choice.getId());
        attemptChoice.setChoiceText(choice.getChoiceText());
        return attemptChoice;
    }

    private List<ProblemChoice> insertChoices(Problem problem, String... texts) {
        List<ProblemChoice> choices = new java.util.ArrayList<>();
        int order = 1;
        for (String text : texts) {
            ProblemChoice choice = new ProblemChoice();
            choice.setProblemId(problem.getId());
            choice.setChoiceText(text);
            choice.setCorrect(false);
            choice.setDisplayOrder(order++);
            choices.add(choice);
        }
        problemChoiceDao.insertAll(choices);
        return problemChoiceDao.findByProblemId(problem.getId());
    }

    private Attempt insertAttempt(User user, Problem problem, boolean correct) {
        Attempt attempt = new Attempt();
        attempt.setUserId(user.getId());
        attempt.setProblemId(problem.getId());
        attempt.setSubmittedAnswer("[1]");
        attempt.setCorrect(correct);
        attemptDao.insert(attempt);
        return attempt;
    }

    private Department insertDepartment() {
        Department department = new Department();
        department.setName("테스트부서-" + System.nanoTime());
        department.setCode("TEST-DEPT-" + System.nanoTime());
        department.setStatus(Status.ACTIVE);
        departmentDao.insert(department);
        return department;
    }

    private User insertUser(Department department) {
        User user = new User();
        user.setEmployeeNo("EMP-" + System.nanoTime());
        user.setName("홍길동");
        user.setEmail("user-" + System.nanoTime() + "@company.local");
        user.setPasswordHash("hashed");
        user.setDepartmentId(department.getId());
        user.setRole(UserRole.EMPLOYEE);
        user.setStatus(Status.ACTIVE);
        user.setMustChangePassword(false);
        userDao.insert(user);
        return user;
    }

    private Problem insertProblem(Department department, User author) {
        Problem problem = new Problem();
        problem.setType(ProblemType.MCQ_SINGLE);
        problem.setContent("보기 문제");
        problem.setStatus(ProblemStatus.ACTIVE);
        problem.setDepartmentId(department.getId());
        problem.setCreatedBy(author.getId());
        problemDao.insert(problem);
        return problem;
    }
}
