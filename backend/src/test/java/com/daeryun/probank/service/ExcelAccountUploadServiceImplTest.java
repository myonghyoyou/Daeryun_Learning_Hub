package com.daeryun.probank.service;

import com.daeryun.probank.dao.DepartmentDao;
import com.daeryun.probank.dao.ExcelUploadLogDao;
import com.daeryun.probank.dao.UserDao;
import com.daeryun.probank.domain.Department;
import com.daeryun.probank.domain.User;
import com.daeryun.probank.dto.upload.ExcelUploadResult;
import org.apache.poi.ss.usermodel.Row;
import org.apache.poi.ss.usermodel.Sheet;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.mockito.Mockito;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;

import java.io.ByteArrayOutputStream;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;

class ExcelAccountUploadServiceImplTest {

    private UserDao userDao;
    private DepartmentDao departmentDao;
    private ExcelUploadLogDao excelUploadLogDao;
    private AccountProvisioningService accountProvisioningService;
    private UserAdminService userAdminService;
    private AuditLogService auditLogService;
    private ExcelAccountUploadServiceImpl service;

    @BeforeEach
    void setUp() {
        userDao = Mockito.mock(UserDao.class);
        departmentDao = Mockito.mock(DepartmentDao.class);
        excelUploadLogDao = Mockito.mock(ExcelUploadLogDao.class);
        accountProvisioningService = Mockito.mock(AccountProvisioningService.class);
        userAdminService = Mockito.mock(UserAdminService.class);
        auditLogService = Mockito.mock(AuditLogService.class);
        Mockito.when(userAdminService.generateTempPassword()).thenReturn("Temp1234!");
        service = new ExcelAccountUploadServiceImpl(userDao, departmentDao, new BCryptPasswordEncoder(),
                excelUploadLogDao, accountProvisioningService, userAdminService, auditLogService);
    }

    private MockMultipartFile buildExcel(Object[][] rows) throws Exception {
        try (XSSFWorkbook workbook = new XSSFWorkbook()) {
            Sheet sheet = workbook.createSheet("accounts");
            for (int r = 0; r < rows.length; r++) {
                Row row = sheet.createRow(r);
                for (int c = 0; c < rows[r].length; c++) {
                    Object value = rows[r][c];
                    if (value instanceof Number) {
                        row.createCell(c).setCellValue(((Number) value).doubleValue());
                    } else {
                        row.createCell(c).setCellValue((String) value);
                    }
                }
            }
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            workbook.write(out);
            return new MockMultipartFile("file", "accounts.xlsx", "application/vnd.ms-excel", out.toByteArray());
        }
    }

    @Test
    void upload_withValidAndInvalidRows_partiallySucceeds() throws Exception {
        Department department = new Department();
        department.setId(10L);
        Mockito.when(departmentDao.findByCode("DEV")).thenReturn(department);
        Mockito.when(departmentDao.findByCode("UNKNOWN")).thenReturn(null);
        Mockito.when(userDao.existsByEmployeeNo(Mockito.anyString())).thenReturn(false);

        MockMultipartFile file = buildExcel(new Object[][]{
                {"사번", "이름", "회사이메일", "부서코드", "역할"},
                {"3001", "박영희", "park@company.com", "DEV", "EMPLOYEE"},
                {"3002", "이민호", "lee@company.com", "UNKNOWN", "EMPLOYEE"},
                {"", "", "", "", ""},
        });

        ExcelUploadResult result = service.upload(file, 1L);

        assertEquals(3, result.getTotalRows());
        assertEquals(1, result.getSuccessRows());
        assertEquals(2, result.getFailRows());
        // ExcelAccountUploadServiceImpl 은 직접 userDao.insert 를 호출하지 않고 AccountProvisioningService
        // 를 통해 각 행을 별도 트랜잭션으로 영속화한다(계약: "직접 INSERT하지 않는다").
        Mockito.verify(accountProvisioningService, Mockito.times(1))
                .provision(Mockito.any(User.class), Mockito.anyString(), Mockito.eq(1L));
        Mockito.verify(userDao, Mockito.never()).insert(Mockito.any());
        ArgumentCaptor<com.daeryun.probank.domain.ExcelUploadLog> logCaptor =
                ArgumentCaptor.forClass(com.daeryun.probank.domain.ExcelUploadLog.class);
        Mockito.verify(excelUploadLogDao).insert(logCaptor.capture());
        assertEquals(1, logCaptor.getValue().getSuccessRows());
    }

    @Test
    void upload_withDuplicateEmployeeNoWithinSameFile_failsSecondOccurrence() throws Exception {
        Department department = new Department();
        department.setId(10L);
        Mockito.when(departmentDao.findByCode("DEV")).thenReturn(department);
        Mockito.when(userDao.existsByEmployeeNo("3001")).thenReturn(false);

        MockMultipartFile file = buildExcel(new Object[][]{
                {"사번", "이름", "회사이메일", "부서코드", "역할"},
                {"3001", "박영희", "park@company.com", "DEV", "EMPLOYEE"},
                {"3001", "박영희2", "park2@company.com", "DEV", "EMPLOYEE"},
        });

        ExcelUploadResult result = service.upload(file, 1L);

        assertEquals(1, result.getSuccessRows());
        assertEquals(1, result.getFailRows());
    }

