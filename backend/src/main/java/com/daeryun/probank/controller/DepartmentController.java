package com.daeryun.probank.controller;

import com.daeryun.probank.common.AuthUser;
import com.daeryun.probank.common.LoginUser;
import com.daeryun.probank.common.RequireRole;
import com.daeryun.probank.common.ResponseDto;
import com.daeryun.probank.domain.UserRole;
import com.daeryun.probank.dto.department.DepartmentCreateRequest;
import com.daeryun.probank.dto.department.DepartmentUpdateRequest;
import com.daeryun.probank.service.DepartmentService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/admin/departments")
@RequireRole(UserRole.SUPER_ADMIN)
public class DepartmentController {

    private final DepartmentService departmentService;

    public DepartmentController(DepartmentService departmentService) {
        this.departmentService = departmentService;
    }

    @GetMapping
    public ResponseEntity<ResponseDto<?>> list() {
        return ResponseEntity.ok(ResponseDto.ok(departmentService.list()));
    }

    @PostMapping
    public ResponseEntity<ResponseDto<?>> create(@RequestBody DepartmentCreateRequest request,
                                                   @LoginUser AuthUser actor) {
        departmentService.create(request, actor);
        return ResponseEntity.ok(ResponseDto.ok());
    }

    @PutMapping("/{id}")
    public ResponseEntity<ResponseDto<?>> update(@PathVariable Long id, @RequestBody DepartmentUpdateRequest request,
                                                   @LoginUser AuthUser actor) {
        departmentService.update(id, request, actor);
        return ResponseEntity.ok(ResponseDto.ok());
    }
}
