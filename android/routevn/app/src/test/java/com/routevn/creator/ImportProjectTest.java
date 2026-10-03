package com.routevn.creator;

import static org.junit.Assert.*;

import java.io.ByteArrayInputStream;
import java.io.File;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.util.ArrayList;
import java.util.Arrays;
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
        List<String> names = new ArrayList<>(Arrays.asList(directory.list()));
        names.sort(String::compareTo);
        return names;
    }

    private static List<String[]> renames(String... pairs) {
        List<String[]> renames = new ArrayList<>();
        for (int index = 0; index < pairs.length; index += 2) {
            renames.add(new String[] { pairs[index], pairs[index + 1] });
        }
        return renames;
    }

    private static void assertFails(String code, ProjectImportException error) {
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

    @Test public void moveProjectRequiresProjectDb() throws Exception {
        File source = folder.newFolder("source");
        write(source, "files/abc", "asset");
        File workDir = new File(folder.getRoot(), "work");

        assertFails("invalidArchive", assertThrows(
            ProjectImportException.class,
            () -> ImportProject.moveProject(source, workDir)
        ));

        assertFalse(workDir.exists());
        assertTrue(new File(source, "files/abc").exists());
    }

    @Test public void moveProjectRejectsAFileWhereAFolderIsExpected() throws Exception {
        File source = folder.newFolder("source");
        write(source, "project.db", "db");
        write(source, "files", "not a folder");

        assertFails("invalidArchive", assertThrows(
            ProjectImportException.class,
            () -> ImportProject.moveProject(source, new File(folder.getRoot(), "work"))
        ));
    }

    @Test public void applyRenamesRenamesDirectEntriesOfFiles() throws Exception {
        File files = folder.newFolder("files");
        write(files, "photo.png", "one");
        write(files, "sound.mp3", "two");

        ImportProject.applyRenames(files, renames("photo.png", "abc", "sound.mp3", "def"));

        assertEquals(Arrays.asList("abc", "def"), names(files));
        assertArrayEquals(bytes("one"), Files.readAllBytes(new File(files, "abc").toPath()));
    }

    @Test public void applyRenamesWithNoRenamesDoesNothing() throws Exception {
        File files = folder.newFolder("files");
        write(files, "abc", "one");
        ImportProject.applyRenames(files, new ArrayList<>());
        assertEquals(Arrays.asList("abc"), names(files));
    }

    @Test public void applyRenamesFailsWhenFromDoesNotExist() throws Exception {
        File files = folder.newFolder("files");
        assertFails("importFailed", assertThrows(
            ProjectImportException.class,
            () -> ImportProject.applyRenames(files, renames("missing.png", "abc"))
        ));
    }

    @Test public void applyRenamesNeverOverwritesAnExistingTarget() throws Exception {
        File files = folder.newFolder("files");
        write(files, "photo.png", "one");
        write(files, "abc", "keep");

        assertFails("importFailed", assertThrows(
            ProjectImportException.class,
            () -> ImportProject.applyRenames(files, renames("photo.png", "abc"))
        ));

        assertArrayEquals(bytes("keep"), Files.readAllBytes(new File(files, "abc").toPath()));
        assertTrue(new File(files, "photo.png").exists());
    }

    @Test public void applyRenamesRejectsNamesThatAreNotPlain() throws Exception {
        File files = folder.newFolder("files");
        write(files, "photo.png", "one");
        write(files, "nested/inner", "two");
        for (String[] rename : new String[][] {
            { "photo.png", "sub/abc" }, { "nested/inner", "abc" }, { "photo.png", ".." },
            { "..", "abc" }, { "photo.png", "" }, { "photo.png", "a\\b" }, { "photo.png", "/abs" },
        }) {
            assertFails("importFailed", assertThrows(
                Arrays.toString(rename),
                ProjectImportException.class,
                () -> ImportProject.applyRenames(files, renames(rename))
            ));
        }
        assertEquals(Arrays.asList("nested", "photo.png"), names(files));
    }

    @Test public void aStagedArchiveGoesFromDownloadToTheWorkDirectory() throws Exception {
        // The copy, list, extract, list and move steps JavaScript drives for a local zip.
        ImportStaging staging = new ImportStaging(new File(folder.getRoot(), "project-import"));
        String stagingId = staging.create();
        byte[] zip = new TestZipArchive()
            .addStored("Project One/project.db", bytes("db"), 0100644)
            .addDeflated("Project One/files/photo.png", bytes("image"), 0100644)
            .addStored("Project One/README.txt", bytes("extra"), 0100644)
            .toBytes();

        ImportStaging.copy(new ByteArrayInputStream(zip), staging.resolve(stagingId, "archive.zip"), 1_000_000);
        File archive = staging.resolve(stagingId, "archive.zip");
        assertEquals(3, ImportArchive.list(archive, 10).size());
        ImportArchive.extract(
            archive,
            staging.resolveDirectory(stagingId, "project"),
            Arrays.asList(
                new ImportArchive.Item("Project One/project.db", "project.db"),
                new ImportArchive.Item("Project One/files/photo.png", "files/photo.png")
            ),
            1_000_000,
            ImportProgress.NONE
        );
        List<ImportStaging.Child> listing = ImportStaging.list(staging.resolveDirectory(stagingId, "project"));
        assertEquals("files", listing.get(0).name);
        assertEquals("project.db", listing.get(1).name);

        File workDir = new File(folder.getRoot(), "project-import/p1");
        ImportProject.moveProject(staging.resolveDirectory(stagingId, "project"), workDir);
        ImportProject.applyRenames(new File(workDir, "files"), renames("photo.png", "abc"));

        assertEquals(Arrays.asList("abc"), names(new File(workDir, "files")));
        staging.remove(stagingId);
        assertTrue(workDir.isDirectory());
    }
}
