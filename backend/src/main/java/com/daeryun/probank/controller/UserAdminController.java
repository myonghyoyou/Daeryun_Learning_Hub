package com.daeryun.probank.controller;

import com.daeryun.probank.common.AuthUser;
import com.daeryun.probank.common.LoginUser;
import com.daeryun.probank.common.RequireRole;
import com.daeryun.probank.common.ResponseDto;
import com.daeryun.probank.domain.UserRole;
import com.daeryun.probank.dto.user.UserCreateRequest;
import com.daeryun.probank.dto.user.UserUpdateRequest;
import com.daeryun.probank.service.ExcelAccountUploadService;
import com.daeryun.probank.service.UserAdminService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

@RestController
@RequestMapping("/api/admin/users")
@RequireRole(UserRole.SUPER_ADMIN)
public class UserAdminController {

    private final UserAdminService userAdminService;
    private final ExcelAccountUploadService excelAccountUploadService;

    public UserAdminController(UserAdminService userAdminService, ExcelAccountUploadService excelAccountUploadService) {
        this.userAdminService = userAdminService;
        this.excelAccountUploadService = excelAccountUploadService;
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

    @PostMapping("/excel-upload")
    public ResponseEntity<ResponseDto<?>> uploadExcel(@RequestParam("file") MultipartFile file,
                                                         @LoginUser AuthUser actor) {
        return ResponseEntity.ok(ResponseDto.ok(excelAccountUploadService.upload(file, actor.getUserId())));
    }
}
