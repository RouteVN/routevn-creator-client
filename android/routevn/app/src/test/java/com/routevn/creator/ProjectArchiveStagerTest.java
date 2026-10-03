package com.routevn.creator;

import static org.junit.Assert.*;

import java.io.ByteArrayInputStream;
import java.io.File;
import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import org.junit.Rule;
import org.junit.Test;
import org.junit.rules.TemporaryFolder;

public class ProjectArchiveStagerTest {
    private static final String MARKER = "ROUTEVN_EXPORT_INCOMPLETE.txt";
    private static final int UNIX_REGULAR = 0100644;

    @Rule
    public TemporaryFolder folder = new TemporaryFolder();

    private byte[] validZipBytes() throws IOException {
        return new TestZipArchive()
            .addStored("project.db", new byte[] { 1, 2, 3 }, UNIX_REGULAR)
            .addStored("files/abc.png", new byte[] { 4 }, UNIX_REGULAR)
            .toBytes();
    }

    private ProjectArchiveStager preparedStager() throws Exception {
        File importRoot = folder.newFolder("project-import");
        ProjectArchiveStager stager = new ProjectArchiveStager(importRoot, "p1");
        stager.prepare();
        return stager;
    }

    @Test public void archiveNeverLivesInsideThePromotedDirectory() throws Exception {
        ProjectArchiveStager stager = preparedStager();
        try (InputStream input = new ByteArrayInputStream(validZipBytes())) {
            stager.copyArchive(input, ProjectArchiveStager.DEFAULT_MAX_ARCHIVE_BYTES);
        }
        stager.extractArchive(MARKER);

        File promoted = stager.promotableDirectory();
        assertFalse(new File(promoted, "archive.zip").exists());
        assertTrue(new File(promoted, "project.db").isFile());
        assertTrue(new File(promoted, "files").isDirectory());
        assertTrue(new File(promoted, "file-metadata").isDirectory());
        assertEquals(3, promoted.list().length);
        // The sibling archive dir is deleted as soon as extraction finishes.
        assertFalse(stager.archiveDirectory().exists());

        stager.cleanup();
        assertFalse(promoted.exists());
    }

    @Test public void unexpectedStagedEntryBlocksPromotion() throws Exception {
        ProjectArchiveStager stager = preparedStager();
        // Simulate an archive file (or any foreign entry) landing inside the
        // directory that would be promoted.
        Files.write(
            new File(stager.promotableDirectory(), "archive.zip").toPath(),
            new byte[] { 1 }
        );
        try (InputStream input = new ByteArrayInputStream(validZipBytes())) {
            stager.copyArchive(input, ProjectArchiveStager.DEFAULT_MAX_ARCHIVE_BYTES);
        }
        try {
            stager.extractArchive(MARKER);
            fail("unexpected staged entry accepted");
        } catch (ProjectImportException error) {
            assertEquals("invalidArchive", error.code);
            assertTrue(error.getMessage().startsWith("invalidArchive: "));
        }
        stager.cleanup();
    }

    @Test public void copyArchiveAbortsOverTheLimitAndDeletesPartialFile() throws Exception {
        ProjectArchiveStager stager = preparedStager();
        try {
            stager.copyArchive(new ByteArrayInputStream(new byte[64]), 16);
            fail("oversized copy accepted");
        } catch (ProjectImportException error) {
            assertEquals("archiveTooLarge", error.code);
            assertTrue(error.getMessage().startsWith("archiveTooLarge: "));
        }
        assertFalse(stager.archiveFile().exists());
        stager.cleanup();
    }

    @Test public void copyArchiveWithinLimitWritesTheFile() throws Exception {
        ProjectArchiveStager stager = preparedStager();
        byte[] payload = new byte[32];
        payload[0] = 7;
        try (InputStream input = new ByteArrayInputStream(payload)) {
            stager.copyArchive(input, 64);
        }
        assertEquals(32, stager.archiveFile().length());
        assertArrayEquals(payload, Files.readAllBytes(stager.archiveFile().toPath()));
        stager.cleanup();
    }
}
