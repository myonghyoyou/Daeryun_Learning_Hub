package com.daeryun.probank.service;

import com.daeryun.probank.common.AuthUser;
import com.daeryun.probank.dao.ExcelUploadLogDao;
import com.daeryun.probank.dao.ProblemAnswerDao;
import com.daeryun.probank.dao.ProblemChoiceDao;
import com.daeryun.probank.dao.ProblemDao;
import com.daeryun.probank.dao.ProblemTagDao;
import com.daeryun.probank.dao.TagDao;
import com.daeryun.probank.domain.UserRole;
import com.daeryun.probank.dto.upload.ExcelUploadResult;
import org.apache.poi.ss.usermodel.Row;
import org.apache.poi.ss.usermodel.Sheet;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;
import org.springframework.mock.web.MockMultipartFile;

import java.io.ByteArrayOutputStream;

import static org.junit.jupiter.api.Assertions.assertEquals;

class ExcelProblemUploadServiceImplTest {

    private ProblemDao problemDao;
    private ProblemChoiceDao problemChoiceDao;
    private ProblemAnswerDao problemAnswerDao;
    private ExcelUploadLogDao excelUploadLogDao;
    private TagDao tagDao;
    private ProblemTagDao problemTagDao;
    private ExcelProblemUploadServiceImpl service;
    private final AuthUser actor = new AuthUser(1L, "1001", "관리자", UserRole.DEPT_ADMIN, 10L, false);

    @BeforeEach
    void setUp() {
        problemDao = Mockito.mock(ProblemDao.class);
        problemChoiceDao = Mockito.mock(ProblemChoiceDao.class);
        problemAnswerDao = Mockito.mock(ProblemAnswerDao.class);
        excelUploadLogDao = Mockito.mock(ExcelUploadLogDao.class);
        tagDao = Mockito.mock(TagDao.class);
        problemTagDao = Mockito.mock(ProblemTagDao.class);
        AuditLogService auditLogService = Mockito.mock(AuditLogService.class);
        service = new ExcelProblemUploadServiceImpl(problemDao, problemChoiceDao, problemAnswerDao, excelUploadLogDao,
                tagDao, problemTagDao, auditLogService);
    }

    private MockMultipartFile buildExcel(String[][] rows) throws Exception {
        try (XSSFWorkbook workbook = new XSSFWorkbook()) {
            Sheet sheet = workbook.createSheet("problems");
            for (int r = 0; r < rows.length; r++) {
                Row row = sheet.createRow(r);
                for (int c = 0; c < rows[r].length; c++) {
                    row.createCell(c).setCellValue(rows[r][c]);
                }
            }
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            workbook.write(out);
            return new MockMultipartFile("file", "problems.xlsx", "application/vnd.ms-excel", out.toByteArray());
        }
    }

    @Test
    void upload_mcqSingleRow_succeeds() throws Exception {
        MockMultipartFile file = buildExcel(new String[][]{
                {"문제유형", "문제내용", "이미지", "참조지문", "보기1", "보기2", "보기3", "보기4", "보기5", "정답", "해설", "태그"},
                {"MCQ_SINGLE", "1+1=?", "", "", "1", "2", "3", "", "", "2", "기본 연산", "수학,기초"},
        });

        ExcelUploadResult result = service.upload(file, actor);

        assertEquals(1, result.getSuccessRows());
        assertEquals(0, result.getFailRows());
        Mockito.verify(problemDao).insert(Mockito.any());
        Mockito.verify(problemChoiceDao).insertAll(Mockito.anyList());
    }

    @Test
    void upload_shortAnswerRow_succeeds() throws Exception {
        MockMultipartFile file = buildExcel(new String[][]{
                {"문제유형", "문제내용", "이미지", "참조지문", "보기1", "보기2", "보기3", "보기4", "보기5", "정답", "해설", "태그"},
                {"SHORT_ANSWER", "대한민국의 수도는?", "", "", "", "", "", "", "", "서울,Seoul", ""},
        });

        ExcelUploadResult result = service.upload(file, actor);

        assertEquals(1, result.getSuccessRows());
        Mockito.verify(problemAnswerDao).insertAll(Mockito.anyList());
    }

    @Test
    void upload_fillBlankRow_fails() throws Exception {
        MockMultipartFile file = buildExcel(new String[][]{
                {"문제유형", "문제내용", "이미지", "참조지문", "보기1", "보기2", "보기3", "보기4", "보기5", "정답", "해설", "태그"},
                {"FILL_BLANK", "{{blank_1}}은 수도이다.", "", "", "", "", "", "", "", "", ""},
        });

        ExcelUploadResult result = service.upload(file, actor);

        assertEquals(0, result.getSuccessRows());
        assertEquals(1, result.getFailRows());
    }

    @Test
    void upload_invalidAnswerIndex_fails() throws Exception {
        MockMultipartFile file = buildExcel(new String[][]{
                {"문제유형", "문제내용", "이미지", "참조지문", "보기1", "보기2", "보기3", "보기4", "보기5", "정답", "해설", "태그"},
                {"MCQ_SINGLE", "1+1=?", "", "", "1", "2", "", "", "", "5", ""},
        });

        ExcelUploadResult result = service.upload(file, actor);

        assertEquals(0, result.getSuccessRows());
        assertEquals(1, result.getFailRows());
    }
}
