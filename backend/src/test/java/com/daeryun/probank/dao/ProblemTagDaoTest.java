package com.daeryun.probank.dao;

import com.daeryun.probank.domain.Department;
import com.daeryun.probank.domain.Problem;
import com.daeryun.probank.domain.ProblemStatus;
import com.daeryun.probank.domain.ProblemType;
import com.daeryun.probank.domain.Status;
import com.daeryun.probank.domain.User;
import com.daeryun.probank.domain.UserRole;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.annotation.Transactional;

import java.util.Arrays;
import java.util.Collections;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

@SpringBootTest
@ActiveProfiles("test")
@Transactional
class ProblemTagDaoTest {

    @Autowired private DepartmentDao departmentDao;
    @Autowired private UserDao userDao;
    @Autowired private ProblemDao problemDao;
    @Autowired private TagDao tagDao;
    @Autowired private ProblemTagDao problemTagDao;

    private Long createProblemId() {
        Department department = new Department();
        department.setName("QA");
        department.setCode("QA-" + System.nanoTime());
        department.setStatus(Status.ACTIVE);
        departmentDao.insert(department);

        User author = new User();
        author.setEmployeeNo("author-" + System.nanoTime());
        author.setName("작성자");
        author.setEmail("author-" + System.nanoTime() + "@company.local");
        author.setPasswordHash("hash");
        author.setDepartmentId(department.getId());
        author.setRole(UserRole.DEPT_ADMIN);
        author.setStatus(Status.ACTIVE);
        author.setMustChangePassword(false);
        userDao.insert(author);

        Problem problem = new Problem();
        problem.setType(ProblemType.SHORT_ANSWER);
        problem.setContent("태그 연결 테스트 문제");
        problem.setStatus(ProblemStatus.ACTIVE);
        problem.setDepartmentId(department.getId());
        problem.setCreatedBy(author.getId());
        problemDao.insert(problem);
        return problem.getId();
    }

    @Test
    void findTagNamesByProblemId_withNoTags_returnsEmptyList() {
        Long problemId = createProblemId();
        assertTrue(problemTagDao.findTagNamesByProblemId(problemId).isEmpty());
    }

    @Test
    void replaceTags_linksProblemToTags_andFindTagNamesReturnsThem() {
        Long problemId = createProblemId();
        String tagA = "태그A-" + System.nanoTime();
        String tagB = "태그B-" + System.nanoTime();
        List<Long> tagIds = tagDao.findOrCreateByNames(Arrays.asList(tagA, tagB));

        problemTagDao.replaceTags(problemId, tagIds);

        List<String> names = problemTagDao.findTagNamesByProblemId(problemId);
        assertEquals(2, names.size());
        assertTrue(names.contains(tagA));
        assertTrue(names.contains(tagB));
    }

    @Test
    void replaceTags_removesOldLinks_whenCalledAgainWithDifferentTags() {
        Long problemId = createProblemId();
        String oldTag = "이전태그-" + System.nanoTime();
        String newTag = "새태그-" + System.nanoTime();
        List<Long> oldTagIds = tagDao.findOrCreateByNames(Collections.singletonList(oldTag));
        List<Long> newTagIds = tagDao.findOrCreateByNames(Collections.singletonList(newTag));

        problemTagDao.replaceTags(problemId, oldTagIds);
        assertEquals(Collections.singletonList(oldTag), problemTagDao.findTagNamesByProblemId(problemId));

        problemTagDao.replaceTags(problemId, newTagIds);

        List<String> namesAfterReplace = problemTagDao.findTagNamesByProblemId(problemId);
        assertEquals(Collections.singletonList(newTag), namesAfterReplace);
        assertTrue(namesAfterReplace.stream().noneMatch(oldTag::equals));
    }

    @Test
    void replaceTags_withEmptyList_clearsAllLinks() {
        Long problemId = createProblemId();
        String tag = "지울태그-" + System.nanoTime();
        List<Long> tagIds = tagDao.findOrCreateByNames(Collections.singletonList(tag));
        problemTagDao.replaceTags(problemId, tagIds);
        assertEquals(1, problemTagDao.findTagNamesByProblemId(problemId).size());

        problemTagDao.replaceTags(problemId, Collections.emptyList());

        assertTrue(problemTagDao.findTagNamesByProblemId(problemId).isEmpty());
    }
}
