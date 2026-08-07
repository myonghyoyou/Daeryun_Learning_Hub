package com.daeryun.probank.service;

import com.daeryun.probank.common.AuthUser;
import com.daeryun.probank.dao.ExcelUploadLogDao;
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
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * ExcelProblemUploadServiceImpl 은 직접 problemDao/problemChoiceDao/problemAnswerDao 를 호출하지 않고
 * ProblemProvisioningService 를 통해 각 행을 별도 트랜잭션(REQUIRES_NEW)으로 영속화한다 — Plan 2의
 * ExcelAccountUploadServiceImplTest 가 accountProvisioningService 를 모킹해 검증하는 것과 같은 방식이다.
 * DB 쓰기 자체(problemDao.insert 등)의 순서·트랜잭션 경계 검증은 ProblemProvisioningServiceImplTest 가
 * 담당한다.
 */
class ExcelProblemUploadServiceImplTest {

    private ExcelUploadLogDao excelUploadLogDao;
    private ProblemProvisioningService problemProvisioningService;
    private AuditLogService auditLogService;
    private ExcelProblemUploadServiceImpl service;
    private final AuthUser actor = new AuthUser(1L, "1001", "관리자", UserRole.DEPT_ADMIN, 10L, false);

    @BeforeEach
    void setUp() {
        excelUploadLogDao = Mockito.mock(ExcelUploadLogDao.class);
        problemProvisioningService = Mockito.mock(ProblemProvisioningService.class);
        auditLogService = Mockito.mock(AuditLogService.class);
        service = new ExcelProblemUploadServiceImpl(excelUploadLogDao, problemProvisioningService, auditLogService);
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
        Mockito.verify(problemProvisioningService).provisionWithChoices(Mockito.any(), Mockito.anyList(),
                Mockito.anyList());
    }

    @Test
    void upload_shortAnswerRow_succeeds() throws Exception {
        MockMultipartFile file = buildExcel(new String[][]{
                {"문제유형", "문제내용", "이미지", "참조지문", "보기1", "보기2", "보기3", "보기4", "보기5", "정답", "해설", "태그"},
                {"SHORT_ANSWER", "대한민국의 수도는?", "", "", "", "", "", "", "", "서울,Seoul", ""},
        });

        ExcelUploadResult result = service.upload(file, actor);

        assertEquals(1, result.getSuccessRows());
        Mockito.verify(problemProvisioningService).provisionWithAnswers(Mockito.any(), Mockito.anyList(),
                Mockito.anyList());
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
        Mockito.verifyNoInteractions(problemProvisioningService);
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

    /**
     * 이 업로드의 핵심 계약(부분 성공)을 한 파일 안에서 직접 증명한다: 유효한 행과 무효한 행이 섞여
     * 있을 때, 무효한 행이 배치 전체를 중단시키지 않고 유효한 행은 그대로 저장되어야 한다. 이전까지의
     * 4개 테스트는 모두 파일 하나에 데이터 행 하나뿐이라 "실패 행이 있어도 나머지 배치가 계속 처리된다"
     * 는 보장 자체는 증명하지 못했다 — 예를 들어 행 처리 중 예외가 루프 밖으로 새어 나가 배치 전체가
     * 중단되더라도, 그 실패만 담긴 단일 행 테스트는 여전히 통과해 버린다. 이 테스트는 첫 행(무효)이
     * upload() 를 중단시키면 실패한다: 그러면 둘째 행이 아예 처리되지 않아 totalRows/successRows/
     * failRows 가 기대와 달라지고, provisionWithChoices 호출도 발생하지 않는다.
     */
    @Test
    void upload_withValidAndInvalidRowsInSameFile_partiallySucceeds() throws Exception {
        MockMultipartFile file = buildExcel(new String[][]{
                {"문제유형", "문제내용", "이미지", "참조지문", "보기1", "보기2", "보기3", "보기4", "보기5", "정답", "해설", "태그"},
                {"MCQ_SINGLE", "잘못된 정답 행", "", "", "1", "2", "", "", "", "9", ""},
                {"MCQ_SINGLE", "1+1=?", "", "", "1", "2", "3", "", "", "2", "기본 연산", "수학,기초"},
        });

        ExcelUploadResult result = service.upload(file, actor);

        assertEquals(2, result.getTotalRows());
        assertEquals(1, result.getSuccessRows());
        assertEquals(1, result.getFailRows());
        assertTrue(result.getErrorDetail().contains("행 2:"),
                "실패 행 번호(엑셀 2행, 헤더 다음 첫 데이터 행)가 오류 상세에 담겨야 한다: " + result.getErrorDetail());
        Mockito.verify(problemProvisioningService, Mockito.times(1))
                .provisionWithChoices(Mockito.any(), Mockito.anyList(), Mockito.anyList());
    }
}
