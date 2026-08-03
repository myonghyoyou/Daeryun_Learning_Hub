package com.daeryun.probank.controller;

import com.daeryun.probank.common.AuthUser;
import com.daeryun.probank.common.LoginUser;
import com.daeryun.probank.common.RequireRole;
import com.daeryun.probank.common.ResponseDto;
import com.daeryun.probank.domain.UserRole;
import com.daeryun.probank.dto.user.UserCreateRequest;
import com.daeryun.probank.dto.user.UserUpdateRequest;
import com.daeryun.probank.service.UserAdminService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/admin/users")
@RequireRole(UserRole.SUPER_ADMIN)
public class UserAdminController {

    private final UserAdminService userAdminService;

    public UserAdminController(UserAdminService userAdminService) {
        this.userAdminService = userAdminService;
    }

    @GetMapping
    public ResponseEntity<ResponseDto<?>> list(@RequestParam(required = false) Long departmentId) {
        return ResponseEntity.ok(ResponseDto.ok(userAdminService.list(departmentId)));
    }

    @PostMapping
    public ResponseEntity<ResponseDto<?>> create(@RequestBody UserCreateRequest request,
                                                   @LoginUser AuthUser actor) {
        return ResponseEntity.ok(ResponseDto.ok(userAdminService.create(request, actor)));
    }

    @PutMapping("/{id}")
    public ResponseEntity<ResponseDto<?>> update(@PathVariable Long id, @RequestBody UserUpdateRequest request,
                                                   @LoginUser AuthUser actor) {
        userAdminService.update(id, request, actor);
        return ResponseEntity.ok(ResponseDto.ok());
    }
}
