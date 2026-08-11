package com.daeryun.probank.dao;

import com.daeryun.probank.domain.Attempt;
import com.daeryun.probank.domain.Department;
import com.daeryun.probank.domain.Problem;
import com.daeryun.probank.domain.ProblemStatus;
import com.daeryun.probank.domain.ProblemType;
import com.daeryun.probank.domain.Status;
import com.daeryun.probank.domain.User;
import com.daeryun.probank.domain.UserRole;
import com.daeryun.probank.dto.solve.AttemptHistoryItem;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

@SpringBootTest
@ActiveProfiles("test")
@Transactional
class AttemptDaoTest {

    @Autowired
    private DepartmentDao departmentDao;

    @Autowired
    private UserDao userDao;

    @Autowired
    private ProblemDao problemDao;

    @Autowired
    private AttemptDao attemptDao;

    // is_correct 컬럼이 DTO 의 boolean correct 프로퍼티로 실제로 매핑되는지 DB 왕복으로 검증한다.
    // 서비스 단위 테스트는 attemptDao 를 목으로 대체하므로 이 매핑을 전혀 거치지 않는다 —
    // AS correct 별칭이 빠지면 findByUserId 가 항상 false 를 돌려주던 회귀를 이 테스트가 잡는다.
    @Test
    void findByUserId_mapsIsCorrectColumnToCorrectFlag() {
        User user = insertUser();
        Problem problem = insertProblem(user, "1 + 1 = ?");

        attemptDao.insert(newAttempt(user.getId(), problem.getId(), "[27]", true));

        List<AttemptHistoryItem> history = attemptDao.findByUserId(user.getId());

        assertEquals(1, history.size());
        AttemptHistoryItem item = history.get(0);
        assertTrue(item.isCorrect(), "is_correct=true 가 correct 프로퍼티로 매핑되어야 한다");
        assertEquals(problem.getId(), item.getProblemId());
        assertEquals("1 + 1 = ?", item.getProblemContent());
        assertEquals("[27]", item.getSubmittedAnswer());
    }

    @Test
    void findByUserId_mapsIncorrectAttempt() {
        User user = insertUser();
        Problem problem = insertProblem(user, "틀린 문제");

        attemptDao.insert(newAttempt(user.getId(), problem.getId(), "[99]", false));

        List<AttemptHistoryItem> history = attemptDao.findByUserId(user.getId());

        assertEquals(1, history.size());
        assertFalse(history.get(0).isCorrect());
    }

    @Test
    void findByUserId_returnsOnlyOwnAttempts() {
        User me = insertUser();
        User other = insertUser();
        Problem problem = insertProblem(me, "공통 문제");

        attemptDao.insert(newAttempt(me.getId(), problem.getId(), "[1]", true));
        attemptDao.insert(newAttempt(other.getId(), problem.getId(), "[2]", false));

        assertEquals(1, attemptDao.findByUserId(me.getId()).size());
    }

    private Attempt newAttempt(Long userId, Long problemId, String submitted, boolean correct) {
        Attempt attempt = new Attempt();
        attempt.setUserId(userId);
        attempt.setProblemId(problemId);
        attempt.setSubmittedAnswer(submitted);
        attempt.setCorrect(correct);
        return attempt;
    }

    private Department insertDepartment() {
        Department department = new Department();
        department.setName("테스트부서");
        department.setCode("TEST-DEPT-" + System.nanoTime());
        department.setStatus(Status.ACTIVE);
        departmentDao.insert(department);
        return department;
    }

    private User insertUser() {
        Department department = insertDepartment();
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

    private Problem insertProblem(User author, String content) {
        Problem problem = new Problem();
        problem.setType(ProblemType.MCQ_SINGLE);
        problem.setContent(content);
        problem.setStatus(ProblemStatus.ACTIVE);
        problem.setDepartmentId(author.getDepartmentId());
        problem.setCreatedBy(author.getId());
        problemDao.insert(problem);
        return problem;
    }
}
