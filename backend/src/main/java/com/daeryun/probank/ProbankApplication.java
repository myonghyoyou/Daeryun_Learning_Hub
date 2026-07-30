package com.daeryun.probank;

import org.mybatis.spring.annotation.MapperScan;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

@SpringBootApplication
@MapperScan("com.daeryun.probank.dao")
public class ProbankApplication {

    public static void main(String[] args) {
        SpringApplication.run(ProbankApplication.class, args);
    }
}
