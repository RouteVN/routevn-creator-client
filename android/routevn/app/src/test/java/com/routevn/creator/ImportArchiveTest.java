package com.routevn.creator;

import static org.junit.Assert.*;

import java.io.File;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.concurrent.atomic.AtomicLong;
import org.junit.Assume;
import org.junit.Rule;
import org.junit.Test;
import org.junit.rules.TemporaryFolder;

public class ImportArchiveTest {
    private static final int FILE = 0100644;
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

    /** Pairs of entry name and destination path. */
    private static List<ImportArchive.Item> items(String... pairs) {
        List<ImportArchive.Item> items = new ArrayList<>();
        for (int index = 0; index < pairs.length; index += 2) {
            items.add(new ImportArchive.Item(pairs[index], pairs[index + 1]));
        }
        return items;
    }

    private static ProjectImportException assertFails(String code, ProjectImportException error) {
        assertEquals(code, error.code);
        assertTrue(error.getMessage(), error.getMessage().startsWith(code + ": "));
        return error;
    }

    private ProjectImportException extractFailure(File archive, File root, List<ImportArchive.Item> items, long maxBytes) {
        return assertThrows(
            ProjectImportException.class,
            () -> ImportArchive.extract(archive, root, items, maxBytes, ImportProgress.NONE)
        );
    }

    private TestZipArchive sample() throws IOException {
        return new TestZipArchive()
            .addDirectory("Project One/")
            .addStored("Project One/project.db", bytes("db"), FILE)
            .addDeflated("Project One/files/abc.png", bytes("image bytes"), FILE)
            .addStored("Project One/readme.txt", bytes("extra"), FILE);
    }

    @Test public void listReturnsRawNamesSizesAndDirectories() throws Exception {
        List<ImportArchive.Entry> entries = ImportArchive.list(archive(sample()), 100);

        assertEquals(4, entries.size());
        assertEquals("Project One/", entries.get(0).name);
        assertTrue(entries.get(0).isDirectory);
        assertEquals("Project One/project.db", entries.get(1).name);
        assertFalse(entries.get(1).isDirectory);
        assertEquals(2, entries.get(1).size);
        assertEquals(11, entries.get(2).size);
    }

    @Test public void listFailsForAFileThatIsNotAZip() throws Exception {
        File notZip = folder.newFile();
        Files.write(notZip.toPath(), bytes("not a zip at all"));
        assertFails("invalidArchive", assertThrows(ProjectImportException.class, () -> ImportArchive.list(notZip, 100)));
        assertFails("invalidArchive", assertThrows(
            ProjectImportException.class,
            () -> ImportArchive.list(new File(folder.getRoot(), "missing.zip"), 100)
        ));
    }

    @Test public void listFailsWhenThereAreMoreEntriesThanAllowed() throws Exception {
        File zip = archive(sample());
        assertEquals(4, ImportArchive.list(zip, 4).size());
        assertFails("invalidArchive", assertThrows(ProjectImportException.class, () -> ImportArchive.list(zip, 3)));
    }

    @Test public void extractWritesOnlyTheRequestedEntriesToTheirNewPaths() throws Exception {
        File root = new File(folder.getRoot(), "out");

        long bytes = ImportArchive.extract(
            archive(sample()),
            root,
            items("Project One/project.db", "project.db", "Project One/files/abc.png", "files/abc"),
            LIMIT,
            ImportProgress.NONE
        );

        assertEquals(13, bytes);
        assertArrayEquals(bytes("db"), Files.readAllBytes(new File(root, "project.db").toPath()));
        assertArrayEquals(bytes("image bytes"), Files.readAllBytes(new File(root, "files/abc").toPath()));
        assertEquals(Arrays.asList("files", "project.db"), sorted(root.list()));
    }

    private static List<String> sorted(String[] names) {
        List<String> list = new ArrayList<>(Arrays.asList(names));
        list.sort(String::compareTo);
        return list;
    }

