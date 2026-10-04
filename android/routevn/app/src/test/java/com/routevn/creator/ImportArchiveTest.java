package com.routevn.creator;

import static org.junit.Assert.*;

import java.io.File;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import org.junit.Assume;
import org.junit.Rule;
import org.junit.Test;
import org.junit.rules.TemporaryFolder;

public class ImportArchiveTest {
    private static final long LIMIT = 1_000_000;

    @Rule
    public TemporaryFolder folder = new TemporaryFolder();

    private static byte[] bytes(String text) {
        return text.getBytes(StandardCharsets.UTF_8);
    }

    private File archive(TestZipArchive zip) throws IOException {
        File file = folder.newFile();
        Files.write(file.toPath(), zip.toBytes());
        return file;
    }

    private File sample() throws IOException {
        return archive(new TestZipArchive()
            .addStored("Project One/", new byte[0])
            .addStored("Project One/project.db", bytes("db"))
            .addDeflated("Project One/files/abc.png", bytes("image bytes"))
            .addStored("Project One/readme.txt", bytes("extra")));
    }

    /** Pairs of entry name and destination path. */
    private static List<ImportArchive.Item> items(String... pairs) {
        List<ImportArchive.Item> items = new ArrayList<>();
        for (int index = 0; index < pairs.length; index += 2) {
            items.add(new ImportArchive.Item(pairs[index], pairs[index + 1]));
        }
        return items;
    }

    private static void assertCode(String code, CodedException error) {
        assertEquals(code, error.code);
        assertTrue(error.getMessage(), error.getMessage().startsWith(code + ": "));
    }

    private static void assertExtractFails(String code, File zip, File root, long maxBytes, String... pairs) {
        assertCode(code, assertThrows(
            CodedException.class,
            () -> ImportArchive.extract(zip, root, items(pairs), maxBytes, TransferProgress.NONE)
        ));
    }

    private static List<String> sorted(String[] names) {
        Arrays.sort(names);
        return Arrays.asList(names);
    }

    @Test public void listReturnsRawEntriesAndFailsForTooManyEntriesOrNotAZip() throws Exception {
        File zip = sample();
        List<ImportArchive.Entry> entries = ImportArchive.list(zip, 4);

        assertEquals(4, entries.size());
        assertEquals("Project One/", entries.get(0).name);
        assertTrue(entries.get(0).isDirectory);
        assertEquals("Project One/project.db", entries.get(1).name);
        assertFalse(entries.get(1).isDirectory);
        assertEquals(2, entries.get(1).size);
        assertEquals(11, entries.get(2).size);

        File notZip = folder.newFile();
        Files.write(notZip.toPath(), bytes("not a zip at all"));
        for (File file : new File[] { zip, notZip, new File(folder.getRoot(), "missing.zip") }) {
            assertCode("invalidArchive", assertThrows(CodedException.class, () -> ImportArchive.list(file, 3)));
        }
    }

    @Test public void extractWritesOnlyTheRequestedEntriesToTheirNewPaths() throws Exception {
        File root = new File(folder.getRoot(), "out");

        long bytes = ImportArchive.extract(
            sample(),
            root,
            items(
                "Project One/project.db", "project.db",
                "Project One/files/abc.png", "files/abc",
                "Project One/", "file-metadata"
            ),
            LIMIT,
            TransferProgress.NONE
        );

        assertEquals(13, bytes);
        assertArrayEquals(bytes("db"), Files.readAllBytes(new File(root, "project.db").toPath()));
        assertArrayEquals(bytes("image bytes"), Files.readAllBytes(new File(root, "files/abc").toPath()));
        assertTrue(new File(root, "file-metadata").isDirectory());
        assertEquals(Arrays.asList("file-metadata", "files", "project.db"), sorted(root.list()));
    }

    @Test public void extractRefusesUnsafeDestinationPaths() throws Exception {
        File zip = sample();
        File root = new File(folder.getRoot(), "out");
        for (String path : new String[] { "/absolute", "../escape", "a\\b", "a:b", "a\0b", "a//b" }) {
            assertExtractFails("unsafeArchiveEntry", zip, root, LIMIT, "Project One/project.db", path);
        }
        assertFalse(root.exists());
    }

    @Test public void extractNeverOverwritesOrWritesThroughWhatIsAlreadyThere() throws Exception {
        File zip = sample();
        File root = folder.newFolder("out");
        Files.write(new File(root, "project.db").toPath(), bytes("old"));

        assertExtractFails("importFailed", zip, root, LIMIT, "Project One/project.db", "project.db");
        assertArrayEquals(bytes("old"), Files.readAllBytes(new File(root, "project.db").toPath()));

        File outside = folder.newFolder("outside");
        File planted = new File(outside, "planted");
        Files.write(planted.toPath(), bytes("keep"));
        try {
            Files.createSymbolicLink(new File(root, "link.db").toPath(), planted.toPath());
            Files.createSymbolicLink(new File(root, "files").toPath(), outside.toPath());
        } catch (IOException | UnsupportedOperationException error) {
            Assume.assumeNoException(error);
        }

        assertExtractFails("importFailed", zip, root, LIMIT, "Project One/project.db", "link.db");
        assertExtractFails("unsafeArchiveEntry", zip, root, LIMIT, "Project One/files/abc.png", "files/abc");
        assertArrayEquals(bytes("keep"), Files.readAllBytes(planted.toPath()));
        assertEquals(Arrays.asList("planted"), sorted(outside.list()));
    }

    @Test public void extractFailsWhenTheCrcDoesNotMatch() throws Exception {
        File root = new File(folder.getRoot(), "out");
        File zip = archive(new TestZipArchive()
            .addStored("project.db", bytes("db"))
            .addDeflatedWithWrongCrc("files/abc", bytes("image bytes")));

        assertExtractFails("invalidArchive", zip, root, LIMIT, "project.db", "project.db", "files/abc", "files/abc");

        assertFalse("everything this call created is removed", root.exists());
    }

    @Test public void extractFailsWhenTheSizeDoesNotMatch() throws Exception {
        File root = new File(folder.getRoot(), "out");
        File zip = archive(new TestZipArchive().addDeflatedWithDeclaredSize("files/abc", bytes("image bytes"), 99));

        assertExtractFails("invalidArchive", zip, root, LIMIT, "files/abc", "files/abc");

        assertFalse(root.exists());
    }

    @Test public void extractCountsTheBytesActuallyWritten() throws Exception {
        File root = new File(folder.getRoot(), "parent/out");
        // 200 KB of zeros deflates to a few hundred bytes, so only the bytes
        // written can reveal the size.
        File zip = archive(new TestZipArchive()
            .addStored("project.db", bytes("db"))
            .addDeflated("files/big", new byte[200_000]));

        assertExtractFails("tooLarge", zip, root, 100_000, "project.db", "project.db", "files/big", "files/big");

        assertFalse("created folders and files are removed", new File(folder.getRoot(), "parent").exists());
    }
}
