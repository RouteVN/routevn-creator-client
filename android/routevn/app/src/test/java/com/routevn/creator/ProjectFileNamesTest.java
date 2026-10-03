package com.routevn.creator;

import static org.junit.Assert.*;

import java.io.File;
import java.io.IOException;
import java.nio.file.Files;
import org.junit.Rule;
import org.junit.Test;
import org.junit.rules.TemporaryFolder;

public class ProjectFileNamesTest {
    @Rule
    public TemporaryFolder folder = new TemporaryFolder();

    private File filesDirectory(String... names) throws IOException {
        File filesDirectory = folder.newFolder("files");
        for (String name : names) {
            Files.write(new File(filesDirectory, name).toPath(), new byte[] { 1 });
        }
        return filesDirectory;
    }

    private String[] names(File filesDirectory) {
        return filesDirectory.list();
    }

    private void assertCode(ProjectImportException error, String code, String detailPart) {
        assertEquals(code, error.code);
        assertTrue(
            "message should start with the code: " + error.getMessage(),
            error.getMessage().startsWith(code + ": ")
        );
        assertTrue(
            "message should contain " + detailPart + ": " + error.getMessage(),
            error.getMessage().contains(detailPart)
        );
    }

    @Test public void stripsExtensionToFirstDot() throws Exception {
        File filesDirectory = filesDirectory("abc.png");
        assertEquals(1, ProjectFileNames.normalize(filesDirectory));
        assertArrayEquals(new String[] { "abc" }, names(filesDirectory));
    }

    @Test public void leavesExtensionlessNamesUnchanged() throws Exception {
        File filesDirectory = filesDirectory("abc");
        assertEquals(0, ProjectFileNames.normalize(filesDirectory));
        assertArrayEquals(new String[] { "abc" }, names(filesDirectory));
    }

    @Test public void stripsOnlyTheFirstDot() throws Exception {
        File filesDirectory = filesDirectory("a_b-1.tar.gz");
        assertEquals(1, ProjectFileNames.normalize(filesDirectory));
        assertArrayEquals(new String[] { "a_b-1" }, names(filesDirectory));
    }

    @Test public void ignoresDotPrefixedNames() throws Exception {
        File filesDirectory = filesDirectory(".DS_Store", "._abc.png", ".png");
        assertEquals(0, ProjectFileNames.normalize(filesDirectory));
        assertArrayEquals(names(filesDirectory), new String[] { ".DS_Store", "._abc.png", ".png" });
    }

    @Test public void ignoresSubDirectories() throws Exception {
        File filesDirectory = filesDirectory("abc.png");
        new File(filesDirectory, "assets.dir").mkdirs();
        Files.write(new File(new File(filesDirectory, "assets.dir"), "x.png").toPath(), new byte[] { 1 });
        assertEquals(1, ProjectFileNames.normalize(filesDirectory));
        assertTrue(new File(filesDirectory, "abc").isFile());
        assertTrue(new File(new File(filesDirectory, "assets.dir"), "x.png").isFile());
    }

    @Test public void conflictingExtensionsFailBeforeAnyRename() throws Exception {
        File filesDirectory = filesDirectory("abc.png", "abc.jpg", "other.png");
        try {
            ProjectFileNames.normalize(filesDirectory);
            fail("conflict accepted");
        } catch (ProjectImportException error) {
            assertCode(error, "fileNameConflict", "both map to abc");
        }
        // Planning happens first: no file was renamed.
        assertTrue(new File(filesDirectory, "abc.png").isFile());
        assertTrue(new File(filesDirectory, "abc.jpg").isFile());
        assertTrue(new File(filesDirectory, "other.png").isFile());
    }

    @Test public void extensionlessNameConflictsWithExtension() throws Exception {
        File filesDirectory = filesDirectory("abc", "abc.png");
        try {
            ProjectFileNames.normalize(filesDirectory);
            fail("conflict accepted");
        } catch (ProjectImportException error) {
            assertCode(error, "fileNameConflict", "both map to abc");
        }
    }

    @Test public void conflictingIdsAreCaseInsensitive() throws Exception {
        // macOS/Windows file systems are case-insensitive, so ABC.png and
        // abc.png collapse to one file there; use different extensions to
        // keep both on disk while the ids still collide case-insensitively.
        File filesDirectory = filesDirectory("ABC.png", "abc.jpg");
        try {
            ProjectFileNames.normalize(filesDirectory);
            fail("conflict accepted");
        } catch (ProjectImportException error) {
            assertCode(error, "fileNameConflict", "both map to");
        }
    }

