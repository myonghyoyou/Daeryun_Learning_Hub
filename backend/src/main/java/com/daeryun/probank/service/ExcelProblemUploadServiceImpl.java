package com.daeryun.probank.service;

import com.daeryun.probank.common.AuthUser;
import com.daeryun.probank.common.ErrorCode;
import com.daeryun.probank.dao.DepartmentDao;
import com.daeryun.probank.dao.ExcelUploadLogDao;
import com.daeryun.probank.domain.Department;
import com.daeryun.probank.domain.Problem;
import com.daeryun.probank.domain.ProblemAnswer;
import com.daeryun.probank.domain.ProblemChoice;
import com.daeryun.probank.domain.ProblemStatus;
import com.daeryun.probank.domain.ProblemType;
import com.daeryun.probank.domain.Status;
import com.daeryun.probank.domain.ExcelUploadLog;
import com.daeryun.probank.domain.UploadTargetType;
import com.daeryun.probank.domain.UserRole;
import com.daeryun.probank.dto.upload.ExcelUploadResult;
import com.daeryun.probank.dto.upload.RowResult;
import com.daeryun.probank.exception.BizException;
import org.apache.poi.ss.usermodel.Cell;
import org.apache.poi.ss.usermodel.DataFormatter;
import org.apache.poi.ss.usermodel.Row;
import org.apache.poi.ss.usermodel.Sheet;
import org.apache.poi.ss.usermodel.Workbook;
import org.apache.poi.ss.usermodel.WorkbookFactory;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Locale;
import java.util.stream.Collectors;

/**
 * 문제 엑셀 일괄 업로드. {@link ExcelAccountUploadServiceImpl}(Plan 2)과 같은 구조를 따른다: 행 단위로
 * 파싱·검증하고, 실패한 행은 건너뛰며 성공한 행만 저장하는 부분 성공을 허용한다.
 * <p>
 * 트랜잭션 경계: 이 메서드 전체와 {@link #processRow}에는 {@code @Transactional}을 걸지 않는다. 대신 각
 * 행의 검증을 모두 통과한 뒤의 실제 DB 쓰기(Problem insert + 보기/정답 insert + 태그 연결 + 감사 로그)는
 * {@link ProblemProvisioningService}에 위임한다 — 계정 업로드 레퍼런스가 {@code AccountProvisioningService}
 * 를 별도 빈으로 두고 {@code @Transactional(REQUIRES_NEW)}를 붙인 것과 동일한 이유다: 이 클래스 안의 private
 * 메서드에 {@code @Transactional}을 붙여도 같은 빈 안에서 {@code this.xyz()}로 호출하면 Spring AOP 프록시를
 * 우회해 트랜잭션이 걸리지 않는다(자기 호출 문제) — 그래서 실제 DB 쓰기를 별도 빈으로 분리했다. 이렇게 하면
 * 한 행의 쓰기 도중 예외가 나도 그 행만 롤백되고(Problem·보기/정답·태그가 함께 사라진다) 이미 커밋된 다른
 * 행에는 영향을 주지 않는다 — 트랜잭션 없이 진행하던 이전 버전에서 남을 수 있었던 "보기 없는 Problem 고아
 * 행" 문제가 해결된다.
 */
@Service
public class ExcelProblemUploadServiceImpl implements ExcelProblemUploadService {

    private static final Logger LOGGER = LoggerFactory.getLogger(ExcelProblemUploadServiceImpl.class);

    private static final int HEADER_ROW_COUNT = 1;
    private static final int MAX_CHOICE_COLUMNS = 5;
    private static final int MIN_CHOICES = 2;
    private static final int MAX_TAGS = 20;
    private static final int MAX_TAG_LENGTH = 100;
    private static final int COL_TYPE = 0;
    private static final int COL_CONTENT = 1;
    private static final int COL_IMAGE = 2;
    private static final int COL_REFERENCE = 3;
    private static final int COL_CHOICE_START = 4;
    private static final int COL_ANSWER = 9;
    private static final int COL_EXPLANATION = 10;
    private static final int COL_TAGS = 11;

    /**
     * 한 요청에서 처리할 데이터 행 상한. 20MB 멀티파트 제한은 이보다 훨씬 많은 행을 허용할 수 있고,
     * 행이 많아질수록 요청 하나의 처리 시간과 실패 시 재현·디버그 부담이 커진다. Plan 2 계정 업로드와
     * 동일한 방어 기준(500행)을 그대로 적용한다.
     */
    private static final int MAX_DATA_ROWS = 500;
    private static final String UNREADABLE_MESSAGE =
            "엑셀 파일을 읽을 수 없습니다. 손상되었거나 암호가 설정된 파일인지 확인한 뒤 다시 올려 주세요.";

