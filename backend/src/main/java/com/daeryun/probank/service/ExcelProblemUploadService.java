package com.daeryun.probank.service;

import com.daeryun.probank.common.AuthUser;
import com.daeryun.probank.dto.upload.ExcelUploadResult;
import org.springframework.web.multipart.MultipartFile;

public interface ExcelProblemUploadService {
    /**
     * @param departmentId 총괄 관리자가 지정한 귀속 부서. 부서 관리자에게는 무시되고 본인 부서가 쓰인다.
     */
    ExcelUploadResult upload(MultipartFile file, Long departmentId, AuthUser actor);
}
