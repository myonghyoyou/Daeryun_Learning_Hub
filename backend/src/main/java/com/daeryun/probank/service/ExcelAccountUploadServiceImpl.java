package com.daeryun.probank.service;

import com.daeryun.probank.common.ErrorCode;
import com.daeryun.probank.dao.DepartmentDao;
import com.daeryun.probank.dao.ExcelUploadLogDao;
import com.daeryun.probank.dao.UserDao;
import com.daeryun.probank.domain.Department;
import com.daeryun.probank.domain.ExcelUploadLog;
import com.daeryun.probank.domain.Status;
import com.daeryun.probank.domain.UploadTargetType;
import com.daeryun.probank.domain.User;
import com.daeryun.probank.domain.UserRole;
import com.daeryun.probank.dto.upload.ExcelUploadResult;
import com.daeryun.probank.dto.upload.RowResult;
import com.daeryun.probank.exception.BizException;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.apache.poi.ss.usermodel.Cell;
import org.apache.poi.ss.usermodel.DataFormatter;
import org.apache.poi.ss.usermodel.Row;
import org.apache.poi.ss.usermodel.Sheet;
import org.apache.poi.ss.usermodel.Workbook;
import org.apache.poi.ss.usermodel.WorkbookFactory;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

@Service
public class ExcelAccountUploadServiceImpl implements ExcelAccountUploadService {

    private static final Logger LOGGER = LoggerFactory.getLogger(ExcelAccountUploadServiceImpl.class);
    private static final ObjectMapper OBJECT_MAPPER = new ObjectMapper();
    private static final int HEADER_ROW_COUNT = 1;

    private final UserDao userDao;
    private final DepartmentDao departmentDao;
    private final PasswordEncoder passwordEncoder;
    private final ExcelUploadLogDao excelUploadLogDao;
    private final AccountProvisioningService accountProvisioningService;
    private final UserAdminService userAdminService;
    private final AuditLogService auditLogService;

    public ExcelAccountUploadServiceImpl(UserDao userDao, DepartmentDao departmentDao,
                                          PasswordEncoder passwordEncoder, ExcelUploadLogDao excelUploadLogDao,
                                          AccountProvisioningService accountProvisioningService,
                                          UserAdminService userAdminService, AuditLogService auditLogService) {
        this.userDao = userDao;
        this.departmentDao = departmentDao;
        this.passwordEncoder = passwordEncoder;
        this.excelUploadLogDao = excelUploadLogDao;
        this.accountProvisioningService = accountProvisioningService;
        this.userAdminService = userAdminService;
        this.auditLogService = auditLogService;
    }

    @Override
    public ExcelUploadResult upload(MultipartFile file, Long uploadedByUserId) {
        List<RowResult> results = new ArrayList<>();
        Set<String> seenEmployeeNos = new HashSet<>();
        Set<String> seenEmails = new HashSet<>();
        DataFormatter dataFormatter = new DataFormatter();

        try (Workbook workbook = WorkbookFactory.create(file.getInputStream())) {
            Sheet sheet = workbook.getSheetAt(0);
            for (int rowIndex = HEADER_ROW_COUNT; rowIndex <= sheet.getLastRowNum(); rowIndex++) {
                Row row = sheet.getRow(rowIndex);
                if (row == null) {
                    continue;
                }
                results.add(processRow(row, rowIndex + 1, seenEmployeeNos, seenEmails, uploadedByUserId, dataFormatter));
            }
        } catch (IOException e) {
            throw new BizException(ErrorCode.FILE_REQUIRED, "엑셀 파일을 읽을 수 없습니다.");
        }

        int successRows = (int) results.stream().filter(RowResult::isSuccess).count();
        int failRows = results.size() - successRows;
        String errorDetail = results.stream()
                .filter(r -> !r.isSuccess())
                .map(r -> "행 " + r.getRowNumber() + ": " + r.getReason())
                .collect(Collectors.joining("\n"));

        ExcelUploadLog log = new ExcelUploadLog();
        log.setUploadedBy(uploadedByUserId);
        log.setDepartmentId(null);
        log.setTargetType(UploadTargetType.ACCOUNT);
        log.setFileName(file.getOriginalFilename());
        log.setTotalRows(results.size());
        log.setSuccessRows(successRows);
        log.setFailRows(failRows);
        log.setErrorDetail(errorDetail.isEmpty() ? null : errorDetail);
        excelUploadLogDao.insert(log);

        auditLogService.record(uploadedByUserId, "ACCOUNT_EXCEL_UPLOADED", "EXCEL_UPLOAD_LOG", log.getId(),
                buildUploadDetail(log));

        return new ExcelUploadResult(results.size(), successRows, failRows, log.getErrorDetail());
    }