    private final ExcelUploadLogDao excelUploadLogDao;
    private final ProblemProvisioningService problemProvisioningService;
    private final AuditLogService auditLogService;
    private final DepartmentDao departmentDao;

    public ExcelProblemUploadServiceImpl(ExcelUploadLogDao excelUploadLogDao,
                                          ProblemProvisioningService problemProvisioningService,
                                          AuditLogService auditLogService,
                                          DepartmentDao departmentDao) {
        this.excelUploadLogDao = excelUploadLogDao;
        this.problemProvisioningService = problemProvisioningService;
        this.auditLogService = auditLogService;
        this.departmentDao = departmentDao;
    }

    @Override
    public ExcelUploadResult upload(MultipartFile file, Long departmentId, AuthUser actor) {
        if (file == null || file.isEmpty()) {
            throw new BizException(ErrorCode.FILE_REQUIRED);
        }
        validateExtension(file.getOriginalFilename());
        Long effectiveDepartmentId = resolveDepartmentId(departmentId, actor);

        List<RowResult> results = new ArrayList<>();
        DataFormatter dataFormatter = new DataFormatter();

        try (Workbook workbook = openWorkbook(file)) {
            Sheet sheet = firstSheet(workbook);
            int lastRowNum = sheet.getLastRowNum();
            // 한 행도 처리하기 전에 상한을 확인한다. 처리 중에 끊으면 이미 커밋된 문제가 남는다.
            if (lastRowNum - HEADER_ROW_COUNT + 1 > MAX_DATA_ROWS) {
                throw new BizException(ErrorCode.INPUT_VALUE_INVALID,
                        "한 번에 업로드할 수 있는 데이터 행은 최대 " + MAX_DATA_ROWS + "건입니다. 파일을 나눠 업로드하세요.");
            }
            for (int rowIndex = HEADER_ROW_COUNT; rowIndex <= lastRowNum; rowIndex++) {
                Row row = sheet.getRow(rowIndex);
                if (row == null) {
                    continue;
                }
                results.add(processRow(row, rowIndex + 1, effectiveDepartmentId, actor, dataFormatter));
            }
        } catch (IOException e) {
            // try-with-resources 의 close() 만 남은 경로. 여는 실패는 openWorkbook 이 이미 변환한다.
            throw new BizException(ErrorCode.FILE_UNREADABLE, UNREADABLE_MESSAGE);
        }

        int successRows = (int) results.stream().filter(RowResult::isSuccess).count();
        int failRows = results.size() - successRows;
        String errorDetail = results.stream()
                .filter(r -> !r.isSuccess())
                .map(r -> "행 " + r.getRowNumber() + ": " + r.getReason())
                .collect(Collectors.joining("\n"));

        ExcelUploadLog log = new ExcelUploadLog();
        log.setUploadedBy(actor.getUserId());
        // 귀속 부서는 총괄 관리자가 지정할 수 있다(부서 관리자는 본인 부서로 강제된다). 문제 행과 이
        // 이력이 같은 값을 써야 excel_upload_logs 와 실제 귀속이 어긋나지 않는다 — QA §8.22 가 그것을
        // 검사한다.
        log.setDepartmentId(effectiveDepartmentId);
        log.setTargetType(UploadTargetType.PROBLEM);
        log.setFileName(file.getOriginalFilename());
        log.setTotalRows(results.size());
        log.setSuccessRows(successRows);
        log.setFailRows(failRows);
        log.setErrorDetail(errorDetail.isEmpty() ? null : errorDetail);
        excelUploadLogDao.insert(log);

        auditLogService.record(actor.getUserId(), "PROBLEM_EXCEL_UPLOADED", "EXCEL_UPLOAD_LOG", log.getId(),
                "{\"fileName\":\"" + escapeJson(log.getFileName()) + "\",\"totalRows\":" + log.getTotalRows()
                        + ",\"successRows\":" + log.getSuccessRows() + ",\"failRows\":" + log.getFailRows()
                        + ",\"departmentId\":" + log.getDepartmentId() + "}");

        return new ExcelUploadResult(results.size(), successRows, failRows, log.getErrorDetail());
    }

