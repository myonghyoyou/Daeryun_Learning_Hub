package com.daeryun.probank.config;

import com.daeryun.probank.dao.DepartmentDao;
import com.daeryun.probank.dao.UserDao;
import com.daeryun.probank.domain.Department;
import com.daeryun.probank.domain.Status;
import com.daeryun.probank.domain.User;
import com.daeryun.probank.domain.UserRole;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.CommandLineRunner;
import org.springframework.context.annotation.Profile;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;

@Component
@Profile("!test")
public class SuperAdminBootstrapRunner implements CommandLineRunner {

    private static final String DEFAULT_DEPARTMENT_CODE = "HQ";
    private static final String DEFAULT_DEPARTMENT_NAME = "본사";

    private final DepartmentDao departmentDao;
    private final UserDao userDao;
    private final PasswordEncoder passwordEncoder;
    private final String bootstrapEmployeeNo;
    private final String bootstrapEmail;
    private final String bootstrapPassword;

    public SuperAdminBootstrapRunner(
            DepartmentDao departmentDao,
            UserDao userDao,
            PasswordEncoder passwordEncoder,
            @Value("${app.bootstrap.super-admin.employee-no}") String bootstrapEmployeeNo,
            @Value("${app.bootstrap.super-admin.email}") String bootstrapEmail,
            @Value("${app.bootstrap.super-admin.password}") String bootstrapPassword) {
        this.departmentDao = departmentDao;
        this.userDao = userDao;
        this.passwordEncoder = passwordEncoder;
        this.bootstrapEmployeeNo = bootstrapEmployeeNo;
        this.bootstrapEmail = bootstrapEmail;
        this.bootstrapPassword = bootstrapPassword;
    }

    @Override
    public void run(String... args) {
        if (userDao.existsSuperAdmin()) {
            return;
        }

        Department department = departmentDao.findByCode(DEFAULT_DEPARTMENT_CODE);
        if (department == null) {
            department = new Department();
            department.setName(DEFAULT_DEPARTMENT_NAME);
            department.setCode(DEFAULT_DEPARTMENT_CODE);
            department.setStatus(Status.ACTIVE);
            departmentDao.insert(department);
        }

        User superAdmin = new User();
        superAdmin.setEmployeeNo(bootstrapEmployeeNo);
        superAdmin.setName("총괄관리자");
        superAdmin.setEmail(bootstrapEmail);
        superAdmin.setPasswordHash(passwordEncoder.encode(bootstrapPassword));
        superAdmin.setDepartmentId(department.getId());
        superAdmin.setRole(UserRole.SUPER_ADMIN);
        superAdmin.setStatus(Status.ACTIVE);
        superAdmin.setMustChangePassword(true);
        userDao.insert(superAdmin);
    }
}
