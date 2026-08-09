package com.daeryun.probank.dto.problem;

import lombok.AllArgsConstructor;
import lombok.Data;

import java.util.List;

/**
 * 문제 목록 한 페이지.
 * <p>
 * totalCount 는 <b>필터를 적용한 전체 건수</b>다(현재 페이지의 건수가 아니다). 화면이 페이지 수를
 * 계산하고 "N–M / 전체 T건"을 표기하는 데 쓴다.
 */
@Data
@AllArgsConstructor
public class ProblemPageResponse {
    private List<ProblemListItem> items;
    private long totalCount;
    private int page;
    private int size;
}
