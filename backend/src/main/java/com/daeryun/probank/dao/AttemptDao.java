package com.daeryun.probank.dao;

import com.daeryun.probank.domain.Attempt;
import com.daeryun.probank.dto.solve.AttemptHistoryItem;
import org.apache.ibatis.annotations.Param;

import java.util.List;

public interface AttemptDao {
    void insert(Attempt attempt);
    List<AttemptHistoryItem> findByUserId(@Param("userId") Long userId);
    List<com.daeryun.probank.dto.stats.RecentWrongSample> findRecentWrong(@Param("problemId") Long problemId,
                                                                            @Param("limit") int limit);
}
