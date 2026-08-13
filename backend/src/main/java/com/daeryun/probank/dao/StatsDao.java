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

    /**
     * 페이징 없이 전부. 대시보드 집계 전용이라 화면에 직접 내려보내지 않는다.
     *
     * statsFilter 를 공유하지 않는다 — statsFilter 는 status 를 참조하는데 이 메서드는
     * departmentId 파라미터만 선언한다. status 파라미터 없이 공유하면 MyBatis 가
     * BindingException("Parameter 'status' not found")을 던진다. "고치려면" status 파라미터를
     * 추가해야 하는데, 그러면 findAllProblemStats 는 더 이상 "보관 포함 전체"가 아니게 되어
     * 대시보드 집계(활성+보관 총량)가 깨진다.
     */
    List<ProblemStatRaw> findAllProblemStats(@Param("departmentId") Long departmentId);

    /** 활성 문제 수. 대시보드의 "문제 수" metric 은 보관 문제를 세지 않는다. */
    int countActiveProblems(@Param("departmentId") Long departmentId);

    ProblemStatRaw findProblemStat(@Param("problemId") Long problemId);
}
