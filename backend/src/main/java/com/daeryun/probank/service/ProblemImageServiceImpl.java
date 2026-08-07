package com.daeryun.probank.service;

import com.daeryun.probank.common.AuthUser;
import com.daeryun.probank.common.ErrorCode;
import com.daeryun.probank.exception.BizException;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.Arrays;
import java.util.HashSet;
import java.util.Locale;
import java.util.Set;
import java.util.UUID;

@Service
public class ProblemImageServiceImpl implements ProblemImageService {

    /**
     * Extensions accepted for problem images. Deliberately excludes svg — SVG can carry inline
     * {@code <script>}/event-handler content and would let a stored file execute script in whoever's
     * browser later opens the "image" URL (stored XSS), even though it is served as a static
     * resource rather than executed server-side.
     */
    private static final Set<String> ALLOWED_EXTENSIONS =
            new HashSet<>(Arrays.asList("png", "jpg", "jpeg", "gif", "webp"));

    private static final Set<String> ALLOWED_CONTENT_TYPES = new HashSet<>(Arrays.asList(
            "image/png", "image/jpeg", "image/gif", "image/webp"));

    /**
     * Per-image cap, tighter than the global {@code spring.servlet.multipart.max-file-size} (20MB),
     * which is sized for other endpoints (e.g. excel account uploads). A single problem illustration
     * has no legitimate reason to approach that, and a smaller bound limits disk usage/DoS exposure
     * per uploaded file. Not specified by the task brief; chosen as a defensive default.
     */
    private static final long MAX_IMAGE_SIZE_BYTES = 5L * 1024 * 1024;

    private final Path uploadDir;
    private final AuditLogService auditLogService;

    public ProblemImageServiceImpl(@Value("${app.upload.image-dir}") String uploadDir,
                                   AuditLogService auditLogService) {
        // Resolve once, at construction, to a fixed absolute root. Every write target is checked
        // against this root before any bytes touch disk.
        this.uploadDir = Paths.get(uploadDir).toAbsolutePath().normalize();
        this.auditLogService = auditLogService;
    }

    @Override
    public String store(MultipartFile file, AuthUser actor) {
        if (file == null || file.isEmpty()) {
            throw new BizException(ErrorCode.FILE_REQUIRED);
        }
        if (file.getSize() > MAX_IMAGE_SIZE_BYTES) {
            throw new BizException(ErrorCode.FILE_TOO_LARGE, "이미지 크기는 5MB를 초과할 수 없습니다.");
        }

        String extension = validateAndExtractExtension(file);

        try {
            Files.createDirectories(uploadDir);
            // The stored name is always a fresh UUID plus a vetted extension — the client-supplied
            // original filename is never used to build the path, so it cannot inject "../", an
            // absolute path, or a NUL byte into the target location.
            String fileName = UUID.randomUUID() + "." + extension;
            Path target = uploadDir.resolve(fileName).normalize();
            if (!target.getParent().equals(uploadDir)) {
                // Defense-in-depth: should be unreachable given the UUID name and extension allowlist
                // above, but never write outside the configured upload root.
                throw new BizException(ErrorCode.FILE_TYPE_NOT_ALLOWED, "허용되지 않는 파일입니다.");
            }
            file.transferTo(target.toFile());
            auditLogService.record(actor.getUserId(), "PROBLEM_IMAGE_UPLOADED", "PROBLEM_IMAGE", null,
                    "{\"fileName\":\"" + fileName + "\"}");
            return "/uploads/images/" + fileName;
        } catch (IOException e) {
            throw new BizException(ErrorCode.MSG_PROC_FAIL, "이미지 업로드에 실패했습니다.");
        }
    }

    /**
     * Validates the file's declared content type and original filename's extension against fixed
     * allowlists and returns the (lower-cased) extension to use for the stored file.
     * <p>
     * {@code Content-Type} is client-supplied and therefore not trusted on its own — it is checked
     * together with, not instead of, the filename extension. Both must independently pass their
     * allowlist. Neither the original filename nor the content type is ever used to build a
     * filesystem path; only this short, regex-validated extension is used, and it can never contain
     * a path separator or traversal sequence.
     */
    private String validateAndExtractExtension(MultipartFile file) {
        String contentType = file.getContentType();
        if (contentType == null || !ALLOWED_CONTENT_TYPES.contains(contentType.toLowerCase(Locale.ROOT))) {
            throw new BizException(ErrorCode.FILE_TYPE_NOT_ALLOWED,
                    "허용되지 않는 파일 형식입니다. png, jpg, jpeg, gif, webp 이미지만 업로드할 수 있습니다.");
        }
        String extension = extractSafeExtension(file.getOriginalFilename());
        if (!ALLOWED_EXTENSIONS.contains(extension)) {
            throw new BizException(ErrorCode.FILE_TYPE_NOT_ALLOWED,
                    "허용되지 않는 파일 형식입니다. png, jpg, jpeg, gif, webp 이미지만 업로드할 수 있습니다.");
        }
        return extension;
    }

    /**
     * Extracts a bare, lower-cased extension (no dot) from a client-supplied filename, or "" if none
     * can be safely determined. Strips any path segments first so an attacker-crafted name such as
     * {@code "a.png/../../../etc/cron.d/evil"} cannot smuggle a traversal sequence through into the
     * extension: only the last path segment is considered, and the result must match
     * {@code [a-z0-9]{1,5}} — anything containing '/', '\\', '.', or a NUL byte is rejected outright
     * by the allowlist check in the caller.
     */
    private String extractSafeExtension(String originalFilename) {
        if (originalFilename == null) {
            return "";
        }
        String baseName = originalFilename.replace('\\', '/');
        int lastSlash = baseName.lastIndexOf('/');
        if (lastSlash >= 0) {
            baseName = baseName.substring(lastSlash + 1);
        }
        int lastDot = baseName.lastIndexOf('.');
        if (lastDot < 0 || lastDot == baseName.length() - 1) {
            return "";
        }
        String extension = baseName.substring(lastDot + 1).toLowerCase(Locale.ROOT);
        return extension.matches("[a-z0-9]{1,5}") ? extension : "";
    }
}
