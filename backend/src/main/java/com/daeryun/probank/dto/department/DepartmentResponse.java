package com.daeryun.probank.dto.department;

import com.daeryun.probank.domain.Department;
import com.daeryun.probank.domain.Status;
import lombok.AllArgsConstructor;
import lombok.Data;

@Data
@AllArgsConstructor
public class DepartmentResponse {
    private Long id;
    private String name;
    private String code;
    private Status status;

    public static DepartmentResponse from(Department department) {
        return new DepartmentResponse(department.getId(), department.getName(), department.getCode(), department.getStatus());
    }
}
