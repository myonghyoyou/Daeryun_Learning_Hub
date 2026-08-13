package com.daeryun.probank.service;

import com.daeryun.probank.common.AuthUser;
import com.daeryun.probank.dto.stats.ProblemStatItem;
import com.daeryun.probank.dto.stats.ProblemStatPageResponse;

import java.util.List;

public interface StatsService {
    ProblemStatPageResponse listProblemStats(AuthUser actor, Long departmentId, String status, int page, int size);

    /** 대시보드 집계용. 페이징 없이 스코프 안의 모든 문제를 돌려준다. */
    List<ProblemStatItem> listAllProblemStats(AuthUser actor, Long departmentId);

    /** 대시보드 "문제 수" metric. 보관 문제는 세지 않는다. */
    int countActiveProblems(AuthUser actor, Long departmentId);

    com.daeryun.probank.dto.stats.ProblemStatDetailResponse getProblemDetail(Long problemId, AuthUser actor);
}