    private RowResult processRow(Row row, int rowNumber, Set<String> seenEmployeeNos, Set<String> seenEmails,
                                  Long uploadedByUserId, DataFormatter dataFormatter) {
        String employeeNo = cellValue(row, 0, dataFormatter);
        String name = cellValue(row, 1, dataFormatter);
        String email = cellValue(row, 2, dataFormatter);
        String departmentCode = cellValue(row, 3, dataFormatter);
        String roleText = cellValue(row, 4, dataFormatter);

        if (isBlank(employeeNo) || isBlank(name) || isBlank(email) || isBlank(departmentCode) || isBlank(roleText)) {
            return RowResult.fail(rowNumber, "필수값이 누락되었습니다.");
        }
        if (!email.matches("^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$")) {
            return RowResult.fail(rowNumber, "유효한 회사 이메일 형식이 아닙니다.");
        }
        if (seenEmployeeNos.contains(employeeNo) || userDao.existsByEmployeeNo(employeeNo)) {
            return RowResult.fail(rowNumber, "이미 존재하는 사번입니다: " + employeeNo);
        }
        String normalizedEmail = email.toLowerCase();
        if (seenEmails.contains(normalizedEmail) || userDao.existsByEmail(email)) {
            return RowResult.fail(rowNumber, "이미 사용 중인 회사 이메일입니다: " + email);
        }
        Department department = departmentDao.findByCode(departmentCode);
        if (department == null) {
            return RowResult.fail(rowNumber, "존재하지 않는 부서코드입니다: " + departmentCode);
        }
        UserRole role;
        try {
            role = UserRole.valueOf(roleText.trim());
        } catch (IllegalArgumentException e) {
            return RowResult.fail(rowNumber, "유효하지 않은 역할입니다: " + roleText);
        }

        String tempPassword = userAdminService.generateTempPassword();
        User user = new User();
        user.setEmployeeNo(employeeNo);
        user.setName(name);
        user.setEmail(email);
        user.setPasswordHash(passwordEncoder.encode(tempPassword));
        user.setDepartmentId(department.getId());
        user.setRole(role);
        user.setStatus(Status.ACTIVE);
        user.setMustChangePassword(true);
        try {
            accountProvisioningService.provision(user, tempPassword, uploadedByUserId);
        } catch (RuntimeException e) {
            // 임시 비밀번호는 절대 로그에 남기지 않는다. userDao.insert/mailService/auditLogService 가
            // 던지는 예외는 제약조건 위반, 메일 전송 실패, 감사 로그 검증 실패 메시지만 담으므로 안전하다.
            LOGGER.warn("행 {} 계정 프로비저닝 실패", rowNumber, e);
            return RowResult.fail(rowNumber, "계정 저장 또는 회사 이메일 발송에 실패했습니다.");
        }

        seenEmployeeNos.add(employeeNo);
        seenEmails.add(normalizedEmail);
        return RowResult.success(rowNumber);
    }

    private String buildUploadDetail(ExcelUploadLog log) {
        Map<String, Object> detail = new LinkedHashMap<>();
        detail.put("fileName", log.getFileName());
        detail.put("totalRows", log.getTotalRows());
        detail.put("successRows", log.getSuccessRows());
        detail.put("failRows", log.getFailRows());
        try {
            return OBJECT_MAPPER.writeValueAsString(detail);
        } catch (JsonProcessingException e) {
            throw new IllegalStateException("Failed to serialize excel upload audit detail", e);
        }
    }

    private String cellValue(Row row, int cellIndex, DataFormatter dataFormatter) {
        Cell cell = row.getCell(cellIndex);
        if (cell == null) {
            return "";
        }
        return dataFormatter.formatCellValue(cell).trim();
    }

    private boolean isBlank(String value) {
        return value == null || value.trim().isEmpty();
    }
}
