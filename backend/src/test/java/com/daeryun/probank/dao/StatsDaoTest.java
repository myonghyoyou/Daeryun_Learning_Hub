package com.daeryun.probank.dao;

import com.daeryun.probank.domain.Attempt;
import com.daeryun.probank.domain.Department;
import com.daeryun.probank.domain.Problem;
import com.daeryun.probank.domain.ProblemStatus;
import com.daeryun.probank.domain.ProblemType;
import com.daeryun.probank.domain.Status;
import com.daeryun.probank.domain.User;
import com.daeryun.probank.domain.UserRole;
import com.daeryun.probank.dto.stats.ProblemStatRaw;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * StatsMapper.xml 의 SQL 은 서비스 단위 테스트에서 statsDao 를 목으로 대체하므로 한 번도
 * 실행된 적이 없다. accuracyOrder 는 StatsServiceImpl.LOWEST_ACCURACY_FIRST 와 같은 규칙을
 * SQL 에 다시 적은 것인데, SQL 쪽은 아무 테스트도 이 규칙을 고정하지 않았다 — 이 테스트가
 * 그 공백을 메운다. AttemptDaoTest 와 같은 구조(@SpringBootTest, DAO 로 픽스처 삽입)를 따른다.
 */
@SpringBootTest
@ActiveProfiles("test")
@Transactional
class StatsDaoTest {

    @Autowired
    private DepartmentDao departmentDao;

    @Autowired
    private UserDao userDao;

    @Autowired
    private ProblemDao problemDao;

    @Autowired
    private AttemptDao attemptDao;

    @Autowired
    private StatsDao statsDao;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    // 정렬은 반드시 SQL 에서 잘려야 한다(StatsMapper.accuracyOrder 의 주석 참고). 페이지 두 장을
    // 이어붙였을 때 정답률 오름차순 + 미응시(null) 맨 뒤 + 동률은 problemId 로 끊이는지를
    // 검증한다.
    //
    // 데이터가 이만큼 작으면(문제 4개) 플래너가 기본적으로 GroupAggregate + 사전 Sort(p.id) 를
    // 골라, ORDER BY 의 p.id 타이브레이커를 지워도 우연히 같은 순서가 나온다(EXPLAIN 으로 확인).
    // enable_sort 를 꺼서 HashAggregate 를 강제하면 동률의 순서가 해시 버킷을 타므로 타이브레이커가
    // 빠졌을 때 뒤집힐 가능성이 커진다 — 다만 해시는 problem_id 실값에 따라 갈리므로 매 실행마다
    // 반드시 뒤집힌다는 보장은 없다(직접 확인 완료, final-fix-report.md 참고). SQL 이 맞을 때는
    // 이 힌트가 있든 없든 최종 ORDER BY 가 항상 결정적으로 옳은 순서를 내므로 이 테스트가 잘못
    // 실패하는 일은 없다. SET LOCAL 이라 이 트랜잭션(=이 테스트) 밖으로 새지 않는다.
    @Test
    void findProblemStats_ordersAscendingAccuracy_unattemptedLast_tiesBrokenByProblemId() {
        jdbcTemplate.execute("SET LOCAL enable_sort = off");

        Department department = insertDepartment();
        User user = insertUser(department);

        Problem low = insertProblem(department, user, "정답률 25%");     // 1/4 = 0.25
        Problem tieA = insertProblem(department, user, "동률 A");        // 1/2 = 0.5, 먼저 생성 -> problemId 작음
        Problem tieB = insertProblem(department, user, "동률 B");        // 1/2 = 0.5, 나중 생성 -> problemId 큼
        Problem unattempted = insertProblem(department, user, "미응시"); // 시도 없음 -> null accuracy, 맨 뒤

        recordAttempts(user, low, 1, 3);
        recordAttempts(user, tieA, 1, 1);
        recordAttempts(user, tieB, 1, 1);

        List<ProblemStatRaw> page1 = statsDao.findProblemStats(department.getId(), null, 2, 0);
        List<ProblemStatRaw> page2 = statsDao.findProblemStats(department.getId(), null, 2, 2);

        List<Long> combinedOrder = new ArrayList<>();
        page1.forEach(item -> combinedOrder.add(item.getProblemId()));
        page2.forEach(item -> combinedOrder.add(item.getProblemId()));

        assertEquals(
                List.of(low.getId(), tieA.getId(), tieB.getId(), unattempted.getId()),
                combinedOrder,
                "정답률 오름차순, 동률은 problemId 순, 미응시는 맨 뒤여야 한다");
    }

