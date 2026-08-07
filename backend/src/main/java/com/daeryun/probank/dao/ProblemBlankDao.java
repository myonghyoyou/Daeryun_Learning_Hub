package com.daeryun.probank.dao;

import com.daeryun.probank.domain.ProblemBlank;
import org.apache.ibatis.annotations.Param;

import java.util.List;

public interface ProblemBlankDao {
    void insertAll(@Param("blanks") List<ProblemBlank> blanks);
    List<ProblemBlank> findByProblemId(@Param("problemId") Long problemId);
    void deleteByProblemId(@Param("problemId") Long problemId);
}
