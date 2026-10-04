package com.routevn.creator;

import static org.junit.Assert.*;

import java.io.File;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.util.Arrays;
import java.util.Collections;
import java.util.List;
import org.junit.Rule;
import org.junit.Test;
import org.junit.rules.TemporaryFolder;

public class ImportProjectTest {
    @Rule
    public TemporaryFolder folder = new TemporaryFolder();

    private static byte[] bytes(String text) {
        return text.getBytes(StandardCharsets.UTF_8);
    }

    private File write(File directory, String name, String content) throws IOException {
        File file = new File(directory, name);
        file.getParentFile().mkdirs();
        Files.write(file.toPath(), bytes(content));
        return file;
    }

    private static List<String> names(File directory) {
        String[] names = directory.list();
        Arrays.sort(names);
        return Arrays.asList(names);
    }

    private static void assertCode(String code, CodedException error) {
        assertEquals(code, error.code);
        assertTrue(error.getMessage(), error.getMessage().startsWith(code + ": "));
    }

    @Test public void moveProjectMovesOnlyThePayload() throws Exception {
        File source = folder.newFolder("source");
        write(source, "project.db", "db");
        write(source, "project.db-wal", "wal");
        write(source, "project.db-shm", "shm");
        write(source, "project.db-journal", "journal");
        write(source, "files/abc", "asset");
        write(source, "file-metadata/abc.mime", "image/png");
        write(source, "archive.zip", "zip");
        write(source, "notes.txt", "extra");
        File workDir = new File(folder.getRoot(), "work");

        ImportProject.moveProject(source, workDir);

        assertEquals(
            Arrays.asList("file-metadata", "files", "project.db", "project.db-journal", "project.db-shm", "project.db-wal"),
            names(workDir)
        );
        assertArrayEquals(bytes("asset"), Files.readAllBytes(new File(workDir, "files/abc").toPath()));
        assertEquals(Arrays.asList("archive.zip", "notes.txt"), names(source));
    }

    @Test public void moveProjectCreatesEmptyFolderWhenTheArchiveHasNoAssets() throws Exception {
        File source = folder.newFolder("source");
        write(source, "project.db", "db");
        File workDir = new File(folder.getRoot(), "work");

        ImportProject.moveProject(source, workDir);

        assertEquals(Arrays.asList("file-metadata", "files", "project.db"), names(workDir));
        assertEquals(0, new File(workDir, "files").list().length);
        assertEquals(0, new File(workDir, "file-metadata").list().length);
    }

    @Test public void applyRenamesRenamesDirectEntriesOfFiles() throws Exception {
        File files = folder.newFolder("files");
        write(files, "photo.png", "one");
        write(files, "sound.mp3", "two");

        ImportProject.applyRenames(files, Arrays.asList(
            new String[] { "photo.png", "abc" },
            new String[] { "sound.mp3", "def" }
        ));

        assertEquals(Arrays.asList("abc", "def"), names(files));
        assertArrayEquals(bytes("one"), Files.readAllBytes(new File(files, "abc").toPath()));
    }

    @Test public void applyRenamesRefusesMissingSourcesExistingTargetsAndNestedNames() throws Exception {
        File files = folder.newFolder("files");
        write(files, "photo.png", "one");
        write(files, "abc", "keep");
        write(files, "nested/inner", "two");
        for (String[] rename : new String[][] {
            { "missing.png", "def" }, { "photo.png", "abc" }, { "photo.png", "sub/def" }, { "nested/inner", "def" },
            { "..", "def" },
        }) {
            assertCode("importFailed", assertThrows(
                Arrays.toString(rename),
                CodedException.class,
                () -> ImportProject.applyRenames(files, Collections.singletonList(rename))
            ));
        }
        assertEquals(Arrays.asList("abc", "nested", "photo.png"), names(files));
        assertArrayEquals(bytes("keep"), Files.readAllBytes(new File(files, "abc").toPath()));
    }
}
