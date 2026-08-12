package com.daeryun.probank.service;

import com.daeryun.probank.domain.Tag;

import java.util.List;

public interface TagService {
    List<Tag> list();

    List<Tag> listInUse();
}
