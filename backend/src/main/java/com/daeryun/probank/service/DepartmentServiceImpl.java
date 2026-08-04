package com.daeryun.probank.service;

import com.daeryun.probank.common.ErrorCode;
import com.daeryun.probank.common.AuthUser;
import com.daeryun.probank.dao.DepartmentDao;
import com.daeryun.probank.domain.Department;
import com.daeryun.probank.domain.Status;
import com.daeryun.probank.dto.department.DepartmentCreateRequest;
import com.daeryun.probank.dto.department.DepartmentResponse;
import com.daeryun.probank.dto.department.DepartmentUpdateRequest;
import com.daeryun.probank.exception.BizException;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@Service
public class DepartmentServiceImpl implements DepartmentService {

    private static final ObjectMapper OBJECT_MAPPER = new ObjectMapper();
    /** departments.name VARCHAR(100) / departments.code VARCHAR(50) 컬럼 길이와 맞춘다. */
    private static final int NAME_MAX_LENGTH = 100;
    private static final int CODE_MAX_LENGTH = 50;

    private final DepartmentDao departmentDao;
    private final AuditLogService auditLogService;

    public DepartmentServiceImpl(DepartmentDao departmentDao, AuditLogService auditLogService) {
        this.departmentDao = departmentDao;
        this.auditLogService = auditLogService;
    }

    @Override
    public List<DepartmentResponse> list() {
        return departmentDao.findAll().stream().map(DepartmentResponse::from).collect(Collectors.toList());
    }

    /**
     * insert 와 auditLogService.record 를 한 트랜잭션으로 묶는다. 묶지 않으면 감사 로그 기록이
     * 실패했을 때 부서 행만 커밋된 채로 남아, 재시도하면 "이미 존재하는 부서 코드입니다"가 되고
     * 감사 기록은 영영 유실된다(UserAdminServiceImpl 과 같은 경계).
     */
    @Override
    @Transactional
    public void create(DepartmentCreateRequest request, AuthUser actor) {
        validateName(request.getName());
        validateCode(request.getCode());
        if (departmentDao.findByCode(request.getCode()) != null) {
            throw new BizException(ErrorCode.INPUT_VALUE_INVALID, "이미 존재하는 부서 코드입니다: " + request.getCode());
        }
        Department department = new Department();
        department.setName(request.getName());
        department.setCode(request.getCode());
        department.setStatus(Status.ACTIVE);
        departmentDao.insert(department);
        auditLogService.record(actor.getUserId(), "DEPARTMENT_CREATED", "DEPARTMENT", department.getId(),
                buildCreateDetail(department));
    }

    @Override
    @Transactional
    public void update(Long id, DepartmentUpdateRequest request, AuthUser actor) {
        validateName(request.getName());
        if (request.getStatus() == null) {
            throw new BizException(ErrorCode.INPUT_VALUE_INVALID, "부서 상태를 선택하세요.");
        }
        Department department = departmentDao.findById(id);
        if (department == null) {
            throw new BizException(ErrorCode.INPUT_VALUE_INVALID, "존재하지 않는 부서입니다.");
        }
        department.setName(request.getName());
        department.setStatus(request.getStatus());
        departmentDao.update(department);
        auditLogService.record(actor.getUserId(), "DEPARTMENT_UPDATED", "DEPARTMENT", id,
                buildUpdateDetail(department));
    }

    // 프런트(departmentValidation.js)도 같은 필수값을 검사하지만, API 를 직접 호출하면
    // 그 검증을 건너뛸 수 있으므로 서버가 최종 권한이다. 길이는 컬럼 정의와 맞춰,
    // NOT NULL / value too long 같은 DB 제약 위반이 "처리 중 오류가 발생하였습니다."로
    // 새어 나가지 않게 한다.
    private void validateName(String name) {
        if (name == null || name.trim().isEmpty()) {
            throw new BizException(ErrorCode.INPUT_VALUE_INVALID, "부서명을 입력하세요.");
        }
        if (name.length() > NAME_MAX_LENGTH) {
            throw new BizException(ErrorCode.INPUT_VALUE_INVALID, "부서명은 " + NAME_MAX_LENGTH + "자를 넘을 수 없습니다.");
        }
    }

    private void validateCode(String code) {
        if (code == null || code.trim().isEmpty()) {
            throw new BizException(ErrorCode.INPUT_VALUE_INVALID, "부서 코드를 입력하세요.");
        }
        if (code.length() > CODE_MAX_LENGTH) {
            throw new BizException(ErrorCode.INPUT_VALUE_INVALID, "부서 코드는 " + CODE_MAX_LENGTH + "자를 넘을 수 없습니다.");
        }
    }

    private String buildCreateDetail(Department department) {
        Map<String, Object> detail = new LinkedHashMap<>();
        detail.put("code", department.getCode());
        return writeJson(detail, "department create");
    }

    private String buildUpdateDetail(Department department) {
        Map<String, Object> detail = new LinkedHashMap<>();
        detail.put("code", department.getCode());
        detail.put("name", department.getName());
        detail.put("status", department.getStatus());
        return writeJson(detail, "department update");
    }

    // 코드/이름에 " 나 \ 가 들어가도 유효한 JSON 이 되도록 직접 문자열을 조립하지 않는다.
    // 깨진 JSON 은 AuditLogServiceImpl 이 fail-closed 로 거부해 요청 전체를 실패시킨다.
    private String writeJson(Map<String, Object> detail, String context) {
        try {
            return OBJECT_MAPPER.writeValueAsString(detail);
        } catch (JsonProcessingException e) {
            throw new IllegalStateException("Failed to serialize " + context + " audit detail", e);
        }
    }
}
