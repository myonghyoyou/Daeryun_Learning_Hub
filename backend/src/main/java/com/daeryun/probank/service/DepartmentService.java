package com.daeryun.probank.service;

import com.daeryun.probank.common.AuthUser;
import com.daeryun.probank.dto.department.DepartmentCreateRequest;
import com.daeryun.probank.dto.department.DepartmentResponse;
import com.daeryun.probank.dto.department.DepartmentUpdateRequest;

import java.util.List;

public interface DepartmentService {
    List<DepartmentResponse> list();
    void create(DepartmentCreateRequest request, AuthUser actor);
    void update(Long id, DepartmentUpdateRequest request, AuthUser actor);
}
