package com.daeryun.probank.service;

import com.daeryun.probank.domain.ProblemBlank;
import com.daeryun.probank.dto.solve.ProblemSolveDetailResponse;
import com.daeryun.probank.dto.solve.ProblemSolveListItem;

import java.util.List;

public interface SolveService {
    List<ProblemSolveListItem> list(String keyword, String tag);
    ProblemSolveDetailResponse getDetail(Long problemId);
    List<String> selectRandomBlankKeys(List<ProblemBlank> blanks, int count);
}
