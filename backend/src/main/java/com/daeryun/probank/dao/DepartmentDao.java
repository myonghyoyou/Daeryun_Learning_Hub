package com.daeryun.probank.dao;

import com.daeryun.probank.domain.Department;

import java.util.List;

public interface DepartmentDao {
    Department findByCode(String code);
    void insert(Department department);
    Department findById(Long id);
    List<Department> findAll();
    void update(Department department);
}