    @Test public void extractCreatesARequestedDirectoryEntry() throws Exception {
        File root = folder.newFolder("out");
        ImportArchive.extract(
            archive(sample()),
            root,
            items("Project One/", "file-metadata"),
            LIMIT,
            ImportProgress.NONE
        );
        assertTrue(new File(root, "file-metadata").isDirectory());
    }

    @Test public void extractRefusesUnsafeDestinationPaths() throws Exception {
        File zip = archive(sample());
        File root = new File(folder.getRoot(), "out");
        for (String path : new String[] { "../escape", "/absolute", "a/../b", "a//b", "a\\b", "a:b", "" }) {
            assertFails("unsafeArchiveEntry", extractFailure(zip, root, items("Project One/project.db", path), LIMIT));
        }
        assertFalse(root.exists());
    }

    @Test public void extractRefusesToWriteThroughASymlinkedParent() throws Exception {
        File root = folder.newFolder("out");
        File outside = folder.newFolder("outside");
        try {
            Files.createSymbolicLink(new File(root, "files").toPath(), outside.toPath());
        } catch (IOException | UnsupportedOperationException error) {
            Assume.assumeNoException(error);
        }

        assertFails("unsafeArchiveEntry", extractFailure(
            archive(sample()),
            root,
            items("Project One/project.db", "project.db", "Project One/files/abc.png", "files/abc"),
            LIMIT
        ));

        assertEquals(0, outside.list().length);
        assertFalse(new File(root, "project.db").exists());
    }

    @Test public void extractNeverWritesThroughASymlinkAtTheTarget() throws Exception {
        File root = folder.newFolder("out");
        File planted = folder.newFile("planted");
        Files.write(planted.toPath(), bytes("keep"));
        try {
            Files.createSymbolicLink(new File(root, "project.db").toPath(), planted.toPath());
        } catch (IOException | UnsupportedOperationException error) {
            Assume.assumeNoException(error);
        }

        assertFails("importFailed", extractFailure(
            archive(sample()),
            root,
            items("Project One/project.db", "project.db"),
            LIMIT
        ));

        assertArrayEquals(bytes("keep"), Files.readAllBytes(planted.toPath()));
    }

    @Test public void extractNeverOverwritesAnExistingFile() throws Exception {
        File root = folder.newFolder("out");
        Files.write(new File(root, "project.db").toPath(), bytes("old"));

        assertFails("importFailed", extractFailure(
            archive(sample()),
            root,
            items("Project One/project.db", "project.db"),
            LIMIT
        ));

        assertArrayEquals(bytes("old"), Files.readAllBytes(new File(root, "project.db").toPath()));
    }

    @Test public void extractFailsWhenAFileIsInTheWayOfAFolder() throws Exception {
        File root = folder.newFolder("out");
        Files.write(new File(root, "files").toPath(), bytes("a file"));

        assertFails("invalidArchive", extractFailure(
            archive(sample()),
            root,
            items("Project One/files/abc.png", "files/abc"),
            LIMIT
        ));
    }

    @Test public void extractFailsWhenTheCrcDoesNotMatch() throws Exception {
        File root = new File(folder.getRoot(), "out");
        File zip = archive(new TestZipArchive()
            .addStored("project.db", bytes("db"), FILE)
            .addDeflatedWithWrongCrc("files/abc", bytes("image bytes"), FILE));

        assertFails("invalidArchive", extractFailure(
            zip,
            root,
            items("project.db", "project.db", "files/abc", "files/abc"),
            LIMIT
        ));

        assertFalse("everything this call created is removed", root.exists());
    }

    @Test public void extractFailsWhenTheSizeDoesNotMatch() throws Exception {
        File root = new File(folder.getRoot(), "out");
        File zip = archive(new TestZipArchive()
            .addDeflatedWithDeclaredSize("files/abc", bytes("image bytes"), FILE, 99));

        assertFails("invalidArchive", extractFailure(zip, root, items("files/abc", "files/abc"), LIMIT));

        assertFalse(root.exists());
    }

