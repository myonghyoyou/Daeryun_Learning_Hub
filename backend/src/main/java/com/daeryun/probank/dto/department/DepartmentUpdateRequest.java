package com.daeryun.probank.dto.department;

import com.daeryun.probank.domain.Status;
import lombok.Data;

@Data
public class DepartmentUpdateRequest {
    private String name;
    private Status status;
}
