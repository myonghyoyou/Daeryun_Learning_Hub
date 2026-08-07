package com.daeryun.probank.service;

import com.daeryun.probank.common.AuthUser;
import com.daeryun.probank.dto.upload.ExcelUploadResult;
import org.springframework.web.multipart.MultipartFile;

public interface ExcelProblemUploadService {
    ExcelUploadResult upload(MultipartFile file, AuthUser actor);
}
