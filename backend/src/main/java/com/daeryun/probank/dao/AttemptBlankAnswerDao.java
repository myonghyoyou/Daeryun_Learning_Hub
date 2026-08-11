package com.daeryun.probank.dao;

import com.daeryun.probank.domain.AttemptBlankAnswer;
import org.apache.ibatis.annotations.Param;

import java.util.List;

public interface AttemptBlankAnswerDao {
    void insertAll(@Param("answers") List<AttemptBlankAnswer> answers);
}
