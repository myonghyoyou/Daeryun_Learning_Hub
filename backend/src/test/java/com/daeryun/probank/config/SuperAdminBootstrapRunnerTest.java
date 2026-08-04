package com.daeryun.probank.config;

import com.daeryun.probank.dao.DepartmentDao;
import com.daeryun.probank.dao.UserDao;
import com.daeryun.probank.domain.Department;
import com.daeryun.probank.domain.User;
import com.daeryun.probank.domain.UserRole;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.mockito.Mockito;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class SuperAdminBootstrapRunnerTest {

    /**
     * existsSuperAdmin() 은 "활성" SUPER_ADMIN 이 있는지를 뜻한다(UserMapper.xml).
     * 이 러너의 분기 자체는 그대로지만, 비활성 총괄 관리자만 남은 상태에서는 false 가
     * 돌아와 부트스트랩 계정이 다시 만들어지는 복구 경로가 열린다.
     */
    @Test
    void whenNoActiveSuperAdminExists_createsDepartmentAndSuperAdmin() throws Exception {
        DepartmentDao departmentDao = Mockito.mock(DepartmentDao.class);
        UserDao userDao = Mockito.mock(UserDao.class);
        Mockito.when(userDao.existsSuperAdmin()).thenReturn(false);
        Mockito.when(departmentDao.findByCode("HQ")).thenReturn(null);

        SuperAdminBootstrapRunner runner = new SuperAdminBootstrapRunner(
                departmentDao, userDao, new BCryptPasswordEncoder(), "admin", "admin@company.local", "changeme1234");

        runner.run();

        ArgumentCaptor<Department> departmentCaptor = ArgumentCaptor.forClass(Department.class);
        Mockito.verify(departmentDao).insert(departmentCaptor.capture());
        assertEquals("HQ", departmentCaptor.getValue().getCode());

        ArgumentCaptor<User> userCaptor = ArgumentCaptor.forClass(User.class);
        Mockito.verify(userDao).insert(userCaptor.capture());
        assertEquals("admin", userCaptor.getValue().getEmployeeNo());
        assertEquals(UserRole.SUPER_ADMIN, userCaptor.getValue().getRole());
        assertTrue(userCaptor.getValue().isMustChangePassword());
    }

    @Test
    void whenAnActiveSuperAdminAlreadyExists_doesNothing() throws Exception {
        DepartmentDao departmentDao = Mockito.mock(DepartmentDao.class);
        UserDao userDao = Mockito.mock(UserDao.class);
        Mockito.when(userDao.existsSuperAdmin()).thenReturn(true);

        SuperAdminBootstrapRunner runner = new SuperAdminBootstrapRunner(
                departmentDao, userDao, new BCryptPasswordEncoder(), "admin", "admin@company.local", "changeme1234");

        runner.run();

        Mockito.verify(userDao, Mockito.never()).insert(Mockito.any());
        Mockito.verify(departmentDao, Mockito.never()).findByCode(Mockito.any());
        Mockito.verify(departmentDao, Mockito.never()).insert(Mockito.any());
    }
}
