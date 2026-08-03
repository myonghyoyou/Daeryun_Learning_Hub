package com.daeryun.probank.service;

import com.daeryun.probank.common.ErrorCode;
import com.daeryun.probank.common.AuthUser;
import com.daeryun.probank.dao.DepartmentDao;
import com.daeryun.probank.domain.Department;
import com.daeryun.probank.domain.Status;
import com.daeryun.probank.dto.department.DepartmentCreateRequest;
import com.daeryun.probank.dto.department.DepartmentResponse;
import com.daeryun.probank.dto.department.DepartmentUpdateRequest;
import com.daeryun.probank.exception.BizException;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Service;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@Service
public class DepartmentServiceImpl implements DepartmentService {

    private static final ObjectMapper OBJECT_MAPPER = new ObjectMapper();

    private final DepartmentDao departmentDao;
    private final AuditLogService auditLogService;

    public DepartmentServiceImpl(DepartmentDao departmentDao, AuditLogService auditLogService) {
        this.departmentDao = departmentDao;
        this.auditLogService = auditLogService;
    }

    @Override
    public List<DepartmentResponse> list() {
        return departmentDao.findAll().stream().map(DepartmentResponse::from).collect(Collectors.toList());
    }

    @Override
    public void create(DepartmentCreateRequest request, AuthUser actor) {
        if (departmentDao.findByCode(request.getCode()) != null) {
            throw new BizException(ErrorCode.INPUT_VALUE_INVALID, "이미 존재하는 부서 코드입니다: " + request.getCode());
        }
        Department department = new Department();
        department.setName(request.getName());
        department.setCode(request.getCode());
        department.setStatus(Status.ACTIVE);
        departmentDao.insert(department);
        auditLogService.record(actor.getUserId(), "DEPARTMENT_CREATED", "DEPARTMENT", department.getId(),
                "{\"code\":\"" + department.getCode() + "\"}");
    }

    @Override
    public void update(Long id, DepartmentUpdateRequest request, AuthUser actor) {
        Department department = departmentDao.findById(id);
        if (department == null) {
            throw new BizException(ErrorCode.INPUT_VALUE_INVALID, "존재하지 않는 부서입니다.");
        }
        department.setName(request.getName());
        department.setStatus(request.getStatus());
        departmentDao.update(department);
        auditLogService.record(actor.getUserId(), "DEPARTMENT_UPDATED", "DEPARTMENT", id,
                buildUpdateDetail(department));
    }

    private String buildUpdateDetail(Department department) {
        Map<String, Object> detail = new LinkedHashMap<>();
        detail.put("code", department.getCode());
        detail.put("name", department.getName());
        detail.put("status", department.getStatus());
        try {
            return OBJECT_MAPPER.writeValueAsString(detail);
        } catch (JsonProcessingException e) {
            throw new IllegalStateException("Failed to serialize department update audit detail", e);
        }
    }
}
