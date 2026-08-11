package com.daeryun.probank.controller;

import com.daeryun.probank.common.ResponseDto;
import com.daeryun.probank.service.SolveService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/problems")
public class SolveController {

    private final SolveService solveService;

    public SolveController(SolveService solveService) {
        this.solveService = solveService;
    }

    @GetMapping
    public ResponseEntity<ResponseDto<?>> list(@RequestParam(required = false) String keyword,
                                               @RequestParam(required = false) String tag) {
        return ResponseEntity.ok(ResponseDto.ok(solveService.list(keyword, tag)));
    }

    @GetMapping("/{id}")
    public ResponseEntity<ResponseDto<?>> getDetail(@PathVariable Long id) {
        return ResponseEntity.ok(ResponseDto.ok(solveService.getDetail(id)));
    }
}
