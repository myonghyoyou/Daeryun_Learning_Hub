package com.daeryun.probank.dao;

import com.daeryun.probank.domain.Department;

public interface DepartmentDao {
    Department findByCode(String code);
    void insert(Department department);
}
