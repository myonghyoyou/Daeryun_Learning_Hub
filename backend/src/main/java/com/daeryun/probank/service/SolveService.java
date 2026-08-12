package com.daeryun.probank.service;

import com.daeryun.probank.domain.ProblemBlank;
import com.daeryun.probank.dto.solve.ProblemSolveDetailResponse;
import com.daeryun.probank.dto.solve.ProblemSolveListItem;

import java.util.List;

public interface SolveService {
    List<ProblemSolveListItem> list(String keyword, String tag);
    List<ProblemSolveListItem> randomSet(int count, Long departmentId);
    ProblemSolveDetailResponse getDetail(Long problemId);
    List<String> selectRandomBlankKeys(List<ProblemBlank> blanks, int count);
    com.daeryun.probank.dto.solve.AttemptResult submit(Long problemId, com.daeryun.probank.dto.solve.AttemptSubmitRequest request,
                                                        com.daeryun.probank.common.AuthUser actor);
    java.util.List<com.daeryun.probank.dto.solve.AttemptHistoryItem> myHistory(com.daeryun.probank.common.AuthUser actor);
}
