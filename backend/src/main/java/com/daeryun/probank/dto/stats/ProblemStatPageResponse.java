package com.daeryun.probank.dto.stats;

import lombok.AllArgsConstructor;
import lombok.Data;

import java.util.List;

/** 문제 목록(ProblemPageResponse)과 같은 모양을 유지해 화면이 같은 Pagination 을 쓴다. */
@Data
@AllArgsConstructor
public class ProblemStatPageResponse {
    private List<ProblemStatItem> items;
    private long totalCount;
    private int page;
    private int size;
}
