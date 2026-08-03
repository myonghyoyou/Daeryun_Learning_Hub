package com.daeryun.probank.dao;

import com.daeryun.probank.domain.Department;
import com.daeryun.probank.domain.ExcelUploadLog;
import com.daeryun.probank.domain.Status;
import com.daeryun.probank.domain.UploadTargetType;
import com.daeryun.probank.domain.User;
import com.daeryun.probank.domain.UserRole;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

@SpringBootTest
@ActiveProfiles("test")
@Transactional
class ExcelUploadLogDaoTest {

    @Autowired
    private DepartmentDao departmentDao;

    @Autowired
    private UserDao userDao;

    @Autowired
    private ExcelUploadLogDao excelUploadLogDao;

    @Test
    void insertAndFindAll_roundTripsTargetTypeAsEnum() {
        Department department = insertDepartment();
        User user = insertUser(department);

        ExcelUploadLog log = new ExcelUploadLog();
        log.setUploadedBy(user.getId());
        log.setDepartmentId(department.getId());
        log.setTargetType(UploadTargetType.ACCOUNT);
        log.setFileName("account-upload.xlsx");
        log.setTotalRows(10);
        log.setSuccessRows(9);
        log.setFailRows(1);
        log.setErrorDetail("2행: 이메일 형식 오류");
        excelUploadLogDao.insert(log);

        List<ExcelUploadLog> found = excelUploadLogDao.findAll(UploadTargetType.ACCOUNT, department.getId());

        assertEquals(1, found.size());
        ExcelUploadLog result = found.get(0);
        assertEquals(UploadTargetType.ACCOUNT, result.getTargetType());
        assertEquals(user.getId(), result.getUploadedBy());
        assertEquals(department.getId(), result.getDepartmentId());
        assertEquals("account-upload.xlsx", result.getFileName());
        assertEquals(10, result.getTotalRows());
        assertEquals(9, result.getSuccessRows());
        assertEquals(1, result.getFailRows());
        assertEquals("2행: 이메일 형식 오류", result.getErrorDetail());
    }

    @Test
    void findAll_filtersByTargetType() {
        Department department = insertDepartment();
        User user = insertUser(department);

        excelUploadLogDao.insert(newLog(user, department, UploadTargetType.ACCOUNT));
        excelUploadLogDao.insert(newLog(user, department, UploadTargetType.PROBLEM));

        List<ExcelUploadLog> problemLogs = excelUploadLogDao.findAll(UploadTargetType.PROBLEM, department.getId());

        assertEquals(1, problemLogs.size());
        assertEquals(UploadTargetType.PROBLEM, problemLogs.get(0).getTargetType());
    }

    @Test
    void findAll_treatsDepartmentIdAsOptionalFilter() {
        Department departmentA = insertDepartment();
        Department departmentB = insertDepartment();
        User userA = insertUser(departmentA);
        User userB = insertUser(departmentB);

        excelUploadLogDao.insert(newLog(userA, departmentA, UploadTargetType.ACCOUNT));
        excelUploadLogDao.insert(newLog(userB, departmentB, UploadTargetType.ACCOUNT));

        List<ExcelUploadLog> filteredByDepartment = excelUploadLogDao.findAll(UploadTargetType.ACCOUNT, departmentA.getId());
        assertEquals(1, filteredByDepartment.size());
        assertEquals(departmentA.getId(), filteredByDepartment.get(0).getDepartmentId());

        List<ExcelUploadLog> unfiltered = excelUploadLogDao.findAll(UploadTargetType.ACCOUNT, null);
        assertTrue(unfiltered.size() >= 2);
    }

    @Test
    void insert_allowsNullDepartmentIdForAccountUploadAcrossDepartments() {
        User user = insertUser(insertDepartment());

        ExcelUploadLog log = new ExcelUploadLog();
        log.setUploadedBy(user.getId());
        log.setDepartmentId(null);
        log.setTargetType(UploadTargetType.ACCOUNT);
        log.setFileName("mixed-departments.xlsx");
        log.setTotalRows(5);
        log.setSuccessRows(5);
        log.setFailRows(0);
        excelUploadLogDao.insert(log);

        List<ExcelUploadLog> found = excelUploadLogDao.findAll(UploadTargetType.ACCOUNT, null);

        ExcelUploadLog result = found.stream()
                .filter(item -> "mixed-departments.xlsx".equals(item.getFileName()))
                .findFirst()
                .orElseThrow(() -> new AssertionError("삽입한 로그를 찾지 못했다"));
        assertNull(result.getDepartmentId());
    }

    private ExcelUploadLog newLog(User user, Department department, UploadTargetType targetType) {
        ExcelUploadLog log = new ExcelUploadLog();
        log.setUploadedBy(user.getId());
        log.setDepartmentId(department.getId());
        log.setTargetType(targetType);
        log.setFileName(targetType + "-upload-" + System.nanoTime() + ".xlsx");
        log.setTotalRows(1);
        log.setSuccessRows(1);
        log.setFailRows(0);
        return log;
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
        user.setMustChangePassword(true);
        userDao.insert(user);
        return user;
    }
}