    /**
     * 워크북을 여는 동안 나는 실패는 모두 BizException 으로 바꾼다. IOException 뿐 아니라 암호가 걸린
     * 파일의 EncryptedDocumentException, 엑셀이 아닌 바이트의 형식 판별 실패 등 RuntimeException 도
     * 나오는데, 그대로 두면 처리되지 않은 500 으로 새어 나간다.
     */
    private Workbook openWorkbook(MultipartFile file) {
        try {
            return WorkbookFactory.create(file.getInputStream());
        } catch (IOException | RuntimeException e) {
            LOGGER.warn("엑셀 업로드 파일을 열지 못했습니다: {}", file.getOriginalFilename(), e);
            throw new BizException(ErrorCode.FILE_UNREADABLE, UNREADABLE_MESSAGE);
        }
    }

    private Sheet firstSheet(Workbook workbook) {
        if (workbook.getNumberOfSheets() == 0) {
            throw new BizException(ErrorCode.FILE_UNREADABLE,
                    "엑셀 파일에 시트가 없습니다. 첫 번째 시트에 문제 목록을 담아 다시 올려 주세요.");
        }
        return workbook.getSheetAt(0);
    }

    private void validateExtension(String originalFilename) {
        String lower = originalFilename == null ? "" : originalFilename.toLowerCase(Locale.ROOT);
        if (!lower.endsWith(".xlsx") && !lower.endsWith(".xls")) {
            throw new BizException(ErrorCode.FILE_TYPE_NOT_ALLOWED, "xlsx 또는 xls 엑셀 파일만 업로드할 수 있습니다.");
        }
    }

    /**
     * 귀속 부서를 정한다. ProblemServiceImpl.list 와 같은 규칙이다 — 총괄 관리자만 요청값을 쓰고,
     * 부서 관리자는 요청값을 무시하고 본인 부서로 강제된다. 화면의 disabled 는 실수 방지일 뿐이므로
     * 파라미터 위조는 여기서 막는다.
     */
    private Long resolveDepartmentId(Long requested, AuthUser actor) {
        if (actor.getRole() != UserRole.SUPER_ADMIN) {
            return actor.getDepartmentId();
        }
        // 아래 검증은 행 루프에 들어가기 전에 끝나야 한다. 행마다 REQUIRES_NEW 로 커밋되므로 처리
        // 도중에 던지면 이미 저장된 문제가 남는다 — 500행 상한을 루프 전에 보는 것과 같은 이유다.
        if (requested == null) {
            throw new BizException(ErrorCode.INPUT_VALUE_INVALID, "업로드할 문제가 귀속될 부서를 선택하세요.");
        }
        Department department = departmentDao.findById(requested);
        if (department == null) {
            throw new BizException(ErrorCode.INPUT_VALUE_INVALID, "존재하지 않는 부서입니다.");
        }
        if (department.getStatus() != Status.ACTIVE) {
            throw new BizException(ErrorCode.INPUT_VALUE_INVALID,
                    "비활성 부서에는 문제를 등록할 수 없습니다: " + department.getName());
        }
        return requested;
    }

