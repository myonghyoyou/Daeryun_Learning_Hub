package com.daeryun.probank.service;

import com.daeryun.probank.common.AuthUser;
import com.daeryun.probank.common.ErrorCode;
import com.daeryun.probank.dao.DepartmentDao;
import com.daeryun.probank.dao.UserDao;
import com.daeryun.probank.domain.Department;
import com.daeryun.probank.domain.Status;
import com.daeryun.probank.domain.User;
import com.daeryun.probank.domain.UserRole;
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
    /** users.employee_no VARCHAR(50) / users.name VARCHAR(100) / users.email VARCHAR(255) 컬럼 길이와 맞춘다. */
    private static final int EMPLOYEE_NO_MAX_LENGTH = 50;
    private static final int NAME_MAX_LENGTH = 100;
    private static final int EMAIL_MAX_LENGTH = 255;
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
        validateEmployeeNo(request.getEmployeeNo());
        validateName(request.getName());
        validateEmail(request.getEmail());
        validateRole(request.getRole());
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
        validateName(request.getName());
        validateEmail(request.getEmail());
        validateRole(request.getRole());
        if (request.getStatus() == null) {
            throw new BizException(ErrorCode.INPUT_VALUE_INVALID, "계정 상태를 선택하세요.");
        }
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
        validateAdminAccessIsPreserved(user, request, actor);

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

    // 프런트(userValidation.js)도 같은 필수값을 검사하지만 API 를 직접 호출하면 건너뛸 수 있으므로
    // 서버가 최종 권한이다. 길이는 컬럼 정의와 맞춰, NOT NULL / value too long 같은 DB 제약 위반이
    // "처리 중 오류가 발생하였습니다."로 새어 나가지 않게 한다.
    private void validateEmployeeNo(String employeeNo) {
        if (employeeNo == null || employeeNo.trim().isEmpty()) {
            throw new BizException(ErrorCode.INPUT_VALUE_INVALID, "사번을 입력하세요.");
        }
        if (employeeNo.length() > EMPLOYEE_NO_MAX_LENGTH) {
            throw new BizException(ErrorCode.INPUT_VALUE_INVALID, "사번은 " + EMPLOYEE_NO_MAX_LENGTH + "자를 넘을 수 없습니다.");
        }
    }

    private void validateName(String name) {
        if (name == null || name.trim().isEmpty()) {
            throw new BizException(ErrorCode.INPUT_VALUE_INVALID, "이름을 입력하세요.");
        }
        if (name.length() > NAME_MAX_LENGTH) {
            throw new BizException(ErrorCode.INPUT_VALUE_INVALID, "이름은 " + NAME_MAX_LENGTH + "자를 넘을 수 없습니다.");
        }
    }

    private void validateRole(UserRole role) {
        if (role == null) {
            throw new BizException(ErrorCode.INPUT_VALUE_INVALID, "역할을 선택하세요.");
        }
    }

    private void validateEmail(String email) {
        if (email == null || email.trim().isEmpty() || !EMAIL_PATTERN.matcher(email.trim()).matches()) {
            throw new BizException(ErrorCode.INPUT_VALUE_INVALID, "유효한 회사 이메일을 입력하세요.");
        }
        if (email.length() > EMAIL_MAX_LENGTH) {
            throw new BizException(ErrorCode.INPUT_VALUE_INVALID,
                    "회사 이메일은 " + EMAIL_MAX_LENGTH + "자를 넘을 수 없습니다.");
        }
    }

    /**
     * 총괄 관리자 접근 경로가 끊기는 변경을 막는다.
     * <p>
     * 1) 본인 계정의 SUPER_ADMIN 해제·비활성화는 다른 관리자가 남아 있더라도 막는다. 실수 한 번으로
     *    자기 자신을 관리 화면 밖으로 내보내는 사고이고, 되돌리려면 다른 관리자의 손을 빌려야 한다.
     * 2) 활성 SUPER_ADMIN 이 이 계정 하나뿐이면 역할 해제도 비활성화도 막는다. 비활성화하면 아무도
     *    관리 화면에 들어갈 수 없고, EMPLOYEE 로 강등하면 재기동 시 SuperAdminBootstrapRunner 가
     *    같은 사번으로 부트스트랩 계정을 넣으려다 employee_no UNIQUE 위반으로 애플리케이션 기동
     *    자체가 실패한다. 어느 쪽도 화면만으로는 복구할 수 없다.
     */
    private void validateAdminAccessIsPreserved(User user, UserUpdateRequest request, AuthUser actor) {
        boolean losesSuperAdminRole = user.getRole() == UserRole.SUPER_ADMIN && request.getRole() != UserRole.SUPER_ADMIN;
        boolean isDeactivated = user.getStatus() == Status.ACTIVE && request.getStatus() == Status.INACTIVE;

        if (actor.getUserId() != null && actor.getUserId().equals(user.getId())) {
            if (losesSuperAdminRole) {
                throw new BizException(ErrorCode.INPUT_VALUE_INVALID, "본인의 총괄 관리자 역할은 스스로 해제할 수 없습니다.");
            }
            if (isDeactivated) {
                throw new BizException(ErrorCode.INPUT_VALUE_INVALID, "본인 계정은 스스로 비활성화할 수 없습니다.");
            }
        }

        if ((losesSuperAdminRole || (isDeactivated && user.getRole() == UserRole.SUPER_ADMIN))
                && userDao.countActiveSuperAdminsExcluding(user.getId()) == 0) {
            throw new BizException(ErrorCode.INPUT_VALUE_INVALID,
                    "마지막 활성 총괄 관리자입니다. 다른 총괄 관리자를 먼저 지정한 뒤 역할 변경 또는 비활성화하세요.");
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
