package com.daeryun.probank.service;

import com.daeryun.probank.common.AuthUser;
import com.daeryun.probank.common.ErrorCode;
import com.daeryun.probank.dao.ExcelUploadLogDao;
import com.daeryun.probank.dao.ProblemAnswerDao;
import com.daeryun.probank.dao.ProblemChoiceDao;
import com.daeryun.probank.dao.ProblemDao;
import com.daeryun.probank.dao.ProblemTagDao;
import com.daeryun.probank.dao.TagDao;
import com.daeryun.probank.domain.Problem;
import com.daeryun.probank.domain.ProblemAnswer;
import com.daeryun.probank.domain.ProblemChoice;
import com.daeryun.probank.domain.ProblemStatus;
import com.daeryun.probank.domain.ProblemType;
import com.daeryun.probank.domain.ExcelUploadLog;
import com.daeryun.probank.domain.UploadTargetType;
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
 * 문제 엑셀 일괄 업로드. {@link com.daeryun.probank.service.ExcelAccountUploadServiceImpl}(Plan 2)과 같은 구조를
 * 따른다: 행 단위로 파싱·검증하고, 실패한 행은 건너뛰며 성공한 행만 저장하는 부분 성공을 허용한다.
 * <p>
 * 트랜잭션 경계: 이 메서드 전체에는 {@code @Transactional}을 걸지 않는다. 각 행의 검증은 DB 쓰기 이전에
 * 모두 끝나므로({@link #processRow}), {@code problemDao.insert} 이후 실행되는 나머지 쓰기(보기/정답,
 * 태그, 감사 로그)는 이례적인 DB 예외가 아니면 실패하지 않는다. 계정 업로드 레퍼런스는 이런 종류의
 * 행별 원자성을 별도 빈({@code AccountProvisioningService})의 {@code REQUIRES_NEW} 트랜잭션으로
 * 얻는다 — 여기서는 그런 별도 빈이 없고, 이 클래스의 생성자 시그니처가 테스트에 고정되어 있어
 * {@code PlatformTransactionManager}를 추가로 주입할 수도 없다. 대신 {@link #processRow}의 쓰기 구간을
 * try/catch로 감싸 한 행의 예외가 전체 배치를 중단시키지 않게 막는다(부분 성공 보장). 남는 한계는,
 * {@code problemDao.insert} 성공 후 같은 행의 후속 쓰기가 실패하면 보기/정답 없는 Problem 행이 남을 수
 * 있다는 점이다 — 이는 검증을 모두 통과한 뒤에만 벌어지는 드문 DB 수준 실패로 한정되며, 리포트에 별도
 * 한계로 명시한다.
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

    private final ProblemDao problemDao;
    private final ProblemChoiceDao problemChoiceDao;
    private final ProblemAnswerDao problemAnswerDao;
    private final ExcelUploadLogDao excelUploadLogDao;
    private final TagDao tagDao;
    private final ProblemTagDao problemTagDao;
    private final AuditLogService auditLogService;

    public ExcelProblemUploadServiceImpl(ProblemDao problemDao, ProblemChoiceDao problemChoiceDao,
                                          ProblemAnswerDao problemAnswerDao, ExcelUploadLogDao excelUploadLogDao,
                                          TagDao tagDao, ProblemTagDao problemTagDao, AuditLogService auditLogService) {
        this.problemDao = problemDao;
        this.problemChoiceDao = problemChoiceDao;
        this.problemAnswerDao = problemAnswerDao;
        this.excelUploadLogDao = excelUploadLogDao;
        this.tagDao = tagDao;
        this.problemTagDao = problemTagDao;
        this.auditLogService = auditLogService;
    }

    @Override
    public ExcelUploadResult upload(MultipartFile file, AuthUser actor) {
        if (file == null || file.isEmpty()) {
            throw new BizException(ErrorCode.FILE_REQUIRED);
        }
        validateExtension(file.getOriginalFilename());

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
                results.add(processRow(row, rowIndex + 1, actor, dataFormatter));
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
        // 문제는 업로드한 관리자의 부서에 귀속된다. 엑셀 셀이나 요청 파라미터에는 부서를 지정할 컬럼이
        // 없고, 오직 세션의 AuthUser(actor)에서만 가져온다 — 부서 격리를 서버가 강제한다.
        log.setDepartmentId(actor.getDepartmentId());
        log.setTargetType(UploadTargetType.PROBLEM);
        log.setFileName(file.getOriginalFilename());
        log.setTotalRows(results.size());
        log.setSuccessRows(successRows);
        log.setFailRows(failRows);
        log.setErrorDetail(errorDetail.isEmpty() ? null : errorDetail);
        excelUploadLogDao.insert(log);

        auditLogService.record(actor.getUserId(), "PROBLEM_EXCEL_UPLOADED", "EXCEL_UPLOAD_LOG", log.getId(),
                "{\"fileName\":\"" + escapeJson(log.getFileName()) + "\",\"totalRows\":" + log.getTotalRows()
                        + ",\"successRows\":" + log.getSuccessRows() + ",\"failRows\":" + log.getFailRows() + "}");

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

    private RowResult processRow(Row row, int rowNumber, AuthUser actor, DataFormatter dataFormatter) {
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

        List<String> choiceTexts = new ArrayList<>();
        for (int i = 0; i < MAX_CHOICE_COLUMNS; i++) {
            String choiceText = cellValue(row, COL_CHOICE_START + i, dataFormatter);
            if (!isBlank(choiceText)) {
                choiceTexts.add(choiceText);
            }
        }

        Problem problem = new Problem();
        problem.setType(type);
        problem.setContent(content);
        problem.setImageUrl(emptyToNull(cellValue(row, COL_IMAGE, dataFormatter)));
        problem.setReferenceText(emptyToNull(cellValue(row, COL_REFERENCE, dataFormatter)));
        problem.setExplanation(emptyToNull(cellValue(row, COL_EXPLANATION, dataFormatter)));
        problem.setStatus(ProblemStatus.ACTIVE);
        problem.setDepartmentId(actor.getDepartmentId());
        problem.setCreatedBy(actor.getUserId());

        if (type == ProblemType.SHORT_ANSWER) {
            List<String> answers = Arrays.stream(answerText.split(","))
                    .map(String::trim).filter(s -> !s.isEmpty()).collect(Collectors.toList());
            if (answers.isEmpty()) {
                return RowResult.fail(rowNumber, "정답 형식이 올바르지 않습니다.");
            }
            return saveShortAnswer(rowNumber, problem, answers, tags, actor);
        }

        // MCQ_SINGLE, MCQ_MULTI, OX
        if (choiceTexts.size() < MIN_CHOICES || choiceTexts.size() > MAX_CHOICE_COLUMNS) {
            return RowResult.fail(rowNumber, "보기는 2개 이상 5개 이하이어야 합니다.");
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

        return saveChoiceBased(rowNumber, problem, choiceTexts, correctIndexes, tags, actor, type);
    }

    /**
     * 검증을 모두 통과한 뒤의 실제 DB 쓰기 구간. Problem insert 이후 보기/정답·태그·감사 로그 중
     * 하나라도 예외를 던지면(예: 이례적인 DB 오류) 여기서 잡아 해당 행만 실패로 표시하고, 이미 처리한
     * 다른 행들의 커밋에는 영향을 주지 않는다 — 트랜잭션을 걸지 않은 이 메서드에서 예외가 상위
     * upload() 루프까지 새어 나가면 전체 배치가 중단되어 부분 성공이 깨지기 때문이다.
     */
    private RowResult saveShortAnswer(int rowNumber, Problem problem, List<String> answers, List<String> tags,
                                       AuthUser actor) {
        try {
            problemDao.insert(problem);
            List<ProblemAnswer> answerEntities = answers.stream().map(text -> {
                ProblemAnswer answer = new ProblemAnswer();
                answer.setProblemId(problem.getId());
                answer.setAnswerText(text);
                return answer;
            }).collect(Collectors.toList());
            problemAnswerDao.insertAll(answerEntities);
            problemTagDao.replaceTags(problem.getId(), tagDao.findOrCreateByNames(tags));
            auditLogService.record(actor.getUserId(), "PROBLEM_CREATED_BY_EXCEL", "PROBLEM", problem.getId(),
                    "{\"type\":\"SHORT_ANSWER\"}");
            return RowResult.success(rowNumber);
        } catch (RuntimeException e) {
            LOGGER.warn("행 {} 문제 저장 실패", rowNumber, e);
            return RowResult.fail(rowNumber, "문제 저장 중 오류가 발생했습니다.");
        }
    }

    private RowResult saveChoiceBased(int rowNumber, Problem problem, List<String> choiceTexts,
                                       List<Integer> correctIndexes, List<String> tags, AuthUser actor,
                                       ProblemType type) {
        try {
            problemDao.insert(problem);
            List<ProblemChoice> choices = new ArrayList<>();
            for (int i = 0; i < choiceTexts.size(); i++) {
                ProblemChoice choice = new ProblemChoice();
                choice.setProblemId(problem.getId());
                choice.setChoiceText(choiceTexts.get(i));
                choice.setCorrect(correctIndexes.contains(i + 1));
                choice.setDisplayOrder(i + 1);
                choices.add(choice);
            }
            problemChoiceDao.insertAll(choices);
            problemTagDao.replaceTags(problem.getId(), tagDao.findOrCreateByNames(tags));
            auditLogService.record(actor.getUserId(), "PROBLEM_CREATED_BY_EXCEL", "PROBLEM", problem.getId(),
                    "{\"type\":\"" + type + "\"}");
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
