package com.daeryun.probank.service;

import com.daeryun.probank.domain.User;

public interface AccountProvisioningService {

    /**
     * userDao.insert -> mailService.sendTemporaryPassword -> auditLogService.record 순서로,
     * 새 트랜잭션(REQUIRES_NEW)에서 계정 한 건을 영속화한다. 엑셀 업로드처럼 여러 행을 순회하며
     * 호출하는 경우 한 행의 실패(메일 발송 실패 포함)가 다른 행의 커밋에 영향을 주지 않도록 하기 위함이다.
     */
    void provision(User user, String temporaryPassword, Long actorId);
}
