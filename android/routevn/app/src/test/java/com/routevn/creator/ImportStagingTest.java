package com.routevn.creator;

import static org.junit.Assert.*;

import java.io.ByteArrayInputStream;
import java.io.File;
import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.util.List;
import java.util.regex.Pattern;
import org.junit.Assume;
import org.junit.Before;
import org.junit.Rule;
import org.junit.Test;
import org.junit.rules.TemporaryFolder;

public class ImportStagingTest {
    @Rule
    public TemporaryFolder folder = new TemporaryFolder();

    private File root;
    private ImportStaging staging;

    @Before
    public void setUp() throws IOException {
        root = new File(folder.getRoot(), "project-import");
        staging = new ImportStaging(root);
    }

    private static void assertCode(String code, ProjectImportException error) {
        assertEquals(code, error.code);
        assertTrue(error.getMessage().startsWith(code + ": "));
    }

    private static void age(File file, long millis) {
        assertTrue(file.setLastModified(System.currentTimeMillis() - millis));
    }

    @Test public void createMakesAUuidFolder() throws Exception {
        String stagingId = staging.create();
        assertTrue(Pattern.matches("[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}", stagingId));
        assertTrue(new File(root, stagingId).isDirectory());
        assertNotEquals(stagingId, staging.create());
    }

    @Test public void createRemovesFoldersOlderThanADayAndKeepsRecentOnes() throws Exception {
        File old = new File(root, "old");
        File recent = new File(root, "recent");
        assertTrue(new File(old, "deep").mkdirs());
        assertTrue(recent.mkdirs());
        assertTrue(new File(old, "deep/file").createNewFile());
        age(old, 25L * 60 * 60 * 1000);
        age(recent, 23L * 60 * 60 * 1000);

        staging.create();

        assertFalse(old.exists());
        assertTrue(recent.exists());
    }

    @Test public void sweepToleratesAMissingRoot() {
        ImportStaging.sweep(new File(folder.getRoot(), "missing"), System.currentTimeMillis());
    }

    @Test public void resolveAcceptsPlainRelativePaths() throws Exception {
        String stagingId = staging.create();
        assertEquals(
            new File(new File(root, stagingId), "files/a b.png"),
            staging.resolve(stagingId, "files/a b.png")
        );
        assertEquals(new File(new File(root, stagingId), "archive.zip"), staging.resolve(stagingId, "archive.zip"));
    }

    @Test public void resolveRejectsUnsafePaths() throws Exception {
        String stagingId = staging.create();
        for (String path : new String[] {
            "", "/etc/passwd", "a//b", "./a", "a/./b", "../a", "a/..", "a/../b", "..", ".",
            "a/", "a\\b", "C:/a", "a:b", "a\0b",
        }) {
            assertCode("importFailed", assertThrows(
                "path accepted: " + path,
                ProjectImportException.class,
                () -> staging.resolve(stagingId, path)
            ));
        }
    }

    @Test public void resolveRejectsBadOrUnknownStagingIds() throws Exception {
        staging.create();
        for (String stagingId : new String[] {
            "", "../project-import", "not-a-uuid", "..", "00000000-0000-0000-0000-00000000000/",
        }) {
            assertCode("importFailed", assertThrows(
                ProjectImportException.class,
                () -> staging.resolve(stagingId, "a.zip")
            ));
        }
        // A well-formed id with no folder behind it is also an error.
        assertCode("importFailed", assertThrows(
            ProjectImportException.class,
            () -> staging.resolve("00000000-0000-0000-0000-000000000000", "a.zip")
        ));
    }

    @Test public void resolveDirectoryTreatsAnEmptyPathAsTheStagingFolder() throws Exception {
        String stagingId = staging.create();
        assertEquals(new File(root, stagingId), staging.resolveDirectory(stagingId, ""));
        assertEquals(new File(root, stagingId), staging.resolveDirectory(stagingId, null));
        assertEquals(
            new File(new File(root, stagingId), "files"),
            staging.resolveDirectory(stagingId, "files")
        );
        assertThrows(ProjectImportException.class, () -> staging.resolveDirectory(stagingId, ".."));
    }

