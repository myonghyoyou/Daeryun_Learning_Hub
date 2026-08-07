package com.daeryun.probank.service;

import com.daeryun.probank.common.AuthUser;
import com.daeryun.probank.dto.problem.ProblemCreateRequest;
import com.daeryun.probank.dto.problem.ProblemListItem;

public interface ProblemService {
    void create(ProblemCreateRequest request, AuthUser actor);
    void update(Long id, ProblemCreateRequest request, AuthUser actor);
    void archive(Long id, AuthUser actor);
    java.util.List<ProblemListItem> list(AuthUser actor, Long departmentId, String type, String status,
                                          java.time.LocalDate createdFrom, java.time.LocalDate createdTo,
                                          String tag, String keyword);
}
