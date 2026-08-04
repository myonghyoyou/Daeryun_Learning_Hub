package com.daeryun.probank.dto.upload;

import lombok.Getter;

@Getter
public class RowResult {
    private final int rowNumber;
    private final boolean success;
    private final String reason;

    private RowResult(int rowNumber, boolean success, String reason) {
        this.rowNumber = rowNumber;
        this.success = success;
        this.reason = reason;
    }

    public static RowResult success(int rowNumber) {
        return new RowResult(rowNumber, true, null);
    }

    public static RowResult fail(int rowNumber, String reason) {
        return new RowResult(rowNumber, false, reason);
    }
}
