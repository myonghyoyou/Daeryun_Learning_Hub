package com.daeryun.probank.controller;

import com.daeryun.probank.common.AuthUser;
import com.daeryun.probank.common.LoginUser;
import com.daeryun.probank.common.RequireRole;
import com.daeryun.probank.common.ResponseDto;
import com.daeryun.probank.domain.UserRole;
import com.daeryun.probank.dto.problem.DepartmentChangeRequest;
import com.daeryun.probank.dto.problem.ImageUploadResponse;
import com.daeryun.probank.dto.problem.ProblemCreateRequest;
import com.daeryun.probank.service.ExcelProblemUploadService;
import com.daeryun.probank.service.ProblemImageService;
import com.daeryun.probank.service.ProblemService;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.time.LocalDate;

@RestController
@RequestMapping("/api/admin/problems")
@RequireRole({UserRole.SUPER_ADMIN, UserRole.DEPT_ADMIN})
public class ProblemController {

    private final ProblemService problemService;
    private final ProblemImageService problemImageService;
    private final ExcelProblemUploadService excelProblemUploadService;

    public ProblemController(ProblemService problemService, ProblemImageService problemImageService,
                              ExcelProblemUploadService excelProblemUploadService) {
        this.problemService = problemService;
        this.problemImageService = problemImageService;
        this.excelProblemUploadService = excelProblemUploadService;
    }

    @PostMapping
    public ResponseEntity<ResponseDto<?>> create(@RequestBody ProblemCreateRequest request, @LoginUser AuthUser actor) {
        problemService.create(request, actor);
        return ResponseEntity.ok(ResponseDto.ok());
    }

    @GetMapping
    public ResponseEntity<ResponseDto<?>> list(
            @RequestParam(required = false) Long departmentId,
            @RequestParam(required = false) String type,
            @RequestParam(required = false) String status,
            // @DateTimeFormat 이 없으면 "2026-08-01" 문자열이 LocalDate 로 변환되지 않아
            // MethodArgumentTypeMismatchException 이 나고, 목록 조회 전체가 실패한다(QA D1).
            @RequestParam(required = false)
            @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate createdFrom,
            @RequestParam(required = false)
            @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate createdTo,
            @RequestParam(required = false) String tag,
            @RequestParam(required = false) String keyword,
            @LoginUser AuthUser actor) {
        return ResponseEntity.ok(ResponseDto.ok(problemService.list(actor, departmentId, type, status,
                createdFrom, createdTo, tag, keyword)));
    }

    @GetMapping("/{id}")
    public ResponseEntity<ResponseDto<?>> getDetail(@PathVariable Long id, @LoginUser AuthUser actor) {
        return ResponseEntity.ok(ResponseDto.ok(problemService.getDetail(id, actor)));
    }

    @PutMapping("/{id}")
    public ResponseEntity<ResponseDto<?>> update(@PathVariable Long id, @RequestBody ProblemCreateRequest request,
                                                  @LoginUser AuthUser actor) {
        problemService.update(id, request, actor);
        return ResponseEntity.ok(ResponseDto.ok());
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<ResponseDto<?>> archive(@PathVariable Long id, @LoginUser AuthUser actor) {
        problemService.archive(id, actor);
        return ResponseEntity.ok(ResponseDto.ok());
    }

    @PostMapping("/images")
    public ResponseEntity<ResponseDto<?>> uploadImage(@RequestParam("file") MultipartFile file,
                                                        @LoginUser AuthUser actor) {
        return ResponseEntity.ok(ResponseDto.ok(new ImageUploadResponse(problemImageService.store(file, actor))));
    }

    /**
     * 클래스 애너테이션은 {SUPER_ADMIN, DEPT_ADMIN} 이지만 RoleCheckInterceptor 가 메서드 애너테이션을
     * 먼저 보므로, 이 엔드포인트만 총괄 관리자로 좁혀진다. 부서 이동은 문제의 소유권을 옮기는 행위라
     * 부서 관리자에게 열어 주면 자기 부서 문제를 남의 부서로 던져 버릴 수 있다.
     */
    @RequireRole(UserRole.SUPER_ADMIN)
    @PatchMapping("/{id}/department")
    public ResponseEntity<ResponseDto<?>> changeDepartment(@PathVariable Long id,
                                                            @RequestBody DepartmentChangeRequest request,
                                                            @LoginUser AuthUser actor) {
        problemService.changeDepartment(id, request.getDepartmentId(), actor);
        return ResponseEntity.ok(ResponseDto.ok());
    }

    @PostMapping("/excel-upload")
    public ResponseEntity<ResponseDto<?>> uploadExcel(@RequestParam("file") MultipartFile file,
                                                        @RequestParam(required = false) Long departmentId,
                                                        @LoginUser AuthUser actor) {
        return ResponseEntity.ok(ResponseDto.ok(excelProblemUploadService.upload(file, departmentId, actor)));
    }
}
