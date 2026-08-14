package com.daeryun.probank.service;

import com.daeryun.probank.common.AuthUser;
import com.daeryun.probank.common.ErrorCode;
import com.daeryun.probank.dao.DepartmentDao;
import com.daeryun.probank.dao.UserDao;
import com.daeryun.probank.domain.Department;
import com.daeryun.probank.domain.ProblemType;
import com.daeryun.probank.domain.Status;
import com.daeryun.probank.domain.User;
import com.daeryun.probank.domain.UserRole;
import com.daeryun.probank.dto.problem.ProblemCreateRequest;
import com.daeryun.probank.exception.BizException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.annotation.Transactional;

import java.util.Collections;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * 실제 DB 를 통과하는 유일한 ProblemService 경로 테스트.
 * <p>
 * 서비스 단위 테스트({@code ProblemServiceImplTest})는 DAO 를 목으로 둔다 — 목은 abort 된
 * 트랜잭션을 흉내내지 않으므로 {@code departmentDao.findById} 가 얌전히 스텁을 돌려주고,
 * catch 블록이 멀쩡해 보인다. DAO 왕복 테스트({@code ProblemSourceNumberDaoTest})는 실제
 * DB 를 쓰지만 예외 <b>타입</b>만 단언하고 서비스를 거치지 않는다. 그 사이의 빈칸으로 QA-1
 * (중복 번호 안내가 "처리 중 오류가 발생하였습니다" 로 나가던 결함)이 295개 테스트를 통과해
 * 브라우저까지 갔다. 이 테스트가 그 빈칸이다.
 */
@SpringBootTest
@ActiveProfiles("test")
@Transactional
class ProblemServiceDuplicateSourceNumberIntegrationTest {

    @Autowired
    private ProblemService problemService;

    @Autowired
    private DepartmentDao departmentDao;

    @Autowired
    private UserDao userDao;

    private Long departmentId;
    private AuthUser actor;

    @BeforeEach
    void setUp() {
        Department department = insertDepartment();
        departmentId = department.getId();
        User user = insertUser(department);
        actor = new AuthUser(user.getId(), user.getEmployeeNo(), user.getName(),
                UserRole.SUPER_ADMIN, departmentId, false);
    }

    @Test
    void create_duplicateSourceNumber_returnsKoreanMessageWithDepartmentName() {
        // 같은 부서 같은 번호로 두 번 저장한다. 두 번째는 UNIQUE 제약에 걸리고, 그때
        // 사용자에게 나가야 하는 문구는 "테스트부서 5번은 이미 있습니다. 다른 번호를 입력하세요." 다.
        //
        // 이 단언이 실제로 무언가를 잡는지는 트랜잭션 abort 때문이다: 실패한 INSERT 뒤에
        // 같은 트랜잭션에서 부서를 SELECT 하면 PostgreSQL 이 25P02 로 다시 터뜨리고,
        // BizException 대신 그 예외가 GlobalExceptionHandler 까지 올라가 -1 이 나간다.
        // 부서명을 쓰기 전에 읽어 두는 수정이 없으면 이 테스트는 통과할 수 없다.
        problemService.create(request(5), departmentId, actor);

        BizException thrown = assertThrows(BizException.class,
                () -> problemService.create(request(5), departmentId, actor));

        assertEquals(ErrorCode.INPUT_VALUE_INVALID, thrown.getErrorCode());
        assertEquals("테스트부서 5번은 이미 있습니다. 다른 번호를 입력하세요.", thrown.getMessage());
        assertTrue(thrown.getMessage().contains("테스트부서"),
                "관리자가 어느 부서의 몇 번인지 알아야 고칠 수 있다: " + thrown.getMessage());
    }

    private ProblemCreateRequest request(Integer sourceNumber) {
        ProblemCreateRequest request = new ProblemCreateRequest();
        request.setType(ProblemType.SHORT_ANSWER);
        request.setContent("테스트 문제");
        request.setAnswers(Collections.singletonList("정답"));
        request.setTags(Collections.emptyList());
        request.setSourceNumber(sourceNumber);
        return request;
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
        user.setRole(UserRole.SUPER_ADMIN);
        user.setStatus(Status.ACTIVE);
        user.setMustChangePassword(false);
        userDao.insert(user);
        return user;
    }
}
