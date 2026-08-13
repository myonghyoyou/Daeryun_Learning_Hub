package com.daeryun.probank.controller;

import com.daeryun.probank.common.AuthUser;
import com.daeryun.probank.common.LoginUser;
import com.daeryun.probank.common.RequireRole;
import com.daeryun.probank.common.ResponseDto;
import com.daeryun.probank.domain.UserRole;
import com.daeryun.probank.service.DashboardService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/admin/dashboard")
@RequireRole({UserRole.SUPER_ADMIN, UserRole.DEPT_ADMIN})
public class DashboardController {

    private final DashboardService dashboardService;

    public DashboardController(DashboardService dashboardService) {
        this.dashboardService = dashboardService;
    }

    @GetMapping
    public ResponseEntity<ResponseDto<?>> getSummary(@RequestParam(required = false) Long departmentId,
                                                       @LoginUser AuthUser actor) {
        return ResponseEntity.ok(ResponseDto.ok(dashboardService.getSummary(actor, departmentId)));
    }
}