    @Test public void caseInsensitiveConflictWithDifferentExtensions() throws Exception {
        File filesDirectory = filesDirectory("ABC", "abc.png");
        try {
            ProjectFileNames.normalize(filesDirectory);
            fail("conflict accepted");
        } catch (ProjectImportException error) {
            assertCode(error, "fileNameConflict", "both map to");
        }
    }

    @Test public void renameTargetOccupiedByDirectoryFails() throws Exception {
        File filesDirectory = filesDirectory("abc.png");
        new File(filesDirectory, "abc").mkdirs();
        try {
            ProjectFileNames.normalize(filesDirectory);
            fail("occupied target accepted");
        } catch (ProjectImportException error) {
            assertCode(error, "fileNameConflict", "existing abc");
        }
    }

    @Test public void invalidNamesFailTheWholeImport() throws Exception {
        File filesDirectory = filesDirectory("a b.png");
        try {
            ProjectFileNames.normalize(filesDirectory);
            fail("invalid name accepted");
        } catch (ProjectImportException error) {
            assertCode(error, "invalidFileName", "a b.png");
        }
        assertTrue(new File(filesDirectory, "a b.png").isFile());
    }

    @Test public void nonAsciiFileIdFails() throws Exception {
        File filesDirectory = filesDirectory("é.png");
        try {
            ProjectFileNames.normalize(filesDirectory);
            fail("invalid name accepted");
        } catch (ProjectImportException error) {
            assertCode(error, "invalidFileName", "é.png");
        }
    }

    @Test public void overlongFileIdFails() throws Exception {
        String longId = "a".repeat(129);
        File filesDirectory = filesDirectory(longId + ".png");
        try {
            ProjectFileNames.normalize(filesDirectory);
            fail("invalid name accepted");
        } catch (ProjectImportException error) {
            assertCode(error, "invalidFileName", longId + ".png");
        }
    }

    @Test public void longestValidFileIdIsAccepted() throws Exception {
        String id = "a".repeat(128);
        File filesDirectory = filesDirectory(id + ".png");
        assertEquals(1, ProjectFileNames.normalize(filesDirectory));
        assertTrue(new File(filesDirectory, id).isFile());
    }

    @Test public void normalizeIsIdempotent() throws Exception {
        File filesDirectory = filesDirectory("abc.png", "plain");
        assertEquals(1, ProjectFileNames.normalize(filesDirectory));
        assertEquals(0, ProjectFileNames.normalize(filesDirectory));
        assertArrayEquals(new String[] { "abc", "plain" }, names(filesDirectory));
    }

    @Test public void manyRenamesApplyTogether() throws Exception {
        File filesDirectory = filesDirectory("one.png", "two.mp3", "three.ogg.tar");
        assertEquals(3, ProjectFileNames.normalize(filesDirectory));
        String[] names = names(filesDirectory);
        java.util.Arrays.sort(names);
        assertArrayEquals(new String[] { "one", "three", "two" }, names);
    }

    @Test public void rollbackAttemptsEveryReversalWhenOneFails() throws Exception {
        File filesDirectory = filesDirectory("a.png", "b.png", "c.png", "d.png");
        java.util.List<ProjectFileNames.Rename> renames = ProjectFileNames.plan(filesDirectory);
        assertEquals(4, renames.size());

        java.util.List<String> rollbackAttempts = new java.util.ArrayList<>();
        ProjectFileNames.RenameOperation operation = (source, target) -> {
            // Rollback calls rename the extensionless id back to the
            // original name, so they are distinguishable from forward calls.
            boolean rollback = source.getName().indexOf('.') < 0;
            if (rollback) {
                rollbackAttempts.add(source.getName());
                if ("b".equals(source.getName())) {
                    return false; // the reversal of b fails
                }
                return source.renameTo(target);
            }
            return !"d.png".equals(source.getName()) && source.renameTo(target);
        };

        try {
            ProjectFileNames.apply(renames, operation);
            fail("failed rename accepted");
        } catch (ProjectImportException error) {
            assertCode(error, "importFailed", "Failed to rename d.png.");
            assertTrue(
                "rollback failures should be reported: " + error.getMessage(),
                error.getMessage().contains("Rollback failed for: b.png")
            );
        }
        // The failing reversal must not stop the remaining ones: the
        // reversals of a, b (fails) and c are all attempted.
        java.util.Collections.sort(rollbackAttempts);
        assertArrayEquals(new String[] { "a", "b", "c" }, rollbackAttempts.toArray());
        assertTrue(new File(filesDirectory, "a.png").isFile());
        assertFalse(new File(filesDirectory, "b.png").exists());
        assertTrue(new File(filesDirectory, "b").isFile());
        assertTrue(new File(filesDirectory, "c.png").isFile());
        assertTrue(new File(filesDirectory, "d.png").isFile());
    }
}
