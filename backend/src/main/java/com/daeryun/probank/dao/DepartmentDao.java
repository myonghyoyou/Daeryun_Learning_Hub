package com.daeryun.probank.dao;

import com.daeryun.probank.domain.Department;

import java.util.List;

public interface DepartmentDao {
    Department findByCode(String code);
    void insert(Department department);
    Department findById(Long id);
    List<Department> findAll();
    void update(Department department);

    /** 활성 부서만. 직원 화면 선택지용이다 — 비활성 부서는 고를 수 없어야 한다. */
    List<Department> findAllActive();
}