    private RowResult processRow(Row row, int rowNumber, Long departmentId, AuthUser actor,
                                  DataFormatter dataFormatter) {
        String typeText = cellValue(row, COL_TYPE, dataFormatter);
        String content = cellValue(row, COL_CONTENT, dataFormatter);

        if (isBlank(typeText) || isBlank(content)) {
            return RowResult.fail(rowNumber, "문제유형과 문제내용은 필수입니다.");
        }
        if ("FILL_BLANK".equalsIgnoreCase(typeText.trim())) {
            // Plan 3 Global Constraint: 빈칸 채우기는 엑셀 업로드를 지원하지 않는다. 개별 입력에서만
            // 만들 수 있다 — 빈칸 마커/정답/공개 개수를 셀 하나의 텍스트로 안정적으로 표현할 방법이 없다.
            return RowResult.fail(rowNumber, "빈칸 채우기는 엑셀 업로드를 지원하지 않습니다. 개별 입력을 이용하세요.");
        }

        ProblemType type;
        try {
            type = ProblemType.valueOf(typeText.trim());
        } catch (IllegalArgumentException e) {
            return RowResult.fail(rowNumber, "유효하지 않은 문제유형입니다: " + typeText);
        }

        String answerText = cellValue(row, COL_ANSWER, dataFormatter);
        List<String> tags = normalizeTags(cellValue(row, COL_TAGS, dataFormatter));
        if (tags == null) {
            return RowResult.fail(rowNumber, "태그는 문제당 20개, 태그명은 100자 이하여야 합니다.");
        }
        if (isBlank(answerText)) {
            return RowResult.fail(rowNumber, "정답은 필수입니다.");
        }

        String imageUrl = emptyToNull(cellValue(row, COL_IMAGE, dataFormatter));
        if (ImageUrlValidator.check(imageUrl) != ImageUrlValidator.Result.VALID) {
            // 엑셀에는 이미지 업로드 API가 없어 유효한 /uploads/images/... 값을 만들 방법이 없다 —
            // 외부 URL이나 상위 경로 값은 ProblemServiceImpl.validateImageUrl과 같은 규칙(ImageUrlValidator)
            // 으로 거부하되, 메시지는 엑셀 사용자가 실제로 할 수 있는 행동(열을 비워두고 개별 화면에서
            // 첨부)을 안내한다.
            return RowResult.fail(rowNumber,
                    "이미지는 엑셀로 등록할 수 없습니다. 이미지 열은 비워 두고, 문제 개별 등록/수정 화면에서 이미지를 첨부하세요.");
        }

        Problem problem = new Problem();
        problem.setType(type);
        problem.setContent(content);
        problem.setImageUrl(imageUrl);
        problem.setReferenceText(emptyToNull(cellValue(row, COL_REFERENCE, dataFormatter)));
        problem.setExplanation(emptyToNull(cellValue(row, COL_EXPLANATION, dataFormatter)));
        problem.setStatus(ProblemStatus.ACTIVE);
        problem.setDepartmentId(departmentId);
        problem.setCreatedBy(actor.getUserId());

        if (type == ProblemType.SHORT_ANSWER) {
            return processShortAnswer(rowNumber, problem, answerText, tags);
        }
        return processChoiceBased(rowNumber, row, problem, type, answerText, tags, dataFormatter);
    }

    /**
     * ProblemServiceImpl.validateAnswers 와 같은 규칙: 콤마로 나눈 정답 토큰 중 하나라도 비어 있으면
     * 그 행 전체를 실패로 표시한다. 이전 버전은 빈 토큰을 조용히 걸러냈는데("서울,,Seoul" ->
     * ["서울","Seoul"]), 그러면 같은 문제가 API 경로(거부)와 엑셀 경로(통과)에서 서로 다르게 취급된다.
     */
    private RowResult processShortAnswer(int rowNumber, Problem problem, String answerText, List<String> tags) {
        List<String> answers = Arrays.stream(answerText.split(",", -1))
                .map(String::trim).collect(Collectors.toList());
        if (answers.stream().anyMatch(this::isBlank)) {
            return RowResult.fail(rowNumber, "빈 정답은 입력할 수 없습니다.");
        }

        List<ProblemAnswer> answerEntities = answers.stream().map(text -> {
            ProblemAnswer answer = new ProblemAnswer();
            answer.setAnswerText(text);
            return answer;
        }).collect(Collectors.toList());

        try {
            problemProvisioningService.provisionWithAnswers(problem, answerEntities, tags);
            return RowResult.success(rowNumber);
        } catch (RuntimeException e) {
            LOGGER.warn("행 {} 문제 저장 실패", rowNumber, e);
            return RowResult.fail(rowNumber, "문제 저장 중 오류가 발생했습니다.");
        }
    }

