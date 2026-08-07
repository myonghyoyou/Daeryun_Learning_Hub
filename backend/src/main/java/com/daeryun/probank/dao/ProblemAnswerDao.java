package com.daeryun.probank.dao;

import com.daeryun.probank.domain.ProblemAnswer;
import org.apache.ibatis.annotations.Param;

import java.util.List;

public interface ProblemAnswerDao {
    void insertAll(@Param("answers") List<ProblemAnswer> answers);
    List<ProblemAnswer> findByProblemId(@Param("problemId") Long problemId);
    void deleteByProblemId(@Param("problemId") Long problemId);
}