    @Test public void extractCountsTheBytesActuallyWritten() throws Exception {
        File root = new File(folder.getRoot(), "parent/out");
        // 200 KB of zeros deflates to a few hundred bytes, so only the bytes
        // written can reveal the size.
        File zip = archive(new TestZipArchive()
            .addStored("project.db", bytes("db"), FILE)
            .addDeflated("files/big", new byte[200_000], FILE));

        assertFails("archiveTooLarge", extractFailure(
            zip,
            root,
            items("project.db", "project.db", "files/big", "files/big"),
            100_000
        ));

        assertFalse("created folders and files are removed", new File(folder.getRoot(), "parent").exists());
    }

    @Test public void extractKeepsWhatWasAlreadyThereWhenItFails() throws Exception {
        File root = folder.newFolder("out");
        File existing = new File(root, "keep.txt");
        Files.write(existing.toPath(), bytes("keep"));
        File zip = archive(new TestZipArchive()
            .addStored("project.db", bytes("db"), FILE)
            .addDeflatedWithWrongCrc("files/abc", bytes("image bytes"), FILE));

        assertFails("invalidArchive", extractFailure(
            zip,
            root,
            items("project.db", "project.db", "files/abc", "files/abc"),
            LIMIT
        ));

        assertEquals(Arrays.asList("keep.txt"), sorted(root.list()));
        assertArrayEquals(bytes("keep"), Files.readAllBytes(existing.toPath()));
    }

    @Test public void extractFailsForAMissingEntry() throws Exception {
        assertFails("invalidArchive", extractFailure(
            archive(sample()),
            new File(folder.getRoot(), "out"),
            items("Project One/nope", "nope"),
            LIMIT
        ));
    }

    @Test public void extractFailsWhenTwoEntriesShareADestination() throws Exception {
        File root = new File(folder.getRoot(), "out");
        assertFails("invalidArchive", extractFailure(
            archive(sample()),
            root,
            items("Project One/project.db", "files/Abc", "Project One/readme.txt", "FILES/abc"),
            LIMIT
        ));
        assertFalse(root.exists());
    }

    @Test public void extractReportsProgressFromZeroToTheTotal() throws Exception {
        File zip = archive(new TestZipArchive()
            .addDeflated("a.bin", new byte[200_000], FILE)
            .addStored("b.bin", new byte[50_000], FILE));
        AtomicLong clock = new AtomicLong();
        List<long[]> events = new ArrayList<>();
        ImportProgress progress = new ImportProgress(
            (current, total) -> events.add(new long[] { current, total }),
            () -> clock.addAndGet(ImportProgress.MIN_INTERVAL_MS)
        );

        ImportArchive.extract(zip, folder.newFolder("out"), items("a.bin", "a.bin", "b.bin", "b.bin"), LIMIT, progress);

        assertEquals(0, events.get(0)[0]);
        long previous = -1;
        for (long[] event : events) {
            assertEquals(250_000, event[1]);
            assertTrue(event[0] >= previous);
            previous = event[0];
        }
        assertEquals(250_000, events.get(events.size() - 1)[0]);
        assertTrue(events.size() > 3);
    }

    @Test public void extractAcceptsEmptyFilesAndKeepsOddLayoutsUntouched() throws Exception {
        // Layout is JavaScript's business: wrappers, extras and odd names are fine.
        File zip = archive(new TestZipArchive()
            .addStored("__MACOSX/._project.db", bytes("junk"), FILE)
            .addStored("Wrapper/Nested/empty", new byte[0], FILE)
            .addDeflated("Wrapper/Nested/data", bytes("data"), FILE));
        File root = folder.newFolder("out");

        long bytes = ImportArchive.extract(
            zip,
            root,
            items("Wrapper/Nested/empty", "empty", "Wrapper/Nested/data", "d/data"),
            LIMIT,
            ImportProgress.NONE
        );

        assertEquals(4, bytes);
        assertEquals(0, new File(root, "empty").length());
        assertTrue(new File(root, "d/data").isFile());
    }
}
