package com.daeryun.probank.dao;

import com.daeryun.probank.domain.Department;
import com.daeryun.probank.domain.Problem;
import com.daeryun.probank.domain.ProblemStatus;
import com.daeryun.probank.domain.ProblemType;
import com.daeryun.probank.domain.Status;
import com.daeryun.probank.domain.User;
import com.daeryun.probank.domain.UserRole;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.annotation.Transactional;

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