    @Test
    void upload_withDuplicateEmailWithinSameFile_failsSecondOccurrence() throws Exception {
        Department department = new Department();
        department.setId(10L);
        Mockito.when(departmentDao.findByCode("DEV")).thenReturn(department);
        Mockito.when(userDao.existsByEmployeeNo(Mockito.anyString())).thenReturn(false);

        MockMultipartFile file = buildExcel(new Object[][]{
                {"사번", "이름", "회사이메일", "부서코드", "역할"},
                {"3001", "박영희", "park@company.com", "DEV", "EMPLOYEE"},
                {"3002", "박영희2", "PARK@company.com", "DEV", "EMPLOYEE"},
        });

        ExcelUploadResult result = service.upload(file, 1L);

        assertEquals(1, result.getSuccessRows());
        assertEquals(1, result.getFailRows());
        assertEquals("행 3: 이미 사용 중인 회사 이메일입니다: PARK@company.com", result.getErrorDetail());
    }

    @Test
    void upload_withNumericEmployeeNoCell_readsAsPlainDigitsNotDouble() throws Exception {
        Department department = new Department();
        department.setId(10L);
        Mockito.when(departmentDao.findByCode("DEV")).thenReturn(department);
        Mockito.when(userDao.existsByEmployeeNo(Mockito.anyString())).thenReturn(false);

        MockMultipartFile file = buildExcel(new Object[][]{
                {"사번", "이름", "회사이메일", "부서코드", "역할"},
                {3003, "박영희", "park3@company.com", "DEV", "EMPLOYEE"},
        });

        ExcelUploadResult result = service.upload(file, 1L);

        assertEquals(1, result.getSuccessRows());
        ArgumentCaptor<User> userCaptor = ArgumentCaptor.forClass(User.class);
        Mockito.verify(accountProvisioningService)
                .provision(userCaptor.capture(), Mockito.anyString(), Mockito.eq(1L));
        assertEquals("3003", userCaptor.getValue().getEmployeeNo());
    }

    @Test
    void upload_whenProvisioningThrows_marksRowAsFailedAndDoesNotPropagate() throws Exception {
        Department department = new Department();
        department.setId(10L);
        Mockito.when(departmentDao.findByCode("DEV")).thenReturn(department);
        Mockito.when(userDao.existsByEmployeeNo(Mockito.anyString())).thenReturn(false);
        Mockito.doThrow(new RuntimeException("SMTP 연결 실패"))
                .when(accountProvisioningService)
                .provision(Mockito.any(User.class), Mockito.anyString(), Mockito.anyLong());

        MockMultipartFile file = buildExcel(new Object[][]{
                {"사번", "이름", "회사이메일", "부서코드", "역할"},
                {"3001", "박영희", "park@company.com", "DEV", "EMPLOYEE"},
        });

        ExcelUploadResult result = service.upload(file, 1L);

        assertEquals(0, result.getSuccessRows());
        assertEquals(1, result.getFailRows());
        assertFalse(result.getErrorDetail().toLowerCase().contains("smtp"),
                "행 실패 사유는 고정 문구여야 하고 하위 예외의 상세 메시지를 노출해서는 안 된다");
    }

    @Test
    void upload_recordsUploadLevelAuditEntryWithSummaryAndNoPasswordKey() throws Exception {
        Department department = new Department();
        department.setId(10L);
        Mockito.when(departmentDao.findByCode("DEV")).thenReturn(department);
        Mockito.when(userDao.existsByEmployeeNo(Mockito.anyString())).thenReturn(false);
        Mockito.doAnswer(invocation -> {
            com.daeryun.probank.domain.ExcelUploadLog log = invocation.getArgument(0);
            log.setId(77L);
            return null;
        }).when(excelUploadLogDao).insert(Mockito.any());

        MockMultipartFile file = buildExcel(new Object[][]{
                {"사번", "이름", "회사이메일", "부서코드", "역할"},
                {"3001", "박영희", "park@company.com", "DEV", "EMPLOYEE"},
        });

        service.upload(file, 1L);

        ArgumentCaptor<String> detailCaptor = ArgumentCaptor.forClass(String.class);
        Mockito.verify(auditLogService).record(Mockito.eq(1L), Mockito.eq("ACCOUNT_EXCEL_UPLOADED"),
                Mockito.eq("EXCEL_UPLOAD_LOG"), Mockito.eq(77L), detailCaptor.capture());

        assertFalse(detailCaptor.getValue().toLowerCase().contains("password"));
        com.fasterxml.jackson.databind.JsonNode detail =
                new com.fasterxml.jackson.databind.ObjectMapper().readTree(detailCaptor.getValue());
        assertEquals("accounts.xlsx", detail.get("fileName").asText());
        assertEquals(1, detail.get("totalRows").asInt());
        assertEquals(1, detail.get("successRows").asInt());
        assertEquals(0, detail.get("failRows").asInt());
    }
}
