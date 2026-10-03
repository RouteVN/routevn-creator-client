package com.routevn.creator;

import static org.junit.Assert.*;

import java.io.File;
import java.io.IOException;
import java.nio.file.Files;
import org.junit.Rule;
import org.junit.Test;
import org.junit.rules.TemporaryFolder;

public class ProjectArchiveStagerStrictTest {
    @Rule
    public TemporaryFolder folder = new TemporaryFolder();

    private ProjectArchiveStager stagerIn(File importRoot) throws IOException {
        return new ProjectArchiveStager(importRoot, "p1");
    }

    @Test public void prepareFailsWhenStagingDirectoryCannotBeCleared() throws Exception {
        File importRoot = folder.newFolder("imports");
        ProjectArchiveStager stager = stagerIn(importRoot);
        stager.prepare();
        File workDir = stager.promotableDirectory();
        Files.write(new File(workDir, "leftover").toPath(), new byte[] { 1 });
        // Without write permission the leftover file cannot be unlinked, so
        // the stale non-empty directory must not be silently reused.
        boolean locked = workDir.setWritable(false);
        try {
            if (locked) {
                try {
                    stager.prepare();
                    fail("stale staging directory reused");
                } catch (ProjectImportException error) {
                    assertEquals("importFailed", error.code);
                }
            }
        } finally {
            if (locked) {
                workDir.setWritable(true);
            }
            stager.cleanup();
        }
        assertFalse(workDir.exists());
        assertFalse(stager.archiveDirectory().exists());
    }

    @Test public void prepareRecreatesLeftoverDirectoriesEmpty() throws Exception {
        File importRoot = folder.newFolder("imports-fresh");
        ProjectArchiveStager stager = stagerIn(importRoot);
        stager.prepare();
        Files.write(
            new File(stager.promotableDirectory(), "project.db").toPath(),
            new byte[] { 1 }
        );
        Files.write(
            new File(stager.archiveDirectory(), "archive.zip").toPath(),
            new byte[] { 2 }
        );
        stager.prepare();
        assertEquals(0, stager.promotableDirectory().list().length);
        assertEquals(0, stager.archiveDirectory().list().length);
    }
}
