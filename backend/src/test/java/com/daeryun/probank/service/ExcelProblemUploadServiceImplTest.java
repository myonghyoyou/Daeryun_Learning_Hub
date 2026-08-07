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
     * 보기1, 보기2에 값이 있고 보기3이 빈 채로 보기4가 채워지면(예: 보기1=A, 보기2=blank, 보기3=C),
     * 이전 버전은 빈 칸을 건너뛰고 [A, C] 2개짜리 목록으로 압축했다 — 그러면 "정답=2"가 원래 3번째 열의
     * C 를 가리키게 되어 정답이 조용히 바뀌는 오답 버그였다. ProblemServiceImpl.validateChoices 와 같이
     * 내부에 빈 보기가 있으면 그 행을 실패로 거부해야 한다. 이 테스트는 가드를 지우면(빈 칸을 건너뛰고
     * 압축하도록 되돌리면) 반드시 실패한다 — 압축 로직에서는 이 행이 성공(2개 보기, 정답 2번=C)으로
     * 처리되기 때문이다.
     */
    @Test
    void upload_choicesWithInternalGap_fails() throws Exception {
        MockMultipartFile file = buildExcel(new String[][]{
                {"문제유형", "문제내용", "이미지", "참조지문", "보기1", "보기2", "보기3", "보기4", "보기5", "정답", "해설", "태그"},
                {"MCQ_SINGLE", "1+1=?", "", "", "A", "", "C", "", "", "2", ""},
        });

        ExcelUploadResult result = service.upload(file, actor);

        assertEquals(0, result.getSuccessRows());
        assertEquals(1, result.getFailRows());
        assertTrue(result.getErrorDetail().contains("빈 보기는 입력할 수 없습니다"),
                "빈 보기 거부 사유가 담겨야 한다: " + result.getErrorDetail());
        Mockito.verifyNoInteractions(problemProvisioningService);
    }

    /**
     * "서울,,Seoul" 처럼 정답 토큰 사이에 빈 값이 있으면 ProblemServiceImpl.validateAnswers 와 같이
     * 그 행을 거부해야 한다. 이전 버전은 빈 토큰을 조용히 걸러내 ["서울","Seoul"] 로 통과시켰다 — API
     * 경로(거부)와 엑셀 경로(통과)가 같은 입력에 서로 다르게 반응하는 불일치였다. 가드를 지우면(빈
     * 토큰을 걸러내도록 되돌리면) 이 테스트는 반드시 실패한다.
     */
    @Test
    void upload_shortAnswerWithBlankToken_fails() throws Exception {
        MockMultipartFile file = buildExcel(new String[][]{
                {"문제유형", "문제내용", "이미지", "참조지문", "보기1", "보기2", "보기3", "보기4", "보기5", "정답", "해설", "태그"},
                {"SHORT_ANSWER", "대한민국의 수도는?", "", "", "", "", "", "", "", "서울,,Seoul", ""},
        });

        ExcelUploadResult result = service.upload(file, actor);

        assertEquals(0, result.getSuccessRows());
        assertEquals(1, result.getFailRows());
        assertTrue(result.getErrorDetail().contains("빈 정답은 입력할 수 없습니다"),
                "빈 정답 거부 사유가 담겨야 한다: " + result.getErrorDetail());
        Mockito.verifyNoInteractions(problemProvisioningService);
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

    /**
     * 이미지 열은 엑셀 업로드에서 지원하지 않는다(전체 브랜치 리뷰 F2 후속). ProblemServiceImpl은 JSON API
     * 경로에서 imageUrl을 이미지 업로드 API가 돌려준 {@code /uploads/images/...} 경로로만 제한하는데, 엑셀에는
     * 그런 값을 만들 API가 없어 이 열에서 "정상적으로" 쓸 수 있는 값은 외부 URL뿐이었다 — Plan 4 풀이 화면이
     * imageUrl을 전사 공통으로 렌더링하므로 외부 URL을 저장 가능한 값으로 남겨 두면 그 자체로 저장된 추적
     * 비콘이 된다. ImageUrlValidator(ProblemServiceImpl과 공유)가 거부하는 값이면 그 행만 실패로 표시해야
     * 한다. 이 테스트는 가드를 지우면(이미지 열 검사를 빼면) 반드시 실패한다 — 그러면 이 행이 외부 URL을
     * 그대로 담은 채 성공으로 처리되기 때문이다.
     */
    @Test
    void upload_externalImageUrl_failsThatRowOnly() throws Exception {
        MockMultipartFile file = buildExcel(new String[][]{
                {"문제유형", "문제내용", "이미지", "참조지문", "보기1", "보기2", "보기3", "보기4", "보기5", "정답", "해설", "태그"},
                {"MCQ_SINGLE", "외부 이미지 URL 행", "https://attacker.example/track.gif", "", "1", "2", "", "", "", "1", ""},
                {"MCQ_SINGLE", "1+1=?", "", "", "1", "2", "3", "", "", "2", "기본 연산", "수학,기초"},
        });

        ExcelUploadResult result = service.upload(file, actor);

        assertEquals(2, result.getTotalRows());
        assertEquals(1, result.getSuccessRows());
        assertEquals(1, result.getFailRows());
        assertTrue(result.getErrorDetail().contains("행 2:"),
                "실패 행 번호(엑셀 2행)가 오류 상세에 담겨야 한다: " + result.getErrorDetail());
        assertTrue(result.getErrorDetail().contains("이미지는 엑셀로 등록할 수 없습니다"),
                "이미지 열 거부 사유가 담겨야 한다: " + result.getErrorDetail());
        Mockito.verify(problemProvisioningService, Mockito.times(1))
                .provisionWithChoices(Mockito.any(), Mockito.anyList(), Mockito.anyList());
    }

    /** 이미지 열이 비어 있는 정상 케이스가 이번 변경으로 회귀하지 않았는지 확인한다. */
    @Test
    void upload_blankImageCell_stillSucceeds() throws Exception {
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
}
