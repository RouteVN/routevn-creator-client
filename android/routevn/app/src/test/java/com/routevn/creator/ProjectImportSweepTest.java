package com.routevn.creator;

import static org.junit.Assert.*;

import java.io.File;
import java.nio.file.Files;
import java.util.Collections;
import java.util.HashSet;
import java.util.Set;
import org.junit.Rule;
import org.junit.Test;
import org.junit.rules.TemporaryFolder;

public class ProjectImportSweepTest {
    @Rule
    public TemporaryFolder folder = new TemporaryFolder();

    private File staleDir(File importRoot, String name) throws Exception {
        File dir = new File(importRoot, name);
        Files.createDirectories(dir.toPath());
        Files.write(new File(dir, "leftover").toPath(), new byte[] { 1 });
        dir.setLastModified(System.currentTimeMillis() - 48 * 60 * 60 * 1000L);
        return dir;
    }

    @Test public void sweepSkipsActiveIdsAndTheirArchiveSiblings() throws Exception {
        File importRoot = folder.newFolder("imports");
        File activeWork = staleDir(importRoot, "p1");
        File activeArchive = staleDir(importRoot, "p1.archive");
        File idleWork = staleDir(importRoot, "p2");
        File idleArchive = staleDir(importRoot, "p2.archive");
        Set<String> active = Collections.singleton("p1");

        MainActivity.sweepStaleImportDirs(importRoot, active);

        assertTrue(activeWork.exists());
        assertTrue(activeArchive.exists());
        assertFalse(idleWork.exists());
        assertFalse(idleArchive.exists());
    }

    @Test public void sweepKeepsRecentDirectories() throws Exception {
        File importRoot = folder.newFolder("imports-recent");
        File recent = new File(importRoot, "p3");
        Files.createDirectories(recent.toPath());
        Set<String> active = new HashSet<>();

        MainActivity.sweepStaleImportDirs(importRoot, active);

        assertTrue(recent.exists());
    }

    @Test public void sweepToleratesMissingRoot() {
        MainActivity.sweepStaleImportDirs(
            new File(folder.getRoot(), "does-not-exist"),
            new HashSet<>()
        );
    }
}
