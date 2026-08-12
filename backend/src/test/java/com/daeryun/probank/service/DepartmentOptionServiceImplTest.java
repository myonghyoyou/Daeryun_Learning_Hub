package com.daeryun.probank.service;

import com.daeryun.probank.dao.DepartmentDao;
import com.daeryun.probank.domain.Department;
import com.daeryun.probank.dto.department.DepartmentOption;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;

import java.util.Arrays;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;

class DepartmentOptionServiceImplTest {

    @Test
    void list_mapsOnlyIdNameCode() {
        DepartmentDao departmentDao = Mockito.mock(DepartmentDao.class);
        Department dev = new Department();
        dev.setId(862L);
        dev.setName("개발팀");
        dev.setCode("DEV");
        Mockito.when(departmentDao.findAllActive()).thenReturn(Arrays.asList(dev));

        List<DepartmentOption> result = new DepartmentOptionServiceImpl(departmentDao).list();

        assertEquals(1, result.size());
        assertEquals(862L, result.get(0).getId());
        assertEquals("개발팀", result.get(0).getName());
        assertEquals("DEV", result.get(0).getCode());
        Mockito.verify(departmentDao).findAllActive();
        Mockito.verify(departmentDao, Mockito.never()).findAll();
    }
}
