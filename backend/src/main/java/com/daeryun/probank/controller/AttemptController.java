package com.daeryun.probank.controller;

import com.daeryun.probank.common.AuthUser;
import com.daeryun.probank.common.LoginUser;
import com.daeryun.probank.common.ResponseDto;
import com.daeryun.probank.service.SolveService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/attempts")
public class AttemptController {

    private final SolveService solveService;

    public AttemptController(SolveService solveService) {
        this.solveService = solveService;
    }

    @GetMapping("/me")
    public ResponseEntity<ResponseDto<?>> myHistory(@LoginUser AuthUser actor) {
        return ResponseEntity.ok(ResponseDto.ok(solveService.myHistory(actor)));
    }
}
