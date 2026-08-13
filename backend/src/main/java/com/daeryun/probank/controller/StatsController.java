package com.daeryun.probank.controller;

import com.daeryun.probank.common.AuthUser;
import com.daeryun.probank.common.LoginUser;
import com.daeryun.probank.common.RequireRole;
import com.daeryun.probank.common.ResponseDto;
import com.daeryun.probank.domain.UserRole;
import com.daeryun.probank.service.StatsService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/admin/stats")
@RequireRole({UserRole.SUPER_ADMIN, UserRole.DEPT_ADMIN})
public class StatsController {

    private final StatsService statsService;

    public StatsController(StatsService statsService) {
        this.statsService = statsService;
    }

    @GetMapping("/problems")
    public ResponseEntity<ResponseDto<?>> listProblemStats(@RequestParam(required = false) Long departmentId,
                                                            @RequestParam(required = false) String status,
                                                            @RequestParam(defaultValue = "1") int page,
                                                            @RequestParam(defaultValue = "20") int size,
                                                            @LoginUser AuthUser actor) {
        return ResponseEntity.ok(ResponseDto.ok(statsService.listProblemStats(actor, departmentId, status, page, size)));
    }
}
