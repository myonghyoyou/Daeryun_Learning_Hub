package com.daeryun.probank.dao;

import com.daeryun.probank.domain.AttemptChoice;
import com.daeryun.probank.dto.stats.ChoiceDistributionRaw;
import org.apache.ibatis.annotations.Param;

import java.util.List;

public interface AttemptChoiceDao {
    /** 호출부는 비어 있지 않은 리스트만 넘긴다 — 빈 리스트는 foreach 가 빈 VALUES 절을 만든다. */
    void insertAll(@Param("choices") List<AttemptChoice> choices);

    /** 이 문제의 시도에서 보기별 선택 횟수. 지금은 사라진 보기 ID 도 그대로 나온다. */
    List<ChoiceDistributionRaw> findDistribution(@Param("problemId") Long problemId);

    /** 분포 계산에 실제로 반영되는 시도 수(현재 보기와 매칭되는 선택이 하나라도 있는 시도). */
    int countAnalyzedAttempts(@Param("problemId") Long problemId);
}
