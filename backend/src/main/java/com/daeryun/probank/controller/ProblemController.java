package com.daeryun.probank.controller;

import com.daeryun.probank.common.AuthUser;
import com.daeryun.probank.common.LoginUser;
import com.daeryun.probank.common.RequireRole;
import com.daeryun.probank.common.ResponseDto;
import com.daeryun.probank.domain.UserRole;
import com.daeryun.probank.dto.problem.ProblemCreateRequest;
import com.daeryun.probank.service.ProblemService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/admin/problems")
@RequireRole({UserRole.SUPER_ADMIN, UserRole.DEPT_ADMIN})
public class ProblemController {

    private final ProblemService problemService;

    public ProblemController(ProblemService problemService) {
        this.problemService = problemService;
    }

    @PostMapping
    public ResponseEntity<ResponseDto<?>> create(@RequestBody ProblemCreateRequest request, @LoginUser AuthUser actor) {
        problemService.create(request, actor);
        return ResponseEntity.ok(ResponseDto.ok());
    }
}
