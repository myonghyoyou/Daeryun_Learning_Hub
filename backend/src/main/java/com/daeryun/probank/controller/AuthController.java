package com.daeryun.probank.controller;

import com.daeryun.probank.common.ResponseDto;
import com.daeryun.probank.dto.auth.LoginRequest;
import com.daeryun.probank.service.AuthService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import javax.servlet.http.HttpServletRequest;

@RestController
@RequestMapping("/api/auth")
public class AuthController {

    private final AuthService authService;

    public AuthController(AuthService authService) {
        this.authService = authService;
    }

    @PostMapping("/login")
    public ResponseEntity<ResponseDto<?>> login(@RequestBody(required = false) LoginRequest loginRequest,
                                                  HttpServletRequest request) {
        return ResponseEntity.ok(ResponseDto.ok(authService.login(loginRequest, request)));
    }

    @PostMapping("/logout")
    public ResponseEntity<ResponseDto<?>> logout(HttpServletRequest request) {
        authService.logout(request);
        return ResponseEntity.ok(ResponseDto.ok());
    }

    @GetMapping("/session")
    public ResponseEntity<ResponseDto<?>> getSession(HttpServletRequest request) {
        return ResponseEntity.ok(ResponseDto.ok(authService.getSessionStatus(request)));
    }
}
