package com.daeryun.probank.dao;

import com.daeryun.probank.dto.stats.ProblemStatRaw;
import org.apache.ibatis.annotations.Param;

import java.util.List;

public interface StatsDao {
    List<ProblemStatRaw> findProblemStats(@Param("departmentId") Long departmentId,
                                           @Param("status") String status,
                                           @Param("limit") int limit,
                                           @Param("offset") int offset);

    long countProblemStats(@Param("departmentId") Long departmentId,
                            @Param("status") String status);

    /** 페이징 없이 전부. 대시보드 집계 전용이라 화면에 직접 내려보내지 않는다. */
    List<ProblemStatRaw> findAllProblemStats(@Param("departmentId") Long departmentId);

    /** 활성 문제 수. 대시보드의 "문제 수" metric 은 보관 문제를 세지 않는다. */
    int countActiveProblems(@Param("departmentId") Long departmentId);

    ProblemStatRaw findProblemStat(@Param("problemId") Long problemId);
}
