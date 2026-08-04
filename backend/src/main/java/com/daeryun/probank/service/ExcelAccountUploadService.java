package com.daeryun.probank.service;

import com.daeryun.probank.dto.upload.ExcelUploadResult;
import org.springframework.web.multipart.MultipartFile;

public interface ExcelAccountUploadService {
    ExcelUploadResult upload(MultipartFile file, Long uploadedByUserId);
}
