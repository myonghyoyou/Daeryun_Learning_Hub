package com.daeryun.probank.dto.department;

import lombok.AllArgsConstructor;
import lombok.Data;

/** 직원 화면의 부서 선택지. 상태·생성일 같은 내부 값은 담지 않는다. */
@Data
@AllArgsConstructor
public class DepartmentOption {
    private Long id;
    private String name;
    private String code;
}