    @Test public void removeDeletesRecursivelyAndIsIdempotent() throws Exception {
        String stagingId = staging.create();
        File file = staging.resolve(stagingId, "files/a.bin");
        assertTrue(file.getParentFile().mkdirs());
        assertTrue(file.createNewFile());

        staging.remove(stagingId);
        assertFalse(new File(root, stagingId).exists());
        staging.remove(stagingId);

        assertThrows(ProjectImportException.class, () -> staging.remove("../x"));
    }

    @Test public void removeNeverFollowsASymlinkOutOfTheStagingFolder() throws Exception {
        String stagingId = staging.create();
        File outside = folder.newFolder("outside");
        File planted = new File(outside, "planted");
        assertTrue(planted.createNewFile());
        try {
            Files.createSymbolicLink(new File(root, stagingId + "/link").toPath(), outside.toPath());
        } catch (IOException | UnsupportedOperationException error) {
            Assume.assumeNoException(error);
        }

        staging.remove(stagingId);

        assertFalse(new File(root, stagingId).exists());
        assertTrue(planted.exists());
    }

    @Test public void listReportsKindAndSizeSortedByName() throws Exception {
        String stagingId = staging.create();
        File directory = staging.resolveDirectory(stagingId, "");
        Files.write(new File(directory, "project.db").toPath(), new byte[] { 1, 2, 3 });
        assertTrue(new File(directory, "files").mkdir());
        assertTrue(new File(directory, "a.txt").createNewFile());

        List<ImportStaging.Child> children = ImportStaging.list(directory);

        assertEquals(3, children.size());
        assertEquals("a.txt", children.get(0).name);
        assertEquals("file", children.get(0).kind);
        assertEquals(0, children.get(0).size);
        assertEquals("files", children.get(1).name);
        assertEquals("directory", children.get(1).kind);
        assertEquals("project.db", children.get(2).name);
        assertEquals(3, children.get(2).size);
    }

    @Test public void listReportsSymlinksWithoutFollowingThem() throws Exception {
        String stagingId = staging.create();
        File directory = staging.resolveDirectory(stagingId, "");
        File target = folder.newFile("target.bin");
        try {
            Files.createSymbolicLink(new File(directory, "link").toPath(), target.toPath());
        } catch (IOException | UnsupportedOperationException error) {
            Assume.assumeNoException(error);
        }

        List<ImportStaging.Child> children = ImportStaging.list(directory);

        assertEquals("symlink", children.get(0).kind);
    }

    @Test public void listFailsForAMissingFolder() {
        assertCode("importFailed", assertThrows(
            ProjectImportException.class,
            () -> ImportStaging.list(new File(root, "missing"))
        ));
    }

    @Test public void copyWritesANewFile() throws Exception {
        File destination = new File(folder.getRoot(), "in/archive.zip");
        long bytes = ImportStaging.copy(new ByteArrayInputStream(new byte[] { 1, 2, 3 }), destination, 10);
        assertEquals(3, bytes);
        assertArrayEquals(new byte[] { 1, 2, 3 }, Files.readAllBytes(destination.toPath()));
    }

    @Test public void copyPastTheLimitFailsAndRemovesTheFile() throws Exception {
        File destination = folder.newFile("partial");
        assertTrue(destination.delete());
        ProjectImportException error = assertThrows(
            ProjectImportException.class,
            () -> ImportStaging.copy(new ByteArrayInputStream(new byte[100]), destination, 99)
        );
        assertCode("archiveTooLarge", error);
        assertFalse(destination.exists());
    }

    @Test public void copyNeverOverwritesAnExistingFile() throws Exception {
        File destination = folder.newFile("existing");
        Files.write(destination.toPath(), new byte[] { 9 });
        ProjectImportException error = assertThrows(
            ProjectImportException.class,
            () -> ImportStaging.copy(new ByteArrayInputStream(new byte[] { 1 }), destination, 10)
        );
        assertCode("importFailed", error);
        assertArrayEquals(new byte[] { 9 }, Files.readAllBytes(destination.toPath()));
    }

    @Test public void copyRemovesTheFileWhenReadingFails() throws Exception {
        File destination = new File(folder.getRoot(), "broken");
        InputStream failing = new InputStream() {
            @Override public int read() throws IOException {
                throw new IOException("read failed");
            }
        };
        ProjectImportException error = assertThrows(
            ProjectImportException.class,
            () -> ImportStaging.copy(failing, destination, 10)
        );
        assertCode("importFailed", error);
        assertFalse(destination.exists());
    }
}