    // countProblemStats 는 problems 행 수를 세야 한다. attempts 를 조인해서 세면 시도 수만큼
    // 부풀어 오른다 — StatsMapper 주석이 경고하는 바로 그 버그.
    @Test
    void countProblemStats_countsProblems_notAttemptRows() {
        Department department = insertDepartment();
        User user = insertUser(department);

        Problem heavilyAttempted = insertProblem(department, user, "시도 많은 문제");
        insertProblem(department, user, "문제 2");
        insertProblem(department, user, "문제 3");

        recordAttempts(user, heavilyAttempted, 3, 2);

        assertEquals(3L, statsDao.countProblemStats(department.getId(), null));
    }

    @Test
    void findProblemStats_statusFilter_activeExcludesArchived_nullIncludesIt() {
        Department department = insertDepartment();
        User user = insertUser(department);

        Problem active = insertProblem(department, user, "활성 문제");
        Problem archived = insertProblem(department, user, "보관 문제");
        problemDao.updateStatus(archived.getId(), ProblemStatus.ARCHIVED);

        List<ProblemStatRaw> activeOnly = statsDao.findProblemStats(department.getId(), "ACTIVE", 10, 0);
        assertEquals(1, activeOnly.size());
        assertEquals(active.getId(), activeOnly.get(0).getProblemId());

        List<ProblemStatRaw> all = statsDao.findProblemStats(department.getId(), null, 10, 0);
        assertEquals(2, all.size());
        assertTrue(all.stream().anyMatch(item -> item.getProblemId().equals(archived.getId())));
    }

    @Test
    void findProblemStat_mapsAllFields() {
        Department department = insertDepartment();
        User user = insertUser(department);
        Problem problem = insertProblem(department, user, "필드 매핑 문제");
        recordAttempts(user, problem, 1, 1);

        ProblemStatRaw raw = statsDao.findProblemStat(problem.getId());

        assertNotNull(raw);
        assertEquals(ProblemType.MCQ_SINGLE, raw.getType());
        assertEquals(ProblemStatus.ACTIVE, raw.getStatus());
        assertEquals(department.getName(), raw.getDepartmentName());
        assertEquals(2, raw.getTotalAttempts());
        assertEquals(1, raw.getCorrectAttempts());
        assertNotNull(raw.getLastAttemptAt());
    }

    @Test
    void countActiveProblems_excludesArchived() {
        Department department = insertDepartment();
        User user = insertUser(department);

        insertProblem(department, user, "활성 1");
        insertProblem(department, user, "활성 2");
        Problem archived = insertProblem(department, user, "보관됨");
        problemDao.updateStatus(archived.getId(), ProblemStatus.ARCHIVED);

        assertEquals(2, statsDao.countActiveProblems(department.getId()));
    }

    private void recordAttempts(User user, Problem problem, int correctCount, int incorrectCount) {
        for (int i = 0; i < correctCount; i++) {
            attemptDao.insert(newAttempt(user.getId(), problem.getId(), true));
        }
        for (int i = 0; i < incorrectCount; i++) {
            attemptDao.insert(newAttempt(user.getId(), problem.getId(), false));
        }
    }

    private Attempt newAttempt(Long userId, Long problemId, boolean correct) {
        Attempt attempt = new Attempt();
        attempt.setUserId(userId);
        attempt.setProblemId(problemId);
        attempt.setSubmittedAnswer("[1]");
        attempt.setCorrect(correct);
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

    private Problem insertProblem(Department department, User author, String content) {
        Problem problem = new Problem();
        problem.setType(ProblemType.MCQ_SINGLE);
        problem.setContent(content);
        problem.setStatus(ProblemStatus.ACTIVE);
        problem.setDepartmentId(department.getId());
        problem.setCreatedBy(author.getId());
        problemDao.insert(problem);
        return problem;
    }
}
