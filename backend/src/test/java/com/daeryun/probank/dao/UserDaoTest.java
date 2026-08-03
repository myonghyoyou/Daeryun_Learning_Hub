package com.daeryun.probank.dao;

import com.daeryun.probank.domain.Department;
import com.daeryun.probank.domain.Status;
import com.daeryun.probank.domain.User;
import com.daeryun.probank.domain.UserRole;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

@SpringBootTest
@Transactional
class UserDaoTest {

    @Autowired
    private DepartmentDao departmentDao;

    @Autowired
    private UserDao userDao;

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
    void incrementFailedLogin_persistsFailedLoginCount() {
        Department department = insertDepartment();
        User user = insertUser(department, UserRole.EMPLOYEE);

        userDao.incrementFailedLogin(user.getId(), 3);

        User found = userDao.findByEmployeeNo(user.getEmployeeNo());
        assertEquals(3, found.getFailedLoginCount());
    }

    @Test
    void lockAccount_setsLockedUntilAndResetsFailedLoginCount() {
        Department department = insertDepartment();
        User user = insertUser(department, UserRole.EMPLOYEE);
        userDao.incrementFailedLogin(user.getId(), 5);

        LocalDateTime lockedUntil = LocalDateTime.now().plusMinutes(15).withNano(0);
        userDao.lockAccount(user.getId(), lockedUntil);

        User found = userDao.findByEmployeeNo(user.getEmployeeNo());
        assertEquals(lockedUntil, found.getLockedUntil());
        assertEquals(0, found.getFailedLoginCount());
    }

    @Test
    void resetFailedLogin_clearsCountAndLockedUntil() {
        Department department = insertDepartment();
        User user = insertUser(department, UserRole.EMPLOYEE);
        userDao.incrementFailedLogin(user.getId(), 5);
        userDao.lockAccount(user.getId(), LocalDateTime.now().plusMinutes(15).withNano(0));

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
