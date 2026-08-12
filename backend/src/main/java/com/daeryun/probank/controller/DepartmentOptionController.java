package com.daeryun.probank.controller;

import com.daeryun.probank.common.ResponseDto;
import com.daeryun.probank.service.DepartmentOptionService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 로그인한 사용자라면 누구나 부서 선택지를 조회할 수 있다 — 랜덤 풀이에서 부서를 고르려면
 * 직원도 목록이 필요한데, 관리자용 /api/admin/departments 는 SUPER_ADMIN 전용이다.
 * TagController 와 같은 방침이며, 인증은 Plan 1의 세션 필터가 담당한다.
 *
 * 부서는 접근 제한이 아니라 사용자가 고르는 필터다(피드백 분석 D1) — 이 목록으로 남의 부서
 * 문제를 막는 것이 아니라, 원하는 부서 문제만 골라 풀 수 있게 한다.
 */
@RestController
@RequestMapping("/api/departments")
public class DepartmentOptionController {

    private final DepartmentOptionService departmentOptionService;

    public DepartmentOptionController(DepartmentOptionService departmentOptionService) {
        this.departmentOptionService = departmentOptionService;
    }

    @GetMapping
    public ResponseEntity<ResponseDto<?>> list() {
        return ResponseEntity.ok(ResponseDto.ok(departmentOptionService.list()));
    }
}
