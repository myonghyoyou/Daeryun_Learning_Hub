package com.daeryun.probank.service;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.mockito.Mockito;
import com.daeryun.probank.common.AuthUser;
import com.daeryun.probank.domain.UserRole;
import com.daeryun.probank.exception.BizException;
import org.springframework.mock.web.MockMultipartFile;

import java.io.File;
import java.nio.file.Path;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class ProblemImageServiceImplTest {

    @Test
    void store_savesFileAndReturnsUrlUnderUploadDir(@TempDir Path tempDir) throws Exception {
        ProblemImageServiceImpl service = new ProblemImageServiceImpl(tempDir.toString(),
                Mockito.mock(AuditLogService.class));
        MockMultipartFile file = new MockMultipartFile("file", "sample.png", "image/png", new byte[]{1, 2, 3});

        String url = service.store(file, new AuthUser(1L, "1001", "관리자", UserRole.DEPT_ADMIN, 10L, false));

        assertTrue(url.startsWith("/uploads/images/"));
        String savedFileName = url.substring("/uploads/images/".length());
        File savedFile = new File(tempDir.toFile(), savedFileName);
        assertTrue(savedFile.exists());
    }

    /**
     * Pins that a filename crafted to smuggle a traversal sequence through a naive
     * "everything after the last dot" extension extraction (e.g. {@code "a.png/../../../evil"},
     * whose naive extension would be {@code ".png/../../../evil"}) is rejected outright rather than
     * written anywhere — inside or outside the upload root. If the extension allowlist/sanitization
     * were removed, this either writes outside {@code tempDir} or throws a raw IOException instead of
     * the clean {@link BizException} asserted here, so the guard is load-bearing for this test.
     */
    @Test
    void store_rejectsPathTraversalAttemptInOriginalFilename(@TempDir Path tempDir) throws Exception {
        ProblemImageServiceImpl service = new ProblemImageServiceImpl(tempDir.toString(),
                Mockito.mock(AuditLogService.class));
        MockMultipartFile file = new MockMultipartFile("file", "a.png/../../../../../../etc/evil",
                "image/png", new byte[]{1, 2, 3});
        AuthUser actor = new AuthUser(1L, "1001", "관리자", UserRole.DEPT_ADMIN, 10L, false);

        BizException ex = assertThrows(BizException.class, () -> service.store(file, actor));
        assertEquals("허용되지 않는 파일 형식입니다. png, jpg, jpeg, gif, webp 이미지만 업로드할 수 있습니다.", ex.getMessage());

        // Nothing must have been written under tempDir, and nothing outside it either.
        File[] children = tempDir.toFile().listFiles();
        assertTrue(children == null || children.length == 0);
    }

    /**
     * Pins that a disallowed file type (here: an .exe with a non-image content type) is rejected by
     * the allowlist, not merely by trusting the client-supplied Content-Type header.
     */
    @Test
    void store_rejectsDisallowedFileType(@TempDir Path tempDir) {
        ProblemImageServiceImpl service = new ProblemImageServiceImpl(tempDir.toString(),
                Mockito.mock(AuditLogService.class));
        MockMultipartFile file = new MockMultipartFile("file", "malware.exe", "application/octet-stream",
                new byte[]{1, 2, 3});
        AuthUser actor = new AuthUser(1L, "1001", "관리자", UserRole.DEPT_ADMIN, 10L, false);

        assertThrows(BizException.class, () -> service.store(file, actor));
    }

    /**
     * Pins that an image content-type with a disallowed extension (e.g. svg, which can carry inline
     * script) is still rejected — the extension allowlist is not bypassable via Content-Type alone.
     */
    @Test
    void store_rejectsAllowlistedContentTypeWithDisallowedExtension(@TempDir Path tempDir) {
        ProblemImageServiceImpl service = new ProblemImageServiceImpl(tempDir.toString(),
                Mockito.mock(AuditLogService.class));
        MockMultipartFile file = new MockMultipartFile("file", "payload.svg", "image/png",
                new byte[]{1, 2, 3});
        AuthUser actor = new AuthUser(1L, "1001", "관리자", UserRole.DEPT_ADMIN, 10L, false);

        assertThrows(BizException.class, () -> service.store(file, actor));
    }

    @Test
    void store_rejectsFileExceedingSizeLimit(@TempDir Path tempDir) {
        ProblemImageServiceImpl service = new ProblemImageServiceImpl(tempDir.toString(),
                Mockito.mock(AuditLogService.class));
        byte[] tooLarge = new byte[5 * 1024 * 1024 + 1];
        MockMultipartFile file = new MockMultipartFile("file", "big.png", "image/png", tooLarge);
        AuthUser actor = new AuthUser(1L, "1001", "관리자", UserRole.DEPT_ADMIN, 10L, false);

        assertThrows(BizException.class, () -> service.store(file, actor));
    }
}
