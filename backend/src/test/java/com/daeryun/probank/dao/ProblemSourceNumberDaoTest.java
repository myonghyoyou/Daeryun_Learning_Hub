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
import com.daeryun.probank.dto.solve.ProblemSolveListItem;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.dao.DataAccessException;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;

@SpringBootTest
@ActiveProfiles("test")
@Transactional
class ProblemSourceNumberDaoTest {

    @Autowired
    private DepartmentDao departmentDao;

    @Autowired
    private UserDao userDao;

    @Autowired
    private ProblemDao problemDao;

    @Autowired
    private AttemptDao attemptDao;

    private Long departmentId;
    private Long userId;

    @BeforeEach
    void setUp() {
        Department department = insertDepartment();
        departmentId = department.getId();
        userId = insertUser(department).getId();
    }

    @Test
    void duplicateSourceNumber_surfacesAsDuplicateKeyExceptionNotRawPersistenceException() {
        // ProblemServiceImpl 의 catch(DuplicateKeyException) 가 이 타입 위에 서 있다.
        // 번역이 없으면 그 catch 는 영원히 안 걸리고 사용자는 -1 만 본다.
        Problem first = newProblem(departmentId, 7);
        problemDao.insert(first);

        Problem second = newProblem(departmentId, 7);

        assertThrows(DuplicateKeyException.class, () -> problemDao.insert(second));
    }

    @Test
    void findMaxSourceNumber_countsArchivedProblems() {
        // spec D5: 번호는 재사용하지 않는다. 보관된 문제도 번호를 점유한 것으로 쳐야 한다.
        // WHERE 절에 status = 'ACTIVE' 가 몰래 끼어들면 이 테스트가 5를 돌려주며 실패한다.
        Problem active = newProblem(departmentId, 5);
        problemDao.insert(active);
        Problem archived = newProblem(departmentId, 9);
        archived.setStatus(ProblemStatus.ARCHIVED);
        problemDao.insert(archived);

        Integer max = problemDao.findMaxSourceNumber(departmentId);

        assertEquals(9, max);
    }

    @Test
    void findMaxSourceNumber_doesNotCountOtherDepartments() {
        // WHERE department_id = #{departmentId} 가 빠지면 다른 부서의 100번이 새어 들어온다.
        Problem problem = newProblem(departmentId, 100);
        problemDao.insert(problem);
        Department otherDepartment = insertDepartment();

        Integer max = problemDao.findMaxSourceNumber(otherDepartment.getId());

        assertNull(max);
    }

    @Test
    void findAllActive_populatesDepartmentNameAndSourceNumber() {
        // JOIN departments 나 GROUP BY d.name 이 빠지면 department_name 이 안 채워지거나
        // (LEFT JOIN 없이 태그 조인과 얽혀) 쿼리 자체가 실패한다.
        Problem problem = newProblem(departmentId, 3);
        problemDao.insert(problem);

        List<ProblemSolveListItem> items = problemDao.findAllActive(null, null);

        ProblemSolveListItem found = items.stream()
                .filter(item -> item.getId().equals(problem.getId()))
                .findFirst()
                .orElseThrow(() -> new AssertionError("방금 넣은 문제가 목록에 없다"));
        assertEquals("테스트부서", found.getDepartmentName());
        assertEquals(Integer.valueOf(3), found.getSourceNumber());
    }

    @Test
    void findRandomActive_populatesDepartmentNameAndSourceNumber() {
        // 이 부서로 조회를 좁혀 무작위 추출이라도 결과를 결정적으로 만든다 — 방금 만든
        // 부서에는 이 문제 하나뿐이다.
        Problem problem = newProblem(departmentId, 4);
        problemDao.insert(problem);

        List<ProblemSolveListItem> items = problemDao.findRandomActive(1, departmentId);

        assertEquals(1, items.size());
        assertEquals("테스트부서", items.get(0).getDepartmentName());
        assertEquals(Integer.valueOf(4), items.get(0).getSourceNumber());
    }

