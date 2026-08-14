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

    /**
     * 부서와 문항 번호를 함께 바꾼다. 부서만 바꾸면 옮겨 간 부서에 같은 번호가 있을 때
     * UNIQUE 제약에 걸리므로, 이동과 재부여는 한 문장이어야 한다.
     */
    void updateDepartmentAndSourceNumber(@Param("id") Long id,
                                          @Param("departmentId") Long departmentId,
                                          @Param("sourceNumber") Integer sourceNumber);

    /** 풀이용 전사 공통 목록: status = ACTIVE 만, 정답 비노출. keyword/tag 는 선택 필터. */
    List<com.daeryun.probank.dto.solve.ProblemSolveListItem> findAllActive(@Param("keyword") String keyword,
                                                                            @Param("tag") String tag);

    /**
     * 풀이용 무작위 세트: status = ACTIVE 중 무작위 count 건. departmentId 가 null 이면 전 부서.
     * 이미 푼 문제도 다시 뽑힌다(반복 학습이 목적이라 attempts 와 조인하지 않는다).
     */
    List<com.daeryun.probank.dto.solve.ProblemSolveListItem> findRandomActive(@Param("count") int count,
                                                                               @Param("departmentId") Long departmentId);

    /** 최근 등록 문제. departmentId 가 null 이면 전 부서. 스코프는 호출부가 계산해 넘긴다. */
    List<ProblemListItem> findRecent(@Param("departmentId") Long departmentId, @Param("limit") int limit);

    /**
     * 그 부서에서 가장 큰 문항 번호. 없으면 null.
     * 보관(ARCHIVED)된 문제도 번호를 점유하므로 상태로 거르지 않는다(spec D5).
     */
    Integer findMaxSourceNumber(@Param("departmentId") Long departmentId);
}
