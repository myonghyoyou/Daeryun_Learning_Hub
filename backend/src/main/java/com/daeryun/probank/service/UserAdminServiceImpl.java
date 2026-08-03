package com.daeryun.probank.service;

import com.daeryun.probank.common.AuthUser;
import com.daeryun.probank.common.ErrorCode;
import com.daeryun.probank.dao.DepartmentDao;
import com.daeryun.probank.dao.UserDao;
import com.daeryun.probank.domain.Department;
import com.daeryun.probank.domain.Status;
import com.daeryun.probank.domain.User;
import com.daeryun.probank.dto.user.UserCreateRequest;
import com.daeryun.probank.dto.user.UserCreateResponse;
import com.daeryun.probank.dto.user.UserListItem;
import com.daeryun.probank.dto.user.UserUpdateRequest;
import com.daeryun.probank.exception.BizException;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.security.SecureRandom;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Pattern;

@Service
public class UserAdminServiceImpl implements UserAdminService {

    private static final ObjectMapper OBJECT_MAPPER = new ObjectMapper();
    private static final Pattern EMAIL_PATTERN = Pattern.compile("^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$");
    private static final String TEMP_PASSWORD_CHARS = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
    private static final int TEMP_PASSWORD_LENGTH = 10;
    private final SecureRandom random = new SecureRandom();

    private final UserDao userDao;
    private final DepartmentDao departmentDao;
    private final PasswordEncoder passwordEncoder;
    private final MailService mailService;
    private final AuditLogService auditLogService;

    public UserAdminServiceImpl(UserDao userDao, DepartmentDao departmentDao, PasswordEncoder passwordEncoder,
                                MailService mailService, AuditLogService auditLogService) {
        this.userDao = userDao;
        this.departmentDao = departmentDao;
        this.passwordEncoder = passwordEncoder;
        this.mailService = mailService;
        this.auditLogService = auditLogService;
    }

    @Override
    public List<UserListItem> list(Long departmentId) {
        return userDao.findAll(departmentId);
    }

    /**
     * userDao.insert -> mailService.sendTemporaryPassword -> auditLogService.record 순서로 실행한다.
     * 메일 발송에 실패하면 예외가 트랜잭션을 롤백시켜 계정 생성 요청 전체가 실패로 처리된다.
     */
    @Override
    @Transactional
    public UserCreateResponse create(UserCreateRequest request, AuthUser actor) {
        validateEmail(request.getEmail());
        if (userDao.existsByEmployeeNo(request.getEmployeeNo())) {
            throw new BizException(ErrorCode.INPUT_VALUE_INVALID, "이미 존재하는 사번입니다: " + request.getEmployeeNo());
        }
        if (userDao.existsByEmail(request.getEmail())) {
            throw new BizException(ErrorCode.INPUT_VALUE_INVALID, "이미 사용 중인 회사 이메일입니다: " + request.getEmail());
        }
        Department department = departmentDao.findById(request.getDepartmentId());
        if (department == null) {
            throw new BizException(ErrorCode.INPUT_VALUE_INVALID, "존재하지 않는 부서입니다.");
        }

        String tempPassword = generateTempPassword();
        User user = new User();
        user.setEmployeeNo(request.getEmployeeNo());
        user.setName(request.getName());
        user.setEmail(request.getEmail());
        user.setPasswordHash(passwordEncoder.encode(tempPassword));
        user.setDepartmentId(department.getId());
        user.setRole(request.getRole());
        user.setStatus(Status.ACTIVE);
        user.setMustChangePassword(true);

        userDao.insert(user);
        mailService.sendTemporaryPassword(user.getEmail(), user.getEmployeeNo(), tempPassword);
        auditLogService.record(actor.getUserId(), "USER_CREATED", "USER", user.getId(), buildCreateDetail(user));

        return new UserCreateResponse(user.getEmployeeNo(), user.getName(), user.getEmail(), true);
    }

    @Override
    @Transactional
    public void update(Long id, UserUpdateRequest request, AuthUser actor) {
        validateEmail(request.getEmail());
        User user = userDao.findById(id);
        if (user == null) {
            throw new BizException(ErrorCode.INPUT_VALUE_INVALID, "존재하지 않는 계정입니다.");
        }
        Department department = departmentDao.findById(request.getDepartmentId());
        if (department == null) {
            throw new BizException(ErrorCode.INPUT_VALUE_INVALID, "존재하지 않는 부서입니다.");
        }
        if (!request.getEmail().equalsIgnoreCase(user.getEmail()) && userDao.existsByEmail(request.getEmail())) {
            throw new BizException(ErrorCode.INPUT_VALUE_INVALID, "이미 사용 중인 회사 이메일입니다: " + request.getEmail());
        }

        user.setName(request.getName());
        user.setEmail(request.getEmail());
        user.setDepartmentId(department.getId());
        user.setRole(request.getRole());
        user.setStatus(request.getStatus());
        userDao.update(user);

        auditLogService.record(actor.getUserId(), "USER_UPDATED", "USER", id, buildUpdateDetail(user));
    }

    @Override
    public String generateTempPassword() {
        StringBuilder builder = new StringBuilder(TEMP_PASSWORD_LENGTH);
        for (int i = 0; i < TEMP_PASSWORD_LENGTH; i++) {
            builder.append(TEMP_PASSWORD_CHARS.charAt(random.nextInt(TEMP_PASSWORD_CHARS.length())));
        }
        return builder.toString();
    }

    private void validateEmail(String email) {
        if (email == null || email.trim().isEmpty() || !EMAIL_PATTERN.matcher(email.trim()).matches()) {
            throw new BizException(ErrorCode.INPUT_VALUE_INVALID, "유효한 회사 이메일을 입력하세요.");
        }
    }

    private String buildCreateDetail(User user) {
        Map<String, Object> detail = new LinkedHashMap<>();
        detail.put("employeeNo", user.getEmployeeNo());
        return writeJson(detail, "user create");
    }

    private String buildUpdateDetail(User user) {
        Map<String, Object> detail = new LinkedHashMap<>();
        detail.put("employeeNo", user.getEmployeeNo());
        detail.put("name", user.getName());
        detail.put("email", user.getEmail());
        detail.put("departmentId", user.getDepartmentId());
        detail.put("role", user.getRole());
        detail.put("status", user.getStatus());
        return writeJson(detail, "user update");
    }

    private String writeJson(Map<String, Object> detail, String context) {
        try {
            return OBJECT_MAPPER.writeValueAsString(detail);
        } catch (JsonProcessingException e) {
            throw new IllegalStateException("Failed to serialize " + context + " audit detail", e);
        }
    }
}
