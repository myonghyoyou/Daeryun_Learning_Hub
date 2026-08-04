package com.daeryun.probank.dao;

import com.daeryun.probank.domain.ExcelUploadLog;
import com.daeryun.probank.domain.UploadTargetType;
import org.apache.ibatis.annotations.Param;

import java.util.List;

public interface ExcelUploadLogDao {
    void insert(ExcelUploadLog log);
    List<ExcelUploadLog> findAll(@Param("targetType") UploadTargetType targetType, @Param("departmentId") Long departmentId);
}
