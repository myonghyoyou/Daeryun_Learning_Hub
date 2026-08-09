package com.daeryun.probank.dao;

import com.daeryun.probank.domain.Problem;
import com.daeryun.probank.domain.ProblemStatus;
import com.daeryun.probank.dto.problem.ProblemListItem;
import org.apache.ibatis.annotations.Param;

import java.util.List;

public interface ProblemDao {
    void insert(Problem problem);
    Problem findById(@Param("id") Long id);
    void update(Problem problem);
    void updateStatus(@Param("id") Long id, @Param("status") ProblemStatus status);
    List<ProblemListItem> findAll(@Param("departmentId") Long departmentId,
                                   @Param("type") String type,
                                   @Param("status") String status,
                                   @Param("createdFrom") java.time.LocalDate createdFrom,
                                   @Param("createdTo") java.time.LocalDate createdTo,
                                   @Param("tag") String tag,
                                   @Param("keyword") String keyword,
                                   @Param("limit") int limit,
                                   @Param("offset") int offset);

    /** findAll 과 동일한 필터를 적용한 전체 건수. 페이지 수 계산에 쓴다. */
    long countAll(@Param("departmentId") Long departmentId,
                   @Param("type") String type,
                   @Param("status") String status,
                   @Param("createdFrom") java.time.LocalDate createdFrom,
                   @Param("createdTo") java.time.LocalDate createdTo,
                   @Param("tag") String tag,
                   @Param("keyword") String keyword);

    void updateDepartment(@Param("id") Long id, @Param("departmentId") Long departmentId);
}