    private RowResult processChoiceBased(int rowNumber, Row row, Problem problem, ProblemType type,
                                          String answerText, List<String> tags, DataFormatter dataFormatter) {
        List<String> choiceCells = new ArrayList<>();
        for (int i = 0; i < MAX_CHOICE_COLUMNS; i++) {
            choiceCells.add(cellValue(row, COL_CHOICE_START + i, dataFormatter));
        }
        int lastNonBlank = -1;
        for (int i = MAX_CHOICE_COLUMNS - 1; i >= 0; i--) {
            if (!isBlank(choiceCells.get(i))) {
                lastNonBlank = i;
                break;
            }
        }
        int choiceCount = lastNonBlank + 1;

        // ProblemServiceImpl.validateChoices 와 같은 순서: 개수 검사 먼저, 그 다음 빈 보기 검사.
        if (choiceCount < MIN_CHOICES || choiceCount > MAX_CHOICE_COLUMNS) {
            return RowResult.fail(rowNumber, "보기는 2개 이상 5개 이하이어야 합니다.");
        }
        List<String> choiceTexts = new ArrayList<>();
        for (int i = 0; i < choiceCount; i++) {
            String cell = choiceCells.get(i);
            if (isBlank(cell)) {
                // 보기1, 보기2에 값이 있고 보기3이 비어 있는데 보기4가 다시 채워진 경우처럼, 뒤쪽에
                // 값이 있는데 앞선 열이 비어 있으면 "보기 번호 = 열 번호" 대응이 깨진다. 이전 버전은
                // 빈 칸을 건너뛰고 뒤의 값들을 앞으로 당겨 채웠는데, 그러면 정답 번호가 엉뚱한 보기를
                // 가리키게 되는 조용한 오답 버그였다. ProblemServiceImpl.validateChoices 와 같은 메시지로
                // 거부한다.
                return RowResult.fail(rowNumber, "빈 보기는 입력할 수 없습니다.");
            }
            choiceTexts.add(cell);
        }
        if (type == ProblemType.OX && choiceTexts.size() != 2) {
            return RowResult.fail(rowNumber, "OX 문제는 보기 2개(O/X)가 필요합니다.");
        }

        List<Integer> correctIndexes;
        try {
            correctIndexes = Arrays.stream(answerText.split(","))
                    .map(String::trim).map(Integer::parseInt).collect(Collectors.toList());
        } catch (NumberFormatException e) {
            return RowResult.fail(rowNumber, "정답은 보기 번호(1부터 시작)여야 합니다: " + answerText);
        }
        for (Integer index : correctIndexes) {
            if (index < 1 || index > choiceTexts.size()) {
                return RowResult.fail(rowNumber, "정답 번호가 보기 범위를 벗어났습니다: " + index);
            }
        }
        long distinctCorrect = correctIndexes.stream().distinct().count();
        if (type != ProblemType.MCQ_MULTI && distinctCorrect != 1) {
            return RowResult.fail(rowNumber, "이 유형은 정답이 1개여야 합니다.");
        }
        if (type == ProblemType.MCQ_MULTI && distinctCorrect < 1) {
            return RowResult.fail(rowNumber, "정답을 최소 1개 선택하세요.");
        }

        List<ProblemChoice> choices = new ArrayList<>();
        for (int i = 0; i < choiceTexts.size(); i++) {
            ProblemChoice choice = new ProblemChoice();
            choice.setChoiceText(choiceTexts.get(i));
            choice.setCorrect(correctIndexes.contains(i + 1));
            choice.setDisplayOrder(i + 1);
            choices.add(choice);
        }

        try {
            problemProvisioningService.provisionWithChoices(problem, choices, tags);
            return RowResult.success(rowNumber);
        } catch (RuntimeException e) {
            LOGGER.warn("행 {} 문제 저장 실패", rowNumber, e);
            return RowResult.fail(rowNumber, "문제 저장 중 오류가 발생했습니다.");
        }
    }

    /**
     * 태그 셀(콤마 구분)을 trim·빈 값 제거·대소문자 무관 중복 제거한다. Task 2의
     * {@code ProblemServiceImpl.normalizeTags}와 같은 규칙(최대 20개, 태그명 100자 이하)을 적용하되,
     * 위반 시 예외 대신 null을 돌려주어 호출자가 해당 행만 실패로 표시할 수 있게 한다 — 여기서는 한
     * 행의 태그 위반이 전체 배치를 중단시켜서는 안 되기 때문이다.
     */
    private List<String> normalizeTags(String tagCell) {
        List<String> normalized = Arrays.stream(tagCell.split(","))
                .map(String::trim).filter(s -> !s.isEmpty())
                .map(s -> s.toLowerCase(Locale.ROOT)).distinct().collect(Collectors.toList());
        if (normalized.size() > MAX_TAGS || normalized.stream().anyMatch(s -> s.length() > MAX_TAG_LENGTH)) {
            return null;
        }
        return normalized;
    }

    private String cellValue(Row row, int cellIndex, DataFormatter dataFormatter) {
        Cell cell = row.getCell(cellIndex);
        if (cell == null) {
            return "";
        }
        return dataFormatter.formatCellValue(cell).trim();
    }

    private String emptyToNull(String value) {
        return isBlank(value) ? null : value;
    }

    private boolean isBlank(String value) {
        return value == null || value.trim().isEmpty();
    }

    private String escapeJson(String value) {
        return value == null ? "" : value.replace("\\", "\\\\").replace("\"", "\\\"");
    }
}
