package com.daeryun.probank.service;

import com.daeryun.probank.dao.DepartmentDao;
import com.daeryun.probank.dao.UserDao;
import com.daeryun.probank.domain.Department;
import com.daeryun.probank.domain.Status;
import com.daeryun.probank.domain.User;
import com.daeryun.probank.domain.UserRole;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;

/**
 * provision(...) 은 REQUIRES_NEW 로 별도 트랜잭션을 연다(Approved Amendments: "엑셀 각 행은 독립
 * 트랜잭션으로 처리한다"). 이 클래스는 그 전파 속성이 실제로 필요함을 증명한다: 두 번의 provision 호출을
 * 하나의 바깥쪽(앰비언트) 트랜잭션 안에서 실행했을 때, 두 번째 호출이 메일 발송 실패로 던진 예외가
 * 바깥쪽 트랜잭션을 rollback-only 로 표시하더라도(일반 REQUIRED 전파였다면 첫 번째 호출까지 함께
 * 롤백됐을 상황), REQUIRES_NEW 덕분에 첫 번째 호출은 독립적으로 커밋되어 남아 있어야 한다.
 * <p>
 * 주의: 테스트 메서드 자체에는 {@code @Transactional} 을 붙이지 않는다(UserAdminServiceImplIntegrationTest
 * 와 같은 이유). 대신 TransactionTemplate 으로 명시적인 바깥쪽 트랜잭션을 만들어 앰비언트 트랜잭션을 흉내낸다.
 */
@SpringBootTest
@ActiveProfiles("test")
class AccountProvisioningServiceImplIntegrationTest {

    @Autowired
    private AccountProvisioningService accountProvisioningService;

    @Autowired
    private UserDao userDao;

    @Autowired
    private DepartmentDao departmentDao;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Autowired
    private PlatformTransactionManager transactionManager;

    @MockBean
    private MailService mailService;

    @Test
    void provision_withRequiresNew_isolatesEachRowFromAmbientTransactionFailure() {
        String suffix = String.valueOf(System.nanoTime());
        Department department = insertDepartment(suffix);
        User actorUser = insertActor(department, suffix);
        String succeedingEmployeeNo = "OK-" + suffix;
        String failingEmployeeNo = "FAIL-" + suffix;

        Mockito.doNothing()
                .when(mailService)
                .sendTemporaryPassword(Mockito.eq(email(succeedingEmployeeNo)), Mockito.anyString(), Mockito.anyString());
        Mockito.doThrow(new RuntimeException("SMTP 연결 실패"))
                .when(mailService)
                .sendTemporaryPassword(Mockito.eq(email(failingEmployeeNo)), Mockito.anyString(), Mockito.anyString());

        TransactionTemplate outerTransaction = new TransactionTemplate(transactionManager);
        try {
            outerTransaction.execute(status -> {
                accountProvisioningService.provision(newUser(department, succeedingEmployeeNo), "Temp1234!", actorUser.getId());
                try {
                    accountProvisioningService.provision(newUser(department, failingEmployeeNo), "Temp1234!", actorUser.getId());
                } catch (RuntimeException expected) {
                    // 행 2의 실패를 여기서 흡수한다 — ExcelAccountUploadServiceImpl.processRow 가 하는 것과 동일하다.
                }
                return null;
            });

            assertNotNull(userDao.findByEmployeeNo(succeedingEmployeeNo),
                    "REQUIRES_NEW 로 실행된 첫 번째 행은 바깥 트랜잭션의 이후 실패와 무관하게 커밋되어 있어야 한다");
            assertNull(userDao.findByEmployeeNo(failingEmployeeNo),
                    "메일 발송에 실패한 두 번째 행은 자신의 트랜잭션만 롤백되어야 한다");
        } finally {
            cleanUp(succeedingEmployeeNo, failingEmployeeNo, actorUser.getEmployeeNo(), department.getId());
        }
    }

    private User insertActor(Department department, String suffix) {
        User actor = new User();
        actor.setEmployeeNo("ACTOR-" + suffix);
        actor.setName("액터");
        actor.setEmail("actor-" + suffix + "@company.local");
        actor.setPasswordHash("hashed");
        actor.setDepartmentId(department.getId());
        actor.setRole(UserRole.SUPER_ADMIN);
        actor.setStatus(Status.ACTIVE);
        actor.setMustChangePassword(false);
        userDao.insert(actor);
        return actor;
    }

    private User newUser(Department department, String employeeNo) {
        User user = new User();
        user.setEmployeeNo(employeeNo);
        user.setName("테스트");
        user.setEmail(email(employeeNo));
        user.setPasswordHash("hashed");
        user.setDepartmentId(department.getId());
        user.setRole(UserRole.EMPLOYEE);
        user.setStatus(Status.ACTIVE);
        user.setMustChangePassword(true);
        return user;
    }

    private String email(String employeeNo) {
        return employeeNo.toLowerCase() + "@company.local";
    }

    private Department insertDepartment(String suffix) {
        Department department = new Department();
        department.setName("테스트부서");
        department.setCode("TEST-DEPT-" + suffix);
        department.setStatus(Status.ACTIVE);
        departmentDao.insert(department);
        return department;
    }

    private void cleanUp(String succeedingEmployeeNo, String failingEmployeeNo, String actorEmployeeNo, Long departmentId) {
        jdbcTemplate.update("DELETE FROM audit_logs WHERE actor_id IN "
                        + "(SELECT id FROM users WHERE employee_no IN (?, ?, ?))",
                succeedingEmployeeNo, failingEmployeeNo, actorEmployeeNo);
        jdbcTemplate.update("DELETE FROM users WHERE employee_no IN (?, ?, ?)",
                succeedingEmployeeNo, failingEmployeeNo, actorEmployeeNo);
        jdbcTemplate.update("DELETE FROM departments WHERE id = ?", departmentId);
    }
}
