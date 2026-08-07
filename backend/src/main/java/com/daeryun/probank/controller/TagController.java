package com.daeryun.probank.controller;

import com.daeryun.probank.common.ResponseDto;
import com.daeryun.probank.service.TagService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 로그인한 사용자라면 누구나 태그 선택지 목록을 조회할 수 있다 — 인증은 Plan 1의
 * 세션 필터가 담당하며, 이 컨트롤러에는 별도 관리자 role 제한({@code @RequireRole})을
 * 두지 않는다 (plan Approved Amendments 참고).
 */
@RestController
@RequestMapping("/api/tags")
public class TagController {

    private final TagService tagService;

    public TagController(TagService tagService) {
        this.tagService = tagService;
    }

    @GetMapping
    public ResponseEntity<ResponseDto<?>> list() {
        return ResponseEntity.ok(ResponseDto.ok(tagService.list()));
    }
}
