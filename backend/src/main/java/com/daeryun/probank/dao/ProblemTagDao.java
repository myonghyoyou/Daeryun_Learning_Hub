package com.daeryun.probank.dao;

import org.apache.ibatis.annotations.Param;

import java.util.List;

public interface ProblemTagDao {

    void deleteByProblemId(@Param("problemId") Long problemId);

    void insertAll(@Param("problemId") Long problemId, @Param("tagIds") List<Long> tagIds);

    List<String> findTagNamesByProblemId(@Param("problemId") Long problemId);

    /**
     * 문제의 태그 연결을 통째로 교체한다: 기존 연결을 모두 지우고 새 tagIds로 다시
     * 연결한다. 문제 등록/수정 서비스가 본문 저장과 같은 트랜잭션 안에서 호출한다.
     */
    default void replaceTags(Long problemId, List<Long> tagIds) {
        deleteByProblemId(problemId);
        if (tagIds != null && !tagIds.isEmpty()) {
            insertAll(problemId, tagIds);
        }
    }
}
