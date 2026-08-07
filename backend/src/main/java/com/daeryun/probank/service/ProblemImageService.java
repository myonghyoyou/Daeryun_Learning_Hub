package com.daeryun.probank.service;

import com.daeryun.probank.common.AuthUser;
import org.springframework.web.multipart.MultipartFile;

public interface ProblemImageService {
    String store(MultipartFile file, AuthUser actor);
}
