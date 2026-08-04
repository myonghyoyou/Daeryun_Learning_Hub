package com.daeryun.probank.domain;

import lombok.Data;

import java.time.LocalDateTime;

@Data
public class ExcelUploadLog {
    private Long id;
    private Long uploadedBy;
    private Long departmentId;
    private UploadTargetType targetType;
    private String fileName;
    private int totalRows;
    private int successRows;
    private int failRows;
    private String errorDetail;
    private LocalDateTime createdAt;
}