    @Test
    void attemptDao_findByUserId_populatesDepartmentNameAndSourceNumber() {
        // AttemptMapper.findByUserId 의 JOIN departments 와 별칭이 실제로 AttemptHistoryItem
        // 필드까지 이어지는지는 이 왕복 테스트가 유일하게 확인한다.
        Problem problem = newProblem(departmentId, 6);
        problemDao.insert(problem);
        Attempt attempt = new Attempt();
        attempt.setUserId(userId);
        attempt.setProblemId(problem.getId());
        attempt.setSubmittedAnswer("답");
        attempt.setCorrect(true);
        attemptDao.insert(attempt);

        List<AttemptHistoryItem> history = attemptDao.findByUserId(userId);

        assertEquals(1, history.size());
        assertEquals("테스트부서", history.get(0).getDepartmentName());
        assertEquals(Integer.valueOf(6), history.get(0).getSourceNumber());
    }

    @Test
    void uniqueConstraint_preventsSameDepartmentAndSourceNumberTwice() {
        // UNIQUE(department_id, source_number) 가 실제로 DB에 걸려 있는지 확인한다.
        // 제약이 빠지면 두 번째 insert 도 조용히 성공한다.
        Problem first = newProblem(departmentId, 42);
        problemDao.insert(first);
        Problem second = newProblem(departmentId, 42);

        assertThrows(DataAccessException.class, () -> problemDao.insert(second));
    }

    @Test
    void nullSourceNumber_allowsMultipleProblemsInSameDepartment() {
        // 기존 14건이 source_number 없이 공존할 수 있는 근거: UNIQUE 제약은 NULL 끼리는
        // 서로 다른 값으로 취급한다(PostgreSQL 기본 동작). 이게 깨지면 둘째 insert 가 실패한다.
        Problem first = newProblem(departmentId, null);
        Problem second = newProblem(departmentId, null);

        problemDao.insert(first);
        problemDao.insert(second);

        assertNotNull(first.getId());
        assertNotNull(second.getId());
        assertNotEquals(first.getId(), second.getId());
    }

    @Test
    void updateDepartmentAndSourceNumber_writesBothColumnsToTheRow() {
        // 이 SQL 은 서비스 단위 테스트의 Mockito.verify 로만 고정돼 있었다 — 목은 자바 호출만
        // 확인할 뿐 SQL 은 한 글자도 실행하지 않는다. 두 컬럼을 서로 바꿔 써도 전 테스트가
        // 초록이었다. 부서와 번호가 <b>둘 다</b> 바뀌었는지 실제 행에서 읽어 확인한다.
        Problem problem = newProblem(departmentId, 3);
        problemDao.insert(problem);
        Department target = insertDepartment();

        problemDao.updateDepartmentAndSourceNumber(problem.getId(), target.getId(), 41);

        Problem reloaded = problemDao.findById(problem.getId());
        assertEquals(target.getId(), reloaded.getDepartmentId(), "부서가 옮겨져야 한다");
        assertEquals(Integer.valueOf(41), reloaded.getSourceNumber(), "번호가 새 부서 기준으로 다시 매겨져야 한다");
    }

    @Test
    void update_persistsSourceNumber() {
        // <update id="update"> 에 source_number = #{sourceNumber} 가 들어갔지만 그 값이 행까지
        // 가는지 단언하는 테스트가 없었다. 이 절이 빠지면 수정 화면의 번호 변경이 조용히 사라진다.
        Problem problem = newProblem(departmentId, 3);
        problemDao.insert(problem);

        problem.setContent("수정된 문제");
        problem.setSourceNumber(44);
        problemDao.update(problem);

        Problem reloaded = problemDao.findById(problem.getId());
        assertEquals(Integer.valueOf(44), reloaded.getSourceNumber());
        assertEquals("수정된 문제", reloaded.getContent());
    }

    private Department insertDepartment() {
        Department department = new Department();
        department.setName("테스트부서");
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

    private Problem newProblem(Long departmentId, Integer sourceNumber) {
        Problem problem = new Problem();
        problem.setType(ProblemType.SHORT_ANSWER);
        problem.setContent("테스트 문제");
        problem.setStatus(ProblemStatus.ACTIVE);
        problem.setDepartmentId(departmentId);
        problem.setSourceNumber(sourceNumber);
        problem.setCreatedBy(userId);
        return problem;
    }
}
