package com.daeryun.probank.dto.upload;

import lombok.AllArgsConstructor;
import lombok.Data;

@Data
@AllArgsConstructor
public class ExcelUploadResult {
    private int totalRows;
    private int successRows;
    private int failRows;
    private String errorDetail;
}
