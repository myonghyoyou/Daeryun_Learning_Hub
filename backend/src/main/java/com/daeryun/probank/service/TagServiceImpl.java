package com.daeryun.probank.service;

import com.daeryun.probank.dao.TagDao;
import com.daeryun.probank.domain.Tag;
import org.springframework.stereotype.Service;

import java.util.List;

@Service
public class TagServiceImpl implements TagService {

    private final TagDao tagDao;

    public TagServiceImpl(TagDao tagDao) {
        this.tagDao = tagDao;
    }

    @Override
    public List<Tag> list() {
        return tagDao.findAll();
    }

    @Override
    public List<Tag> listInUse() {
        return tagDao.findInUse();
    }
}
