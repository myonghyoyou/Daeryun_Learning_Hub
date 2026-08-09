package com.daeryun.probank.dto.problem;

import lombok.Data;

/**
 * 문제의 귀속 부서를 옮기는 요청. ProblemCreateRequest 와 분리해 두는 것이 핵심이다 —
 * 그쪽에 departmentId 를 넣으면 등록 경로에도 부서 위조 표면이 다시 열린다.
 */
@Data
public class DepartmentChangeRequest {
    private Long departmentId;
}
