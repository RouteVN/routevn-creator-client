package com.routevn.creator;

import static org.junit.Assert.*;

import java.io.ByteArrayInputStream;
import java.io.File;
import java.nio.file.Files;
import java.util.List;
import java.util.regex.Pattern;
import org.junit.Before;
import org.junit.Rule;
import org.junit.Test;
import org.junit.rules.TemporaryFolder;

public class TempFoldersTest {
    @Rule
    public TemporaryFolder folder = new TemporaryFolder();

    private File root;
    private TempFolders folders;

    @Before
    public void setUp() {
        root = new File(folder.getRoot(), "project-import");
        folders = new TempFolders(root);
    }

    private static void assertCode(String code, CodedException error) {
        assertEquals(code, error.code);
        assertTrue(error.getMessage().startsWith(code + ": "));
    }

    private static void age(File file, long millis) {
        assertTrue(file.setLastModified(System.currentTimeMillis() - millis));
    }

    @Test public void createMakesAUuidFolder() throws Exception {
        String tempFolderId = folders.create();
        assertTrue(Pattern.matches("[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}", tempFolderId));
        assertTrue(new File(root, tempFolderId).isDirectory());
        assertNotEquals(tempFolderId, folders.create());
    }

    @Test public void createRemovesFoldersOlderThanADayAndKeepsRecentOnes() throws Exception {
        File old = new File(root, "old");
        File recent = new File(root, "recent");
        assertTrue(new File(old, "deep").mkdirs());
        assertTrue(recent.mkdirs());
        assertTrue(new File(old, "deep/file").createNewFile());
        age(old, 25L * 60 * 60 * 1000);
        age(recent, 23L * 60 * 60 * 1000);

        folders.create();

        assertFalse(old.exists());
        assertTrue(recent.exists());
    }

    @Test public void resolveStaysInsideTheTempFolder() throws Exception {
        String tempFolderId = folders.create();
        File directory = new File(root, tempFolderId);
        assertEquals(new File(directory, "files/a b.png"), folders.resolve(tempFolderId, "files/a b.png"));
        assertEquals(directory, folders.resolveDirectory(tempFolderId, ""));
        for (String path : new String[] { "", "/etc/passwd", "../a", "a/./b" }) {
            assertCode("importFailed", assertThrows(
                "path accepted: " + path,
                CodedException.class,
                () -> folders.resolve(tempFolderId, path)
            ));
        }
    }

    @Test public void tempFolderIdsMustBeUuidsOfExistingFolders() throws Exception {
        folders.create();
        for (String tempFolderId : new String[] {
            "../project-import", "not-a-uuid", "00000000-0000-0000-0000-000000000000",
        }) {
            assertCode("importFailed", assertThrows(
                "id accepted: " + tempFolderId,
                CodedException.class,
                () -> folders.resolve(tempFolderId, "a.zip")
            ));
        }
    }

    @Test public void removeDeletesRecursivelyAndIsIdempotent() throws Exception {
        String tempFolderId = folders.create();
        File file = folders.resolve(tempFolderId, "files/a.bin");
        assertTrue(file.getParentFile().mkdirs());
        assertTrue(file.createNewFile());

        folders.remove(tempFolderId);
        assertFalse(new File(root, tempFolderId).exists());
        folders.remove(tempFolderId);

        assertThrows(CodedException.class, () -> folders.remove("../x"));
    }

    @Test public void listReportsKindAndSizeSortedByName() throws Exception {
        String tempFolderId = folders.create();
        File directory = folders.resolveDirectory(tempFolderId, "");
        Files.write(new File(directory, "project.db").toPath(), new byte[] { 1, 2, 3 });
        assertTrue(new File(directory, "files").mkdir());
        assertTrue(new File(directory, "a.txt").createNewFile());

        List<TempFolders.Child> children = TempFolders.list(directory);

        assertEquals(3, children.size());
        assertEquals("a.txt", children.get(0).name);
        assertEquals("file", children.get(0).kind);
        assertEquals(0, children.get(0).size);
        assertEquals("files", children.get(1).name);
        assertEquals("directory", children.get(1).kind);
        assertEquals("project.db", children.get(2).name);
        assertEquals(3, children.get(2).size);
    }

    @Test public void copyWritesANewFileAndRemovesItPastTheLimit() throws Exception {
        File destination = new File(folder.getRoot(), "in/archive.zip");
        assertEquals(3, TempFolders.copy(new ByteArrayInputStream(new byte[] { 1, 2, 3 }), destination, 10));
        assertArrayEquals(new byte[] { 1, 2, 3 }, Files.readAllBytes(destination.toPath()));

        File partial = new File(folder.getRoot(), "partial");
        assertCode("tooLarge", assertThrows(
            CodedException.class,
            () -> TempFolders.copy(new ByteArrayInputStream(new byte[100]), partial, 99)
        ));
        assertFalse(partial.exists());
    }
}
