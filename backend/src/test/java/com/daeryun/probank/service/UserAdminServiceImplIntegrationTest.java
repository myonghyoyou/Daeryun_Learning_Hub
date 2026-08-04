package com.daeryun.probank.service;

import com.daeryun.probank.common.AuthUser;
import com.daeryun.probank.dao.DepartmentDao;
import com.daeryun.probank.dao.UserDao;
import com.daeryun.probank.domain.Department;
import com.daeryun.probank.domain.Status;
import com.daeryun.probank.domain.User;
import com.daeryun.probank.domain.UserRole;
import com.daeryun.probank.dto.user.UserCreateRequest;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;

import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;

/**
 * create(...) 는 @Transactional 로 userDao.insert -> mailService.sendTemporaryPassword ->
 * auditLogService.record 를 하나의 트랜잭션으로 묶는다(Resolution 1). 이 클래스는 그 사실을
 * 목이 아니라 실제 스프링 컨텍스트와 실제 DB 트랜잭션으로 검증한다.
 * <p>
 * 주의: 테스트 클래스/메서드에 {@code @Transactional} 을 붙이지 않는다. 붙이면 테스트 자체가
 * 바깥쪽 트랜잭션을 열어 create(...) 를 그 안에 감싸버리므로, insert 가 실제로 롤백되는지가 아니라
 * "테스트가 끝나면 어차피 다 지워진다"는 것만 확인하게 되어 검증이 무의미해진다. 대신 각 테스트가
 * 만든 행은 finally 에서 직접 지운다.
 */
@SpringBootTest
@ActiveProfiles("test")
class UserAdminServiceImplIntegrationTest {

    @Autowired
    private UserAdminService userAdminService;

    @Autowired
    private UserDao userDao;

    @Autowired
    private DepartmentDao departmentDao;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @MockBean
    private MailService mailService;

    @Test
    void create_whenMailServiceFails_rollsBackInsertedUser() {
        String suffix = String.valueOf(System.nanoTime());
        Department department = insertDepartment(suffix);
        User actorUser = insertUser(department, UserRole.SUPER_ADMIN, "ACTOR-" + suffix);
        AuthUser actor = new AuthUser(actorUser.getId(), actorUser.getEmployeeNo(), actorUser.getName(),
                UserRole.SUPER_ADMIN, null, false);

        String newEmployeeNo = "NEW-" + suffix;
        String newEmail = "new-" + suffix + "@company.local";
        Mockito.doThrow(new RuntimeException("SMTP 연결 실패"))
                .when(mailService).sendTemporaryPassword(Mockito.anyString(), Mockito.anyString(), Mockito.anyString());

        UserCreateRequest request = new UserCreateRequest();
        request.setEmployeeNo(newEmployeeNo);
        request.setName("홍길동");
        request.setEmail(newEmail);
        request.setDepartmentId(department.getId());
        request.setRole(UserRole.EMPLOYEE);

        try {
            assertThrows(RuntimeException.class, () -> userAdminService.create(request, actor));

            assertNull(userDao.findByEmployeeNo(newEmployeeNo),
                    "메일 발송 실패로 트랜잭션이 롤백되어 새 계정 행이 남아있으면 안 된다");
        } finally {
            cleanUp(newEmployeeNo, actorUser.getEmployeeNo(), department.getId());
        }
    }

    @Test
    void create_onSuccess_commitsInsertedUser() {
        String suffix = String.valueOf(System.nanoTime());
        Department department = insertDepartment(suffix);
        User actorUser = insertUser(department, UserRole.SUPER_ADMIN, "ACTOR-" + suffix);
        AuthUser actor = new AuthUser(actorUser.getId(), actorUser.getEmployeeNo(), actorUser.getName(),
                UserRole.SUPER_ADMIN, null, false);

        String newEmployeeNo = "NEW-" + suffix;
        String newEmail = "new-" + suffix + "@company.local";

        UserCreateRequest request = new UserCreateRequest();
        request.setEmployeeNo(newEmployeeNo);
        request.setName("홍길동");
        request.setEmail(newEmail);
        request.setDepartmentId(department.getId());
        request.setRole(UserRole.EMPLOYEE);

        try {
            userAdminService.create(request, actor);

            User found = userDao.findByEmployeeNo(newEmployeeNo);
            assertNotNull(found, "메일 발송이 성공하면 트랜잭션이 커밋되어 새 계정 행이 조회되어야 한다");
        } finally {
            cleanUp(newEmployeeNo, actorUser.getEmployeeNo(), department.getId());
        }
    }

    private Department insertDepartment(String suffix) {
        Department department = new Department();
        department.setName("테스트부서");
        department.setCode("TEST-DEPT-" + suffix);
        department.setStatus(Status.ACTIVE);
        departmentDao.insert(department);
        return department;
    }

    private User insertUser(Department department, UserRole role, String employeeNo) {
        User user = new User();
        user.setEmployeeNo(employeeNo);
        user.setName("액터");
        user.setEmail(employeeNo.toLowerCase() + "@company.local");
        user.setPasswordHash("hashed");
        user.setDepartmentId(department.getId());
        user.setRole(role);
        user.setStatus(Status.ACTIVE);
        user.setMustChangePassword(true);
        userDao.insert(user);
        return user;
    }

    private void cleanUp(String newEmployeeNo, String actorEmployeeNo, Long departmentId) {
        // audit_logs.actor_id 가 users(id) 를 참조하므로(FK, ON DELETE 미지정) users 행보다 먼저 지운다.
        jdbcTemplate.update("DELETE FROM audit_logs WHERE actor_id IN "
                + "(SELECT id FROM users WHERE employee_no IN (?, ?))", newEmployeeNo, actorEmployeeNo);
        jdbcTemplate.update("DELETE FROM users WHERE employee_no IN (?, ?)", newEmployeeNo, actorEmployeeNo);
        jdbcTemplate.update("DELETE FROM departments WHERE id = ?", departmentId);
    }
}
