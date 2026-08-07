package com.daeryun.probank.dao;

import com.daeryun.probank.domain.ProblemChoice;
import org.apache.ibatis.annotations.Param;

import java.util.List;

public interface ProblemChoiceDao {
    void insertAll(@Param("choices") List<ProblemChoice> choices);
    List<ProblemChoice> findByProblemId(@Param("problemId") Long problemId);
    void deleteByProblemId(@Param("problemId") Long problemId);
}
