package com.daeryun.probank.dao;

import com.daeryun.probank.domain.Tag;
import org.apache.ibatis.annotations.Param;

import java.util.Collections;
import java.util.List;

public interface TagDao {

    List<Tag> findAll();

    /** 활성(ACTIVE) 문제에 하나 이상 붙어 있는 태그만. 직원 풀이 화면의 필터 선택지용이다. */
    List<Tag> findInUse();

    /**
     * 주어진 이름들 중 존재하지 않는 태그를 {@code tags.name}의 UNIQUE 제약을
     * {@code ON CONFLICT (name) DO NOTHING}으로 흡수하며 삽입한다. 동시에 같은
     * 이름을 등록하려는 두 트랜잭션이 있어도, 한쪽이 커밋될 때까지 다른 쪽이
     * 대기했다가 충돌 없이 no-op 되므로 중복 행이 생기지 않는다 — 이후
     * {@link #findIdsByNames(List)}가 커밋된 최종 상태를 다시 읽는다.
     */
    void insertIgnoreAll(@Param("names") List<String> names);

    List<Long> findIdsByNames(@Param("names") List<String> names);

    /**
     * 이름 목록에 해당하는 태그를 찾아 없으면 생성한 뒤, 그 id 목록을 반환한다.
     * {@link ProblemTagDao#replaceTags(Long, List)}에 바로 넘길 수 있는 형태다.
     */
    default List<Long> findOrCreateByNames(List<String> names) {
        if (names == null || names.isEmpty()) {
            return Collections.emptyList();
        }
        insertIgnoreAll(names);
        return findIdsByNames(names);
    }
}
