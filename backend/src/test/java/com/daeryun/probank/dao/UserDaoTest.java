package com.daeryun.probank.dao;

import com.daeryun.probank.domain.Department;
import com.daeryun.probank.domain.Status;
import com.daeryun.probank.domain.User;
import com.daeryun.probank.domain.UserRole;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

@SpringBootTest
@ActiveProfiles("test")
@Transactional
class UserDaoTest {

    @Autowired
    private DepartmentDao departmentDao;

    @Autowired
    private UserDao userDao;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Test
    void insertAndFindByEmployeeNo() {
        Department department = new Department();
        department.setName("테스트부서");
        department.setCode("TEST-DEPT-" + System.nanoTime());
        department.setStatus(Status.ACTIVE);
        departmentDao.insert(department);

        User user = new User();
        user.setEmployeeNo("EMP-" + System.nanoTime());
        user.setName("홍길동");
        user.setEmail("user-" + System.nanoTime() + "@company.local");
        user.setPasswordHash("hashed");
        user.setDepartmentId(department.getId());
        user.setRole(UserRole.EMPLOYEE);
        user.setStatus(Status.ACTIVE);
        user.setMustChangePassword(true);
        userDao.insert(user);

        User found = userDao.findByEmployeeNo(user.getEmployeeNo());

        assertEquals(user.getName(), found.getName());
        assertEquals(UserRole.EMPLOYEE, found.getRole());
        assertNull(found.getLockedUntil());
    }

    @Test
    void incrementFailedLogin_incrementsInTheDatabaseWithoutAnAbsoluteValueFromJava() {
        Department department = insertDepartment();
        User user = insertUser(department, UserRole.EMPLOYEE);
        LocalDateTime lockedUntil = LocalDateTime.now().plusMinutes(15).withNano(0);

        // 임계값(5)에 도달하지 않는 3 번의 실패는 카운트만 1 씩 올리고 잠그지 않는다.
        assertNull(userDao.incrementFailedLogin(user.getId(), 5, lockedUntil));
        assertEquals(1, userDao.findByEmployeeNo(user.getEmployeeNo()).getFailedLoginCount());

        assertNull(userDao.incrementFailedLogin(user.getId(), 5, lockedUntil));
        assertNull(userDao.incrementFailedLogin(user.getId(), 5, lockedUntil));

        User found = userDao.findByEmployeeNo(user.getEmployeeNo());
        assertEquals(3, found.getFailedLoginCount());
        assertNull(found.getLockedUntil());
    }

    @Test
    void incrementFailedLogin_appliesLockInTheSameStatementWhenThresholdIsReached() {
        Department department = insertDepartment();
        User user = insertUser(department, UserRole.EMPLOYEE);
        LocalDateTime lockedUntil = LocalDateTime.now().plusMinutes(15).withNano(0);

        for (int attempt = 1; attempt <= 4; attempt++) {
            assertNull(userDao.incrementFailedLogin(user.getId(), 5, lockedUntil));
        }

        // 5 번째 실패에서 같은 문장이 카운트 증가와 잠금을 동시에 적용하고,
        // 갱신 후의 locked_until 을 돌려준다.
        LocalDateTime returned = userDao.incrementFailedLogin(user.getId(), 5, lockedUntil);
        assertEquals(lockedUntil, returned);

        User found = userDao.findByEmployeeNo(user.getEmployeeNo());
        assertEquals(lockedUntil, found.getLockedUntil());
        assertEquals(5, found.getFailedLoginCount());
    }

    /**
     * 이 테스트만 테스트 트랜잭션 밖에서 실행한다(NOT_SUPPORTED). 별도 스레드들이
     * 각자의 커넥션으로 같은 행을 동시에 갱신해야 하는데, 테스트 트랜잭션 안에서
     * 만든 행은 커밋되지 않아 다른 커넥션에서 보이지 않기 때문이다.
     * 대신 만든 데이터는 finally 에서 직접 정리한다.
     */
    @Test
    @Transactional(propagation = Propagation.NOT_SUPPORTED)
    void incrementFailedLogin_isAtomicUnderConcurrentAttempts() throws Exception {
        String suffix = String.valueOf(System.nanoTime());
        String departmentCode = "TEST-DEPT-" + suffix;
        String employeeNo = "EMP-CONCURRENT-" + suffix;
        jdbcTemplate.update(
                "INSERT INTO departments (name, code, status) VALUES ('테스트부서', ?, 'ACTIVE')", departmentCode);
        Long departmentId = jdbcTemplate.queryForObject(
                "SELECT id FROM departments WHERE code = ?", Long.class, departmentCode);
        jdbcTemplate.update(
                "INSERT INTO users (employee_no, name, email, password_hash, department_id, role, status,"
                        + " must_change_password) VALUES (?, '동시성', ?, 'hashed', ?, 'EMPLOYEE', 'ACTIVE', TRUE)",
                employeeNo, employeeNo + "@company.local", departmentId);
        Long userId = jdbcTemplate.queryForObject(
                "SELECT id FROM users WHERE employee_no = ?", Long.class, employeeNo);

        int threads = 8;
        LocalDateTime lockedUntil = LocalDateTime.now().plusMinutes(15).withNano(0);
        ExecutorService pool = Executors.newFixedThreadPool(threads);
        CountDownLatch start = new CountDownLatch(1);
        try {
            List<Future<?>> futures = new ArrayList<>();
            for (int i = 0; i < threads; i++) {
                futures.add(pool.submit(() -> {
                    start.await();
                    userDao.incrementFailedLogin(userId, 5, lockedUntil);
                    return null;
                }));
            }
            start.countDown();
            for (Future<?> future : futures) {
                future.get(30, TimeUnit.SECONDS);
            }

            // 절대값 덮어쓰기였다면 동시에 같은 값을 읽은 스레드들이 같은 값을 써서
            // 카운트가 시도 횟수보다 작아진다. DB 안에서 증가시키면 정확히 8 이다.
            Integer count = jdbcTemplate.queryForObject(
                    "SELECT failed_login_count FROM users WHERE id = ?", Integer.class, userId);
            assertEquals(threads, count.intValue());
        } finally {
            pool.shutdownNow();
            jdbcTemplate.update("DELETE FROM users WHERE id = ?", userId);
            jdbcTemplate.update("DELETE FROM departments WHERE id = ?", departmentId);
        }
    }

