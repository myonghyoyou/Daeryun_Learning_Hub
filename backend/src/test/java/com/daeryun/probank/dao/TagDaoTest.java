package com.daeryun.probank.dao;

import com.daeryun.probank.domain.Tag;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

@SpringBootTest
@ActiveProfiles("test")
@Transactional
class TagDaoTest {

    @Autowired private TagDao tagDao;
    @Autowired private JdbcTemplate jdbcTemplate;

    @Test
    void findOrCreateByNames_createsNewTags_andFindAllIncludesThem() {
        String name1 = "자바-" + System.nanoTime();
        String name2 = "스프링-" + System.nanoTime();

        List<Long> ids = tagDao.findOrCreateByNames(Arrays.asList(name1, name2));

        assertEquals(2, ids.size());
        List<Tag> all = tagDao.findAll();
        List<String> allNames = new ArrayList<>();
        for (Tag tag : all) {
            allNames.add(tag.getName());
        }
        assertTrue(allNames.contains(name1));
        assertTrue(allNames.contains(name2));
    }

    @Test
    void findOrCreateByNames_reusesExistingTag_insteadOfDuplicating() {
        String name = "중복방지-" + System.nanoTime();

        List<Long> firstCall = tagDao.findOrCreateByNames(Collections.singletonList(name));
        List<Long> secondCall = tagDao.findOrCreateByNames(Collections.singletonList(name));

        assertEquals(1, firstCall.size());
        assertEquals(firstCall, secondCall);

        Integer countInTable = jdbcTemplate.queryForObject(
                "SELECT count(*) FROM tags WHERE name = ?", Integer.class, name);
        assertEquals(1, countInTable.intValue());
    }

    @Test
    void findOrCreateByNames_withEmptyList_returnsEmptyList() {
        assertTrue(tagDao.findOrCreateByNames(Collections.emptyList()).isEmpty());
        assertTrue(tagDao.findOrCreateByNames(null).isEmpty());
    }

    /**
     * ON CONFLICT (name) DO NOTHING 이 실제로 동시 삽입 경쟁을 안전하게 흡수하는지
     * 확인한다. 같은 새 태그 이름을 여러 스레드가 동시에 findOrCreateByNames 로
     * 요청해도 tags 테이블에는 정확히 한 행만 남아야 한다.
     *
     * 클래스 레벨 @Transactional 은 테스트 메서드를 실행하는 메인 스레드에만
     * 걸리므로, 별도 스레드에서 호출하는 findOrCreateByNames 는 그 트랜잭션 밖에서
     * 커밋된다 — 롤백으로 정리되지 않으므로 UserDaoTest의 동시성 테스트와 같은
     * 패턴으로 Propagation.NOT_SUPPORTED 를 걸고 finally 에서 수동으로 지운다.
     */
    @Test
    @Transactional(propagation = Propagation.NOT_SUPPORTED)
    void findOrCreateByNames_isSafeUnderConcurrentInsertOfSameName() throws Exception {
        String name = "동시성태그-" + System.nanoTime();
        int threads = 8;
        ExecutorService pool = Executors.newFixedThreadPool(threads);
        CountDownLatch start = new CountDownLatch(1);
        try {
            List<Future<Long>> futures = new ArrayList<>();
            for (int i = 0; i < threads; i++) {
                futures.add(pool.submit(() -> {
                    start.await();
                    List<Long> ids = tagDao.findOrCreateByNames(Collections.singletonList(name));
                    return ids.get(0);
                }));
            }
            start.countDown();

            List<Long> results = new ArrayList<>();
            for (Future<Long> future : futures) {
                results.add(future.get(30, TimeUnit.SECONDS));
            }

            // 모든 스레드가 같은 id 를 돌려받아야 하고(중복 생성이 없었다는 뜻),
            Long firstId = results.get(0);
            for (Long id : results) {
                assertEquals(firstId, id);
            }
            // tags 테이블에도 정확히 한 행만 존재해야 한다.
            Integer countInTable = jdbcTemplate.queryForObject(
                    "SELECT count(*) FROM tags WHERE name = ?", Integer.class, name);
            assertEquals(1, countInTable.intValue());
        } finally {
            pool.shutdownNow();
            jdbcTemplate.update("DELETE FROM tags WHERE name = ?", name);
        }
    }
}
