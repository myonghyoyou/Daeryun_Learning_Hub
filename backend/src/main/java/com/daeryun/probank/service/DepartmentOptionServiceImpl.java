package com.daeryun.probank.service;

import com.daeryun.probank.dao.DepartmentDao;
import com.daeryun.probank.dto.department.DepartmentOption;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.stream.Collectors;

@Service
public class DepartmentOptionServiceImpl implements DepartmentOptionService {

    private final DepartmentDao departmentDao;

    public DepartmentOptionServiceImpl(DepartmentDao departmentDao) {
        this.departmentDao = departmentDao;
    }

    @Override
    public List<DepartmentOption> list() {
        return departmentDao.findAllActive().stream()
                .map(d -> new DepartmentOption(d.getId(), d.getName(), d.getCode()))
                .collect(Collectors.toList());
    }
}
