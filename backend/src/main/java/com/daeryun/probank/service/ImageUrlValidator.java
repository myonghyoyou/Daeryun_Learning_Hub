package com.daeryun.probank.service;

/**
 * problems.image_url 이 가져야 하는 형태를 검사하는 단일 규칙. {@link ProblemServiceImpl}(JSON API 경로)과
 * {@link ExcelProblemUploadServiceImpl}(엑셀 업로드 경로) 양쪽 모두 이 클래스 하나만 사용한다.
 * <p>
 * 이미지 업로드 API({@link ProblemImageServiceImpl#store})는 확장자/Content-Type 허용목록, 5MB 상한,
 * SVG 제외, UUID 파일명, 경로 탈출 방어를 모두 적용한다. imageUrl을 자유 문자열로 받아 그대로 저장하면
 * 그 검증을 전부 우회할 수 있고, Plan 4 풀이 화면이 이 값을 전사 공통으로 렌더링하므로 두 입력 경로
 * 모두에서 서버가 고정해야 한다. 규칙을 두 클래스에 각각 구현하면 한쪽만 고쳐지고 다른 쪽은 남는
 * 드리프트가 생기므로, 실제 판정 로직은 이 클래스에만 존재한다 — 호출부는 결과(Result)만 보고 자기
 * 맥락에 맞는 메시지를 고른다.
 */
final class ImageUrlValidator {

    /** 이미지 업로드 API가 돌려주는 경로의 접두어. 이 값으로 시작하지 않으면 외부 URL로 간주해 거부한다. */
    static final String PREFIX = "/uploads/images/";

    /** problems.image_url VARCHAR(500) 과 1:1로 맞춘 상한. */
    static final int MAX_LENGTH = 500;

    private ImageUrlValidator() {
    }

    enum Result {
        /** 비어 있거나(이미지 없음) 유효한 업로드 경로. */
        VALID,
        /** 접두어가 다르거나(외부 URL 등) {@code ..}로 상위 경로를 가리키는 경우. */
        BAD_PREFIX,
        /** 접두어는 맞지만 길이 상한을 넘는 경우. */
        TOO_LONG
    }

    /**
     * imageUrl 값을 검사한다. {@code ..}는 접두어를 통과하고도 상위 경로를 가리킬 수 있으므로
     * 접두어 검사와 함께 막는다.
     */
    static Result check(String imageUrl) {
        if (imageUrl == null || imageUrl.trim().isEmpty()) {
            return Result.VALID;
        }
        String value = imageUrl.trim();
        if (!value.startsWith(PREFIX) || value.contains("..")) {
            return Result.BAD_PREFIX;
        }
        if (value.length() > MAX_LENGTH) {
            return Result.TOO_LONG;
        }
        return Result.VALID;
    }
}