    @Test
    void lockAccount_setsLockedUntilAndResetsFailedLoginCount() {
        Department department = insertDepartment();
        User user = insertUser(department, UserRole.EMPLOYEE);
        LocalDateTime lockedUntil = LocalDateTime.now().plusMinutes(15).withNano(0);
        userDao.incrementFailedLogin(user.getId(), 5, lockedUntil);

        userDao.lockAccount(user.getId(), lockedUntil);

        User found = userDao.findByEmployeeNo(user.getEmployeeNo());
        assertEquals(lockedUntil, found.getLockedUntil());
        assertEquals(0, found.getFailedLoginCount());
    }

    @Test
    void resetFailedLogin_clearsCountAndLockedUntil() {
        Department department = insertDepartment();
        User user = insertUser(department, UserRole.EMPLOYEE);
        LocalDateTime lockedUntil = LocalDateTime.now().plusMinutes(15).withNano(0);
        for (int attempt = 1; attempt <= 5; attempt++) {
            userDao.incrementFailedLogin(user.getId(), 5, lockedUntil);
        }
        User locked = userDao.findByEmployeeNo(user.getEmployeeNo());
        assertEquals(5, locked.getFailedLoginCount());
        assertEquals(lockedUntil, locked.getLockedUntil());

        userDao.resetFailedLogin(user.getId());

        User found = userDao.findByEmployeeNo(user.getEmployeeNo());
        assertEquals(0, found.getFailedLoginCount());
        assertNull(found.getLockedUntil());
    }

    @Test
    void updateLastLoginAt_persistsTimestamp() {
        Department department = insertDepartment();
        User user = insertUser(department, UserRole.EMPLOYEE);

        LocalDateTime lastLoginAt = LocalDateTime.now().withNano(0);
        userDao.updateLastLoginAt(user.getId(), lastLoginAt);

        User found = userDao.findByEmployeeNo(user.getEmployeeNo());
        assertEquals(lastLoginAt, found.getLastLoginAt());
    }

    @Test
    void updatePassword_persistsHashAndClearsMustChangePassword() {
        Department department = insertDepartment();
        User user = insertUser(department, UserRole.EMPLOYEE);
        assertTrue(user.isMustChangePassword());

        String newHash = "bcrypt-hash-" + System.nanoTime();
        userDao.updatePassword(user.getId(), newHash);

        User found = userDao.findByEmployeeNo(user.getEmployeeNo());
        assertEquals(newHash, found.getPasswordHash());
        assertFalse(found.isMustChangePassword());
    }

    @Test
    void existsSuperAdmin_falseThenTrueAfterInsertingSuperAdmin() {
        // 이 테스트는 개발 DB를 공유한다. 앱을 dev 프로파일로 한 번이라도 띄우면
        // SuperAdminBootstrapRunner가 SUPER_ADMIN 행을 남기므로 "아직 없다"는 전제가 깨진다.
        // @Transactional 롤백 범위 안에서만 지우므로 개발 DB의 실제 데이터는 보존된다.
        jdbcTemplate.update("DELETE FROM users WHERE role = 'SUPER_ADMIN'");

        assertFalse(userDao.existsSuperAdmin());

        Department department = insertDepartment();
        insertUser(department, UserRole.SUPER_ADMIN);

        assertTrue(userDao.existsSuperAdmin());
    }

    @Test
    void findByCode_returnsInsertedDepartmentAndNullForUnknownCode() {
        Department department = insertDepartment();

        Department found = departmentDao.findByCode(department.getCode());
        assertEquals(department.getName(), found.getName());
        assertEquals(Status.ACTIVE, found.getStatus());

        Department notFound = departmentDao.findByCode("UNKNOWN-CODE-" + System.nanoTime());
        assertNull(notFound);
    }

    private Department insertDepartment() {
        Department department = new Department();
        department.setName("테스트부서");
        department.setCode("TEST-DEPT-" + System.nanoTime());
        department.setStatus(Status.ACTIVE);
        departmentDao.insert(department);
        return department;
    }

    private User insertUser(Department department, UserRole role) {
        User user = new User();
        user.setEmployeeNo("EMP-" + System.nanoTime());
        user.setName("홍길동");
        user.setEmail("user-" + System.nanoTime() + "@company.local");
        user.setPasswordHash("hashed");
        user.setDepartmentId(department.getId());
        user.setRole(role);
        user.setStatus(Status.ACTIVE);
        user.setMustChangePassword(true);
        userDao.insert(user);
        return user;
    }
}
