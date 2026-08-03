package com.daeryun.probank.domain;

import lombok.Data;

import java.time.LocalDateTime;

@Data
public class Department {
    private Long id;
    private String name;
    private String code;
    private Status status;
    private LocalDateTime createdAt;
}
