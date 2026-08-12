package com.daeryun.probank.service;

import com.daeryun.probank.dao.TagDao;
import com.daeryun.probank.domain.Tag;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;

import java.util.Arrays;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;

class TagServiceImplTest {

    @Test
    void listInUse_returnsOnlyWhatTheDaoReports() {
        TagDao tagDao = Mockito.mock(TagDao.class);
        Tag geography = new Tag();
        geography.setName("지리");
        Mockito.when(tagDao.findInUse()).thenReturn(Arrays.asList(geography));

        List<Tag> result = new TagServiceImpl(tagDao).listInUse();

        assertEquals(1, result.size());
        assertEquals("지리", result.get(0).getName());
        Mockito.verify(tagDao).findInUse();
        Mockito.verify(tagDao, Mockito.never()).findAll();
    }
}
