package com.daeryun.probank.service;

import com.daeryun.probank.common.AuthUser;
import com.daeryun.probank.dto.problem.ProblemCreateRequest;
import com.daeryun.probank.dto.problem.ProblemListItem;

public interface ProblemService {
    void create(ProblemCreateRequest request, AuthUser actor);
    void update(Long id, ProblemCreateRequest request, AuthUser actor);
    void archive(Long id, AuthUser actor);
    com.daeryun.probank.dto.problem.ProblemPageResponse list(AuthUser actor, Long departmentId, String type,
                                                              String status, java.time.LocalDate createdFrom,
                                                              java.time.LocalDate createdTo, String tag,
                                                              String keyword, int page, int size);
    com.daeryun.probank.dto.problem.ProblemDetailResponse getDetail(Long id, AuthUser actor);

    void changeDepartment(Long id, Long departmentId, AuthUser actor);
}
